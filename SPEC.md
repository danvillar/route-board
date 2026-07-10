# Route Board — Phase 2 build spec

Work through milestones in order; each is one Claude Code session-sized.
After each: commit, push, verify on Vercel + phone before moving on.

## M0 — Restructure (no behavior change)
Split current index.html into the file layout in CLAUDE.md. App works
exactly as before. Verify sign-in + board + add site on phone.

## M1 — Migration + city
Run migration-phase2.sql in Supabase (owner does this manually).
Add city/address to site form and site cards; optional sort/filter by city.

## M2 — Scheduled services & new cadence
- Seed default service_types on first run: Service visit (30d),
  Legionella test, Hyperchlorination, Glycol test, Boiler inspection,
  Chiller inspection, Dip slide read (2d), Corrosion coupon;
  activities: Phone call, Install, Delivery.
- Migrate each site's existing freq/last_visit into a "Service visit"
  site_service (interval mode) with computed next_due.
- Site can add/remove scheduled services; each has cadence_mode
  (interval / months / manual) and editable next_due. This fixes:
  * City Hall 800-days-past-due -> set next_due manually
  * Cooling tower July + September -> months mode {7,9}
- Board now lists site_services (not sites) sorted by days-left; group
  rows by site where multiple services are due together.
- "Log" button per service: date (default today), notes, proposed next
  due (editable), writes activity_log + updates site_service.
- Keep report_pending flow on the Service visit type.

## M3 — Activities + site history
- Quick "Log activity" on any site: pick/add activity type, date, notes.
- Site detail view gains History section: activity_log newest-first.

## M4 — Site profile (structured)
Site detail view with collapsible sections (all lazy-loaded, collapsed):
- Contacts: name, role, phone (tap-to-call), email
- Systems: kind, loop_type (HWH/CHW/GCW/GHW), label, metallurgy,
  glycol type/%/installed date, volume, freeze protection, notes
- Equipment: kind, make/model, settings, linked system
- Products: product, purpose, feed settings, inventory qty/unit
Migrate nothing automatically; owner re-enters from notes over time.

## M5 — Request pipeline
- Requests view (separate tab/section from the board): open requests
  sorted by age, each showing kind, description, site/account, status,
  days in current status.
- New request: kind (quote/order/other), description, site (optional),
  PO, amount.
- Advance status per flows in migration SQL; each advance writes a
  request_event with date + note.
- AR chips on invoiced orders: 0-15 / 16-30 / 31-60 / 61+ days since
  invoiced_on, colored teal/amber/amber/red.
- Board header gains a small "requests needing attention" count.

## M6 — Polish
- Backup/Restore extended to all tables.
- CSV export per table.
- Board filter row: by city, by account, by service type.

## Parked (do not build yet)
- Test readings per visit + ranges (Phase "readings")
- AI comment drafting via /api serverless function
- Multi-rep pilot: team visibility, company Supabase migration
- Analytics dashboards (rep/branch/region/national)
