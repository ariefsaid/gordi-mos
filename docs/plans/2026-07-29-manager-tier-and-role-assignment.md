# Plan — `manager` financial tier + admin Jabatan/Access assignment

- Date: 2026-07-29 · Branch: one branch, one PR
- Spec: `docs/specs/manager-tier-and-role-assignment.spec.md` · ADR: `docs/adr/0050-manager-financial-visibility-tier.md`
- TDD: every behavior task writes the failing test FIRST, then the implementation. Two existing tests are
  **intentionally inverted** (they encode invariants ADR-0050 reverses) — those tasks state the exact old
  assertion being replaced.
- Verify battery (run from `mos-app/` unless noted): `npm run typecheck` · `npm run build` ·
  `npm test` · `npm run lint` (`--max-warnings=0`); pgTAP from repo root: `supabase test db`.

## Order of work
DB migrations + DOWN → pgTAP (RLS/contracts) → types → DAL + unit → UI (RoleEditor + PositionPicker +
table) → SPA reach (helper + router + destinations + home) → deploy/seed note + full battery.

---

## Section 1 — DB: `manager` tier

### T1 — Migration: enum + guard self-assign + reporting policies
Create `supabase/migrations/20260729000001_manager_financial_tier.sql`:

```sql
-- Adds the `manager` access-role tier (ADR-0050, amends ADR-0011 D5).
-- `manager` = company-wide financial VIEW (revenue + COGS/gross-margin), org-scoped, SELECT-only.
-- NOT overheads (no overheads table). NOT a write path. Self-assign blocked (parity w/ finance).
-- Distinct from the DERIVED reporting-line "manager" (is_manager_of) — see ADR-0050 Context.

-- (1) Extend the access-role vocabulary CHECK (FR-101). ADR-0011 Reversibility: enum grows by one migration.
alter table shared.person_access_roles
  drop constraint person_access_roles_access_role_check,
  add constraint person_access_roles_access_role_check
    check (access_role in ('admin','ops_lead','finance','member','manager'));

comment on table shared.person_access_roles is
  'Access-role assignments (ADR-0011 D5 + ADR-0050). One row per (person, access_role); soft-revoke via revoked_at. `manager` = company-wide financial view (ADR-0050); the reporting-line manager (is_manager_of) stays derived, never stored.';

-- (2) Self-assign block extended to `manager` (FR-107). Full 20260626000001 guard body re-pasted
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

  -- admin/finance/manager never self-assignable, on a GRANT (a live, non-revoked target state).
  if new.revoked_at is null
     and new.access_role in ('admin','finance','manager')
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
  'Guard (ADR-0011 D5 + ADR-0016 + ADR-0050): admin/finance/manager never self-assignable on grant (42501); org_id/person_id/access_role immutable on UPDATE; granted_by/revoked_by forced server-side; no-lockout on last admin. SECURITY INVOKER.';

-- (3) Widen the reporting SELECT policies to admit `manager` (FR-103/104). ALTER POLICY replaces ONLY
--     the USING expression — policy names, finance/admin arms, and reporting_writer write policy untouched (FR-106).
alter policy sales_daily_revenue_select_finance_admin
  on reporting.sales_daily_revenue
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('finance')
      or shared.has_access_role('admin')
      or shared.has_access_role('manager')
    )
  );
comment on policy sales_daily_revenue_select_finance_admin on reporting.sales_daily_revenue is
  'SELECT for finance/admin/manager (ADR-0050) in the same org. Name kept for DOWN-chain stability though it now admits manager.';

alter policy sales_margin_daily_select_finance_admin
  on reporting.sales_margin_daily
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('finance')
      or shared.has_access_role('admin')
      or shared.has_access_role('manager')
    )
  );
comment on policy sales_margin_daily_select_finance_admin on reporting.sales_margin_daily is
  'SELECT for finance/admin/manager (ADR-0050) in the same org. Name kept for DOWN-chain stability though it now admits manager.';

-- DOWN:
--   alter policy sales_margin_daily_select_finance_admin on reporting.sales_margin_daily
--     using (org_id = shared.current_org_id() and (shared.has_access_role('finance') or shared.has_access_role('admin')));
--   alter policy sales_daily_revenue_select_finance_admin on reporting.sales_daily_revenue
--     using (org_id = shared.current_org_id() and (shared.has_access_role('finance') or shared.has_access_role('admin')));
--   create or replace shared._guard_person_access_roles() with the 20260626000001 body (self-assign set back to admin,finance);
--   alter table shared.person_access_roles drop constraint person_access_roles_access_role_check,
--     add constraint person_access_roles_access_role_check check (access_role in ('admin','ops_lead','finance','member'));
--     -- NOTE: this enum-shrink FAILS while any live 'manager' row exists — revoke/delete them first.
```
Verify: `supabase test db` (T2/T3 exercise it). No app code depends on this task alone.
Covers: FR-101/103/104/105/106/107 (impl) · NFR-101/102.

