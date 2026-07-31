# Plan — `supervisor` per-branch revenue-scope tier

- Date: 2026-07-29 · Branch: one branch, one PR
- Spec: `docs/specs/supervisor-revenue-scope.spec.md` · ADR: `docs/adr/0051-supervisor-per-branch-revenue-scope.md`
- Builds on the just-merged ADR-0050 manager tier — mirrors its migration/pgTAP/UI patterns.
- TDD: every behavior task writes the failing test FIRST, then the implementation. pgTAP files are
  authored to be RED against the pre-migration schema (the CHECK rejects `supervisor`; the policy has no
  supervisor arm) and GREEN after T1/T2 — they are the DB proof and are **CI-gated** (the local Supabase
  stack is unavailable to agents; do NOT claim a local pgTAP pass — cite the CI run).
- Verify battery (run from `mos-app/` unless noted): `npm run typecheck` · `npm run build` · `npm test` ·
  `npm run lint` (`--max-warnings=0`); pgTAP from repo root: `supabase test db` (CI).

## Order of work
DB migrations + DOWN (T1, T2) → pgTAP RLS/contracts (T3, T4, T5) → capabilities split (T6, T7) → types
(T8, T9) → DAL (T10, T11) → RevenueScopePicker (T12, T13) → RoleEditor wiring (T14, T15) → admin page
(T16) → router (T17, T18) → destinations (T19, T20) → Home split (T21, T22) → Dashboard split (T23, T24)
→ seed/deploy note + full battery (T25).

---

## Section 1 — DB

### T1 — Migration: enum `supervisor` + guard self-assign
Create `supabase/migrations/20260729000003_supervisor_access_role.sql`:

```sql
-- Adds the `supervisor` access-role tier (ADR-0051 D1/D5; adds a 6th value to ADR-0011 D5 / ADR-0050).
-- `supervisor` = revenue VIEW only, scoped per-person to (channel, branch) via
-- reporting.supervisor_revenue_scope (see 20260729000004). Self-assign blocked (parity w/ finance/manager).

-- (1) Extend the access-role vocabulary CHECK (FR-301). ADR-0011 Reversibility: enum grows by one migration.
alter table shared.person_access_roles
  drop constraint person_access_roles_access_role_check,
  add constraint person_access_roles_access_role_check
    check (access_role in ('admin','ops_lead','finance','member','manager','supervisor'));

comment on table shared.person_access_roles is
  'Access-role assignments (ADR-0011 D5 + ADR-0050 + ADR-0051). One row per (person, access_role); soft-revoke via revoked_at. `manager` = company-wide financial view; `supervisor` = per-branch revenue view (scope in reporting.supervisor_revenue_scope).';

-- (2) Self-assign block extended to `supervisor` (FR-308). Full 20260729000001 guard body re-pasted
--     UNCHANGED except the self-assign set — do not drop any existing invariant (no-lockout etc.).
create or replace function shared._guard_person_access_roles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on an access-role assignment' using errcode = '42501';
    end if;
    if new.person_id is distinct from old.person_id then
      raise exception 'person_id is immutable on an access-role assignment' using errcode = '42501';
    end if;
    if new.access_role is distinct from old.access_role then
      raise exception 'access_role is immutable on an access-role assignment' using errcode = '42501';
    end if;
    if new.revoked_at is not null and old.revoked_at is null then
      new.revoked_by := shared.current_person_id();
    elsif new.revoked_at is null and old.revoked_at is not null then
      new.revoked_by := null;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.granted_by := shared.current_person_id();
  end if;

  -- admin/finance/manager/supervisor never self-assignable, on a GRANT (a live, non-revoked target state).
  if new.revoked_at is null
     and new.access_role in ('admin','finance','manager','supervisor')
     and new.person_id = shared.current_person_id() then
    raise exception 'access role % is never self-assignable', new.access_role using errcode = '42501';
  end if;

  -- No-lockout (FR-041 / ADR-0016): a revoke (live->revoked) of the LAST active admin is refused.
  if tg_op = 'UPDATE'
     and old.access_role = 'admin'
     and old.revoked_at is null and new.revoked_at is not null then
    if shared._count_active_admins() <= 1 then
      raise exception 'cannot revoke admin from the last active admin' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
comment on function shared._guard_person_access_roles() is
  'Guard (ADR-0011 D5 + ADR-0016 + ADR-0050 + ADR-0051): admin/finance/manager/supervisor never self-assignable on grant (42501); org_id/person_id/access_role immutable on UPDATE; granted_by/revoked_by forced server-side; no-lockout on last admin. SECURITY INVOKER.';

-- DOWN:
--   create or replace shared._guard_person_access_roles() with the 20260729000001 body (self-assign set back to admin,finance,manager);
--   alter table shared.person_access_roles drop constraint person_access_roles_access_role_check,
--     add constraint person_access_roles_access_role_check check (access_role in ('admin','ops_lead','finance','member','manager'));
--     -- NOTE: this enum-shrink FAILS while any live 'supervisor' row exists — revoke/delete them first.
```
Verify: `supabase test db` (T3/T4 exercise it). Covers FR-301/302/308 (impl).

### T2 — Migration: scope table + guard + RLS + revenue policy + branch catalog
Create `supabase/migrations/20260729000004_supervisor_revenue_scope.sql`:

