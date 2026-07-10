-- ============================================================
-- Route Board — Phase 2 migration
-- Run in Supabase SQL Editor. Safe to run once.
-- Adds: city, contacts, systems, equipment, products,
--       service catalog, per-site schedules, activity log,
--       request pipeline (quotes/orders/AR).
-- ============================================================

-- ---- sites: location fields --------------------------------
alter table public.sites add column if not exists city text default '';
alter table public.sites add column if not exists address text default '';

-- ---- helper: standard RLS ----------------------------------
-- every table below: user_id defaults to the signed-in user,
-- and policies restrict all access to own rows.

-- ---- contacts ----------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null,
  role text default '',            -- e.g. Chief Engineer, Operator, Purchasing
  phone text default '',
  email text default '',
  notes text default '',
  created_at timestamptz default now()
);
alter table public.contacts enable row level security;
create policy "own contacts" on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- systems (structured, analytics-ready) ------------------
create table if not exists public.systems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  kind text not null check (kind in ('boiler','cooling_tower','closed_loop','other')),
  loop_type text default '' check (loop_type in ('','HWH','CHW','GCW','GHW')),  -- closed loops only
  label text not null,             -- e.g. "Boiler #1", "CT South", "EC Glycol HWH"
  metallurgy text default '',      -- e.g. "aluminum", "steel/copper"
  glycol_type text default '' check (glycol_type in ('','propylene','ethylene','none')),
  glycol_pct numeric,              -- last known %
  glycol_installed date,           -- for glycol aging
  volume_liters numeric,           -- system volume
  freeze_protection_c numeric,     -- e.g. -28
  notes text default '',
  created_at timestamptz default now()
);
alter table public.systems enable row level security;
create policy "own systems" on public.systems
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- equipment (controllers, pumps, softeners, filters) -----
create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  system_id uuid references public.systems(id) on delete set null,
  kind text not null default 'controller',   -- controller | pump | softener | filter | other
  make_model text default '',                -- e.g. "AEGIS II"
  settings text default '',                  -- feed settings, setpoints, schedules
  notes text default '',
  created_at timestamptz default now()
);
alter table public.equipment enable row level security;
create policy "own equipment" on public.equipment
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- products on site (chemicals + inventory) ----------------
create table if not exists public.site_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  system_id uuid references public.systems(id) on delete set null,
  product text not null,            -- e.g. "Ecoguard L-677"
  purpose text default '',          -- e.g. "scale inhibitor"
  feed_settings text default '',    -- e.g. "15% of BD @ 60 of 360 strokes"
  inventory_qty numeric,
  inventory_unit text default '',   -- pails, drums, totes, L
  notes text default '',
  created_at timestamptz default now()
);
alter table public.site_products enable row level security;
create policy "own site_products" on public.site_products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- service catalog (user-editable, add on the fly) ---------
create table if not exists public.service_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'scheduled' check (kind in ('scheduled','activity')),
  default_interval_days integer,    -- null for activities / manual services
  created_at timestamptz default now()
);
alter table public.service_types enable row level security;
create policy "own service_types" on public.service_types
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- per-site scheduled services ------------------------------
-- Replaces the single freq/last_visit cadence. Each site can have
-- multiple scheduled services, each with its own cadence mode.
create table if not exists public.site_services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  service_type_id uuid not null references public.service_types(id) on delete cascade,
  cadence_mode text not null default 'interval' check (cadence_mode in ('interval','months','manual')),
  interval_days integer,            -- cadence_mode = interval
  months integer[],                 -- cadence_mode = months, e.g. {7,9} = July & Sept
  next_due date,                    -- always authoritative; user can override anytime
  last_done date,
  active boolean default true,
  created_at timestamptz default now()
);
alter table public.site_services enable row level security;
create policy "own site_services" on public.site_services
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- activity log (everything that happens at a site) --------
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  site_service_id uuid references public.site_services(id) on delete set null,
  label text not null,              -- "Service visit", "Phone call", "Install", ...
  done_on date not null default current_date,
  notes text default '',
  next_due_set date,                -- what next_due was set to at logging time
  created_at timestamptz default now()
);
alter table public.activity_log enable row level security;
create policy "own activity_log" on public.activity_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- request pipeline (quotes, orders, AR, misc requests) ----
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  account text default '',          -- for account-level requests without a site
  kind text not null default 'order' check (kind in ('quote','order','other')),
  description text not null,       -- "6x CWS-594", "price list", "new binder"
  po_number text default '',
  amount numeric,
  status text not null default 'received',
  -- quote flow:  received -> quote_submitted -> won | lost
  -- order flow:  received -> entered -> delivered -> invoiced -> paid
  -- other flow:  received -> fulfilled
  opened_on date not null default current_date,
  invoiced_on date,                 -- drives AR aging buckets
  closed_on date,                   -- paid / won / lost / fulfilled
  notes text default '',
  created_at timestamptz default now()
);
alter table public.requests enable row level security;
create policy "own requests" on public.requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- status history: every transition dated => days-in-stage analytics
create table if not exists public.request_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  status text not null,
  happened_on date not null default current_date,
  notes text default '',
  created_at timestamptz default now()
);
alter table public.request_events enable row level security;
create policy "own request_events" on public.request_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- indexes for the queries the UI will run -----------------
create index if not exists idx_site_services_due on public.site_services (user_id, active, next_due);
create index if not exists idx_activity_site on public.activity_log (user_id, site_id, done_on desc);
create index if not exists idx_requests_open on public.requests (user_id, status, opened_on);
create index if not exists idx_contacts_site on public.contacts (site_id);
create index if not exists idx_systems_site on public.systems (site_id);
