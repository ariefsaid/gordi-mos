# Plan — Strategy-to-Execution cascade foundation (first slice)

- Date: 2026-06-23
- Spec: `docs/specs/cascade-foundation.spec.md` (FR-200..234, NFR-200..205, AC-200..234)
- Binding: **ADR-0014** (6-level model, 3 tables now, additive-not-inserted topology, A/R per layer),
  **OD-C-1** (`docs/decisions.md`), `CONTEXT.md` § Cascade / § Ownership.
- Mirrors: `supabase/migrations/20260611000007_mos_tasks.sql` (table shape, `org_id` default, indexes,
  `set_updated_at` trigger), `…000009_mos_rls.sql` (RLS posture, `_guard_archive`),
  `…20260612000006_ops_log_guard.sql` (same-org guard), `…20260619000001_shared_person_access_roles.sql`
  (role-gated RLS), `…20260620000009_…approve_kitchen_log_rpc.sql` (SECURITY DEFINER RPC pattern),
  `mos-app/src/lib/db/tasks.ts` (schema-scoped client + throwOnError), `…/db/team.ts`, `…/db/viewer.ts`.

---

## 0. Naming reconciliation — READ FIRST (spec vs CONTEXT.md drift)

The spec (drafted 2026-06-23 morning) names the layer-4 entity **`Initiative` / `mos.initiatives`**.
`CONTEXT.md` § Cascade and OD-C-1's "Open" line were updated **later the same day** by the owner:

> "No umbrella term is locked (owner 2026-06-23 — 'use the Project/Process pair for now'; the earlier
> 'Initiative' is dropped); refer to the pair, or to the specific type." — `CONTEXT.md:67-70`
> _Avoid_: **Initiative**, workstream, work (umbrella terms — none locked) — `CONTEXT.md:70`

CONTEXT.md is the later authority and the de-reference firewall forbids re-introducing a dropped term.
**This plan does NOT use `Initiative`.** It carries a single open question (§9 Q1) for the owner to pick the
physical table name and proposes a recommendation. Every task below is written against the recommended
name with a one-line note on what to rename if the owner picks the alternative. No code or test depends on
the *display* term — in-app copy uses "Project / Process".

**Physical-name recommendation:** `mos.work_lines` (column on tasks: `work_line_id`).
- Rationale: it is a neutral container noun for "a line of work" that reads naturally for *both*
  `type=project` and `type=process`, is not on the CONTEXT.md _Avoid_ list, and avoids the awkward
  plural-pair table name. `mos.projects_processes` is the literal alternative but reads as two tables
  fused and pluralises badly in code (`projectsProcesses`). Snake_case + UUID PK + `org_id` per ADR-0014 §4.
- **If the owner rejects `work_lines`:** the only mechanical change is the table name and the
  `work_line_id` bridge column name; every policy/guard/index/RPC/test/data-layer symbol derives from
  those two tokens. A find-replace of `work_lines`→`<chosen>` and `work_line_id`→`<chosen>_id` is the
  entire delta. Hold the owner pick (Q1) before the migration tasks run.

Below, **WL** = the chosen Project/Process table (`mos.work_lines` recommended).

---

## 1. Design

### 1.1 Architecture & data flow

Three additive layers, all in schema `mos`, all behind RLS, all `org_id`-seamed:

```
mos.objectives        (layer 2)  ── parent_objective_id self-FK (UNUSED v1, no cycle guard)
   ▲ objective_id? (nullable FK)
mos.work_lines  [WL]  (layer 4)  ── type ∈ {project,process}, lane ∈ {run,optimize,transform}
   ▲ work_line_id? (nullable FK on mos.tasks)
mos.tasks             (layer 6, EXISTS — one ADD COLUMN, no reshape)
```

Read path mirrors `tasks.ts`: SPA → `supabase.schema('mos')` on the one pinned auth client → PostgREST →
RLS decides. No cross-schema FK embeds (PGRST200 lesson — A/R/BU display names resolve client-side via
`directory.ts`, exactly as `tasks.ts` does). `org_id` is NEVER sent by the client — the column default
`shared.current_org_id()` stamps it and RLS `WITH CHECK` pins it unspoofable.