```sql
-- Per-person, per-branch revenue-scope substrate for the `supervisor` tier (ADR-0051 D2/D3/D6).
-- reporting.supervisor_revenue_scope: one row per (person, channel, branch_code); branch_code NULL =
-- whole channel. Admin-only writes (mirror shared.person_roles admin RLS, ADR-0050 D5); supervisor may
-- read OWN rows so the revenue policy's correlated EXISTS resolves under RLS. Margin policy UNCHANGED.

create table reporting.supervisor_revenue_scope (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  person_id   uuid not null references shared.people(id) on delete cascade,
  channel     text not null check (channel in ('POS','B2B')),
  branch_code text,  -- NULL = the whole channel (all branches)
  granted_by  uuid references shared.people(id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table reporting.supervisor_revenue_scope is
  'Per-person revenue-visibility grants for the supervisor tier (ADR-0051). One row per (person, channel, branch_code); branch_code NULL = whole channel. Admin-writes only; feeds sales_daily_revenue''s supervisor RLS arm.';
comment on column reporting.supervisor_revenue_scope.branch_code is
  'NULL = the whole channel (every branch). Non-null = one specific warehouse branch_code (free-text pass-through; not FK-validated — no branch table exists).';

-- org_id + granted_by stamped server-side (unspoofable), mirroring shared.person_access_roles.
alter table reporting.supervisor_revenue_scope alter column org_id set default shared.current_org_id();
alter table reporting.supervisor_revenue_scope alter column granted_by set default shared.current_person_id();

-- Uniqueness (portable across PG versions): at most one specific-branch row per (person,channel,branch)
-- AND at most one whole-channel row per (person,channel).
create unique index supervisor_revenue_scope_branch_uniq
  on reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  where branch_code is not null;
create unique index supervisor_revenue_scope_channel_uniq
  on reporting.supervisor_revenue_scope (person_id, channel)
  where branch_code is null;

-- Lookup index backing the revenue policy's correlated EXISTS.
create index supervisor_revenue_scope_lookup_idx
  on reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code);

-- Base privileges: SELECT/INSERT/DELETE to authenticated (no UPDATE — scope is add/remove). RLS is authority.
grant select, insert, delete on reporting.supervisor_revenue_scope to authenticated;

-- Guard: org seam (target person in caller's org) + force granted_by server-side (FR-303). SECURITY INVOKER.
create or replace function reporting._guard_supervisor_revenue_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.granted_by := shared.current_person_id();
    if not exists (select 1 from shared.people p
                    where p.id = new.person_id and p.org_id = shared.current_org_id()) then
      raise exception 'person is not in your org' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function reporting._guard_supervisor_revenue_scope() is
  'Guard (ADR-0051): a supervisor scope row must target a person in the caller''s org (42501 otherwise); granted_by forced server-side. org_id server-stamped by the column default. SECURITY INVOKER.';

create trigger supervisor_revenue_scope_guard
  before insert on reporting.supervisor_revenue_scope
  for each row execute function reporting._guard_supervisor_revenue_scope();

alter table reporting.supervisor_revenue_scope enable row level security;
alter table reporting.supervisor_revenue_scope force row level security;

-- SELECT (FR-304): admin reads all org rows (for the /admin scope editor); a supervisor reads OWN rows
-- (so the revenue policy's correlated EXISTS resolves under RLS as the querying supervisor — ADR-0051 D3).
create policy supervisor_revenue_scope_select on reporting.supervisor_revenue_scope
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('admin') or person_id = shared.current_person_id())
  );

-- INSERT (FR-303): admin-only, org-scoped (org_id server-stamped + WITH CHECK-bound, unspoofable).
create policy supervisor_revenue_scope_insert_admin on reporting.supervisor_revenue_scope
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- DELETE (FR-303): admin-only, org-scoped hard delete.
create policy supervisor_revenue_scope_delete_admin on reporting.supervisor_revenue_scope
  for delete to authenticated
  using (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- Extend the revenue SELECT policy with a scoped supervisor arm (FR-305). ALTER POLICY replaces ONLY the
-- USING expression — the policy name + finance/admin/manager arms + reporting_writer write policy untouched (FR-309).
alter policy sales_daily_revenue_select_finance_admin
  on reporting.sales_daily_revenue
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('finance')
      or shared.has_access_role('admin')
      or shared.has_access_role('manager')
      or (
        shared.has_access_role('supervisor')
        and exists (
          select 1 from reporting.supervisor_revenue_scope s
          where s.person_id = shared.current_person_id()
            and s.org_id    = shared.current_org_id()
            and s.channel   = sales_daily_revenue.channel
            and (s.branch_code is null or s.branch_code = sales_daily_revenue.branch_code)
        )
      )
    )
  );
comment on policy sales_daily_revenue_select_finance_admin on reporting.sales_daily_revenue is
  'SELECT for finance/admin/manager (all org rows) + supervisor (scoped to reporting.supervisor_revenue_scope) in the same org (ADR-0050 + ADR-0051). Name kept for DOWN-chain stability. Margin policy is unchanged (supervisor excluded).';

-- Live branch catalog for the admin scope picker (NFR-303). SECURITY INVOKER: RLS on the base table still
-- governs (admin sees all → distinct works). Never a hardcoded list.
create or replace function reporting.list_revenue_branches()
returns table (channel text, branch_code text, branch_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct r.channel, r.branch_code, r.branch_name
  from reporting.sales_daily_revenue r
  where r.org_id = shared.current_org_id()
  order by r.channel, r.branch_name
$$;
comment on function reporting.list_revenue_branches() is
  'Distinct (channel, branch_code, branch_name) for the admin Revenue-scope picker (ADR-0051, NFR-303). SECURITY INVOKER — reporting RLS governs. Never a hardcoded list.';
grant execute on function reporting.list_revenue_branches() to authenticated;

-- DOWN:
--   drop function reporting.list_revenue_branches();
--   alter policy sales_daily_revenue_select_finance_admin on reporting.sales_daily_revenue
--     using (org_id = shared.current_org_id() and (shared.has_access_role('finance') or shared.has_access_role('admin') or shared.has_access_role('manager')));
--   drop policy supervisor_revenue_scope_delete_admin on reporting.supervisor_revenue_scope;
--   drop policy supervisor_revenue_scope_insert_admin on reporting.supervisor_revenue_scope;
--   drop policy supervisor_revenue_scope_select on reporting.supervisor_revenue_scope;
--   drop trigger supervisor_revenue_scope_guard on reporting.supervisor_revenue_scope;
--   drop function reporting._guard_supervisor_revenue_scope();
--   drop table reporting.supervisor_revenue_scope cascade;
```
Verify: `supabase test db` (T4/T5 exercise it). Covers FR-303/304/305/306/307/309 (impl) · NFR-301/302/303.

