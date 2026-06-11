-- P1-2 — RLS for the shared directory (ADR-0001 D3/D8, OD-P1-1/3).
-- Posture this issue: every table org-READABLE by org members; WRITES = service_role/admin only
-- (app write paths ship with their Phase-2 features). org_id defaulted + WITH CHECK = unspoofable.

----------------------------------------------------------------------
-- Base table privileges. RLS is a FILTER, not a GRANT: Postgres checks the base
-- privilege FIRST, then applies policies. Without these grants every authenticated
-- read errors "permission denied" before any policy is evaluated. Grant SELECT on the
-- whole directory ONLY. There is NO standing INSERT/UPDATE/DELETE grant for authenticated on any
-- directory table this issue: the app has no people-write feature yet, so a standing write surface
-- (even one fenced by a WITH CHECK policy) is attack surface with no caller (security audit M1). The
-- org_id-spoof property is proven WITHOUT a standing grant — the spoof test (06_org_id_spoof.sql)
-- creates the grant + WITH CHECK policy inside its own rolled-back transaction. service_role bypasses
-- RLS entirely and keeps its implicit grants (the only real write path: server-side seeds/admin).
----------------------------------------------------------------------
grant select on shared.orgs, shared.business_units, shared.roles, shared.people, shared.person_roles
  to authenticated;

----------------------------------------------------------------------
-- orgs: the tenant itself. Readable by its own members; no org_id column (ADR-0001 D8).
----------------------------------------------------------------------
alter table shared.orgs enable row level security;
alter table shared.orgs force row level security;

create policy orgs_select_own on shared.orgs
  for select to authenticated
  using (id = shared.current_org_id());

-- (no insert/update/delete policy for authenticated -> writes denied; service_role bypasses RLS)

----------------------------------------------------------------------
-- Child directory tables: org isolation on read; org_id defaulted + checked; writes denied to app.
-- Pattern repeated 4x; each table sets the org_id default so future app writes omit it.
----------------------------------------------------------------------

-- business_units
alter table shared.business_units alter column org_id set default shared.current_org_id();
alter table shared.business_units enable row level security;
alter table shared.business_units force row level security;
create policy business_units_select_org on shared.business_units
  for select to authenticated
  using (org_id = shared.current_org_id());

-- roles
alter table shared.roles alter column org_id set default shared.current_org_id();
alter table shared.roles enable row level security;
alter table shared.roles force row level security;
create policy roles_select_org on shared.roles
  for select to authenticated
  using (org_id = shared.current_org_id());

-- people
alter table shared.people alter column org_id set default shared.current_org_id();
alter table shared.people enable row level security;
alter table shared.people force row level security;
create policy people_select_org on shared.people
  for select to authenticated
  using (org_id = shared.current_org_id());

-- person_roles
alter table shared.person_roles alter column org_id set default shared.current_org_id();
alter table shared.person_roles enable row level security;
alter table shared.person_roles force row level security;
create policy person_roles_select_org on shared.person_roles
  for select to authenticated
  using (org_id = shared.current_org_id());

----------------------------------------------------------------------
-- NO standing INSERT policy on people for authenticated (security audit M1). The org_id-spoof
-- property — that even with a write policy a client cannot stamp a foreign org_id — is proven in
-- 06_org_id_spoof.sql, which grants INSERT + creates the WITH CHECK (org_id = current_org_id())
-- policy INSIDE its rolled-back test transaction. Nothing about that surface persists in the schema.
----------------------------------------------------------------------