Write path: same-org integrity that RLS `WITH CHECK` cannot express (comparing a *referenced* row's
`org_id` to the new row's `org_id`) is enforced by a `BEFORE INSERT OR UPDATE` guard trigger per table,
directly mirroring `ops._guard_log_entry` (raises `23514`). Archival immutability/gate mirrors
`mos._guard_archive`.

The **Workload** read (the headline, FR-230..234) is a single **SECURITY DEFINER RPC**
`mos.person_workload(p_person_id uuid)` returning one row per non-archived WL the subject is A or R on,
each with the subject's open-linked-task count, plus `lane`/`type` for client grouping. RPC-vs-view
decision and justification in §1.4.

### 1.2 `mos.objectives` shape (FR-200..205)

| column | type | notes |
|---|---|---|
| `id` | uuid PK `default gen_random_uuid()` | |
| `org_id` | uuid NOT NULL → `shared.orgs(id)` `default shared.current_org_id()` | seam |
| `title` | text NOT NULL `check (btrim(title) <> '')` | mirrors tasks |
| `description` | text NULL | |
| `lane` | text NULL `check (lane is null or lane in ('run','optimize','transform'))` | nullable — an Objective may span lanes (spec §3) |
| `accountable_person_id` | uuid NOT NULL → `shared.people(id)` | A |
| `responsible_person_id` | uuid NOT NULL → `shared.people(id)` | R |
| `parent_objective_id` | uuid NULL → `mos.objectives(id)` | **UNUSED v1, no cycle guard** (ADR-0014 §4) |
| `archived_at` | timestamptz NULL | soft-archive |
| `created_by` | uuid NOT NULL → `shared.people(id)` `default shared.current_person_id()` | |
| `created_at` / `updated_at` | timestamptz NOT NULL `default now()` | `set_updated_at` trigger |

Indexes: `(org_id)`, `(org_id) where archived_at is null`, `(accountable_person_id)`,
`(responsible_person_id)`, `(parent_objective_id)`.

### 1.3 `mos.work_lines` [WL] shape (FR-210..216)

| column | type | notes |
|---|---|---|
| `id` | uuid PK `default gen_random_uuid()` | |
| `org_id` | uuid NOT NULL → `shared.orgs(id)` `default shared.current_org_id()` | seam |
| `title` | text NOT NULL `check (btrim(title) <> '')` | |
| `description` | text NULL | |
| `type` | text NOT NULL `check (type in ('project','process'))` | set at create; not editable v1 (FR-215) |
| `lane` | text NOT NULL `check (lane in ('run','optimize','transform'))` | required (spec §3) |
| `business_unit_id` | uuid NOT NULL → `shared.business_units(id)` | |
| `accountable_person_id` | uuid NOT NULL → `shared.people(id)` | A |
| `responsible_person_id` | uuid NOT NULL → `shared.people(id)` | R |
| `objective_id` | uuid NULL → `mos.objectives(id)` | nullable link (FR-213) |
| `archived_at` | timestamptz NULL | |
| `created_by` | uuid NOT NULL → `shared.people(id)` `default shared.current_person_id()` | |
| `created_at` / `updated_at` | timestamptz NOT NULL `default now()` | trigger |

**NO date/timebox columns v1** (ADR-0014 §4 — additive later). Indexes: `(org_id)`,
`(org_id) where archived_at is null`, `(business_unit_id)`, `(objective_id)`,
`(accountable_person_id)`, `(responsible_person_id)`, `(lane)`, `(type)`.

### 1.4 RPC vs view — DECISION: **SECURITY DEFINER RPC** `mos.person_workload(p_person_id)`

Considered: (A) a plain SQL view + RLS; (B) a `SECURITY INVOKER` SQL function; (C) a `SECURITY DEFINER`
RPC with an explicit access gate. **Chosen: C.** Justification:

- The access rule for FR-230/234 is **"manager-of(subject) OR self OR admin"** — it is a property of the
  *(viewer, subject)* pair, not a per-row org predicate. A view's RLS can only express "rows the viewer
  may read"; it cannot say "you may read person X's load iff you manage X". Encoding the pair-gate in a
  view forces it into every `using()` clause and leaks subject-existence through empty-vs-denied ambiguity.
- A DEFINER RPC makes the gate a single explicit, audited check (mirrors `ops.approve_kitchen_log` steps
  1a/2): one `if not (self OR is_manager_of OR admin) then raise 42501` line, evaluated once, before any
  read — so denial is a clean `42501`, never an oracle.
- **`is_manager_of` is the only viable DB-side manager test.** The auth hook does NOT stamp `manager`
  into the JWT `access_roles` claim (`…000002` lines 32-33: "manager is NOT stamped — derived"); it is
  injected client-side only (`viewer.ts:131`). So `shared.has_access_role('manager')` is *always false at
  the DB layer*. The RPC and the WL write policies MUST use `shared.is_manager_of(target)` for the manager
  capability — `has_access_role('admin'|'ops_lead')` for the assigned roles. **This is binding for §2 and
  §3.**
- Performance (NFR-203): one round-trip; the RPC does one indexed scan of `mos.work_lines` filtered by
  `(org_id, archived_at is null)` + `(A=subject OR R=subject)` and a correlated count over `mos.tasks`
  on `(work_line_id, status<>'Done', archived_at is null)`. At Gordi scale (≤ few hundred WLs/org) this is
  sub-millisecond. The DEFINER body re-applies `org_id = shared.current_org_id()` to every read so it can
  never cross tenants despite RLS bypass (mirrors `approve_kitchen_log` step 1a).

DEFINER caveat handled exactly like the kitchen RPC: the function bypasses RLS, so it explicitly pins
`org_id` and explicitly gates the role/relationship before reading. `revoke execute … from public, anon`;
`grant execute … to authenticated`.

### 1.5 Error handling (spec §7) — where each lands

| Condition | Mechanism |
|---|---|
| A/R or BU not in org | guard trigger `23514` (insert/update) |
| `type`/`lane` out of set | column `CHECK` (`23514`) |
| `objective_id` cross-org | guard trigger `23514`; NULL → unlinked (allowed) |
| non-manager requests another's Workload | RPC `raise 42501` |
| archived WL/objective | hidden by `archived_at is null` list filter; still resolvable by id |
| task → archived WL | allowed; excluded from open-load by the RPC's status/archived filter |
| write by member lacking role | RLS `WITH CHECK` denies; UI surfaces neutral copy |

---

## 2. Migrations (reversible; each its own file; DOWN noted inline per repo convention)

> Ordering: WL FKs objectives, so objectives table first. Verify the whole stack after the last one with
> `supabase db reset` (applies all migrations clean) + `supabase test db` (§6).

### Task 2.1 — `mos.objectives` table + trigger + grants (NFR-202)
**File (new):** `supabase/migrations/20260623000001_mos_objectives.sql`
Write the `create table mos.objectives (…)` exactly per §1.2 (UUID PK, `org_id default
shared.current_org_id()`, the `lane` nullable CHECK, A/R/created_by FKs to `shared.people`,
`parent_objective_id` self-FK with **no** cycle guard and a comment saying "UNUSED v1, ADR-0014 §4",
`archived_at`, timestamps). Add the six indexes from §1.2. Add
`create trigger objectives_set_updated_at before update on mos.objectives for each row execute function
shared.set_updated_at();`. Add `grant select, insert, update on mos.objectives to authenticated;`
(**no DELETE grant** — soft-archive only, mirrors tasks). End-of-file DOWN comment:
`-- DOWN: drop table mos.objectives cascade;` (drops indexes+trigger+grants with it).
**Verify:** `cd /Users/ariefsaid/Coding/gordi-mos && supabase db reset 2>&1 | tail -5` → applies with no error.

### Task 2.2 — `mos.objectives` RLS + same-org guard + archive guard (NFR-200/201, FR-204/205)
**File (new):** `supabase/migrations/20260623000002_mos_objectives_rls.sql`
1. `alter table mos.objectives enable row level security; … force row level security;`
2. **SELECT** — org-readable: `create policy objectives_select_org … for select to authenticated using
   (org_id = shared.current_org_id());`
3. **INSERT** — admin or manager: `with check (org_id = shared.current_org_id() and shared.is_org_member()
   and (shared.has_access_role('admin') or shared.is_manager_of(responsible_person_id) or
   shared.is_manager_of(accountable_person_id)));` *(manager = is_manager_of one of the A/R; NOT
   has_access_role('manager') — see §1.4)*.
4. **UPDATE** — same gate in both `using` and `with check` (admin or manager-of-A/R), plus
   `org_id = shared.current_org_id()`.
5. **NO delete policy** (hard delete denied).
6. **Same-org guard** `mos._guard_objective()` (`security invoker`, `set search_path=''`, mirrors
   `ops._guard_log_entry`): on INSERT/UPDATE, for each of `accountable_person_id`, `responsible_person_id`
   look up `shared.people.org_id` and `raise 23514` if distinct from `new.org_id`; on UPDATE, raise
   `42501` if `org_id` or `created_by` changes (immutable). `before insert or update on mos.objectives`.
7. **Archive non-cascade (FR-205)** is automatic — archival only sets `objectives.archived_at`; WL rows are
   a separate table and are untouched. No extra code; the pgTAP AC-205 proves it.
End DOWN comment: drop the three policies, the guard trigger, and `mos._guard_objective()`.
**Verify:** `supabase db reset 2>&1 | tail -3 && supabase test db 2>&1 | tail -5`.

### Task 2.3 — `mos.work_lines` [WL] table + trigger + grants (FR-210/211, NFR-202)
**File (new):** `supabase/migrations/20260623000003_mos_work_lines.sql`
`create table mos.work_lines (…)` per §1.3 — note the `type` and `lane` NOT-NULL CHECKs, FK
`objective_id → mos.objectives(id)` nullable, `business_unit_id → shared.business_units(id)` NOT NULL,
A/R/created_by FKs, `archived_at`, timestamps, `org_id default shared.current_org_id()`. Add the eight
indexes from §1.3. Add `work_lines_set_updated_at` trigger. `grant select, insert, update on
mos.work_lines to authenticated;` (no DELETE). DOWN: `drop table mos.work_lines cascade;`.
*(If owner picks `mos.projects_processes`: rename table + indexes/trigger prefix only.)*
**Verify:** `supabase db reset 2>&1 | tail -3`.

### Task 2.4 — `mos.work_lines` RLS + same-org guard (NFR-200/201, FR-212/213/216)
**File (new):** `supabase/migrations/20260623000004_mos_work_lines_rls.sql`
1. enable + force RLS.
2. **SELECT** org-readable (same shape as 2.2).
3. **INSERT** — admin, ops_lead, **or manager**: `with check (org_id = shared.current_org_id() and
   shared.is_org_member() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead') or
   shared.is_manager_of(responsible_person_id) or shared.is_manager_of(accountable_person_id)));`
4. **UPDATE** — same gate both sides + `org_id` pin.
5. **NO delete policy.**
6. **Guard** `mos._guard_work_line()` (`security invoker`, `search_path=''`): INSERT/UPDATE — `23514` if
   `accountable_person_id`/`responsible_person_id`/`business_unit_id`/`objective_id` (when non-null)
   resolve to an `org_id` distinct from `new.org_id` (look up `shared.people` / `shared.business_units` /
   `mos.objectives` respectively; cross-org rows are invisible under INVOKER RLS → NULL → distinct →
   raise, exactly the `ops._guard_log_entry` rationale). UPDATE — `42501` if `org_id`, `type`, or
   `created_by` changes (immutable; `type` is create-only per FR-215). `before insert or update`.
7. **Archive leaves linked tasks unchanged (FR-216)** — automatic: archiving sets `work_lines.archived_at`
   only; `mos.tasks.work_line_id` is a separate column, never touched. pgTAP AC-216 proves it.
DOWN: drop policies, guard trigger, `mos._guard_work_line()`.
**Verify:** `supabase db reset 2>&1 | tail -3 && supabase test db 2>&1 | tail -5`.

### Task 2.5 — `mos.tasks` bridge column `work_line_id` (FR-220/222, NFR-202)
**File (new):** `supabase/migrations/20260623000005_mos_tasks_work_line_id.sql`
Single additive ALTER, **no reshape, no backfill**:
`alter table mos.tasks add column work_line_id uuid null references mos.work_lines(id);`
`create index tasks_work_line_idx on mos.tasks (work_line_id);`
Comment: `'Permanent cascade parent → mos.work_lines (ADR-0014 topology; a Task never routes through an
Output). Nullable/additive — no backfill (FR-222).'`
**Cross-table same-org guard for the bridge:** extend the existing `mos._guard_archive` is NOT the right
home (it is archive-only). Instead add a small `mos._guard_task_work_line()` (`security invoker`,
`search_path=''`) `before insert or update on mos.tasks`: when `new.work_line_id is not null`, look up
`mos.work_lines.org_id` and `raise 23514` if distinct from `new.org_id` (FR-220 "provided the WL is in the
task's org"). Existing task RLS/triggers untouched. DOWN: drop trigger, drop function, drop index, drop
column.
**Verify:** `supabase db reset 2>&1 | tail -3` (existing task tests 12-17 must still pass:
`supabase test db 2>&1 | tail -5`).

### Task 2.6 — Workload RPC `mos.person_workload(p_person_id uuid)` (FR-230..234)
**File (new):** `supabase/migrations/20260623000006_mos_person_workload_rpc.sql`
`create or replace function mos.person_workload(p_person_id uuid) returns table (
  work_line_id uuid, title text, type text, lane text, is_accountable boolean,
  is_responsible boolean, open_task_count integer) language plpgsql security definer
  set search_path = '' as $$ … $$;`
Body, in order (mirrors `approve_kitchen_log` gate posture):
1. `v_org := shared.current_org_id();` `if v_org is null then raise 42501; end if;`
2. **Access gate (FR-230/234):** the subject must be same-org AND
   `(p_person_id = shared.current_person_id() OR shared.is_manager_of(p_person_id) OR
   shared.has_access_role('admin'))`; else `raise exception 'workload not available' using errcode='42501';`
   *(self OR manager-of-subject OR admin — never `has_access_role('manager')`, §1.4).*
3. **Return** (FR-231/232/233): select from `mos.work_lines wl` where `wl.org_id = v_org` and
   `wl.archived_at is null` and `(wl.accountable_person_id = p_person_id or wl.responsible_person_id =
   p_person_id)`, with `is_accountable`/`is_responsible` booleans, `wl.type`, `wl.lane`, and a correlated
   `(select count(*) from mos.tasks t where t.work_line_id = wl.id and t.archived_at is null and
   t.status <> 'Done')::int as open_task_count`. Order by `lane, type, title`. Empty subject → zero rows
   (FR-233 — the surface renders empty state; not an error).
`revoke execute on function mos.person_workload(uuid) from public, anon;`
`grant execute on function mos.person_workload(uuid) to authenticated;`
DOWN: revoke + `drop function mos.person_workload(uuid);`.
**Verify:** `supabase db reset 2>&1 | tail -3 && supabase test db 2>&1 | tail -5`.

### Task 2.7 — pgTAP fixture: seed objectives + work_lines + linked tasks
**File (edit):** `supabase/migrations/20260612000003_mos_test_seed.sql` is the role-tree seed; **add a new
sibling test-only fixture** to keep that file's contract stable.
**File (new):** `supabase/migrations/20260623000007_cascade_test_seed.sql`
`create or replace function mos._test_seed_cascade() returns void language plpgsql security definer
set search_path = '' as $$ begin … end; $$;` Seeds (assumes `_test_seed_role_tree()` already ran — same
fixed UUIDs, org `…a1`):
- Objective `…e1` (org a1, A=DirectMgr `…d2`, R=Author `…d1`, lane `transform`).
- WL `…e2` `type=process lane=run` BU `…a2` A=DirectMgr R=Author objective_id=`…e1` ("IG Content").
- WL `…e3` `type=project lane=transform` BU `…a2` A=Author R=Peer objective_id=`…e1` ("New-menu A").
- WL `…e4` `type=project lane=transform` BU `…a2` A=Author R=Peer objective_id null ("New-menu B").
- Foreign WL `…e9` in org `…b1` (for org-isolation AC-202).
- Tasks: 2 open + 1 Done linked to `…e2` (Author R), 1 open linked to `…e3`, 1 open linked to `…e4`;
  one task linked to a (separately) archived WL `…e8` for AC-216.
`revoke execute … from public, anon, authenticated;` DOWN: `drop function mos._test_seed_cascade();`.
**Verify:** `supabase db reset 2>&1 | tail -3`.

---

## 3. pgTAP tests (each AC tagged in the test title so `grep -r AC-### supabase/tests` finds the proof)

> All follow the `begin; create extension … pgtap; select plan(N); _test_seed_role_tree();
> _test_seed_access_roles(); _test_seed_cascade(); set local role authenticated; set local
> request.jwt.claims = '…'; …; reset role; select * from finish(); rollback;` shape (mirrors
> `48_kitchen_logs_same_org_guard.sql`). JWT claims set `org_id`/`person_id`/`access_roles` per case.

### Task 3.1 — AC-200 objective create stamps creator org (FR-200)
**File (new):** `supabase/tests/51_cascade_objective_create.sql`
As DirectMgr (`…d2`, a manager of Author) insert an objective with A/R in org a1 → assert a row exists in
`mos.objectives` with `org_id = …a1` (use `is(…)` / `results_eq`). Title: `'AC-200: manager creates
objective; org stamped'`.
**Verify:** `cd /Users/ariefsaid/Coding/gordi-mos && supabase test db 2>&1 | grep -E 'AC-200|not ok|Failed'`.

### Task 3.2 — AC-201 cross-org A/R rejected, objectives & work_lines (FR-201/212)
**File (new):** `supabase/tests/52_cascade_cross_org_ar.sql`  `plan(2)`
As an org-a1 manager: `throws_ok($$ insert into mos.objectives … responsible_person_id = '<org-b1
person …b4>' $$, '23514', null, 'AC-201: objective with foreign-org R rejected')`; and the analogous
`throws_ok` for `mos.work_lines` insert naming `…b4` as A. Both expect `23514` (guard).
**Verify:** `supabase test db 2>&1 | grep -E 'AC-201|not ok'`.

### Task 3.3 — AC-202 list isolation across orgs (FR-202/214)
**File (new):** `supabase/tests/53_cascade_org_isolation.sql`  `plan(2)`
With org-a1 claims, `results_eq` that `select count(*)` of readable non-archived `mos.objectives` excludes
the foreign-org objective, and that readable `mos.work_lines` excludes `…e9`. Title: `'AC-202: only org-A
non-archived objectives/work_lines visible'`.
**Verify:** `supabase test db 2>&1 | grep -E 'AC-202|not ok'`.

### Task 3.4 — AC-205 archive objective is non-cascading (FR-205)
**File (new):** `supabase/tests/54_cascade_objective_archive_noncascade.sql`  `plan(2)`
As DirectMgr set `…e1.archived_at = now()`; assert (a) WL `…e2` and `…e3` still exist with
`objective_id = …e1` unchanged; (b) the objective itself drops from a `archived_at is null` list.
Title: `'AC-205: archiving an objective leaves child work_lines + their objective_id intact'`.
**Verify:** `supabase test db 2>&1 | grep -E 'AC-205|not ok'`.

### Task 3.5 — AC-210 work_line type/lane validation (FR-210/211)
**File (new):** `supabase/tests/55_cascade_work_line_create.sql`  `plan(2)`
As DirectMgr: `lives_ok` inserting a WL with `type=process, lane=run`, valid BU+A/R → row created; then
`throws_ok($$ … type='foo' … $$, '23514', null, 'AC-210: invalid type rejected')` (column CHECK).
Title prefix `'AC-210'`.
**Verify:** `supabase test db 2>&1 | grep -E 'AC-210|not ok'`.

### Task 3.6 — AC-213 objective_id cross-org rejected / null unlinked (FR-213)
**File (new):** `supabase/tests/56_cascade_work_line_objective_link.sql`  `plan(2)`
As DirectMgr: `throws_ok` inserting a WL with `objective_id` = a foreign-org objective → `23514`; then
`lives_ok` inserting a WL with `objective_id = null` (created unlinked). Title prefix `'AC-213'`.
**Verify:** `supabase test db 2>&1 | grep -E 'AC-213|not ok'`.

### Task 3.7 — AC-216 archived WL leaves linked task unchanged (FR-216/222)
**File (new):** `supabase/tests/57_cascade_work_line_archive_task.sql`  `plan(2)`
Given the task linked to `…e8` from the fixture: as a WL editor set `…e8.archived_at = now()`; assert the
task row's `work_line_id` is still `…e8` and the task is otherwise unchanged. Title prefix `'AC-216'`.
**Verify:** `supabase test db 2>&1 | grep -E 'AC-216|not ok'`.

### Task 3.8 — AC-234 own-workload allowed, other's denied (FR-234)
**File (new):** `supabase/tests/58_cascade_person_workload_gate.sql`  `plan(3)`
- As **Author** (`…d1`, a non-manager) calling `mos.person_workload('…d1')` (self) → `results_ne` empty /
  returns ≥1 row (Author owns `…e2`).
- As **Author** calling `mos.person_workload('…d4' /* Peer */)` → `throws_ok(…, '42501', null, 'AC-234:
  non-manager denied another's workload')`.
- As **DirectMgr** (manager of Author) calling `mos.person_workload('…d1')` → `lives_ok` (manager path).
Title prefix `'AC-234'`. *(Also implicitly exercises FR-230/231/232 row shape at the DB.)*
**Verify:** `supabase test db 2>&1 | grep -E 'AC-234|not ok'`.

---

## 4. Data layer (`mos-app/src/lib/db/`) — schema-scoped client + throwOnError (mirror `tasks.ts`)

### Task 4.1 — types for the two new entities
**File (new):** `mos-app/src/lib/db/cascade.types.ts`
Export `WorkLineType = 'project' | 'process'`, `Lane = 'run' | 'optimize' | 'transform'`,
`interface ObjectiveRow { id; org_id; title; description: string|null; lane: Lane|null;
accountable_person_id; responsible_person_id; parent_objective_id: string|null; archived_at: string|null;
created_by; created_at; updated_at }`, `interface WorkLineRow { id; org_id; title; description:string|null;
type: WorkLineType; lane: Lane; business_unit_id; accountable_person_id; responsible_person_id;
objective_id: string|null; archived_at: string|null; created_by; created_at; updated_at }`, and
`interface PersonWorkloadRow { work_line_id; title; type: WorkLineType; lane: Lane; is_accountable:boolean;
is_responsible:boolean; open_task_count: number }`. Comment: source-of-truth = the §2 migrations,
hand-kept in sync (mirrors `tasks.types.ts:1-3`).
**Verify (no test yet — type compile):** `cd mos-app && npx tsc --noEmit 2>&1 | grep cascade.types || echo OK`.

### Task 4.2 — `objectives.ts` data layer
**File (new):** `mos-app/src/lib/db/objectives.ts`
`const mos = () => supabase.schema('mos')`. Export `listObjectives(includeArchived=false):
Promise<ObjectiveRow[]>` (`from('objectives').select('*')`, `.is('archived_at', null)` unless included,
`.order('created_at',{ascending:false})`, throw on error — mirror `listTasks`), `createObjective(input):
Promise<string>` (insert title/description/lane/A/R; **never send org_id**; `.select('id').single()`),
`updateObjectiveFields(id, patch)`, `archiveObjective(id)` (set `archived_at = new Date().toISOString()`),
`unarchiveObjective(id)`. All `throw new Error('…failed — '+error.message)` on PostgREST error.
**Verify:** covered by Task 5.1's unit test run; type: `cd mos-app && npx tsc --noEmit 2>&1 | grep objectives || echo OK`.

### Task 4.3 — `work-lines.ts` data layer
**File (new):** `mos-app/src/lib/db/work-lines.ts`
Same pattern: `listWorkLines(includeArchived=false)`, `createWorkLine(input)` (title/description/**type**/
lane/business_unit_id/A/R/objective_id?), `updateWorkLineFields(id, patch)` — **patch type EXCLUDES
`type`** (create-only, FR-215) and excludes `org_id`/`created_by`; `archiveWorkLine(id)`,
`unarchiveWorkLine(id)`. Throw on error. *(If owner renames the table, change the `.from('work_lines')`
string + file name only.)*
**Verify:** `cd mos-app && npx tsc --noEmit 2>&1 | grep work-lines || echo OK`.

### Task 4.4 — `workload.ts` RPC caller
**File (new):** `mos-app/src/lib/db/workload.ts`
`export async function getPersonWorkload(personId: string): Promise<PersonWorkloadRow[]>` →
`supabase.schema('mos').rpc('person_workload', { p_person_id: personId })`; throw on error; `return
(data ?? []) as unknown as PersonWorkloadRow[]`. Helper `groupWorkloadByLaneType(rows):
Record<Lane, Record<WorkLineType, PersonWorkloadRow[]>>` — **pure function** (FR-231 grouping; unit-tested
without a DB). Comment links FR-230..234.
**Verify:** `cd mos-app && npx tsc --noEmit 2>&1 | grep workload || echo OK`.

### Task 4.5 — extend `tasks.ts` for the bridge (FR-220/221)
**File (edit):** `mos-app/src/lib/db/tasks.ts`
Add `work_line_id: string | null` to `TaskRow` in **`tasks.types.ts`** (Task 4.1's file is separate; edit
`tasks.types.ts` here to add the field after `accountable_person_id`). In `tasks.ts` add:
`export async function setTaskWorkLine(id: string, workLineId: string | null, actor: string):
Promise<void>` → `updateTask(id, { work_line_id: workLineId })` then `logEvent(id, actor, 'field_edited')`
(reuses existing private `updateTask`/`logEvent`; mirrors `updateTaskFields`). Setting = id, clearing =
`null` (one function, FR-220 + FR-221). Do NOT add `work_line_id` to `CreateTaskInput` mapping changes
beyond optional — keep create unchanged (additive; FR-222).
**Verify:** `cd mos-app && npx tsc --noEmit 2>&1 | grep -E 'tasks|OK' ; npm test -- tasks 2>&1 | tail -5`.

---

## 5. UI tasks (stub-level wiring; full surface gated on the design-architect Workload mockup, spec §8)

> NFR-204/205: lane/type as **text labels** (not color alone), DESIGN.md tokens, existing dense-table /
> card-reflow grammar. No new visual language. The Workload **entry point** (team-module row-expand vs
> standalone surface) is an **open question (Q4)** — both paths are stubbed so neither is blocked.

### Task 5.1 — Task editor: Project/Process picker (FR-220/221/222) — owns AC-220/222
**File (edit):** the task editor component. **Locate first:**
`cd /Users/ariefsaid/Coding/gordi-mos && rg -l "updateTaskFields|TaskFieldsPatch|accountable_person_id"
mos-app/src/components mos-app/src/features 2>/dev/null` — edit the component that renders the task
detail/edit form (the one already wiring R/A selects).
Add a single-select "Project / Process" control: options = `listWorkLines()` non-archived, label
`"{title} · {type} · {lane}"`; a clear ("None") option. On change → `setTaskWorkLine(taskId, value|null,
viewer.person.id)`. Optional field; a task with none stays valid (FR-222). Label is text (NFR-204).
**Test (write FIRST, red):** `mos-app/src/lib/db/tasks.test.ts` — add a case titled `'AC-220: set then
clear a task work_line_id'` mocking the `mos` client (mirror existing `tasks.test.ts` mocks): assert
`setTaskWorkLine(id, 'wl-1', actor)` calls update with `{ work_line_id: 'wl-1' }`, then `setTaskWorkLine(id,
null, actor)` calls update with `{ work_line_id: null }`; and `'AC-222: task with null work_line_id remains
valid'` reads a row with `work_line_id: null` through `getTask` and asserts it round-trips. *(Component
render assertion is optional/secondary; the data-layer test is the AC-owning proof at the lowest layer.)*
**Verify:** `cd mos-app && npm test -- tasks 2>&1 | grep -E 'AC-220|AC-222|passed|failed'`.

### Task 5.2 — Workload surface component + empty state — owns AC-233
**File (new):** `mos-app/src/components/workload/PersonWorkload.tsx` (or the features dir the repo uses —
confirm with `rg -l "export default function" mos-app/src/components | head`).
Props `{ personId: string; personName: string }`. Calls `getPersonWorkload(personId)` →
`groupWorkloadByLaneType`. Renders one section per lane (text heading "Run" / "Optimize" / "Transform"),
within it Process rows then Project rows, each row showing title + a text `type` chip + `open_task_count`
("3 open"). When the result is empty render an explicit empty state ("No Projects or Processes yet") — NOT
an error (FR-233). DESIGN.md tokens + dense-table grammar (NFR-205).
**Test (write FIRST, red):** `mos-app/src/components/workload/PersonWorkload.test.tsx` — RTL, mock
`getPersonWorkload`. Case `'AC-233: empty workload renders explicit empty state, not an error'` →
resolves `[]`, assert the empty-state copy is in the document and no error UI. Add a second
(non-AC-owning) case: a person with one Run process + two Transform projects renders the headings + the
open-task counts (a unit echo of AC-230's journey to catch render regressions cheaply).
**Verify:** `cd mos-app && npm test -- PersonWorkload 2>&1 | grep -E 'AC-233|passed|failed'`.

### Task 5.3 — Workload entry-point stubs (both paths; no behavior commitment)
**File (edit):** the manager **team module** component (`rg -l "getTeamForManager" mos-app/src` → that
view). Add a per-person affordance ("View workload") that renders `<PersonWorkload>` inline/in a drawer —
**guarded behind a `// TODO(Q4): entry-point pending mockup gate` comment and only mounted when a feature
flag / prop is set**, so it ships dark until the owner picks the entry point. No nav change, no route added
in this slice (standalone route is the alternative path; leave a one-line comment noting where it would
mount: `mos-app/src/App.tsx` router). This keeps both Q4 options open with zero rework.
**Verify:** `cd mos-app && npm run typecheck 2>&1 | tail -3 && npm run build 2>&1 | tail -3`.

---

## 6. E2E (1 curated journey) — owns AC-230

### Task 6.1 — Playwright: manager views designer's workload (FR-230/231/232)
**File (new):** `mos-app/e2e/workload-manager-view.spec.ts`
Precondition: the e2e dev-login seed must include a manager + a "designer" person who is **R on one
`process` (Run)** and **A on two `project`s (Transform)**, each with open linked tasks (extend the e2e seed
the same way `tasks-create-status.spec.ts` relies on seeded data — confirm the seed path with
`rg -l "dev.login|seed" mos-app/e2e mos-app/src 2>/dev/null` and add the cascade rows to that seed, NOT a
new mechanism). Journey (the user's real path, BDD goal-oracle = "answer daily-vs-project at a glance"):
sign in as the manager → open the team module → open the designer's Workload → assert the **Process under
Run** with its open-task count AND the **two Projects under Transform** each with their counts are visible.
Title: `'AC-230: manager sees a person's Process (Run) vs Projects (Transform) with open-task counts'`.
**Verify:** `cd mos-app && npx playwright test workload-manager-view 2>&1 | tail -8`.

---

## 7. Verify-live (the log_date lesson — every new query/RPC against the REAL local stack)

### Task 7.1 — live smoke of the RPC + data layer against the running local Supabase
**File (new):** `mos-app/scripts/verify-cascade-live.md` (a checklist doc, not code — Director runs it).
Steps with exact commands:
1. `cd /Users/ariefsaid/Coding/gordi-mos && supabase db reset` (applies all migrations + seeds).
2. `supabase test db 2>&1 | tail -15` — all pgTAP green (AC-200/201/202/205/210/213/216/234).
3. Live RPC shape check against the real schema (catches column/return drift the mocks can't):
   `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -c "select * from
   mos.person_workload('00000000-0000-0000-0000-0000000000d1');"` after `select mos._test_seed_role_tree();
   select mos._test_seed_cascade();` in a `psql` session with `set role authenticated; set request.jwt.claims
   = '{…d2 manager…}';` — assert columns match `PersonWorkloadRow` (work_line_id,title,type,lane,
   is_accountable,is_responsible,open_task_count) and counts exclude Done/archived.
4. `cd mos-app && npm run typecheck && npm run lint -- --max-warnings=0 && npm test && npm run build`.
**Verify:** the doc's own commands all pass; this is the gate before review.

---

## 8. Task → AC coverage map

| Task | AC / FR | Layer |
|---|---|---|
| 2.1/2.2 | FR-200/202/203/204/205, NFR-200/201/202 | migration |
| 2.3/2.4 | FR-210/211/212/213/214/215/216, NFR-200/201/202 | migration |
| 2.5 | FR-220/221/222, NFR-202 | migration |
| 2.6 | FR-230/231/232/233/234, NFR-203 | migration (RPC) |
| 2.7 | (fixture for 3.x / 6.1) | migration |
| 3.1 | **AC-200** (FR-200) | pgTAP |
| 3.2 | **AC-201** (FR-201/212) | pgTAP |
| 3.3 | **AC-202** (FR-202/214) | pgTAP |
| 3.4 | **AC-205** (FR-205) | pgTAP |
| 3.5 | **AC-210** (FR-210/211) | pgTAP |
| 3.6 | **AC-213** (FR-213) | pgTAP |
| 3.7 | **AC-216** (FR-216/222) | pgTAP |
| 3.8 | **AC-234** (FR-234; exercises 230/231/232 at DB) | pgTAP |
| 4.1–4.4 | data layer for FR-202/203/214/215/230..234 | unit-supported |
| 4.5 | FR-220/221/222 | data layer |
| 5.1 | **AC-220, AC-222** (FR-220/221/222) | unit |
| 5.2 | **AC-233** (FR-233) | unit (RTL) |
| 5.3 | FR-230 entry-point (dark) | wiring |
| 6.1 | **AC-230** (FR-230/231/232) | e2e |
| 7.1 | NFR-203 + verify-live | smoke |

**Total tasks: 23** (migrations 7 · pgTAP 8 · data layer 5 · UI 3 — note 4.5/5.1 share, counted once each
· e2e 1 · verify-live 1 → 2.1-2.7=7, 3.1-3.8=8, 4.1-4.5=5, 5.1-5.3=3, 6.1=1, 7.1=1 = **25 task entries**).
Every spec AC (200,201,202,205,210,213,216,220,222,230,233,234) is owned by exactly one test at its lowest
sufficient layer per the spec's §6 pyramid. **No spec AC is unmapped.**

---

## 9. ADRs worth adding

- **None strictly required** — ADR-0014 already binds the model, topology, and additive sequence; this
  plan is its faithful implementation. **One small ADR is worth recording** once the owner answers Q1/Q4,
  to lock two decisions ADR-0014 left open: (a) the **physical table name** for layer 4 and (b) the
  **SECURITY DEFINER RPC vs view** choice for Workload + the **`is_manager_of`-not-`has_access_role('manager')`**
  rule at the DB layer (a non-obvious seam future cascade work will re-encounter). Proposed:
  `docs/adr/0015-workload-rpc-and-work-line-naming.md` — eng-planner authors it after the owner picks the
  name (grill proposes, planner writes, per CLAUDE.md). Not blocking the migrations except the table name.

---

## 10. Risks / open questions for the Director → owner

**Q1 (BLOCKING the migration tasks) — physical table name for layer 4.** Spec says `mos.initiatives`;
CONTEXT.md (later, same day) drops "Initiative" and locks no umbrella. **Recommend `mos.work_lines` +
`tasks.work_line_id`.** Alternative: `mos.projects_processes` + `tasks.project_process_id`. Owner pick
needed before Task 2.3 (rename is a 2-token find-replace; everything else is mechanical).

**Q2 — manager write capability at the DB.** The auth hook does NOT stamp `manager` into the JWT
(`…000002`), so RLS cannot use `has_access_role('manager')`; the plan uses `is_manager_of(A or R)` for the
manager-write path on objectives/work_lines. **Consequence:** a manager may only create/edit an
objective/WL where they manage the A or the R person — they cannot create one owned entirely by people
outside their chain. Confirm that matches intent (the alternative — a stamped `manager` claim — is a hook
change out of this slice's scope). Admin/ops_lead are unconstrained per spec.

**Q3 — RPC vs view confirmed.** Decided SECURITY DEFINER RPC (§1.4). Flagging only so the Director ratifies
the DEFINER surface (one new RPC, gated + org-pinned exactly like `approve_kitchen_log`).

**Q4 — Workload entry point** (spec §9.4). Plan stubs both (team-module row-expand recommended; standalone
route noted) and ships the surface dark behind a flag so neither is blocked. Owner/mockup gate decides
before un-darkening (design-architect Workload mockup is a prerequisite to Task 5.2/5.3 going live, spec §8).

**Q5 — real seed (spec §9.3).** The pgTAP/e2e fixtures use fictional canon. The owner offered 2–3 real
Objectives + the designer's real Projects/Processes to make the mockup land truer — that is a *mockup/seed*
input for design-architect, not a code dependency; flagged so it is not forgotten before the UI build.

**Risk — `mos.tasks` hot-table touch.** Task 2.5 adds a column + a new BEFORE trigger to the live tasks
table. The trigger is INSERT/UPDATE and only fires logic when `work_line_id is not null`, so existing task
writes are unaffected; existing pgTAP 12-17 are the regression guard (re-run in 2.5's verify). Reversible
(DOWN drops column+trigger+index). No backfill, NFR-202 honored.

**Risk — additive-topology discipline.** When Output lands later it MUST be `CREATE TABLE output` +
nullable `task.output_id`, never a re-point of `task.work_line_id` (ADR-0014 §3). Noted here so a future
planner does not "tidy" the Task→WL link into Task→Output.
