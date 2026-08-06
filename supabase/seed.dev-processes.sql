-- seed.dev-processes.sql — DEV ONLY (#298). The "Café HQ daily opening" Process the
-- AC-630-start-occurrence e2e journey (mos-app/e2e/AC-630-start-occurrence.spec.ts) drives:
-- a daily-cadence Process with two generated-Task definitions —
--   d1 "Unlock and prep the floor" — pic_role_id = Cafe Ops Lead, held by exactly ONE dev person
--       (Cahya, seed.sql person_roles) → resolves to a Task on spawn (FR-604).
--   d2 "Bakery handover" — pic_role_id = "Café Opener (demo)", held by TWO dev people
--       (Cahya + Krishna) → spawns a pending human-choice row instead of a Task (FR-605/OD-41).
-- Plus Dewi Director's active hq_operations Team membership (the owning-Team half of the
-- process.start authorization, ADR-0051 D8 — her `admin` access role also passes the gate, but the
-- membership is the model the spec documents).
--
-- Fixed UUIDs where the e2e spec hardcodes them (WORK_LINE_ID e2000000-…-0001); people resolved BY
-- EMAIL and teams BY CODE, the same patterns seed.dev-tasks.sql / seed.sql use (teams carry
-- generated ids, so a hardcoded team id would break on any reseed).
--
-- Wired in supabase/config.toml [db.seed] sql_paths AFTER seed.sql (needs its org / BUs / roles /
-- people / teams). Must stay OUT of any prod seed run — it references the fictional *.dev personas.
-- Idempotent: every insert is ON CONFLICT DO NOTHING or WHERE NOT EXISTS.

-- ── The shared "Café Opener (demo)" role, held by Cahya AND Krishna ──────────────────────────
-- Two holders is the point: it is what makes d2 (and seed.dev-cafe-opening.sql's d3) resolve to a
-- pending human-choice row rather than a Task (mos._function_holders → 'multiple', OD-41 never
-- guess). Also inserted by seed.dev-cafe-opening.sql (same fixed id, both idempotent) so neither
-- file depends on the other's presence.
insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000014', 'Café Opener (demo)', '30000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into shared.person_roles (org_id, person_id, role_id)
select '10000000-0000-0000-0000-000000000001', p.id, '30000000-0000-0000-0000-000000000006'
from shared.people p
where p.email in ('cahya.dev@example.test', 'krishna.dev@example.test')
on conflict (person_id, role_id) do nothing;

-- ── Dewi's active hq_operations membership ───────────────────────────────────────────────────
-- is_primary stays FALSE on purpose: a primary membership would change which Team resolves as
-- Dewi's default context elsewhere (shared.default_stream, one-live-primary partial unique);
-- the process gates (mos.can_start_process_for_team) only need an ACTIVE membership.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '10000000-0000-0000-0000-000000000001', p.id, t.id, false, current_date - 30
from shared.people p, shared.teams t
where p.email = 'dewi.dev@example.test'
  and t.org_id = '10000000-0000-0000-0000-000000000001' and t.code = 'hq_operations'
  and not exists (
    select 1 from shared.team_memberships m
    where m.person_id = p.id and m.team_id = t.id and m.effective_to is null
  );

-- ── The Process, its daily cadence, and the two generated-Task definitions ───────────────────
insert into mos.work_lines (id, org_id, name, type) values
  ('e2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'Café HQ daily opening', 'process')
on conflict (id) do nothing;

insert into mos.process_cadences (org_id, work_line_id, cadence_kind, active) values
  ('10000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'daily', true)
on conflict (work_line_id) do nothing;

insert into mos.process_task_defs
  (id, org_id, work_line_id, title, position, pic_role_id) values
  ('e2000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000001', 'Unlock and prep the floor', 0,
   '30000000-0000-0000-0000-000000000001'),   -- Cafe Ops Lead: one holder (Cahya) → Task on spawn
  ('e2000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000001', 'Bakery handover', 1,
   '30000000-0000-0000-0000-000000000006')    -- Café Opener (demo): two holders → pending row
on conflict (id) do nothing;
