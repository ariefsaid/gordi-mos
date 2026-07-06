# Plan — Work spine v1: objective→task cascade as an everyone-surface

- Spec: `docs/specs/work-spine.spec.md` — **SIGNED (Accepted, OD-WS-1). Status line resolves §7 (a–f)**. Build to the resolution; do **not** re-open.
- ADRs: ADR-0020 (`shared.can()` — Work spine = first consumer) · ADR-0019 D2/D8/D12 (Work destination, phone-first, bilingual) · ADR-0021 (i18n catalog).
- Scope: an **everyone READ** cascade view (`/work/cascade`) over already-org-readable data, the **minimal** `shared.can()` substrate, the **write-policy migration** of `mos.objectives` + `mos.work_lines` to `can()`, and the manage routes re-keyed to capability gates. No product code is written by this plan (planner writes only under `docs/`); tasks below are the exact code the implementer writes.

## 0. Verified premises (read these before T1 — they fix the design)

- **Person→roles source = the JWT `access_roles` claim**, minted by the unspoofable SECURITY DEFINER hook `shared.custom_access_token_hook` (`20260619000002`), read by `shared.current_access_roles()` (`20260619000001`, STABLE SECURITY INVOKER `set search_path=''`). `shared.has_access_role(p)` is just `p = any(current_access_roles())`. **`shared.can()` MUST resolve from the same `current_access_roles()` — no parallel identity path.**
- **READ is already everyone-org-readable.** `objectives_select_org` / `work_lines_select_org` (`20260624000001`, `using (org_id = shared.current_org_id())`) + pgTAP AC-212 (`51_mos_cascade_lookups.sql`) already prove a `member` reads its org rows. The load-bearing change is the **WRITE** migration to `can()` + the everyone **VIEW**.
- **Current WRITE policies (exact, with their owning migration + DOWN):**
  - `mos.objectives`: `objectives_insert_admin`, `objectives_update_admin` — `has_access_role('admin')` — from `20260626000003_objectives_admin_only.sql` (DOWN restores `objectives_insert_admin_or_ops_lead` / `objectives_update_admin_or_ops_lead`).
  - `mos.work_lines`: `work_lines_insert_admin_or_ops_lead`, `work_lines_update_admin_or_ops_lead` — `has_access_role('admin') or has_access_role('ops_lead')` — from `20260624000001_mos_cascade_lookups.sql`.
- **Seed is behavior-preserving:** the `can()` seed (admin→both, ops_lead→`workline.manage`) reproduces today's effective access exactly. So the **red→green proof** that the policy consults `can()` (not a hardcoded role) is the ADR-0020 contract test: *insert a capability grant into `shared.role_capabilities` as service_role → that role gains the write*. That assertion fails under the role-hardcoded policies and passes under `can()` (Phase B T3/T4).
- **Client authority model (FR-333/NFR-302):** RLS is the authority. Client capability derivation (Phase C T7) is **convenience** for hiding the Manage affordance/route — it mirrors `RequireAccessRole`'s existing trust model (client hides routes, RLS denies writes).
- **pgTAP style** (from `51`/`58`): one test file = `begin; … select plan(n); … fixtures inserted as service_role (RLS-bypass) … set local role authenticated; set local request.jwt.claims='{…,"access_roles":[…]}'; … throws_ok/lives_ok/is … reset role; select * from finish(); rollback;`. UUID key stated in a header comment.

## 1. Design decisions (the four critical points the task asked to nail)

### 1.1 `shared.can(capability)` — minimal substrate (SECURITY-relevant)

- **Storage:** a global seed table `shared.role_capabilities(role, capability, scope)` keyed by role **name** (text, CHECK-constrained to the ADR-0011 vocabulary — mirrors `person_access_roles.access_role`). No `org_id` (grants are global reference data for v1; per-org role management + the renameable role registry are the admin-editable-roles slice, Non-goal §5). `scope` column is recorded (`org`|`own_bu`) but **all v1 seeds are `org`** — the `own_bu` upgrade path is a future `can_in_bu(capability, bu_id)` sibling, not a change to `can()`.
- **Resolution:** `can(p)` = `exists (select 1 from role_capabilities rc where rc.capability = p and rc.role = any(current_access_roles()))`. Reuses `current_access_roles()` → same person→roles source as `has_access_role`.
- **SECURITY INVOKER, STABLE, `set search_path = ''`** (matches `has_access_role` exactly). All refs schema-qualified → search_path-safe. **No DEFINER → the definer-revoke CI lint has nothing to flag.** Invoker is `authenticated`; we grant SELECT on `role_capabilities` to `authenticated` + enable RLS with `for select to authenticated using (true)` (global reference data — the client derives affordances from it; not secret). No INSERT/UPDATE/DELETE grant → only `service_role` (RLS-bypass) mutates the seed = migration-only for v1.
- **Trust boundary:** `can()` trusts (a) the `access_roles` JWT claim (unspoofable — minted by the SECURITY DEFINER hook) and (b) the seed table (migration-only writes). No client input crosses the boundary. Flagged for security-auditor + gpt-5.4 review (Phase G).

```sql
-- 20260708000001_shared_capabilities.sql (excerpt — full SQL in Phase A T2)
create table shared.role_capabilities (
  id          uuid primary key default gen_random_uuid(),
  role        text not null check (role in ('admin','ops_lead','finance','member')),
  capability  text not null check (btrim(capability) <> ''),
  scope       text not null check (scope in ('org','own_bu')) default 'org',
  created_at  timestamptz not null default now(),
  unique (role, capability)
);
-- seed (FR-332): admin → both; ops_lead → workline.manage; member/finance → none
insert into shared.role_capabilities (role, capability, scope) values
  ('admin','objective.manage','org'),
  ('admin','workline.manage','org'),
  ('ops_lead','workline.manage','org');

create or replace function shared.can(p_capability text)
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from shared.role_capabilities rc
    where rc.capability = p_capability
      and rc.role = any (shared.current_access_roles())
  )
$$;
```

### 1.2 Write-policy migration (exact DROP/CREATE + DOWN)

See Phase B T4 for the full SQL. Replaces the four policies; **DOWN restores the originals verbatim** (objectives ← `…0626000003`'s `_admin`; work_lines ← `…0624000001`'s `_admin_or_ops_lead`). The `org_id = shared.current_org_id()` tenancy seam is retained on every policy; DELETE stays un-granted (FR-334/NFR-305).

### 1.3 Reuse map (NFR-303 — wire, do not rebuild)

