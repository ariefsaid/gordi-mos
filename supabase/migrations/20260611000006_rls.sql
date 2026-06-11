-- P1-2 — RLS for the shared directory (ADR-0001 D3/D8, OD-P1-1/3).
-- Posture this issue: every table org-READABLE by org members; WRITES = service_role/admin only
-- (app write paths ship with their Phase-2 features). org_id defaulted + WITH CHECK = unspoofable.

----------------------------------------------------------------------
-- Base table privileges. RLS is a FILTER, not a GRANT: Postgres checks the base
-- privilege FIRST, then applies policies. Without these grants every authenticated
-- read errors "permission denied" before any policy is evaluated. Grant SELECT on the
-- whole directory; grant INSERT on people only (the narrow spoof-proof write surface,
-- T-015b) — the WITH CHECK policy still blocks foreign-org inserts. service_role bypasses
-- RLS entirely and keeps its implicit grants.
----------------------------------------------------------------------
grant select on shared.orgs, shared.business_units, shared.roles, shared.people, shared.person_roles
  to authenticated;
grant insert on shared.people to authenticated;

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
-- The org_id-spoof proof surface: an INSERT policy for authenticated on people that enforces
-- WITH CHECK (org_id = current_org_id()). This is intentionally a NARROW, provable surface for this
-- issue (T-015b) — it does NOT open a real app write path (the app has no people-write feature yet),
-- it proves that even WHEN a write policy exists, a client cannot stamp a foreign org_id (OD-P1-1).
----------------------------------------------------------------------
create policy people_insert_own_org on shared.people
  for insert to authenticated
  with check (org_id = shared.current_org_id());