### T3 — pgTAP: vocabulary accepts `supervisor`
Edit `supabase/tests/30_access_roles_vocabulary.sql`. After the existing `manager`-acceptance
`lives_ok` (ADR-0050), add a `supervisor`-acceptance check and bump `plan(N)` by 1:

```sql
-- AC-301 (FR-301): 'supervisor' is a VALID access-role value (ADR-0051).
select lives_ok($$
  insert into shared.person_access_roles (org_id, person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','supervisor')
$$, 'AC-301: access_role = supervisor is accepted (ADR-0051)');
```
- Keep the existing out-of-set rejection as **AC-302** (retag its label to `'AC-302: out-of-set value rejected'` if not already).
- Target person `...d5` (Report) holds no supervisor row in the fixture → no `unique(person_id, access_role)` collision; not the migration owner → not a self-assign.
Verify (CI): `supabase test db` → file 30 passes with the added assertion. RED before T1 (CHECK rejects
`supervisor` → `23514`), GREEN after. Covers AC-301, AC-302.

### T4 — pgTAP: scope table RLS + self-assign (new)
Create `supabase/tests/85_supervisor_scope_rls.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select mos._test_seed_role_tree();      -- org a1 people d1..d7; org b1 person b4
select mos._test_seed_access_roles();   -- grants admin -> GrandMgr (...d3)

set local role authenticated;

-- Admin session = GrandMgr (...d3).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- AC-303: admin grants a specific-branch scope + a whole-channel scope; org_id server-stamped.
select lives_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d4','POS','BGR')
$$, 'AC-303: admin grants specific-branch revenue scope');
select is(
  (select org_id from reporting.supervisor_revenue_scope
     where person_id='00000000-0000-0000-0000-0000000000d4' and channel='POS' and branch_code='BGR'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'AC-303: org_id server-stamped on scope insert');
select lives_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d4','B2B',null)
$$, 'AC-303: admin grants whole-channel scope (branch_code null)');

-- AC-305: cross-org person rejected by guard; foreign org_id rejected by WITH CHECK; bad channel by CHECK.
select throws_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000b4','POS','BGR')
$$, '42501', null, 'AC-305: cross-org person rejected by guard');
select throws_ok($$
  insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d4','POS','BGR')
$$, '42501', null, 'AC-305: foreign org_id rejected by WITH CHECK');
select throws_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d4','GRAB','X')
$$, '23514', null, 'AC-305: out-of-set channel rejected by CHECK');

-- AC-307 (part 1): admin deletes a scope row.
select lives_ok($$
  delete from reporting.supervisor_revenue_scope
   where person_id='00000000-0000-0000-0000-0000000000d4' and channel='POS' and branch_code='BGR'
$$, 'AC-307: admin removes a scope row');

-- Seed a scope row for Report (...d5) as admin, for the supervisor-read test.
insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d5','POS','BGR');

-- AC-308: supervisor not self-assignable; admin grants supervisor to another person.
select throws_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d3','supervisor')
$$, '42501', null, 'AC-308: supervisor not self-assignable');
select lives_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d5','supervisor')
$$, 'AC-308: admin grants supervisor to another person');

-- AC-306: supervisor (Report ...d5) reads ONLY their own scope row (d4's B2B row not visible).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.supervisor_revenue_scope), 1,
  'AC-306: supervisor reads only their own scope row');
select is((select branch_code from reporting.supervisor_revenue_scope), 'BGR',
  'AC-306: the visible scope row is the supervisor''s own POS/BGR grant');

-- AC-307 (part 2): non-admin (supervisor) delete of own row filtered by admin-only USING (0 rows, remains).
select lives_ok($$
  delete from reporting.supervisor_revenue_scope
   where person_id='00000000-0000-0000-0000-0000000000d5' and channel='POS' and branch_code='BGR'
$$, 'AC-307: non-admin delete raises no error');
select is((select count(*)::int from reporting.supervisor_revenue_scope), 1,
  'AC-307: non-admin delete affected zero rows — the scope row remains');

reset role;
select * from finish();
rollback;
```
Verify (CI): `supabase test db` → file 85 all pass. RED before T1/T2 (table/policies absent), GREEN after.
Covers AC-303..308.