### T2 — pgTAP: manager reporting RLS (new)
Create `supabase/tests/83_reporting_manager_tier_rls.sql` (mirror `60_`/`61_` style):

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select mos._test_seed_role_tree();  -- orgs a1 (WU-A) + b1 (WU-B)

insert into reporting.sales_daily_revenue (
  org_id, revenue_date, channel, esb_code, branch_code, branch_name,
  transactions, clean_revenue, snapshot_as_of, source_contract_version
) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GKI','BGR','Bungur',10,1250000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','B2B','GRI','GRI','Gordi Roastery',7,3500000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1'),
  ('00000000-0000-0000-0000-0000000000b1','2026-07-01','POS','GKI','BGR','Bungur foreign',99,9900000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1');

insert into reporting.sales_margin_daily (
  org_id, margin_date, esb_code, branch_code, branch_name,
  revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, margin_interim_pct,
  bom_coverage_pct, snapshot_as_of, source_contract_version
) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','GKI','BGR','Bungur',1250000.00,750000.00,700000.00,500000.00,0.4000,0.9500,'2026-07-01 04:00:00+07','pos_margin_interim.v1'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-02','GRI','GRI','Gordi Roastery',3500000.00,2100000.00,2000000.00,1400000.00,0.4000,1.0000,'2026-07-02 04:00:00+07','pos_margin_interim.v1'),
  ('00000000-0000-0000-0000-0000000000b1','2026-07-01','GKI','BGR','Bungur foreign',9900000.00,5900000.00,5500000.00,4000000.00,0.4040,0.9000,'2026-07-01 04:00:00+07','pos_margin_interim.v1');

set local role authenticated;

-- AC-103 / AC-104: manager reads same-org revenue + margin.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["manager"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 2, 'AC-103: manager reads org-A revenue rows');
select is((select count(*)::int from reporting.sales_margin_daily), 2, 'AC-104: manager reads org-A margin rows');

-- AC-105: coexistence ops_lead+manager still reads (independent axes).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["ops_lead","manager"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 2, 'AC-105: ops_lead+manager reads revenue');
select is((select count(*)::int from reporting.sales_margin_daily), 2, 'AC-105: ops_lead+manager reads margin');

-- AC-106: ops_lead/member-only reads zero (no financial arm).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["ops_lead","member"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 0, 'AC-106: ops_lead/member reads zero revenue');
select is((select count(*)::int from reporting.sales_margin_daily), 0, 'AC-106: ops_lead/member reads zero margin');

-- AC-109: finance arm not weakened.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 2, 'AC-109: finance still reads revenue (policy not weakened)');

-- AC-107: cross-org manager reads zero org-A rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["manager"]}';
select is((select count(*)::int from reporting.sales_daily_revenue where branch_name = 'Bungur'), 0, 'AC-107: cross-org manager reads zero org-A revenue');
select is((select count(*)::int from reporting.sales_margin_daily where branch_name = 'Bungur'), 0, 'AC-107: cross-org manager reads zero org-A margin');

