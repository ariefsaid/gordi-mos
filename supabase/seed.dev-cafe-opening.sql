-- seed.dev-cafe-opening.sql — DEV ONLY (#298). The "Café Opening" Process the AC-720 café
-- today's-opening e2e journey (mos-app/e2e/AC-720-cafe-today-opening.spec.ts) drives, and the
-- /cafe home's own dev dataset (cafe-retrofit.spec.md §4 — without it /cafe renders the
-- "no process" EmptyState). A daily cadence with three generated-Task definitions —
--   d1 "Open the café floor" — pic_role_id = Cafe Ops Lead, one holder (Cahya) → Task on spawn.
--   d2 "Log today's production" — same single-holder Role → its own Task; the description
--       deep-links to /cafe/log (FR-708 — AC-720 asserts the drawer description contains it).
--   d3 "Brew station handover" — pic_role_id = "Café Opener (demo)", two holders
--       (Cahya + Krishna) → a pending human-choice row instead of a Task (FR-705/OD-41).
-- Plus Cahya's active radiant_operations membership — the owning-Team half of her process.start
-- authorization (her `member` access role holds process.start, OD-REDESIGN-71(iii); the Team
-- membership is what scopes it, ADR-0051 D8) AND what resolves /cafe's Team context for her.
--
-- ⚠ The Process NAME is load-bearing: getCafeOpeningProcessId (mos-app/src/lib/db/cafe-opening.ts)
-- resolves it by name = 'Café Opening' (RATIFY-7F name-based v1 seam). Renaming it here breaks /cafe.
--
-- Fixed UUIDs where the e2e spec hardcodes them (WORK_LINE_ID e3000000-…-0001); people BY EMAIL,
-- teams BY CODE (generated ids), same as seed.dev-processes.sql. Wired in supabase/config.toml
-- [db.seed] sql_paths AFTER seed.sql; never in a prod seed run. Idempotent throughout.

-- Shared with seed.dev-processes.sql (same fixed id, both idempotent — no file-order dependency).
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000014', 'Café Opener (demo)', '30000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into shared.person_roles (org_id, person_id, role_id)
select '10000000-0000-0000-0000-000000000001', p.id, '30000000-0000-0000-0000-000000000006'
from shared.people p
where p.email in ('cahya.dev@example.test', 'krishna.dev@example.test')
on conflict (person_id, role_id) do nothing;

-- ── Cahya's active radiant_operations membership ─────────────────────────────────────────────
-- is_primary FALSE for the same reason seed.dev-processes.sql gives for Dewi's: the gates need
-- only an ACTIVE membership, and a primary would re-point Cahya's default context app-wide.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '10000000-0000-0000-0000-000000000001', p.id, t.id, false, current_date - 30
from shared.people p, shared.teams t
where p.email = 'cahya.dev@example.test'
  and t.org_id = '10000000-0000-0000-0000-000000000001' and t.code = 'radiant_operations'
  and not exists (
    select 1 from shared.team_memberships m
    where m.person_id = p.id and m.team_id = t.id and m.effective_to is null
  );

-- ── The Process, its daily cadence, and the three generated-Task definitions ─────────────────
insert into mos.work_lines (id, org_id, name, type) values
  ('e3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'Café Opening', 'process')
on conflict (id) do nothing;

insert into mos.process_cadences (org_id, work_line_id, cadence_kind, active) values
  ('10000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'daily', true)
on conflict (work_line_id) do nothing;

insert into mos.process_task_defs
  (id, org_id, work_line_id, title, description, position, pic_role_id) values
  ('e3000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001',
   'e3000000-0000-0000-0000-000000000001', 'Open the café floor', null, 0,
   '30000000-0000-0000-0000-000000000001'),   -- Cafe Ops Lead: one holder (Cahya) → Task on spawn
  ('e3000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001',
   'e3000000-0000-0000-0000-000000000001', 'Log today''s production',
   'Capture today''s production in the café log: /cafe/log', 1,
   '30000000-0000-0000-0000-000000000001'),   -- same single holder → its own Task (FR-708 deep-link)
  ('e3000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001',
   'e3000000-0000-0000-0000-000000000001', 'Brew station handover', null, 2,
   '30000000-0000-0000-0000-000000000006')    -- Café Opener (demo): two holders → pending row
on conflict (id) do nothing;

-- ── Today's opening RUN at Gordi HQ (#759, AC-084) ───────────────────────────────────────────
-- Inserts one open process_run for `gordi_hq_bar` today (WIB) so the Café door has a real
-- destination on a fresh reset. `spec_snapshot` mirrors what the spawn RPC would freeze at the
-- same moment: the process name, its `definition_version`, and the three active task-defs above.
-- Idempotent by (org, process, team, period_key) — the same UNIQUE the spawn RPC keys on, so a
-- hand re-run is a no-op.
--
-- ⚠ WIB not UTC (#469): the period_key is Jakarta-today, matching what
-- `wibToday()` (mos-app/src/lib/db/cafe-opening.ts) sends when the door reads it back. A UTC
-- value here would miss the door's lookup key by seven hours every day.
insert into mos.process_runs
  (org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date,
   definition_version, spec_snapshot, started_by)
select
  '10000000-0000-0000-0000-000000000001',
  'e3000000-0000-0000-0000-000000000001',
  t.id,
  to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD'),
  'Café Opening · ' || to_char((now() at time zone 'Asia/Jakarta')::date, 'DD Mon YYYY'),
  (now() at time zone 'Asia/Jakarta')::date,
  wl.definition_version,
  jsonb_build_object(
    'definition_version', wl.definition_version,
    'process_name', wl.name,
    'task_defs', coalesce((
      select jsonb_agg(to_jsonb(d.*) order by d.position)
        from mos.process_task_defs d
       where d.work_line_id = wl.id and d.org_id = wl.org_id and d.archived_at is null
    ), '[]'::jsonb)
  ),
  null   -- no acting person on a seed insert; matches the null granted_by pattern above
from mos.work_lines wl
join shared.teams t
  on t.org_id = wl.org_id and t.code = 'gordi_hq_bar' and t.archived_at is null
where wl.id = 'e3000000-0000-0000-0000-000000000001'
on conflict (org_id, work_line_id, owning_team_id, period_key) do nothing;