### T5 — pgTAP: revenue scoped RLS (new)
Create `supabase/tests/86_supervisor_revenue_rls.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select mos._test_seed_role_tree();  -- orgs a1 + b1; people d1,d5,d6,d7 (a1) + b4 (b1)

-- Revenue: org a1 has 2 POS branches (BGR, SKC) + 2 B2B branches (GRI, JKT); org b1 has 1 POS (BGR).
insert into reporting.sales_daily_revenue (
  org_id, revenue_date, channel, esb_code, branch_code, branch_name,
  transactions, clean_revenue, snapshot_as_of, source_contract_version
) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GKI','BGR','Bungur',       10,1250000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GSK','SKC','Sunter Kec',    8, 900000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','B2B','GRI','GRI','Gordi Roastery', 7,3500000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','B2B','GJK','JKT','B2B Jakarta',    5,2200000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1'),
  ('00000000-0000-0000-0000-0000000000b1','2026-07-01','POS','GKI','BGR','Bungur foreign',99,9900000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1');

-- Margin (POS-only, no channel) — org a1 BGR, for the supervisor-denied-margin test.
insert into reporting.sales_margin_daily (
  org_id, margin_date, esb_code, branch_code, branch_name,
  revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, margin_interim_pct,
  bom_coverage_pct, snapshot_as_of, source_contract_version
) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','GKI','BGR','Bungur',1250000.00,750000.00,700000.00,500000.00,0.4000,0.9500,'2026-07-01 04:00:00+07','pos_margin_interim.v1');

-- Scope rows. The scope table has a guard reading current_org_id(), so set claims before each seed insert
-- (session role is still the superuser here → RLS bypassed, but the BEFORE-INSERT guard still runs).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','POS','BGR'),   -- Ipul analog: one POS branch
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','B2B',null),    -- Epoy analog: whole B2B channel
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d7','POS','BGR'),   -- multi-row: POS/BGR
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d7','B2B',null);    -- multi-row: whole B2B
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1"}';
insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4','POS','BGR');   -- cross-org supervisor

set local role authenticated;

-- AC-310: POS/BGR supervisor (Report ...d5) reads ONLY the POS/BGR row (not POS/SKC, not any B2B).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 1,
  'AC-310: POS/BGR supervisor reads exactly one row');
select is((select branch_code from reporting.sales_daily_revenue), 'BGR',
  'AC-310: the visible row is POS/BGR (not SKC, not any B2B)');

-- AC-311: whole-channel B2B supervisor (DualHat ...d6) reads all B2B (2), zero POS.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue where channel='B2B'), 2,
  'AC-311: whole-channel B2B supervisor reads all B2B rows');
select is((select count(*)::int from reporting.sales_daily_revenue where channel='POS'), 0,
  'AC-311: whole-channel B2B supervisor reads zero POS rows');

-- AC-316: multi-row supervisor (Lead2Holder ...d7) reads POS/BGR + all B2B (3), not POS/SKC.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 3,
  'AC-316: multi-row supervisor reads POS/BGR + all B2B (3 rows)');
select is((select count(*)::int from reporting.sales_daily_revenue where branch_code='SKC'), 0,
  'AC-316: multi-row supervisor does not read the other POS branch (SKC)');

-- AC-312: supervisor denied the margin table (zero rows).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_margin_daily), 0,
  'AC-312: supervisor reads zero margin rows (revenue-only)');

-- AC-317: supervisor with NO scope rows (Author ...d1) reads zero revenue (fail-closed).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 0,
  'AC-317: supervisor with no scope rows reads zero revenue (fail-closed)');

-- AC-313: cross-org supervisor (ForeignMgr ...b4, scoped POS/BGR in org b1) reads zero org-A rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue where branch_name='Bungur'), 0,
  'AC-313: cross-org supervisor reads zero org-A revenue rows');

-- AC-314: supervisor has NO revenue write path.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["supervisor"]}';
select throws_ok($$
  insert into reporting.sales_daily_revenue (org_id, revenue_date, channel, esb_code, branch_code, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-09','POS','GKI','BGR',1,1.00,now())
$$, '42501', null, 'AC-314: supervisor insert denied (revenue)');

-- AC-315: finance + manager arms not weakened (each reads all 4 org-A rows).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 4,
  'AC-315: finance still reads all org-A revenue rows (arm not weakened)');

reset role;
select * from finish();
rollback;
```
Verify (CI): `supabase test db` → file 86 all pass. RED before T1/T2, GREEN after. Covers AC-310..317.

---

## Section 2 — Capabilities split

### T6 — Capabilities test: `canViewRevenue` / `canViewMargin` (write FIRST)
Edit `mos-app/src/lib/capabilities.test.ts`. Replace the `canViewFinance` describe with:

```ts
import { can, canViewRevenue, canViewMargin } from './capabilities'

describe('canViewRevenue / canViewMargin (ADR-0051 D4)', () => {
  it('AC-320: canViewRevenue admits finance/admin/manager/supervisor', () => {
    for (const r of ['finance', 'admin', 'manager', 'supervisor']) {
      expect(canViewRevenue([r])).toBe(true)
    }
  })
  it('AC-320: canViewMargin admits finance/admin/manager but NOT supervisor', () => {
    for (const r of ['finance', 'admin', 'manager']) expect(canViewMargin([r])).toBe(true)
    expect(canViewMargin(['supervisor'])).toBe(false)
  })
  it('AC-320: neither admits member/empty', () => {
    expect(canViewRevenue(['member'])).toBe(false)
    expect(canViewRevenue([])).toBe(false)
    expect(canViewMargin(['member'])).toBe(false)
  })
})
```
Verify: `npm test -- capabilities` → RED (functions absent). Covers AC-320.

### T7 — Capabilities impl
Edit `mos-app/src/lib/capabilities.ts`. Replace `canViewFinance` with the split (keep `can`/`ROLE_CAPABILITIES`):

```ts
/** Revenue-VIEW visibility: finance | admin | manager | supervisor (ADR-0051 D4). RLS is the hard boundary. */
export function canViewRevenue(accessRoles: readonly string[]): boolean {
  return ['finance', 'admin', 'manager', 'supervisor'].some((r) => accessRoles.includes(r))
}

/** Margin/COGS-VIEW visibility: finance | admin | manager (ADR-0051 D4 — supervisor excluded, revenue-only). */
export function canViewMargin(accessRoles: readonly string[]): boolean {
  return ['finance', 'admin', 'manager'].some((r) => accessRoles.includes(r))
}
```
(No `canViewFinance` alias — T21/T23 migrate the two call sites. Grepping `canViewFinance` after this
task must return only the removed line + comments; T21 removes the last usages.)
Verify: `npm test -- capabilities` → GREEN. Covers AC-320.