-- AC-108: manager has NO write path.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["manager"]}';
select throws_ok($$
  insert into reporting.sales_daily_revenue (org_id, revenue_date, channel, esb_code, branch_code, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-09','POS','GKI','BGR',1,1.00,now())
$$, '42501', null, 'AC-108: manager insert denied (revenue)');
select throws_ok($$
  insert into reporting.sales_margin_daily (org_id, margin_date, esb_code, branch_code, revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-09','GKI','BGR',1.00,1.00,1.00,0.00,now())
$$, '42501', null, 'AC-108: manager insert denied (margin)');

reset role;
select * from finish();
rollback;
```
Verify: `supabase test db` → file 83 all pass. Covers AC-103..109.

### T3 — pgTAP: update the vocabulary test (INTENTIONAL INVERSION)
Edit `supabase/tests/30_access_roles_vocabulary.sql`. The old file asserts `manager` is REJECTED
(`throws_ok(..., '23514', ..., 'AC-003: access_role = manager rejected (derived, never assigned)')`) —
ADR-0050 reverses this. Replace that assertion (keep `plan(5)` count) with:

- Change the comment block (lines 15-16) to: `-- AC-101 (FR-101): 'manager' is now a VALID access-role value (ADR-0050); only out-of-set values are rejected.`
- Replace the `manager`-rejection `throws_ok` (lines 17-20) with an acceptance check:
```sql
select lives_ok($$
  insert into shared.person_access_roles (org_id, person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d3','manager')
$$, 'AC-101: access_role = manager is accepted (ADR-0050)');
```
  (Target person `...d3` = GrandMgr, who has no manager row in the fixture; avoids the `unique(person_id, access_role)` collision and is not self relative to the migration owner.)
- Keep the existing `superuser` rejection as **AC-102** (retag the label): `'AC-102: out-of-set value rejected'`.
- Keep the two `is_manager_of` derivation assertions (they concern the reporting-line manager, unchanged) but retag their labels from `AC-004` to `AC-103b: reporting-line manager still derived from the role chain (distinct from the manager access role)`.

Verify: `supabase test db` → file 30 passes with the inverted assertion. Covers AC-101, AC-102.

> NOTE (no code change): `supabase/tests/32_access_role_hook_claim.sql` line 33-38 asserts the fixture
> person's claim omits `manager` — still TRUE (that fixture person holds no `manager` grant), so it does
> NOT break. Its comment ("manager never stamped, derived") is now semantically narrow; leave the
> assertion, optionally reword the comment to `-- this fixture person holds no manager grant → not stamped`.

---

## Section 2 — DB: admin assigns Jabatan (Position)

### T4 — Migration: person_roles admin write RLS + guard
Create `supabase/migrations/20260729000002_admin_assign_jabatan.sql`:

```sql
-- Admin can assign/remove a person's Jabatan (Position) = a shared.person_roles row (ADR-0050 D5).
-- Plain admin-scoped RLS (NOT a definer RPC): person_roles is a directory junction with no auth.* write
-- and no privilege escalation, so it mirrors shared.person_access_roles' admin RLS (ADR-0011 D5). org seam
-- enforced by the org_id default (20260611000006) + WITH CHECK + a guard.

grant insert, delete on shared.person_roles to authenticated;

-- Guard: person AND role must both belong to the caller's org (org seam, ADR-0001). SECURITY INVOKER.
create or replace function shared._guard_person_roles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from shared.people p
                    where p.id = new.person_id and p.org_id = shared.current_org_id()) then
      raise exception 'person is not in your org' using errcode = '42501';
    end if;
    if not exists (select 1 from shared.roles r
                    where r.id = new.role_id and r.org_id = shared.current_org_id()) then
      raise exception 'position is not in your org' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function shared._guard_person_roles() is
  'Guard (ADR-0050): a Jabatan (person_roles) assignment must reference a person AND a role in the caller''s org (42501 otherwise). org_id is server-stamped by the column default. SECURITY INVOKER.';

create trigger person_roles_guard
  before insert on shared.person_roles
  for each row execute function shared._guard_person_roles();

-- Assign (FR-201): admin-only, org-scoped. org_id defaulted to current_org_id() in 20260611000006.
create policy person_roles_insert_admin on shared.person_roles
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- Remove (FR-202): admin-only, org-scoped hard delete (no soft-delete column; is_manager_of reads live rows).
create policy person_roles_delete_admin on shared.person_roles
  for delete to authenticated
  using (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- DOWN:
--   drop policy person_roles_delete_admin on shared.person_roles;
--   drop policy person_roles_insert_admin on shared.person_roles;
--   drop trigger person_roles_guard on shared.person_roles;
--   drop function shared._guard_person_roles();
--   revoke insert, delete on shared.person_roles from authenticated;
```
Verify: `supabase test db` (T5 exercises it). Covers FR-201/202/203/204/205/207 (impl) · NFR-201.

### T5 — pgTAP: admin assignment (new)
Create `supabase/tests/84_admin_assign_jabatan.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select mos._test_seed_role_tree();      -- org a1 people d1..d7, roles f1..f6/c1; org b1 person b4, role c1
select mos._test_seed_access_roles();   -- grants admin -> GrandMgr (...d3)

set local role authenticated;

-- Admin session = GrandMgr (...d3).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- AC-111: admin assigns a Position to Peer (...d4) -> Lead R (...f2), not already held.
select lives_ok($$
  insert into shared.person_roles (person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000f2')
$$, 'AC-111: admin assigns a Position (person_roles insert)');
select is(
  (select org_id from shared.person_roles
     where person_id='00000000-0000-0000-0000-0000000000d4' and role_id='00000000-0000-0000-0000-0000000000f2'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'AC-111: org_id server-stamped on assign');

-- AC-112: admin removes a Position (Peer's Staff R ...f3 row seeded by role tree).
select lives_ok($$
  delete from shared.person_roles
   where person_id='00000000-0000-0000-0000-0000000000d4' and role_id='00000000-0000-0000-0000-0000000000f3'
$$, 'AC-112: admin removes a Position');
select is(
  (select count(*)::int from shared.person_roles
     where person_id='00000000-0000-0000-0000-0000000000d4' and role_id='00000000-0000-0000-0000-0000000000f3'),
  0, 'AC-112: Position row removed');

-- AC-114: cross-org role_id rejected by guard (assign Peer ...d4 the WU-B B-Lead ...c1).
select throws_ok($$
  insert into shared.person_roles (person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000c1')
$$, '42501', null, 'AC-114: cross-org Position rejected by guard');

-- AC-115: explicit foreign org_id rejected by WITH CHECK.
select throws_ok($$
  insert into shared.person_roles (org_id, person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000f2')
$$, '42501', null, 'AC-115: foreign org_id rejected by WITH CHECK');

-- AC-110: admin grants manager to another person (...d4) -> lives; to self (...d3) -> 42501 (self-guard).
select lives_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d4','manager')
$$, 'AC-110: admin grants manager to another person');
select throws_ok($$
  insert into shared.person_access_roles (person_id, access_role)
  values ('00000000-0000-0000-0000-0000000000d3','manager')
$$, '42501', null, 'AC-110: manager not self-assignable');

-- AC-113: non-admin (Peer ...d4, no access roles) cannot assign a Position.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":[]}';
select throws_ok($$
  insert into shared.person_roles (person_id, role_id)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000f2')
$$, '42501', null, 'AC-113: non-admin Position assign denied by RLS');

reset role;
select * from finish();
rollback;
```
Verify: `supabase test db` → file 84 all pass. Covers AC-110..115.

---

## Section 3 — Types + DAL

### T6 — Types: assignable manager, jabatan, RoleOption
Edit `mos-app/src/lib/db/admin-users.types.ts`:
- `ASSIGNABLE_ROLES`: `['member', 'ops_lead', 'admin', 'finance', 'manager'] as const`.
- `ROLE_META.manager`: `{ label: 'Manager', description: 'Company-wide revenue & margin' }` (drop the
  "Derived from team ownership" wording — manager is now assignable).
- Add to `AdminPersonRow`: `jabatan: { role_id: string; role_name: string }[]`.
- Add exports:
```ts
export interface RoleOption { id: string; name: string }
```
Verify: `npm run typecheck`. Covers AC-120 (impl).

### T7 — Types test: manager assignable (write test FIRST, then T6 makes it pass)
Edit `mos-app/src/lib/db/admin-users.types.test.ts`:
- In the `ROLE_META` describe, replace the `includes derived manager for chip rendering` test with:
```ts
it('AC-120: manager is an assignable role with a non-derived description', () => {
  expect(ASSIGNABLE_ROLES).toContain('manager')
  expect(ROLE_META.manager.label).toBe('Manager')
  expect(ROLE_META.manager.description.length).toBeGreaterThan(0)
  expect(ROLE_META.manager.description.toLowerCase()).not.toContain('derived')
})
```
(The existing `has a human label + description for every assignable role` loop now also covers manager.)
Verify: `npm test -- admin-users.types` → red before T6, green after. Covers AC-120.

### T8 — DAL: listRoles / assignJabatan / removeJabatan + listAdminPeople jabatan
Edit `mos-app/src/lib/db/admin-users.ts`:
- Import `RoleOption` from `./admin-users.types`.
- Add functions:
```ts
// ── Jabatan (Position) — shared.person_roles admin writes (FR-201/202) ──────────
/** All org roles (Positions) for the picker, sorted by name. */
export async function listRoles(): Promise<RoleOption[]> {
  const { data, error } = await shared().from('roles').select('id,name').order('name', { ascending: true })
  if (error) throw surface('load positions', error)
  return (data ?? []) as RoleOption[]
}

/** Assign a Jabatan (Position) to a person. Never sends org_id (DB stamps it). */
export async function assignJabatan(personId: string, roleId: string): Promise<void> {
  const { error } = await shared().from('person_roles').insert({ person_id: personId, role_id: roleId })
  if (error) throw surface('assign position', error)
}

/** Remove a Jabatan (Position) from a person (hard delete). */
export async function removeJabatan(personId: string, roleId: string): Promise<void> {
  const { error } = await shared().from('person_roles').delete().eq('person_id', personId).eq('role_id', roleId)
  if (error) throw surface('remove position', error)
}
```
- Add `'load positions'`, `'assign position'`, `'remove position'` are non-DB-raised labels; no SAFE_RPC
  addition needed (they degrade to the generic message, which is leak-safe).
- Extend `listAdminPeople`: after the roles fetch, add a Jabatan fetch and merge:
```ts
// 4. Fetch Jabatan (person_roles joined to role names) — no cross-schema embed (PGRST200); two reads.
const { data: prRows, error: prErr } = await shared().from('person_roles').select('person_id,role_id')
if (prErr) throw surface('load people', prErr)
const { data: roleRows, error: rErr } = await shared().from('roles').select('id,name')
if (rErr) throw surface('load people', rErr)
const roleNameById = new Map((roleRows ?? []).map((r: { id: string; name: string }) => [r.id, r.name]))
const jabatanByPerson: Record<string, { role_id: string; role_name: string }[]> = {}
for (const row of (prRows ?? []) as { person_id: string; role_id: string }[]) {
  if (!jabatanByPerson[row.person_id]) jabatanByPerson[row.person_id] = []
  jabatanByPerson[row.person_id].push({ role_id: row.role_id, role_name: roleNameById.get(row.role_id) ?? row.role_id })
}
```
  and add `jabatan: jabatanByPerson[p.id] ?? []` to the returned `AdminPersonRow`.
Verify: `npm run typecheck`. Covers AC-124 (impl).

### T9 — DAL test: Jabatan wrappers (write FIRST)
Edit `mos-app/src/lib/db/admin-users.test.ts`. Add a `describe('Jabatan (Position) wrappers', …)`:
- `AC-124: listRoles returns role options` — mock `roles` table returns `[{id:'r1',name:'Barista'}]`; assert result.
- `AC-124: assignJabatan inserts a person_roles row` — spy the `person_roles` builder's `insert`; assert called with `{ person_id, role_id }` and NO `org_id`.
- `AC-124: removeJabatan deletes by person+role` — assert `delete().eq('person_id',…).eq('role_id',…)` path.
- `AC-124: listAdminPeople merges jabatan` — extend the existing `makeSharedSchema` table map with `person_roles` + `roles` responses; assert a person's `jabatan[0].role_name`.
  (Extend the chainable mock's `delete` — add `builder.delete = vi.fn(() => builder)` to `makeSharedSchema`.)
Verify: `npm test -- admin-users.test` → green after T8. Covers AC-124.

---

## Section 4 — UI: RoleEditor (Access level) + PositionPicker (Jabatan)

### T10 — RoleEditor: self-guard manager + relabel heading (impl)
Edit `mos-app/src/components/admin/role-editor.tsx`:
- `SELF_GUARDED_ROLES`: `new Set(['admin', 'finance', 'manager'])` (manager self-guard, ADR-0050 D4).
- Heading `Manage roles` → `Access level`; the legend `Access roles for {name}` → `Access level for {name}`.
- (Manager checkbox now renders automatically because `ASSIGNABLE_ROLES` includes it — no list edit here.)
- Keep the self-guard copy generic; for manager on self it shows the same "You can't change your own …"
  disabled reason — update that string to `"You can't change your own admin/finance/manager access"`.
Verify: `npm run typecheck`. Covers AC-121/122 (impl).

### T11 — RoleEditor test: manager rendered + self-disabled + toggles (INTENTIONAL INVERSION)
Edit `mos-app/src/components/admin/role-editor.test.tsx`. The old test
`AC-050: "manager" role is never rendered` (lines 108-112) encodes an invariant ADR-0050 reverses —
**replace it** with:
```ts
it('AC-121: renders a Manager checkbox (manager is now assignable)', () => {
  renderEditor()
  expect(screen.getByRole('checkbox', { name: /manager/i })).toBeInTheDocument()
})
it('AC-122: on the self row, the manager checkbox is disabled (self-guard)', () => {
  renderEditor({ ...SELF_PERSON, access_roles: ['admin', 'member'] })
  expect(screen.getByRole('checkbox', { name: /manager/i })).toHaveAttribute('aria-disabled', 'true')
})
it('AC-123: toggling Manager on calls grantRole(id, "manager")', async () => {
  const user = userEvent.setup()
  renderEditor(OTHER_PERSON)
  await user.click(screen.getByRole('checkbox', { name: /manager/i }))
  await waitFor(() => expect(mockGrantRole).toHaveBeenCalledWith('other-person-id', 'manager'))
})
```
- The existing `AC-050: on the self row, member and ops_lead are NOT disabled` stays valid.
- If `renderEditor` needs the AdminPersonRow `jabatan` field to typecheck, add `jabatan: []` to the
  `OTHER_PERSON`/`SELF_PERSON`/`ADMIN_VIEWER` fixtures.
Verify: `npm test -- role-editor` → red before T10 (manager not rendered), green after. Covers AC-121/122/123.

### T12 — PositionPicker component (new)
Create `mos-app/src/components/admin/position-picker.tsx` — a checkbox list of org roles, checked =
assigned. Mirror RoleEditor's toggle pattern but for Jabatan. Signature:
```ts
export interface PositionPickerProps {
  person: AdminPersonRow
  roles: RoleOption[]        // from listRoles()
  onDone: () => void         // reload list after a write
  onShowToast?: (message: string) => void
}
```
Behavior:
- Section labeled **"Position"** (heading + `sr-only` legend `Position for {name}`) — never "Role".
- One `<Checkbox>` per role in `roles`; `checked` = `person.jabatan.some(j => j.role_id === role.id)`.
- Toggle ON → `assignJabatan(person.id, role.id)`; OFF → `removeJabatan(person.id, role.id)`; then `onDone()`
  and `onShowToast(\`${role.name} … ${person.full_name}\`)`.
- Empty roles → a muted "No positions defined yet" line (no crash).
- Errors surface inline via `role="alert"` (mirror RoleEditor's error block).
Verify: `npm run typecheck`. Covers AC-125 (impl).

### T13 — PositionPicker test (write FIRST)
Create `mos-app/src/components/admin/position-picker.test.tsx` (mirror role-editor.test structure; mock
`@/lib/db/admin-users` `assignJabatan`/`removeJabatan`):
- `AC-125: lists roles under a "Position" label, never "Role"` — render with two roles; assert both labels
  present and `screen.queryByText(/^Role$/)` is null.
- `AC-125: checking an unassigned role calls assignJabatan(id, roleId)`.
- `AC-125: unchecking an assigned role calls removeJabatan(id, roleId)` (person.jabatan seeded with one).
- `AC-125: empty roles shows "No positions defined yet"`.
Verify: `npm test -- position-picker` → green after T12. Covers AC-125.

### T14 — RoleEditor: mount PositionPicker + accept roles prop
Edit `mos-app/src/components/admin/role-editor.tsx`:
- Add `roles?: RoleOption[]` to `RoleEditorProps`.
- Render `<PositionPicker person={person} roles={roles ?? []} onDone={onDone} onShowToast={onShowToast} />`
  as a bordered section BELOW the access-level fieldset, under a "Position" subheading.
- Dialog title stays `Access level`; add the Position section within the same dialog. (Two sections, one
  dialog — no new modal.)
Verify: `npm run typecheck` + `npm test -- role-editor`. Covers AC-125/126 (wiring).

### T15 — UserTable: Position column + relabel + menu item
Edit `mos-app/src/components/admin/user-table.tsx`:
- DesktopTable header `Access roles` → `Access`; add a new `<th>Position</th>` column (adjust widths, e.g.
  Person 30% / Login 12% / Access 26% / Position 22% / Status 10%).
- Add a `JabatanChips` cell (mirror `RoleChips`) rendering `person.jabatan.map(j => j.role_name)` as
  `<Tag color="gray">`, `—` when empty.
- Mobile card: relabel `dt` `Roles` → `Access`; add a `Position` `dt`/`dd` pair with `JabatanChips`.
- `PersonActionMenu`: the `manage-roles` menu item text `Manage roles` → `Manage access & position`.
  (Keep the `PersonAction` union value `'manage-roles'` — only the visible label changes.)
Verify: `npm run typecheck`. Covers AC-126 (impl).

### T16 — UserTable test: label updates (INTENTIONAL INVERSION on the menu label)
Edit `mos-app/src/components/admin/user-table.test.tsx`:
- The test `dispatches manage-roles action when "Manage roles" clicked` (line 172): update the queried
  button text to `/manage access & position/i` (the action value is unchanged).
- Add `AC-126: table shows Position and Access column headers, not "Role"` — assert `getByText('Position')`
  and `getByText('Access')` present; `queryByText(/^Access roles$/)` and `queryByText(/^Roles$/)` null.
- Extend all `AdminPersonRow` fixtures in this file with `jabatan: []` (and one with a role for the chip test).
Verify: `npm test -- user-table` → green after T15. Covers AC-126.

### T17 — Admin page: load roles, pass to RoleEditor
Edit `mos-app/src/pages/admin-users-page.tsx`:
- Add state `const [roles, setRoles] = useState<RoleOption[]>([])`; in `load()` also
  `setRoles(await listRoles())` (import `listRoles`, `RoleOption`).
- Pass `roles={roles}` to the `<RoleEditor …>` render.
Verify: `npm run typecheck` + `npm test -- admin-users-page`. Covers AC-125/126 (page wiring).

---

## Section 5 — SPA reach (make the DB grant usable; ADR-0050 D8)

### T18 — `canViewFinance` helper (dedupe the finance-view predicate)
Edit `mos-app/src/lib/capabilities.ts` — add (DRY: the `finance||admin` check is currently duplicated in
two pages):
```ts
/** Financial-VIEW visibility: finance, admin, or manager (ADR-0050 D8). RLS is the hard boundary. */
export function canViewFinance(accessRoles: readonly string[]): boolean {
  return accessRoles.includes('finance') || accessRoles.includes('admin') || accessRoles.includes('manager')
}
```
Verify: `npm run typecheck`. Covers AC-128 (impl helper).

### T19 — Router: dashboard route admits manager (budget stays finance/admin)
Edit `mos-app/src/router.tsx`:
- Line 139 (dashboard/sales group): `<RequireAccessRole anyOf={['finance', 'admin', 'manager']} />`.
- **Line 162 (plan/budget + plan/pricing group): UNCHANGED** `['finance', 'admin']` — manager is
  view-only, no planning (FR-112). Leave a comment noting manager is deliberately excluded.
Verify: `npm run typecheck`. Covers AC-127 (impl).

### T20 — Router test: dashboard admits manager, budget does not (write FIRST)
Edit `mos-app/src/router.test.tsx`:
- Line 165 dashboard assertion → `<RequireAccessRole anyOf={['finance', 'admin', 'manager']} />`.
- Line 212 plan/budget assertion → **unchanged** `['finance', 'admin']`; add an explicit
  `AC-127: manager is NOT admitted to plan/budget` assertion so the exclusion is pinned.
Verify: `npm test -- router` → green after T19. Covers AC-127.

### T21 — Destinations: Plan destination live for manager
Edit `mos-app/src/shell/destinations.tsx` line 72: `anyOf: ['finance', 'admin', 'manager']`.
(The budget/pricing LINKS inside stay `SHOW_PLAN_BUDGET`-gated and are not rendered by default; when that
flag ships, gate those links to finance/admin — documented follow-up, not this issue.)
Verify: `npm run typecheck`. Covers AC-128 (impl).

### T22 — Destinations test: manager sees Plan (write FIRST)
Edit `mos-app/src/shell/destinations.test.ts`:
- Line 54 assertion → `expect(plan.anyOf).toEqual(['finance', 'admin', 'manager'])`.
- Add `AC-128: isLive(plan, ['manager']) === true`.
Verify: `npm test -- destinations` → green after T21. Covers AC-128.

### T23 — Home pages: use canViewFinance
Edit `mos-app/src/pages/home-page.tsx` (line 40) and `mos-app/src/pages/stacked-union-home.tsx` (line 36):
replace `const canSeeFinance = accessRoles.includes('finance') || accessRoles.includes('admin')` with
`const canSeeFinance = canViewFinance(accessRoles)` (import from `@/lib/capabilities`).
Verify: `npm run typecheck`. Covers AC-129 (impl).

### T24 — Home test: manager sees money tiles (write FIRST)
Edit `mos-app/src/pages/home-page.test.tsx` (and/or `stacked-union-home.test.tsx` mirroring its existing
finance-gated case): add `AC-129: a manager viewer sees the company money tiles / issues the finance
fetch` — set `accessRoles: ['manager']`, assert the revenue/margin tile (or the reporting DAL call) is
present where a `['finance']` viewer's is. Reuse the file's existing finance-case scaffold.
Verify: `npm test -- home-page` (and `stacked-union-home`) → green after T23. Covers AC-129.

---

## Section 6 — Deploy sequencing + full battery

### T25 — Sequencing note + full verify
- **Migration order (deploy):** `20260729000001` (enum) MUST deploy **before** any re-run of
  `supabase/seed.production.sql` (gitignored) — that seed assigns `manager` to Iqbal/Riri/Fira and
  `finance` to Wiwit/Johana; the `manager` grants FAIL the CHECK if the enum migration has not run.
  `20260729000002` (Jabatan RLS) has no seed dependency. On staging/prod: `supabase db push`, then re-run
  the seed. No data backfill required.
- **DOWN caveat (documented in T1):** the enum-shrink DOWN fails while live `manager` rows exist — revoke
  them first.
- **Full battery (all must pass before offering merge):**
  - Repo root: `supabase test db` (files 30, 60, 61, 83, 84 green; 32 unchanged-green).
  - `mos-app/`: `npm run typecheck` · `npm run build` · `npm test` · `npm run lint`.
  - Review battery per CLAUDE.md: spec · code-quality · design (tsx/css changed) · **security**
    (RLS/auth/schema changed) recorded in `docs/reviews/<branch>.md`; `bash scripts/pre-merge-check.sh` exit 0.

---

## AC → task coverage map

| AC | Task(s) | Layer |
|---|---|---|
| AC-101, AC-102 | T1, T3 | pgTAP 30 |
| AC-103, AC-104, AC-105, AC-106, AC-107, AC-108, AC-109 | T1, T2 | pgTAP 83 |
| AC-110, AC-111, AC-112, AC-113, AC-114, AC-115 | T4, T5 | pgTAP 84 |
| AC-120 | T6, T7 | Vitest |
| AC-121, AC-122, AC-123 | T10, T11 | RTL |
| AC-124 | T8, T9 | Vitest |
| AC-125 | T12, T13, T14, T17 | RTL |
| AC-126 | T15, T16, T17 | RTL |
| AC-127 | T19, T20 | Vitest |
| AC-128 | T18, T21, T22 | Vitest |
| AC-129 | T23, T24 | RTL |

Task count: **25** (T1–T25). Two tasks (T3, T11) plus one label change (T16) intentionally invert
existing assertions that encoded pre-ADR-0050 invariants.