| Reuse target | Import | How the cascade view composes it |
|---|---|---|
| `useCascadeCatalogs` | `@/components/tasks/use-cascade-catalogs` | mount-once load of `objectives[]` + `workLines[]` (+ maps). **No parallel loader.** |
| `listObjectives` / `listWorkLines` | `@/lib/db/objectives`, `@/lib/db/work-lines` | consumed *inside* `useCascadeCatalogs` (unchanged). |
| `listTasks` | `@/lib/db/tasks` | `listTasks({})` → active org tasks (org-readable via `tasks_select_org`). |
| `GroupHeaderRow` | `@/components/tasks/group-header-row` | rendered for **both** ladder levels (objective + work_line). **Additive prop `readOnly?: boolean`** (Phase D T8) to suppress "+ Add task"/overdue-filter (cascade is read-only). Existing callers pass nothing → unchanged. |
| `WorkloadCaption` (+ `WorkloadSummary`) | `@/components/tasks/workload-caption` | rendered when `mine` is on (single-person = viewer). Summary computed from the viewer's visible tasks. |
| `StatusPill`, `dueStatus`, `isOverdue`, `formatDate` | `@/components/tasks/status-pill`, `@/lib/due-status`, `@/components/tasks/task-formatters` | used by the cascade task leaf (read-only). `TaskRow` is **not** reused (it carries editor/selection/cursor wiring that doesn't apply; NFR-303 does not list it). |
| `PageHead`, `useIsDesktop`, `useAuth`, `useT`, `getPeople` | existing | page chrome / responsive / viewer / i18n / owner-name map. |

The **2-level ladder grouping** (Objective → work_line → task) is a **new pure function** `buildLadder` (`src/lib/cascade/build-ladder.ts`) — the shipped `tasks-grouping` is single-level and does not model the objective→work_line nest. This is the sanctioned new logic; everything it *renders* is reused.

### 1.4 Route + guard (client convenience; RLS is authority)

- **`/work/cascade`** — everyone route, under `AppShell`, **no gate** (FR-300/320).
- **`/objectives`** — re-keyed from `RequireAccessRole anyOf={['admin']}` → `RequireCapability capability="objective.manage"` (seed: admin → identical access).
- **`/projects-processes`** — re-keyed from `RequireAccessRole anyOf={['ops_lead','admin']}` → `RequireCapability capability="workline.manage"` (seed: admin+ops_lead → identical access).
- **`RequireCapability`** mirrors `RequireAccessRole`; on deny it `<Navigate to="/work/cascade" replace />` (FR-313: the everyone cascade IS the neutral surface — landing there is the neutral outcome; AC-302's oracle is the redirect *target*, no message string is asserted).
- **Client capability derivation** (`src/lib/capabilities.ts`, Phase C T7): a static `ROLE_CAPABILITIES` map mirroring the DB seed, `can(accessRoles, capability)`. Reuses the existing `auth.viewer.accessRoles` plumbing (same trust model as `RequireAccessRole`). **TODO documented in-file:** replace with an RPC (`shared.my_capabilities()`) when the admin-editable-roles UI (ADR-0020 D2) makes grants dynamic.

---

## Phase A — `shared.can()` substrate (DB)

### T1 — pgTAP: `shared.can()` resolution contract (RED)
**AC tagged:** supports AC-311/312 (proves FR-332 — the function the write policies call).
**File (new):** `supabase/tests/72_mos_work_spine_can.sql`
**Write:** a pgTAP test asserting `shared.can()` resolution per role, using the same session-as-claim pattern as `51_mos_cascade_lookups.sql`. Fixtures: none needed beyond the seed (the migration seeds role_capabilities). The test sets `request.jwt.claims` per role and asserts.

```sql
-- pgTAP: shared.can() resolution (ADR-0020 D4, FR-332). Proves the capability function
-- the write policies call. AC-311/312 cite this as the FR-332 proof.
-- can('objective.manage'): admin TRUE; ops_lead/member/finance FALSE.
-- can('workline.manage'):  admin+ops_lead TRUE; member+finance FALSE.
-- fail-closed: no access_roles claim -> every can() FALSE.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- service_role inserts nothing extra; the migration seed is the only grant source.
-- AC-311/FR-332: objective.manage
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","person_id":"00000000-0000-0000-0000-00000000ca12","access_roles":["admin"]}';
select is(shared.can('objective.manage'), true,  'AC-311: admin can(objective.manage) = true');
select is(shared.can('workline.manage'),  true,  'AC-312: admin can(workline.manage) = true');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-00000000ca11","access_roles":["ops_lead"]}';
select is(shared.can('objective.manage'), false, 'AC-311: ops_lead can(objective.manage) = false (OD-C-2 holds)');
select is(shared.can('workline.manage'),  true,  'AC-312: ops_lead can(workline.manage) = true');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-00000000ca10","access_roles":["member"]}';
select is(shared.can('objective.manage'), false, 'AC-311: member can(objective.manage) = false');
select is(shared.can('workline.manage'),  false, 'AC-312: member can(workline.manage) = false');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ca","access_roles":["finance"]}';
select is(shared.can('objective.manage'), false, 'AC-311: finance can(objective.manage) = false');
select is(shared.can('workline.manage'),  false, 'AC-312: finance can(workline.manage) = false');

-- fail-closed: absent claim -> FALSE for everything
set local request.jwt.claims = '{}';
select is(shared.can('objective.manage'), false, 'AC-311: no access_roles claim -> can() = false (fail closed)');
reset role;
select * from finish();
rollback;
```
**Verify (RED):** `supabase test db` → test 72 fails (`function shared.can(integer...) does not exist` / `relation shared.role_capabilities does not exist`).

### T2 — Migration: `shared.can()` + seed (GREEN)
**File (new):** `supabase/migrations/20260708000001_shared_capabilities.sql`
**Write:** table + seed + function + grants + RLS + DOWN. (Filename `20260708000001` is after the current max `20260707000001`.)

```sql
-- Work spine v1 (ADR-0020 D4, FR-332): the minimal capability substrate.
-- shared.role_capabilities (global seed) + shared.can(capability). SECURITY INVOKER STABLE
-- set search_path='' — mirrors has_access_role (no DEFINER -> definer-revoke lint clean).
-- First consumer: mos.objectives / mos.work_lines write policies (next migration).

create table shared.role_capabilities (
  id          uuid primary key default gen_random_uuid(),
  role        text not null check (role in ('admin','ops_lead','finance','member')),
  capability  text not null check (btrim(capability) <> ''),
  scope       text not null check (scope in ('org','own_bu')) default 'org',
  created_at  timestamptz not null default now(),
  unique (role, capability)
);
comment on table shared.role_capabilities is
  'Capability grants per access role (ADR-0020 D3/D4). v1 = global seed (migration-only writes); per-org role management + the renameable registry land with the admin-editable-roles slice. scope recorded for the own_bu upgrade; all v1 grants are org.';

create index role_capabilities_role_idx on shared.role_capabilities (role);

-- FR-332 seed: admin -> both manage caps; ops_lead -> workline.manage; member/finance -> none.
insert into shared.role_capabilities (role, capability, scope) values
  ('admin',    'objective.manage', 'org'),
  ('admin',    'workline.manage',  'org'),
  ('ops_lead', 'workline.manage',  'org');

-- can(capability): true iff the session holds ANY access_role granted that capability.
-- Resolves from current_access_roles() (the SAME unspoofable JWT source has_access_role uses).
-- SECURITY INVOKER: runs as the RLS caller (authenticated); reads only current_access_roles()
-- (a claim helper) + role_capabilities (SELECT granted to authenticated below). search_path=''
-- is safe — every ref is schema-qualified. No DEFINER -> definer-revoke CI lint is clean.
-- (The own_bu scope is handled by a future can_in_bu(capability, bu_id) sibling, not here.)
create or replace function shared.can(p_capability text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from shared.role_capabilities rc
    where rc.capability = p_capability
      and rc.role = any (shared.current_access_roles())
  )
$$;
comment on function shared.can(text) is
  'True iff the session holds an access role granted capability p (ADR-0020 D4). Resolves person->roles->capability from current_access_roles() (JWT, unspoofable). SECURITY INVOKER. First consumer: mos.objectives/work_lines write RLS.';

-- Reference-data read posture: every authenticated member may read the capability vocabulary
-- (the client derives affordances from it; it is not secret). No write grant -> service_role only.
grant select on shared.role_capabilities to authenticated;
alter table shared.role_capabilities enable row level security;
alter table shared.role_capabilities force  row level security;
create policy role_capabilities_select_all on shared.role_capabilities
  for select to authenticated using (true);
-- (no insert/update/delete policy + no such grant -> only service_role bypasses RLS)

-- DOWN:
-- drop policy if exists role_capabilities_select_all on shared.role_capabilities;
-- drop function if exists shared.can(text);
-- drop table if exists shared.role_capabilities cascade;
```
**Verify (GREEN):** `supabase test db` → test 72 passes; tests 51/58 still pass (untouched policies).

---

## Phase B — write-policy migration → `can()` + RLS pgTAP (AC-310..315)

### T3 — pgTAP: cascade write/read contract under `can()` (RED)
**AC tagged:** AC-310 (read), AC-311 (objectives write), AC-312 (work_lines write), AC-313 (RLS authority), AC-314 (no delete), AC-315 (tenancy).
**File (new):** `supabase/tests/73_mos_work_spine_rls.sql`
**The load-bearing red→green:** the *capability-grant-opens-write* clauses (AC-311/312) FAIL under the current role-hardcoded policies (granting `ops_lead` the `objective.manage` capability does nothing today) and PASS once policies call `can()`. That is the ADR-0020 contract proof.

```sql
-- pgTAP: cascade read+write RLS under shared.can() (Work spine v1).
-- AC-310 read (member reads active+archived org rows; zero foreign).
-- AC-311 objectives write: member/ops_lead DENIED; admin ALLOWED; AND granting ops_lead the
--      objective.manage capability via the seed OPENS the write (proves the policy consults can()).
-- AC-312 work_lines write: member DENIED; ops_lead/admin ALLOWED; AND granting member the
--      workline.manage capability OPENS the write.
-- AC-313 RLS is the authority: a no-capability session is denied via direct SQL (UI bypassed).
-- AC-314 no DELETE on either table (any session).
-- AC-315 tenancy: org-A cannot reach org-B by read or write; client org_id ignored.
--
-- UUID key: orgs ...0000fa (A) / ...0000fb (B) · BUs ...00fa01 / ...00fb01
--   people member ...00fa10 / ops_lead ...00fa11 / admin ...00fa12 · B-admin ...00fb10
--   objective-A ...0000f1 / objective-B ...0000f2 · work_line-A ...000f0001 / work_line-B ...000f0002
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000fa','WS Org A','ws-a'),
  ('00000000-0000-0000-0000-0000000000fb','WS Org B','ws-b');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-00000000fa01','00000000-0000-0000-0000-0000000000fa','BU A'),
  ('00000000-0000-0000-0000-00000000fb01','00000000-0000-0000-0000-0000000000fb','BU B');
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-00000000fa10','00000000-0000-0000-0000-0000000000fa','WS Member'),
  ('00000000-0000-0000-0000-00000000fa11','00000000-0000-0000-0000-0000000000fa','WS OpsLead'),
  ('00000000-0000-0000-0000-00000000fa12','00000000-0000-0000-0000-0000000000fa','WS Admin'),
  ('00000000-0000-0000-0000-00000000fb10','00000000-0000-0000-0000-0000000000fb','WS B Admin');
insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('00000000-0000-0000-0000-0000000000fa','00000000-0000-0000-0000-00000000fa10','member'),
  ('00000000-0000-0000-0000-0000000000fa','00000000-0000-0000-0000-00000000fa11','ops_lead'),
  ('00000000-0000-0000-0000-0000000000fa','00000000-0000-0000-0000-00000000fa12','admin'),
  ('00000000-0000-0000-0000-0000000000fb','00000000-0000-0000-0000-00000000fb10','admin');
-- service_role fixtures (RLS-bypass): active + archived rows in both orgs
insert into mos.objectives (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000fa','WS Objective A'),
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000fb','WS Objective B');
update mos.objectives set archived_at = now() where id = '00000000-0000-0000-0000-0000000000f1'; -- archived org-A row
insert into mos.work_lines (id, org_id, name, type) values
  ('00000000-0000-0000-0000-0000000f0001','00000000-0000-0000-0000-0000000000fa','WS WL A','project'),
  ('00000000-0000-0000-0000-0000000f0002','00000000-0000-0000-0000-0000000000fb','WS WL B','process');

-- ─── AC-310: org-A member reads active + archived org-A rows; zero org-B ─────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa10","access_roles":["member"]}';
select is((select count(*)::int from mos.objectives), 1,
  'AC-310: org-A member sees the 1 org-A objective (active+archived) — archived visible');
select is((select count(*)::int from mos.objectives where archived_at is not null), 1,
  'AC-310: archived org-A objective IS visible to a member (manage surface relies on it)');
select is((select count(*)::int from mos.work_lines where id = '00000000-0000-0000-0000-0000000f0002'), 0,
  'AC-310: org-B work_line invisible to org-A member');

-- ─── AC-311: objectives write via can('objective.manage') ───────────────────────
select throws_ok($$
  insert into mos.objectives (name) values ('Member Obj')
$$, '42501', null, 'AC-311: member INSERT objective DENIED (can false)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa11","access_roles":["ops_lead"]}';
select throws_ok($$
  insert into mos.objectives (name) values ('OpsLead Obj')
$$, '42501', null, 'AC-311: ops_lead INSERT objective DENIED (OD-C-2 holds via can())');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa12","access_roles":["admin"]}';
select lives_ok($$
  insert into mos.objectives (name) values ('Admin Obj')
$$, 'AC-311: admin INSERT objective SUCCEEDS (can true)');

-- ─── AC-312: work_lines write via can('workline.manage') ────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa10","access_roles":["member"]}';
select throws_ok($$
  insert into mos.work_lines (name, type) values ('Member WL','project')
$$, '42501', null, 'AC-312: member INSERT work_line DENIED (can false)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa11","access_roles":["ops_lead"]}';
select lives_ok($$
  insert into mos.work_lines (name, type) values ('OpsLead WL','project')
$$, 'AC-312: ops_lead INSERT work_line SUCCEEDS (can true)');

-- ─── AC-313: RLS is the authority (UI bypassed — direct SQL by a no-cap session) ─
-- member runs a direct UPDATE on a row it CAN see (USING passes) but WITH CHECK denies.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa10","access_roles":["member"]}';
select throws_ok($$
  update mos.objectives set name = 'Hacked' where org_id = '00000000-0000-0000-0000-0000000000fa'
$$, '42501', null, 'AC-313: member direct UPDATE objective DENIED at DB (UI gate not the source of truth)');

-- ─── AC-314: no DELETE on either table (admin included — no grant) ──────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa12","access_roles":["admin"]}';
select throws_ok($$
  delete from mos.objectives where org_id = '00000000-0000-0000-0000-0000000000fa'
$$, '42501', null, 'AC-314: DELETE objectives DENIED even for admin (no grant)');
select throws_ok($$
  delete from mos.work_lines where org_id = '00000000-0000-0000-0000-0000000000fa'
$$, '42501', null, 'AC-314: DELETE work_lines DENIED even for admin (no grant)');

-- ─── AC-315: tenancy — client-supplied org_id is ignored; cross-org write denied ─
-- member tries to INSERT an objective stamping a foreign org_id; DB re-stamps via default
-- + WITH CHECK (org_id = current_org_id()) denies the spoofed row.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa10","access_roles":["member"]}';
select throws_ok($$
  insert into mos.objectives (org_id, name) values ('00000000-0000-0000-0000-0000000000fb','Spoofed Org')
$$, '42501', null, 'AC-315: client-supplied foreign org_id rejected (org_id stamped server-side)');

-- ─── THE CONTRACT PROOF (ADR-0020): granting a capability OPENS the write ───────
-- As service_role, grant ops_lead the objective.manage capability. Then ops_lead — which was
-- DENIED above — must now SUCCEED. This fails under role-hardcoded policies, passes under can().
reset role;
insert into shared.role_capabilities (role, capability, scope) values ('ops_lead','objective.manage','org');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa11","access_roles":["ops_lead"]}';
select lives_ok($$
  insert into mos.objectives (name) values ('OpsLead Now Can')
$$, 'AC-311/FR-331: granting ops_lead objective.manage OPENS the write (policy consults can(), not a role name)');
-- symmetric: grant member workline.manage -> member now writes work_lines
reset role;
insert into shared.role_capabilities (role, capability, scope) values ('member','workline.manage','org');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000fa","person_id":"00000000-0000-0000-0000-00000000fa10","access_roles":["member"]}';
select lives_ok($$
  insert into mos.work_lines (name, type) values ('Member Now Can','process')
$$, 'AC-312/FR-331: granting member workline.manage OPENS the write (policy consults can())');
reset role;
select * from finish();
rollback;
```
**Verify (RED):** `supabase test db` → test 73 fails on the two *grant-opens-write* `lives_ok` assertions (ops_lead still denied objective; member still denied work_line) — the current policies are role-hardcoded and ignore the capability grant. (The deny/allow assertions that match today's seed already pass; that's expected.)

### T4 — Migration: cascade write → `can()` (GREEN)
**File (new):** `supabase/migrations/20260708000002_cascade_write_to_can.sql`
**Write:** drop the 4 current write policies, create 4 `can()`-based policies. DOWN restores the originals **verbatim**.

```sql
-- Work spine v1 (ADR-0020 D4, FR-331): migrate mos.objectives + mos.work_lines WRITE
-- policies from has_access_role(...) to shared.can(...). SELECT stays org-scoped (unchanged).
-- Behavior-preserving for the seed (admin->both, ops_lead->workline.manage). DELETE stays
-- un-granted (FR-334/NFR-305). The org_id = current_org_id() tenancy seam is retained on all.

-- ─── mos.objectives: admin-only write -> can('objective.manage') ────────────────
drop policy if exists objectives_insert_admin on mos.objectives;
drop policy if exists objectives_update_admin on mos.objectives;

create policy objectives_insert_can_manage on mos.objectives
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.can('objective.manage'));

create policy objectives_update_can_manage on mos.objectives
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id() and shared.can('objective.manage'));

-- ─── mos.work_lines: admin|ops_lead write -> can('workline.manage') ─────────────
drop policy if exists work_lines_insert_admin_or_ops_lead on mos.work_lines;
drop policy if exists work_lines_update_admin_or_ops_lead on mos.work_lines;

create policy work_lines_insert_can_manage on mos.work_lines
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.can('workline.manage'));

create policy work_lines_update_can_manage on mos.work_lines
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id() and shared.can('workline.manage'));

-- DOWN (restores the pre-can() policies verbatim — …0626000003 for objectives,
--       …0624000001 for work_lines):
-- drop policy if exists objectives_insert_can_manage on mos.objectives;
-- drop policy if exists objectives_update_can_manage on mos.objectives;
-- create policy objectives_insert_admin on mos.objectives
--   for insert to authenticated
--   with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));
-- create policy objectives_update_admin on mos.objectives
--   for update to authenticated
--   using  (org_id = shared.current_org_id())
--   with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));
-- drop policy if exists work_lines_insert_can_manage on mos.work_lines;
-- drop policy if exists work_lines_update_can_manage on mos.work_lines;
-- create policy work_lines_insert_admin_or_ops_lead on mos.work_lines
--   for insert to authenticated
--   with check (org_id = shared.current_org_id()
--     and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));
-- create policy work_lines_update_admin_or_ops_lead on mos.work_lines
--   for update to authenticated
--   using  (org_id = shared.current_org_id())
--   with check (org_id = shared.current_org_id()
--     and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));
```
**Verify (GREEN):** `supabase test db` → test 73 fully passes (incl. both *grant-opens-write* clauses); tests 51/58 still green (seed preserves AC-010/011/012/213 behavior); test 72 green.

---

## Phase C — client libs (i18n keys, ladder builder, capabilities)

### T5 — i18n: cascade catalog keys (en+id) + parity test (AC-304 i18n clause)
**AC tagged:** AC-304 (i18n clause — `cascade.*` keys ship in en+id, resolve under `id`).
**TDD:** (1) add a cascade-keys parity block to the existing test (RED), (2) add the keys (GREEN).
**Edit:** `mos-app/src/i18n/messages.test.ts` — append a `describe('cascade i18n (AC-304)', …)` block mirroring the assistant block, asserting every `cascade.*` key is present in en+id and resolves under locale `id` to a real string (not the key stub).
**Edit:** `mos-app/src/i18n/messages.ts` — add to **both** `en` and `id` (identical key sets — the existing AC-I01 parity test enforces this at runtime):
```
en:
  'cascade.title': 'Work cascade',
  'cascade.subtitle': "How our work ladders up to our goals",
  'cascade.link': 'Cascade',
  'cascade.mine': 'Mine',
  'cascade.all': 'All',
  'cascade.unlinked': '(Unlinked)',
  'cascade.noWorkLine': 'No Project/Process',
  'cascade.manage.objectives': 'Manage objectives',
  'cascade.manage.projects': 'Manage projects & processes',
  'cascade.empty.title': 'Nothing ladders up yet',
  'cascade.empty.body': 'When tasks link to a Project/Process and an Objective, the ladder appears here.',
  'cascade.mine.empty.title': 'No tasks on your plate',
  'cascade.mine.empty.body': 'Tasks where you are Responsible or Accountable ladder up here. Switch to "All" to see the whole org.',
  'cascade.error.title': "Couldn't load the cascade",
  'cascade.error.retry': 'Try again',
  'cascade.loading': 'Loading the cascade…',
id:
  'cascade.title': 'Cascade kerja',
  'cascade.subtitle': 'Bagaimana kerja kami bermuara ke tujuan kami',
  'cascade.link': 'Cascade',
  'cascade.mine': 'Milik saya',
  'cascade.all': 'Semua',
  'cascade.unlinked': '(Belum tertaut)',
  'cascade.noWorkLine': 'Tanpa Proyek/Proses',
  'cascade.manage.objectives': 'Kelola objective',
  'cascade.manage.projects': 'Kelola proyek & proses',
  'cascade.empty.title': 'Belum ada yang bermuara',
  'cascade.empty.body': 'Saat tugas tertaut ke Proyek/Proses dan Objective, cascadenya muncul di sini.',
  'cascade.mine.empty.title': 'Tidak ada tugas untuk Anda',
  'cascade.mine.empty.body': 'Tugas yang Anda tanggung sebagai R atau A bermuara ke sini. Beralih ke "Semua" untuk melihat seluruh org.',
  'cascade.error.title': 'Tidak dapat memuat cascade',
  'cascade.error.retry': 'Coba lagi',
  'cascade.loading': 'Memuat cascade…',
```
**Verify (GREEN):** `cd mos-app && npx vitest run src/i18n/messages.test.ts` → cascade parity block passes; `npm run typecheck` (new keys are now valid `MessageKey`).

### T6 — pure ladder builder + unit test (AC-301 logic)
**AC tagged:** AC-301 (Mine narrowing + "(Unlinked)" + "No Project/Process" branch structure).
**File (new):** `mos-app/src/lib/cascade/build-ladder.ts`
**Write:** a pure, i18n-agnostic function (labels passed in) that nests tasks under Objective → work_line, with the synthetic branches.

```ts
// build-ladder: the objective→work_line→task nest for the everyone cascade view (FR-301..304).
// PURE (no React, no i18n) so it is unit-testable. Reuses raciOwner for the Mine filter
// (FR-302 — the same R/A ownership semantics as the Tasks DB-view).
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { ObjectiveRow } from '@/lib/db/objectives'
import type { WorkLineRow } from '@/lib/db/work-lines'
import { raciOwner } from '@/lib/raci-member'

export type LadderObjectiveGroup = {
  key: string                         // objective id | '__unlinked__'
  label: string                       // objective name | the Unlinked label
  isUnlinked: boolean
  workLines: LadderWorkLineGroup[]
}
export type LadderWorkLineGroup = {
  key: string                         // work_line id | '__no_workline__'
  label: string                       // work_line name | the No-PP label
  type: 'project' | 'process' | null  // null = the No-PP group
  isNoWorkLine: boolean
  tasks: TaskListRow[]
}
export type Ladder = LadderObjectiveGroup[]

export type BuildLadderInput = {
  objectives: ObjectiveRow[]
  workLines: WorkLineRow[]
  tasks: TaskListRow[]
  viewerId: string | null
  mine: boolean
  labels: { unlinked: string; noWorkLine: string }
}

const UNLINKED = '__unlinked__'
const NO_WL = '__no_workline__'

export function buildLadder(input: BuildLadderInput): Ladder {
  const { objectives, workLines, viewerId, mine, labels } = input
  const tasks = mine && viewerId
    ? input.tasks.filter((t) => raciOwner(t, viewerId))
    : input.tasks

  // tasks grouped by objective_id (null -> UNLINKED)
  const byObjective = new Map<string, TaskListRow[]>()
  for (const t of tasks) {
    const k = t.objective_id ?? UNLINKED
    const arr = byObjective.get(k) ?? []
    arr.push(t)
    byObjective.set(k, arr)
  }

  // objective order: catalog name order, then UNLINKED trailing (FR-303)
  const objKeys = objectives.map((o) => o.id)
  if (byObjective.has(UNLINKED)) objKeys.push(UNLINKED)

  const ladder: Ladder = []
  for (const oKey of objKeys) {
    const objTasks = byObjective.get(oKey)
    if (!objTasks || objTasks.length === 0) continue // drop empty objective branches (AC-301)

    // this objective's tasks grouped by work_line_id (null -> NO_WL)
    const byWl = new Map<string, TaskListRow[]>()
    for (const t of objTasks) {
      const k = t.work_line_id ?? NO_WL
      const arr = byWl.get(k) ?? []
      arr.push(t)
      byWl.set(k, arr)
    }
    const wlKeys = workLines.filter((w) => byWl.has(w.id)).map((w) => w.id) // name order (FR-301)
    if (byWl.has(NO_WL)) wlKeys.push(NO_WL) // No-PP trailing (FR-304)

    const wlGroups: LadderWorkLineGroup[] = []
    for (const wKey of wlKeys) {
      const wlTasks = byWl.get(wKey)!
      if (wKey === NO_WL) {
        wlGroups.push({ key: NO_WL, label: labels.noWorkLine, type: null, isNoWorkLine: true, tasks: wlTasks })
      } else {
        const w = workLines.find((x) => x.id === wKey)!
        wlGroups.push({ key: w.id, label: w.name, type: w.type, isNoWorkLine: false, tasks: wlTasks })
      }
    }

    if (oKey === UNLINKED) {
      ladder.push({ key: UNLINKED, label: labels.unlinked, isUnlinked: true, workLines: wlGroups })
    } else {
      const o = objectives.find((x) => x.id === oKey)!
      ladder.push({ key: o.id, label: o.name, isUnlinked: false, workLines: wlGroups })
    }
  }
  return ladder
}
```
**File (new):** `mos-app/src/lib/cascade/build-ladder.test.ts` — `AC-301` cases (plain `.ts`, mock rows):
  - (a) one objective → two work_lines → tasks: ladder = [O → [WL1, WL2]].
  - (b) **Mine narrows**: viewer is R on one task under O→WL1 only; with `mine:true` only that branch survives (other work_line group + empty objective drop).
  - (c) **Unlinked**: a task with `objective_id=null` but `work_line_id=WL` → renders under the `(Unlinked)` objective → WL (no task hidden).
  - (d) **No Project/Process**: a task with `work_line_id=null` → renders under its objective's "No Project/Process" sub-group; a task with both null → under Unlinked → No-PP.
  - (e) empty input → `[]`.
**Verify:** `cd mos-app && npx vitest run src/lib/cascade/build-ladder.test.ts` → green; `npm run typecheck`.

### T7 — client capabilities lib + test
**AC tagged:** supports AC-302 (affordance + guard) — mirrors the DB seed for client-side affordance/route hiding (convenience only; RLS is authority per FR-333).
**File (new):** `mos-app/src/lib/capabilities.ts`

```ts
// Client capability derivation (ADR-0020 D4 — convenience only; RLS is the authority, FR-333).
// Mirrors the shared.role_capabilities seed (supabase/migrations/20260708000001) for the v1
// grants. Reuses auth.viewer.accessRoles (the JWT access_roles claim — same source the DB reads).
// TODO(admin-editable-roles, ADR-0020 D2): replace this static map with an RPC
// (shared.my_capabilities()) once grants become admin-editable. Until then the seed is static.
export const ROLE_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  admin: ['objective.manage', 'workline.manage'],
  ops_lead: ['workline.manage'],
  // member / finance / manager-derived: no manage capabilities in v1
}

/** True iff any of the viewer's accessRoles is granted `capability` (v1 seed). */
export function can(accessRoles: readonly string[], capability: string): boolean {
  return accessRoles.some((r) => (ROLE_CAPABILITIES[r] ?? []).includes(capability))
}
```
**File (new):** `mos-app/src/lib/capabilities.test.ts` — `can(['admin'],'objective.manage')===true`; `can(['ops_lead'],'workline.manage')===true && can(['ops_lead'],'objective.manage')===false`; `can(['member'], …)===false`; `can([], …)===false`; `can(['unknown-role'], …)===false`; multi-role union (`['ops_lead','admin']` → both).
**Verify:** `cd mos-app && npx vitest run src/lib/capabilities.test.ts` → green; `npm run typecheck`.

---

## Phase D — CascadeView component + GroupHeaderRow additive prop

### T8 — GroupHeaderRow: additive `readOnly` prop (no editor changes)
**AC tagged:** supports AC-300 (reuse GroupHeaderRow in a read-only context).
**Edit:** `mos-app/src/components/tasks/group-header-row.tsx`:
  - add `readOnly?: boolean` to `GroupHeaderRowProps`;
  - in the render: when `readOnly`, omit the "+ Add task" `<button className="gadd">` and render the overdue subtotal as plain `<span>` (no click-to-filter `gsub` button). Caret + label + work-line type tag + count always render.
  - existing callers pass nothing → `readOnly` falsy → **byte-identical output** (update `group-header-row.test.tsx` only to assert the new prop defaults off; no existing assertion changes).
**Verify:** `cd mos-app && npx vitest run src/components/tasks/group-header-row.test.tsx && npm run typecheck`.

### T9 — CascadeView skeleton + desktop ladder render (AC-300)
**AC tagged:** AC-300 (renders Objective→work_line→task ladder; reuses `GroupHeaderRow` + `useCascadeCatalogs`).
**File (new):** `mos-app/src/pages/cascade-page.tsx` — the `CascadePage` component:
  - loads `listTasks({})` + `getPeople()` (blocking gate) and `useCascadeCatalogs()` (non-blocking, reused — no parallel loader);
  - `useAuth()` → `viewerId`, `accessRoles`; `useT()` for all strings;
  - `buildLadder({ objectives, workLines, tasks, viewerId, mine, labels: { unlinked: t('cascade.unlinked'), noWorkLine: t('cascade.noWorkLine') } })`;
  - renders a flat ladder list: for each objective group → a `GroupHeaderRow` (readOnly, label = objective name or `t('cascade.unlinked')`, `workLineType=null`); for each work_line sub-group → a `GroupHeaderRow` (readOnly, indented via `cascade-lvl-2` class, `workLineType=group.type` or `null` for No-PP, label = work_line name or `t('cascade.noWorkLine')`); then the task leaves via a small `CascadeTaskLeaf` (title + owner name from the people map + due via `formatDate`/`dueStatus` + `StatusPill`);
  - `PageHead` title `t('cascade.title')`, subtitle `t('cascade.subtitle')`.
**File (new):** `mos-app/src/pages/cascade-page.test.tsx` — RTL, mocks `listTasks`/`getPeople`/`listObjectives`/`listWorkLines` (same `vi.mock` pattern as `cascade-d4.test.tsx`), `useAuth` via `AuthContext.Provider`. **AC-300 case:** mock one objective → two work_lines (one project, one process) → tasks; assert the objective header renders (label text), both work_line headers render with their type tag (reuse of `GroupHeaderRow`), and the task row appears; assert `useCascadeCatalogs` was the loader (spy on `listObjectives`/`listWorkLines` — called once on mount, not re-called).
**Verify:** `cd mos-app && npx vitest run src/pages/cascade-page.test.tsx` → AC-300 green; `npm run typecheck`.

### T10 — CascadeView: Mine toggle + Unlinked/No-PP render (AC-301 render)
**AC tagged:** AC-301 (rendering — the branch logic itself is owned by `build-ladder.test.ts`; this asserts the rendered branches).
**Edit:** `cascade-page.tsx` + `cascade-page.test.tsx`. Add a Mine/All segmented toggle (`t('cascade.mine')` / `t('cascade.all')`) bound to `mine`. **AC-301 RTL case:** given a task with `objective_id=null`+`work_line_id=WL` and a task with `work_line_id=null`, assert the `(Unlinked)` objective header and the "No Project/Process" work_line header render (no task hidden); with Mine on and the viewer R on one task, assert only that branch's headers render.
**Verify:** `cd mos-app && npx vitest run src/pages/cascade-page.test.tsx` → AC-301 green.

### T11 — CascadeView: WorkloadCaption when Mine (AC-303)
**AC tagged:** AC-303 (reuse `WorkloadCaption`, not a rebuilt caption).
**Edit:** `cascade-page.tsx` + test. When `mine && viewerId`, compute a `WorkloadSummary` from the viewer's open non-archived tasks (distinct project vs process work_line ids + unassigned count — mirrors the caption's existing contract) and render `<WorkloadCaption summary={…} />`. **AC-303 RTL case:** Mine on → the caption sentence is present (`role="status"`, `aria-label="Workload summary"`); Mine off → absent.
**Verify:** `cd mos-app && npx vitest run src/pages/cascade-page.test.tsx` → AC-303 green.

### T12 — CascadeView: Manage affordance (AC-302 affordance clauses) + states + useT
**AC tagged:** AC-302 (affordance clauses 1 + 2).
**Edit:** `cascade-page.tsx` + test. In `PageHead`'s `action` slot: if `can(accessRoles,'objective.manage')` → a `<Link to="/objectives">{t('cascade.manage.objectives')}</Link>`; if `can(accessRoles,'workline.manage')` → `<Link to="/projects-processes">{t('cascade.manage.projects')}</Link>`. If neither → render nothing. **AC-302 RTL cases:** (1) `accessRoles=['member']` → neither link present; (2) `accessRoles=['ops_lead']` → only the projects & processes link present (not objectives); (3) `accessRoles=['admin']` → both. Also wire loading (`t('cascade.loading')`)/error (`t('cascade.error.title')` + retry)/empty (`t('cascade.empty.*'` or `t('cascade.mine.empty.*')`) states.
**Verify:** `cd mos-app && npx vitest run src/pages/cascade-page.test.tsx` → AC-302 affordance clauses green; `npm run typecheck`.

---

## Phase E — route + nav link + capability guard

### T13 — `RequireCapability` guard + test (AC-302 redirect clause)
**AC tagged:** AC-302 (clause 3 — direct-visit-deny redirects to the cascade view).
**File (new):** `mos-app/src/auth/require-capability.tsx` — mirrors `require-access-role.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './use-auth'
import { can } from '@/lib/capabilities'

// Capability route gate (ADR-0020 D4, FR-313). Nested under ProtectedRoute. A session whose
// accessRoles do not grant `capability` is bounced to the everyone cascade view — a hidden route
// is convenience, not a security boundary (RLS via shared.can() is the real gate, FR-333).
export function RequireCapability({ capability }: { capability: string }) {
  const auth = useAuth()
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  if (!can(roles, capability)) return <Navigate to="/work/cascade" replace />
  return <Outlet />
}
```
**File (new):** `mos-app/src/auth/require-capability.test.tsx` — `MemoryRouter` pattern from `require-access-role.test.tsx`. **AC-302 clause-3 cases:** (a) `accessRoles=[]` at `/objectives` → redirected to `/work/cascade` (assert cascade stub renders, not the outlet); (b) `accessRoles=['admin']` at `/objectives` → outlet renders; (c) `accessRoles=['ops_lead']` at `/objectives` (lacks `objective.manage`) → redirected to `/work/cascade`; (d) `accessRoles=['ops_lead']` at `/projects-processes` → outlet renders; (e) loading → redirected (no protected flash).
**Verify:** `cd mos-app && npx vitest run src/auth/require-capability.test.tsx` → AC-302 clause 3 green.

### T14 — router: `/work/cascade` route + re-key manage routes
**Edit:** `mos-app/src/router.tsx`:
  - import `CascadePage` and `RequireCapability`;
  - add `{ path: 'work/cascade', element: <CascadePage /> }` as a sibling under `AppShell`'s children (everyone, no gate) — placed near `tasks`;
  - replace `{ element: <RequireAccessRole anyOf={['admin']} />, children: [{ path: 'objectives', … }] }` → `{ element: <RequireCapability capability="objective.manage" />, children: [{ path: 'objectives', element: <ObjectivesPage /> }] }`;
  - replace the `projects-processes` block's `RequireAccessRole anyOf={['ops_lead','admin']}` → `RequireCapability capability="workline.manage"`.
  - `RequireAccessRole` stays (still used by `/sales`).
**Note:** grep first (`grep -rn "objectives\|projects-processes" mos-app/src --include=*.test.tsx`) — confirmed no test asserts the old `/` redirect target for these two routes, so the redirect-target change (`/` → `/work/cascade`) is safe. If `router.test.tsx` references these routes' guard, update the assertion to the capability gate.
**Verify:** `cd mos-app && npm run typecheck && npx vitest run src/router.test.tsx`.

### T15 — destinations: cascade link under Work + i18n label plumbing (AC-304 link clause)
**AC tagged:** AC-304 (cascade link under Work, no gate; label via `useT()` → id string).
**Edit:** `mos-app/src/shell/sections.tsx` — add an optional `labelKey?: MessageKey` to `Section` (additive; existing links unchanged).
**Edit:** `mos-app/src/shell/rail-nav.tsx` — in `NavItem`, render `{section.labelKey ? t(section.labelKey) : section.label}` (the rail already imports `useT`); this is the **one** shell-chrome change beyond the Work link itself, required so the new link label resolves via the i18n catalog (FR-321/AC-304). Existing links (no `labelKey`) render `label` byte-identically. (The mobile drawer reuses `RailNav`, so it is covered for free.)
**Edit:** `mos-app/src/shell/destinations.tsx` — import `ObjectiveIcon`; add the cascade link to the `work` destination's `links` **before** Tasks is fine, but to keep the primary path (`/tasks`) stable set it after Tasks:

```tsx
links: [
  { path: '/tasks', label: 'Tasks', Icon: TasksIcon },
  { path: '/work/cascade', label: 'Cascade', Icon: ObjectiveIcon, labelKey: 'cascade.link' },
  ...(SHOW_WEEKLY_UPDATES ? […] : []),
  ...(SHOW_DAILY_LOG ? […] : []),
],
```
  - `primaryPath` stays `/tasks` (Work's bottom-tab target unchanged — regroup only).
**Edit:** `mos-app/src/shell/destinations.test.ts` — **AC-304 link clause:** update the "work has a single link to /tasks" case → assert Work's links are `[{path:'/tasks',…},{path:'/work/cascade',…}]`, that the cascade link has **no** `anyOf` gate on the destination (Work has none) and `isLive(work, [])` is true; add `destinationForPath('/work/cascade')?.id === 'work'` (breadcrumb). Add an i18n render case: render `RailNav` under locale `id` (via `I18nProvider`) and assert the cascade link's text is the `id` string (`'Cascade'`) — proves AC-304's "label resolves via useT, yields id string when locale=id".
**Verify:** `cd mos-app && npx vitest run src/shell/destinations.test.ts src/shell/rail-nav.test.tsx && npm run typecheck`.

---

## Phase F — end-to-end (AC-305)

### T16 — e2e: the everyone-cascade journey (AC-305)
**AC tagged:** AC-305 (FR-300..305/310/321).
**Prerequisite (verify first):** `supabase/seed.sql` seeds ≥1 objective, ≥1 work_line, and tasks linking them — incl. an unlinked task (`objective_id=null`) and a no-work_line task — with `VIEWER` (Cahya, `40000000-…-0001`) as **R or A** on ≥1 task. If absent, add seed rows (additive, under `supabase/seed.sql`) so the journey has line-of-sight to assert.
**File (new):** `mos-app/e2e/AC-305-cascade.spec.ts` — reuses `loginAs` (`e2e/helpers/login.ts`) + `VIEWER` (`e2e/fixtures/users.ts`); phone viewport (`useMobileViewport`/`projects[0].use = … ` per existing phone e2e; see `tasks-deeplink-mobile-keyboard.spec.ts` for the phone-setup pattern). Journey:
  1. `loginAs(page, VIEWER.email, VIEWER.password)`;
  2. phone: the bottom-tab bar is present (chrome is phone-first); tap Work → open drawer → tap **Cascade** (`getByRole('link', { name: 'Cascade' })`); (desktop fallback: click the rail Cascade link);
  3. assert the cascade heading (`t('cascade.title')` text) + the ladder renders (≥1 objective header + work_line header + task);
  4. tap **Mine**; assert only the viewer's line-of-sight remains (their R/A task up through its work_line/objective); assert the "(Unlinked)" and "No Project/Process" branches render where the seed has such tasks (no task silently hidden).
**Verify:** `cd mos-app && npx playwright test e2e/AC-305-cascade.spec.ts`.

---

## Phase G — full battery + review checklist

### T17 — full local battery (merge gate)
**Run (all must pass):**
- `cd mos-app && npm run typecheck`
- `cd mos-app && npx eslint src --max-warnings=0`
- `cd mos-app && npx vitest run`
- `supabase test db`
- `cd mos-app && npx playwright test`
**Expected:** zero typecheck errors; zero lint errors; all unit green (incl. AC-300..304); pgTAP green (incl. AC-310..315 + tests 51/58/72/73); e2e green (incl. AC-305 + existing AC-020).

### T18 — review routing (Director dispatches after T17 green)
- **spec-reviewer** — every FR/AC placed + the test-pyramid layering (one owner per AC).
- **code-quality-reviewer** — TDD red→green evidence, no placeholders, reuse map honored.
- **security-auditor + gpt-5.4 (cross-family reviewer)** — **focus: `shared.can()`** (Phase A): trust boundary (JWT claim + migration-only seed), `SECURITY INVOKER` + `search_path=''` correctness, RLS-on-reference-data posture, the contract-proof test (Phase B T3) genuinely proves `can()` is consulted, and the client map (T7) is convenience-only (FR-333).
- **design-reviewer (3-lens)** — CascadeView phone-first + literacy bar (NFR-300/306/307) before merge.

---

## Verify-your-own-work (FR → AC → task traceability)

| FR / NFR | Owning AC(s) | Owning task(s) | Layer |
|---|---|---|---|
| FR-300 (Work link, no gate) | AC-300, AC-304 | T9, T15 | unit |
| FR-301 (ladder render) | AC-300, AC-305 | T9, T16 | unit + e2e |
| FR-302 (Mine filter) | AC-301, AC-305 | T6, T10, T16 | unit + e2e |
| FR-303 (Unlinked branch) | AC-301 | T6, T10 | unit |
| FR-304 (No Project/Process) | AC-301 | T6, T10 | unit |
| FR-305 (reuse cascade components) | AC-300, AC-303 | T9, T11 | unit |
| FR-310 (Manage affordance) | AC-302 | T12 | unit |
| FR-311 (no affordance w/o cap) | AC-302 | T12 | unit |
| FR-312 (manage = existing catalog) | AC-302 + existing AC-020 | T14 (re-key gate only) | unit + e2e (existing) |
| FR-313 (direct-visit deny) | AC-302 | T13, T14 | unit |
| FR-320 (one Work link, regroup only) | AC-304 | T15 | unit |
| FR-321 (i18n en+id) | AC-304 | T5, T9–T12, T15 | unit |
| FR-330 (read org-scoped) | AC-310 | T3 | pgTAP |
| FR-331 (write → can()) | AC-311, AC-312 | T3, T4 | pgTAP |
| FR-332 (can() introduction) | AC-311, AC-312 | T1, T2 | pgTAP |
| FR-333 (RLS authority) | AC-313 | T3 | pgTAP |
| FR-334 (no delete) | AC-314 | T3 | pgTAP |
| NFR-300 (phone-first) | AC-305 | T16 | e2e |
| NFR-301 (bilingual) | AC-304 | T5 | unit |
| NFR-302 (RLS authority) | AC-313 | T3 | pgTAP |
| NFR-303 (reuse) | AC-300, AC-303 | T9, T11 | unit |
| NFR-304 (tenancy) | AC-315 | T3 | pgTAP |
| NFR-305 (no delete) | AC-314 | T3 | pgTAP |
| NFR-306/307 (literacy/a11y) | AC-300, AC-305 | T9, T16, T18 (design-review) | unit/e2e/review |
| NFR-308 (coverage/lint/typecheck) | — | T17 | gate |
| NFR-309 (perf, mount-once) | AC-300 (reuse `useCascadeCatalogs`) | T9 | unit |

**Phase order is TDD-sound:** every DB test (T1, T3) is written before its migration (T2, T4) with a genuine red (T3's grant-opens-write clauses fail under role-hardcoded policies); every component task writes the failing RTL case before/with the code; the i18n parity block precedes the keys.

**AC ownership (one owner each, lowest sufficient layer):**
- AC-300 → `cascade-page.test.tsx` (T9). AC-301 → `build-ladder.test.ts` (T6, pure unit) + rendered in T10. AC-302 → `cascade-page.test.tsx` (T12, affordance) + `require-capability.test.tsx` (T13, redirect) — both unit; grep `AC-302` finds both (the AC's three clauses live in two components). AC-303 → `cascade-page.test.tsx` (T11). AC-304 → `destinations.test.ts` (T15, link) + `messages.test.ts` (T5, i18n). AC-310..315 → `73_mos_work_spine_rls.sql` (T3). AC-305 → `e2e/AC-305-cascade.spec.ts` (T16).

**Nothing left unplaced.** Every FR-300..334, every AC-300..315, and every NFR-300..309 has at least one task that implements + proves it.

**Open questions / residual risks for the Director:**
1. **Seed prerequisite for AC-305** (T16): confirm/augment `supabase/seed.sql` so VIEWER (Cahya) has R/A tasks across linked + unlinked + no-work_line cases. Owner/Director to confirm the dev canon supports this without colliding with other e2e specs (the dedicated `e2e.*` person pattern is the fallback).
2. **`RequireCapability` redirect "neutral message"** (FR-313): interpreted minimally as *redirect to `/work/cascade`* (the neutral surface). No banner string is asserted by AC-302; a `?denied=` banner is an additive follow-up if the owner wants an explicit message.
3. **Client capability map duplication** (T7): the static `ROLE_CAPABILITIES` mirrors the DB seed by design (minimal; RLS is authority). Flagged with an in-file TODO for the RPC swap when ADR-0020 D2's admin UI lands — security-auditor to confirm this is acceptable for v1.
4. **`role_capabilities` is global (no `org_id`)** for v1: consistent with the role-vocabulary posture today; per-org grants arrive with the admin-editable-roles slice. Noted in the migration comment.

PLAN-DONE