---

## Section 3 — Types + DAL

### T8 — Types test: supervisor assignable + scope types (write FIRST)
Edit `mos-app/src/lib/db/admin-users.types.test.ts`. Add:

```ts
it('AC-321: supervisor is an assignable role with a revenue-oriented description', () => {
  expect(ASSIGNABLE_ROLES).toContain('supervisor')
  expect(ROLE_META.supervisor.label).toBe('Supervisor')
  expect(ROLE_META.supervisor.description.length).toBeGreaterThan(0)
  expect(ROLE_META.supervisor.description.toLowerCase()).toContain('revenue')
})
```
Verify: `npm test -- admin-users.types` → RED. Covers AC-321.

### T9 — Types impl
Edit `mos-app/src/lib/db/admin-users.types.ts`:
- `ASSIGNABLE_ROLES = ['member', 'ops_lead', 'admin', 'finance', 'manager', 'supervisor'] as const`.
- Add `ROLE_META.supervisor = { label: 'Supervisor', description: 'Revenue view for assigned branches' }`.
- Add to `AdminPersonRow`: `revenue_scope: { channel: string; branch_code: string | null }[]`.
- Add exports:
```ts
/** A distinct live (channel, branch) from reporting.list_revenue_branches() — for the scope picker. */
export interface RevenueScopeOption { channel: string; branch_code: string | null; branch_name: string | null }
/** A supervisor's granted scope; branch_code null = the whole channel. */
export interface RevenueScopeGrant { channel: string; branch_code: string | null }
```
Verify: `npm test -- admin-users.types` → GREEN; `npm run typecheck`. Covers AC-321 (impl).

### T10 — DAL test: scope wrappers + listAdminPeople merge (write FIRST)
Edit `mos-app/src/lib/db/admin-users.test.ts`. Add a `describe('Revenue scope (supervisor) wrappers', …)`:
- `AC-325: listRevenueScopeOptions returns the RPC rows` — mock the `reporting` schema `rpc('list_revenue_branches')` to resolve `{ data: [{channel:'POS',branch_code:'BGR',branch_name:'Bungur'}], error:null }`; assert the returned array.
- `AC-325: assignRevenueScope inserts a scope row with no org_id` — spy the `supervisor_revenue_scope` builder's `insert`; assert called with `{ person_id, channel, branch_code }` and NO `org_id`.
- `AC-325: removeRevenueScope deletes by person+channel+branch (null-safe)` — assert `delete().eq('person_id',…).eq('channel',…).is('branch_code', null)` when branchCode is null, and `.eq('branch_code', 'BGR')` when set.
- `AC-325: listAdminPeople merges revenue_scope` — extend the chainable `reporting` mock so `supervisor_revenue_scope.select(...)` resolves `[{person_id:'p1',channel:'POS',branch_code:'BGR'}]`; assert a person's `revenue_scope[0].channel === 'POS'`.
  (Add a `reporting` schema branch to the existing `supabase.schema` mock, mirroring the `shared` branch; add `builder.is = vi.fn(() => builder)` and `builder.rpc` if not present.)
Verify: `npm test -- admin-users.test` → RED. Covers AC-325.

### T11 — DAL impl: scope wrappers + listAdminPeople merge
Edit `mos-app/src/lib/db/admin-users.ts`:
- Add a reporting accessor near the top: `const reporting = () => supabase.schema('reporting')`.
- Import `RevenueScopeOption` from `./admin-users.types`.
- Add functions:
```ts
// ── Revenue scope (supervisor) — reporting.supervisor_revenue_scope admin writes (FR-323) ──────────
/** Distinct live (channel, branch) options for the Revenue-scope picker (NFR-303). */
export async function listRevenueScopeOptions(): Promise<RevenueScopeOption[]> {
  const { data, error } = await reporting().rpc('list_revenue_branches')
  if (error) throw surface('load revenue branches', error)
  return (data ?? []) as RevenueScopeOption[]
}

/** Grant a supervisor revenue scope. branchCode null = the whole channel. Never sends org_id (DB stamps). */
export async function assignRevenueScope(personId: string, channel: string, branchCode: string | null): Promise<void> {
  const { error } = await reporting()
    .from('supervisor_revenue_scope')
    .insert({ person_id: personId, channel, branch_code: branchCode })
  if (error) throw surface('assign revenue scope', error)
}

/** Remove a supervisor revenue-scope grant (hard delete; null-safe on branch_code). */
export async function removeRevenueScope(personId: string, channel: string, branchCode: string | null): Promise<void> {
  let q = reporting().from('supervisor_revenue_scope').delete().eq('person_id', personId).eq('channel', channel)
  q = branchCode === null ? q.is('branch_code', null) : q.eq('branch_code', branchCode)
  const { error } = await q
  if (error) throw surface('remove revenue scope', error)
}
```
- Extend `listAdminPeople`: after the Jabatan merge, add a scope fetch + group:
```ts
// 5. Fetch supervisor revenue scope (admin reads all org rows via RLS).
const { data: scopeRows, error: scopeErr } = await reporting()
  .from('supervisor_revenue_scope').select('person_id,channel,branch_code')
if (scopeErr) throw surface('load people', scopeErr)
const scopeByPerson: Record<string, { channel: string; branch_code: string | null }[]> = {}
for (const row of (scopeRows ?? []) as { person_id: string; channel: string; branch_code: string | null }[]) {
  ;(scopeByPerson[row.person_id] ??= []).push({ channel: row.channel, branch_code: row.branch_code })
}
```
  and add `revenue_scope: scopeByPerson[p.id] ?? []` to the returned `AdminPersonRow`.
