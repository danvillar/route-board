# Route Board — project guide for Claude Code

## What this is
A field-service tracker for a water treatment service rep (Pace Solutions).
Tracks customer sites, recurring service schedules, visits/activities, site
equipment/chemistry details, and a quote/order/AR request pipeline.
Single user today; 2–3 rep pilot planned; analytics roadmap after that.

## Stack — deliberately simple
- **Frontend:** vanilla HTML/CSS/JS, ES modules, NO build step, NO framework.
  Vercel serves files as-is. Do not introduce React/Vite/npm unless the owner
  explicitly asks.
- **Database/auth:** Supabase (Postgres + email/password auth via
  supabase-js v2 from CDN). All tables have RLS: rows visible only to their
  owner (user_id default auth.uid()).
- **Hosting:** Vercel, auto-deploys from GitHub main branch.
- **Future:** /api folder for Vercel serverless functions (Phase 3 AI comment
  drafting — Anthropic API key lives server-side ONLY, never in client code).

## File layout (target)
```
index.html          shell + auth screen
css/app.css         all styles (design tokens at top)
js/config.js        SUPABASE_URL + publishable key (safe to commit; RLS protects data)
js/db.js            all Supabase queries (only file that talks to the DB)
js/schedule.js      cadence math: interval / months / manual -> next_due, days-left
js/ui-board.js      the route board (urgency-sorted schedule view)
js/ui-site.js       site detail view (collapsible sections)
js/ui-requests.js   request pipeline view
js/ui-modals.js     shared modal/form helpers
setup.sql           Phase 1 schema (sites)
migration-phase2.sql Phase 2 schema (run once in Supabase SQL editor)
SPEC.md             feature roadmap — work through milestones in order
```

## Non-negotiable rules
1. NEVER commit the Supabase secret (sb_secret_...) key. Only the
   publishable/anon key belongs in js/config.js.
2. Every new table gets RLS enabled + own-rows-only policies, following the
   pattern in migration-phase2.sql.
3. Mobile-first: primary user is on a phone in mechanical rooms. Test at
   ~390px width. Inputs min 16px font (prevents iOS zoom). Tap targets 44px.
4. The route board (urgency view) stays fast and uncluttered — detail lives
   in the site view behind a tap, collapsed by default.
5. Every destructive action confirms first. Every write is verified; on
   failure, roll back optimistic UI and toast the error.
6. Dates are date-only (no times) in America/Regina context; compute
   "days left" against local midnight.
7. Keep the design language: dark steel (#0d161d), copper/brass accents,
   Barlow Condensed display, IBM Plex Mono labels, Inter body. Status colors:
   teal ok / amber soon / oxide red overdue.

## Cadence model (core business logic)
site_services.next_due is ALWAYS authoritative.
- interval mode: on log, propose done_on + interval_days
- months mode (e.g. {7,9} = July, Sept): on log, propose the next
  occurrence after done_on (day-of-month defaults to the 1st; user adjusts)
- manual mode: propose nothing; user picks
The user can override the proposed date at every logging. Logging writes an
activity_log row and updates site_services.last_done + next_due.
Board urgency = (next_due - today) in days, negative = overdue.

## Deploy/test loop
git push -> Vercel deploys in ~1 min. No local server needed, but
`npx serve` works for local preview (Supabase calls work from localhost).