Verify: `npm test -- admin-users.test` → GREEN; `npm run typecheck`. Covers AC-325 (impl).

---

## Section 4 — UI

### T12 — RevenueScopePicker test (write FIRST)
Create `mos-app/src/components/admin/revenue-scope-picker.test.tsx` (mirror `position-picker.test.tsx`;
mock `@/lib/db/admin-users` `assignRevenueScope`/`removeRevenueScope`). Fixtures: options
`[{channel:'POS',branch_code:'BGR',branch_name:'Bungur'},{channel:'B2B',branch_code:'GRI',branch_name:'Gordi Roastery'}]`.
- `AC-323: lists a "Whole POS"/"Whole B2B" option per channel + each branch, under a "Revenue scope" label, never "Role"` — assert `getByText('Revenue scope')`, `getByRole('checkbox', { name: /whole pos/i })`, `getByRole('checkbox', { name: /bungur/i })`, and `queryByText(/^Role$/)` null.
- `AC-323: checking an unassigned branch calls assignRevenueScope(id,'POS','BGR')` (person.revenue_scope=[]).
- `AC-323: checking "Whole B2B" calls assignRevenueScope(id,'B2B',null)`.
- `AC-323: unchecking an assigned branch calls removeRevenueScope(id,'POS','BGR')` (person.revenue_scope seeded with `{channel:'POS',branch_code:'BGR'}`).
- `AC-323: empty options shows "No revenue branches available yet"`.
Verify: `npm test -- revenue-scope-picker` → RED (component absent). Covers AC-323.

### T13 — RevenueScopePicker component (impl)
Create `mos-app/src/components/admin/revenue-scope-picker.tsx` — mirror `position-picker.tsx` structure/
tokens/a11y. Signature:
```ts
export interface RevenueScopePickerProps {
  person: AdminPersonRow
  options: RevenueScopeOption[]   // from listRevenueScopeOptions()
  onDone: () => void
  onShowToast?: (message: string) => void
}
```
Behavior:
- Heading **"Revenue scope"** + `sr-only` legend `Revenue scope for {name}`; muted helper line
  "Which branches' revenue this person can see." Never the word "Role".
- Group `options` by `channel` (stable order POS then B2B). For each channel render:
  - a **"Whole {channel}"** row → `branch_code: null`;
  - one row per branch in that channel → `branch_code: opt.branch_code`, labeled `branch_name ?? branch_code`.
- `checked` = `person.revenue_scope.some(s => s.channel === row.channel && s.branch_code === row.branch_code)`
  (compare `branch_code` with `===`, so `null === null` matches the whole-channel row).
- Toggle ON → `assignRevenueScope(person.id, channel, branch_code)`; OFF →
  `removeRevenueScope(person.id, channel, branch_code)`; then `onDone()` and
  `onShowToast(\`Revenue scope updated for ${person.full_name}.\`)`.
- `options.length === 0` → muted "No revenue branches available yet" (no crash).
- Errors surface inline via `role="alert"` (mirror PositionPicker's error block).
- `busy` state disables the fieldset during a write (mirror PositionPicker).
Verify: `npm test -- revenue-scope-picker` → GREEN; `npm run typecheck`. Covers AC-323 (impl).

### T14 — RoleEditor test: supervisor checkbox + conditional scope picker (write FIRST)
Edit `mos-app/src/components/admin/role-editor.test.tsx`:
- Add `supervisor` to `SELF_GUARDED_ROLES` expectations. Add:
```ts
it('AC-322: renders a Supervisor checkbox', () => {
  renderEditor()
  expect(screen.getByRole('checkbox', { name: /supervisor/i })).toBeInTheDocument()
})
it('AC-322: on the self row, the supervisor checkbox is disabled (self-guard)', () => {
  renderEditor({ ...SELF_PERSON, access_roles: ['admin'] })
  expect(screen.getByRole('checkbox', { name: /supervisor/i })).toHaveAttribute('aria-disabled', 'true')
})
it('AC-324: the Revenue scope picker renders only when the person holds supervisor', () => {
  const { rerender } = renderEditor({ ...OTHER_PERSON, access_roles: ['member'] })
  expect(screen.queryByText('Revenue scope')).not.toBeInTheDocument()
  rerender(<RoleEditor {...baseProps} person={{ ...OTHER_PERSON, access_roles: ['supervisor'] }} scopeOptions={[]} open onClose={() => {}} onDone={() => {}} />)
  expect(screen.getByText('Revenue scope')).toBeInTheDocument()
})
```
- Extend `OTHER_PERSON`/`SELF_PERSON`/`ADMIN_VIEWER` fixtures with `revenue_scope: []` (typecheck).
Verify: `npm test -- role-editor` → RED. Covers AC-322/324.

### T15 — RoleEditor: supervisor self-guard + mount RevenueScopePicker
Edit `mos-app/src/components/admin/role-editor.tsx`:
- `SELF_GUARDED_ROLES = new Set(['admin', 'finance', 'manager', 'supervisor'])`.
- Update the disabled-reason copy from `"You can't change your own admin/finance/manager access"` to
  `"You can't change your own admin, finance, manager, or supervisor access"` (both the `title` and the
  inline description occurrences).
- Add `scopeOptions?: RevenueScopeOption[]` to `RoleEditorProps` (import `RevenueScopeOption`).
- Below `<PositionPicker …/>`, conditionally render:
```tsx
{person.access_roles.includes('supervisor') && (
  <RevenueScopePicker person={person} options={scopeOptions ?? []} onDone={onDone} onShowToast={onShowToast} />
)}
```
  (import `RevenueScopePicker`).
Verify: `npm test -- role-editor` → GREEN; `npm run typecheck`. Covers AC-322/324 (impl).

### T16 — Admin page: load scope options, pass to RoleEditor
Edit `mos-app/src/pages/admin-users-page.tsx`:
- Import `listRevenueScopeOptions` and `RevenueScopeOption`.
- Add state `const [scopeOptions, setScopeOptions] = useState<RevenueScopeOption[]>([])`.
- In `load()`, alongside `listRoles()`, also `setScopeOptions(await listRevenueScopeOptions())`.
- Pass `scopeOptions={scopeOptions}` to the `<RoleEditor …>` render.
Verify: `npm run typecheck` + `npm test -- admin-users-page`. Covers AC-323/324 (page wiring).

---

## Section 5 — SPA reach

### T17 — Router test: dashboard admits supervisor, budget does not (write FIRST)
Edit `mos-app/src/router.test.tsx`:
- Update the dashboard-group assertion to `<RequireAccessRole anyOf={['finance', 'admin', 'manager', 'supervisor']} />`.
- Keep the plan/budget assertion `['finance', 'admin']`; add `AC-326: supervisor is NOT admitted to plan/budget`.
Verify: `npm test -- router` → RED. Covers AC-326.

### T18 — Router impl: dashboard admits supervisor
Edit `mos-app/src/router.tsx`:
- The dashboard/sales group guard → `<RequireAccessRole anyOf={['finance', 'admin', 'manager', 'supervisor']} />`
  (update the AC-127 comment to note supervisor is a revenue-only VIEW tier, ADR-0051).
- **The `plan/budget` + `plan/pricing` group stays `['finance', 'admin']`** — supervisor excluded (FR-315);
  extend the existing deliberate-exclusion comment to name supervisor.
Verify: `npm test -- router` → GREEN; `npm run typecheck`. Covers AC-326.

### T19 — Destinations test: Plan live for supervisor (write FIRST)
Edit `mos-app/src/shell/destinations.test.ts`:
- Update the Plan `anyOf` assertion to `['finance', 'admin', 'manager', 'supervisor']`.
- Add `AC-327: isLive(plan, ['supervisor']) === true`.
Verify: `npm test -- destinations` → RED. Covers AC-327.

### T20 — Destinations impl: Plan anyOf adds supervisor
Edit `mos-app/src/shell/destinations.tsx`: the Plan destination `anyOf: ['finance', 'admin', 'manager', 'supervisor']`
(update the comment to note supervisor sees Dashboard revenue-only, ADR-0051). The `SHOW_PLAN_BUDGET`-gated
Budget/Pricing links stay finance/admin (documented — not rendered by default).
Verify: `npm test -- destinations` → GREEN; `npm run typecheck`. Covers AC-327.

### T21 — Home test: supervisor sees revenue tile, not margin tile (write FIRST)
Edit `mos-app/src/pages/home-page.test.tsx`. Add (mirror the existing finance-case scaffold):
```ts
it('AC-328: a supervisor sees the revenue tile but NOT the margin tile', async () => {
  // mock useAuth → accessRoles: ['supervisor']; mock reporting DAL as in the finance case.
  renderHome(['supervisor'])
  expect(await screen.findByText(/revenue/i)).toBeInTheDocument()
  expect(screen.queryByText(/margin/i)).not.toBeInTheDocument()
})
```
(Adapt `renderHome` to accept an accessRoles arg if it does not already; reuse the file's finance mocks.)
Verify: `npm test -- home-page` → RED. Covers AC-328.

### T22 — Home impl: revenue/margin tile split
Edit `mos-app/src/pages/home-page.tsx`:
- Replace `import { canViewFinance }` with `import { canViewRevenue, canViewMargin } from '@/lib/capabilities'`.
- `const canSeeRevenue = canViewRevenue(accessRoles)`; `const canSeeMargin = canViewMargin(accessRoles)`.
- `const fin = useCompanyFinanceKpis(canSeeRevenue, canSeeMargin)`.
- Gate the finance KPI grid on `canSeeRevenue`; inside it render the revenue tile always and wrap the
  margin `<Link>`/`<KPITile>` in `{canSeeMargin && ( … )}`.
- Gate the `DataProvenanceNote` block on `canSeeRevenue` (was `canSeeFinance`).

Also update the shared hook `mos-app/src/lib/use-company-finance-kpis.ts`:
- Signature → `export function useCompanyFinanceKpis(canSeeRevenue: boolean, canSeeMargin: boolean = canSeeRevenue)`.
- Gate the revenue `useEffect` on `canSeeRevenue`; gate the margin `useEffect` on `canSeeMargin`.

Also update `mos-app/src/pages/stacked-union-home.tsx` + `mos-app/src/components/home-stack/money-position-section.tsx`:
- stacked-union-home: `import { canViewRevenue, canViewMargin }`; compute both; pass `canSeeRevenue`/`canSeeMargin`
  down through `SectionView` → `MoneyPositionSection`.
- MoneyPositionSection: props `{ scope, canSeeRevenue, canSeeMargin }`; `CompanyMoneyTiles` takes both,
  `if (!canSeeRevenue) return null`, wrap the margin tile in `{canSeeMargin && ( … )}`, and call
  `useCompanyFinanceKpis(canSeeRevenue, canSeeMargin)`.
- Update `money-position-section.test.tsx` + `stacked-union-home.test.tsx` prop usages to the new names
  (mechanical rename; existing finance-case behavior unchanged — finance sets both true).

> Known limitation (documented, not fixed here): a *plain* supervisor gets no owner/BU cockpit from
> `deriveHomeStack`, so the stacked-union Home (flag-off in prod) shows them no company money section;
> their revenue reach is Home v1's tile + Plan → Dashboard. Follow-up: a supervisor cockpit in home-stack.

Verify: `npm test -- home-page use-company-finance-kpis money-position-section stacked-union-home` → GREEN;
`npm run typecheck`. Covers AC-328. Confirm `grep -rn canViewFinance mos-app/src` returns nothing.

### T23 — Dashboard test: supervisor gets a revenue-only dashboard (write FIRST)
Edit `mos-app/src/pages/dashboard-page.test.tsx`. Add (mock `@/auth/use-auth` to return the given
accessRoles; mock `@/lib/db/reporting` + `@/lib/db/reporting-margin`):
```ts
it('AC-329: a supervisor sees no gross-margin/COGS row and no margin fetch', async () => {
  renderDashboard(['supervisor'])                    // useAuth → ['supervisor']
  await screen.findByText(/trailing 7-day revenue/i) // revenue KPIs present
  expect(screen.queryByText(/gross margin %/i)).not.toBeInTheDocument()
  expect(listSalesMarginDailySpy).not.toHaveBeenCalled()
})
it('AC-329: a finance viewer still sees the gross-margin row', async () => {
  renderDashboard(['finance'])
  expect(await screen.findByText(/gross margin %/i)).toBeInTheDocument()
})
```
Verify: `npm test -- dashboard-page` → RED. Covers AC-329.

### T24 — Dashboard impl: canViewMargin gate
Edit `mos-app/src/pages/dashboard-page.tsx`:
- Import `useAuth` + `canViewMargin`; `const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []`;
  `const canSeeMargin = canViewMargin(accessRoles)`.
- `fetchRows`: fetch margin only when `canSeeMargin`:
```ts
const [rev, marg] = await Promise.all([
  listSalesDailyRevenue({ sinceDays: 60 }),
  canSeeMargin ? listSalesMarginDaily({ sinceDays: 60 }) : Promise.resolve([] as SalesMarginDailyRow[]),
])
```
- Render the gross-margin/COGS KPI row (`dash-kpi-grid--gm`) and the "Interim = …" footnote only when
  `canSeeMargin`.
- `detailColumns(cut)` → `detailColumns(cut, canSeeMargin)`; when `!canSeeMargin` omit the `cogsInterim`,
  `grossMargin`, `marginPct` column defs (both the summary top-5 table and the Detail table).
Verify: `npm test -- dashboard-page` → GREEN; `npm run typecheck`. Covers AC-329.

---

## Section 6 — Deploy sequencing + full battery

### T25 — Sequencing note + full verify
- **Migration order (deploy):** `20260729000003` (enum) MUST deploy **before** any re-run of
  `supabase/seed.production.sql` (gitignored) that assigns `supervisor` — the CHECK rejects `supervisor`
  until the enum migration runs. `20260729000004` (scope table + policy) must deploy **before** any seed
  that inserts scope rows.
- **Seed note (`seed.production.sql`, gitignored):** grant **Epoy** `supervisor` + a **channel-wide B2B**
  scope row (`channel='B2B', branch_code=null`). Grant **Ipul** `supervisor`; leave his **specific HQ
  branch** scope row to be assigned via `/admin/people` (the picker reads the live HQ `branch_code`,
  e.g. `BGR`, from staging) — or fill it in the seed once the owner confirms the live HQ `branch_code`.
  Do NOT hardcode a café `branch_code` guessed from the spec's illustrative `GHQ/SKC/...` — those differ
  from live data (NFR-303).
- **DOWN caveats (documented in T1/T2):** the enum-shrink DOWN fails while live `supervisor` rows exist
  (revoke first); the revenue-policy DOWN reverts to the ADR-0050 finance/admin/manager USING.
- **pgTAP is CI-gated** — the local Supabase stack is unavailable to agents. Files 30/85/86 are the DB
  proof; cite the CI run, do not claim a local pass.
- **Full battery (all must pass before offering merge):**
  - Repo root (CI): `supabase test db` (files 30, 60, 61, 83, 84, 85, 86 green).
  - `mos-app/`: `npm run typecheck` · `npm run build` · `npm test` · `npm run lint` (`--max-warnings=0`).
  - Review battery per CLAUDE.md: spec · code-quality · design (tsx/css changed) · **security**
    (RLS/auth/schema changed) recorded in `docs/reviews/<branch>.md`; `bash scripts/pre-merge-check.sh` exit 0.

---

## AC → task coverage map

| AC | Task(s) | Layer |
|---|---|---|
| AC-301, AC-302 | T1, T3 | pgTAP 30 |
| AC-303, AC-304, AC-305, AC-306, AC-307, AC-308 | T1, T2, T4 | pgTAP 85 |
| AC-310, AC-311, AC-312, AC-313, AC-314, AC-315, AC-316, AC-317 | T2, T5 | pgTAP 86 |
| AC-320 | T6, T7 | Vitest |
| AC-321 | T8, T9 | Vitest |
| AC-322, AC-324 | T14, T15 | RTL |
| AC-323 | T12, T13 | RTL |
| AC-325 | T10, T11 | Vitest |
| AC-326 | T17, T18 | Vitest |
| AC-327 | T19, T20 | Vitest |
| AC-328 | T21, T22 | RTL |
| AC-329 | T23, T24 | RTL |

Task count: **25** (T1–T25). No intentional test inversions (unlike ADR-0050) — the vocabulary test only
gains a `supervisor`-acceptance assertion; the capabilities split renames `canViewFinance` → two helpers
(T6/T7 replace its describe). `money-position-section`/`stacked-union-home` prop renames in T22 are
mechanical and behavior-preserving for existing (finance) viewers.
