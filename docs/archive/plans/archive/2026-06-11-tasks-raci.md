# Plan: P2-1 — Tasks + lightweight RACI (NON-UI layers + UI wiring)

- **Issue:** P2-1 — the core `mos.tasks` entity end-to-end: schema + RLS + change-events + data layer
  + Tasks list page + Task detail page + create/archive flows + checklist + RACI fields.
- **Spec:** `docs/specs/tasks-raci.spec.md` (35 FR / 10 NFR / 39 AC, signed, zero owner flags).
- **Decisions:** `docs/decisions.md` OD-P2-1..9 (+ OD-DIR-5, OD-P0-8/9, OD-P1-1/3/4/7), ADR-0003
  (cascade-ready task), **ADR-0004** (mos PostgREST exposure + archive-gate trigger — written for this
  plan; read it before the migration/RLS tasks).
- **Parallel UI design-plan:** `docs/plans/2026-06-11-tasks-design.md` (Tasks list + Task detail
  layout/tokens/density). UI tasks here reference it for visual detail — do NOT duplicate layout specs.
- **Date:** 2026-06-11.

## Scope guard (read before touching anything)

**IN scope:** three `mos` migrations (`tasks`, `task_checklist_items`, `task_events`) + indexes +
triggers + RLS + the archive-gate trigger + grants; the `config.toml` `mos` exposure; the pgTAP suite
(AC-001..051); the tasks data layer (`mos-app/src/lib/db/tasks.ts` + the WIB overdue classifier);
hand-written `mos` row types; the Tasks list page, Task detail page + route, create-task form, archive
control wired into the shell; two curated e2e journeys (AC-090/091); the e2e task seed; the coverage
include-scope update.

**OUT of scope (deferred, do NOT build):** free-text comments / composer (P2-1b, OD-P2-8 — P2-1 logs
auto change-events only); the cascade upward FK (`output_id`, ADR-0003); `parent_task_id` / nested
tasks (OD-P2-7 — subtasks are checklist items); weekly-updates / ops tables; people-write / admin UI;
a RACI matrix UI (OD-DIR-5 — fields only). If you find yourself writing a comment composer or a
`mos.outputs` table, stop.

## Conventions for the implementer

- DB work: write ONLY under `supabase/`. App work: ONLY under `mos-app/`. Do not edit `docs/`.
- **TDD red-green is binding.** Every behavior task names the failing test to write **first**; no prod
  code (SQL policy, TS function, component) lands without a red test that goes green.
- Everything schema-qualified (`mos.tasks`, `mos.can_edit_task(...)`); never create in `public`.
  snake_case identifiers; `timestamptz` stored UTC (OD-P1-4); functions pin `set search_path = ''`.
- Migrations reversible by `supabase db reset` (clean re-apply from zero) — the reversibility contract
  for a pre-prod schema (playbook §8).
- Run pgTAP verifies from repo root `/Users/ariefsaid/Coding/gordi-mos`; run Vitest/Playwright/typecheck
  from `/Users/ariefsaid/Coding/gordi-mos/mos-app`.
- Migration filenames use the fixed prefix `20260611NNNNNN_` continuing the existing sequence
  (`...000006_rls.sql` is the last). Keep the exact names below so verify greps match.
- The data layer reads `mos` via `supabase.schema('mos')` on the existing client (ADR-0004 D1) — never
  flip the global `db.schema`. Never send `org_id` (RLS stamps it). Throw on a non-null PostgREST error.

---

## Design decisions (one at a time)

**D1 — `mos` exposure + one client, schema-scoped (ADR-0004 D1).** Add `"mos"` to
`config.toml [api].schemas`. Keep `mos-app/src/lib/supabase.ts` pinned to `shared`; the tasks data
layer calls `supabase.schema('mos').from('tasks')...`. One auth session, one token-refresh path. RLS is
the authority — exposure adds endpoints, not readability.

**D2 — Archive gate = `BEFORE UPDATE` trigger guard (ADR-0004 D2).** General edits go through one RLS
UPDATE policy (R/A/mgr). A `mos._guard_archive()` `BEFORE UPDATE` trigger raises `42501` when
`archived_at` changes and the actor is not A-or-manager — covering archive and unarchive symmetrically.

**D3 — `mos.can_edit_task(task_id)` helper.** The edit predicate (R OR A OR mgr-of-R OR mgr-of-A) is
needed by the `tasks` UPDATE policy AND the child-table (`task_checklist_items`, `task_events`) write
policies. Factor it into one `STABLE SECURITY INVOKER` SQL function, `search_path=''`, so the child
policies say `mos.can_edit_task(task_id)` and there is one definition to maintain. It reads
`mos.tasks` (the caller's RLS on tasks does not re-apply inside an INVOKER function called from a child
policy — but the function itself filters by `org_id = current_org_id()` so it is org-safe).

**D4 — Events are server-written via the data layer, `last_activity_at` via trigger (§3.4).** The data
layer inserts a `mos.task_events` row on each mutation; an `AFTER INSERT` trigger on `task_events` bumps
the parent `tasks.last_activity_at` to the event's `created_at`. One canonical timestamp regardless of
write path (OD-P0-9b). The `task_events` INSERT policy is gated by `mos.can_edit_task(task_id)` so only
authorized editors can write events (and thus advance activity). The `created` event at task-creation
is the one exception: the creator is R+A by default (OD-P2-2) so they pass `can_edit_task` trivially.

**D5 — Mutations are multi-statement, not transactional from the browser.** PostgREST has no
client-side transaction. The data layer does the field UPDATE, then the event INSERT, as two REST
calls. Accepted: a torn write (update lands, event insert fails) leaves `last_activity_at` slightly
stale but no corruption; the layer throws on the event error so the UI surfaces it. A future
hardening is a `SECURITY DEFINER` RPC wrapping both in one txn — out of scope for P2-1 (noted in
the data-layer task). The create path is the riskiest (row + created event); for create we insert the
task, then the event; if the event fails we throw (the row exists but is recoverable/visible).

**D6 — WIB overdue/soon is pure + reuses `lib/week.ts` offset arithmetic.** A new
`mos-app/src/lib/dueStatus.ts` exports `dueStatus(dueDate: string | null, now: Date)` returning
`'overdue' | 'soon' | 'calm' | 'none'`, computed against the WIB calendar day (the `wibParts` +7h
pattern), no host-tz leak (NFR-004). Pure → clock-mocked unit tests.

**D7 — Sub-PR split (recommended; Director sequences).** This issue is large (≈53 tasks). Recommend
three sub-PRs along clean seams:
- **P2-1a (DB + data layer):** T-001..T-026 — migrations, RLS, archive trigger, pgTAP suite, the
  tasks data layer, the WIB classifier, `mos` types. Self-contained; proves the whole contract in
  pgTAP + unit; nothing to render yet. Mergeable on pgTAP-green + typecheck.
- **P2-1b (List page):** T-030..T-039 — TasksPage with toolbar/filters/segmented control/sort/states,
  row rendering, due colouring, wired into the route. Depends on P2-1a's data layer.
- **P2-1c (Detail + checklist + create + archive + e2e):** T-040..T-053 — Task detail route + page,
  inline status, RACI edit, checklist, activity log, read-only mode, create form/modal, archive
  control, the two e2e journeys + seed, coverage-scope finalize. Depends on P2-1a + P2-1b.

If the Director prefers one PR, the task order below is already a valid single-PR build order.

---

## Migration / pgTAP file inventory

| File | Contents |
|---|---|
| `supabase/migrations/20260611000007_mos_tasks.sql` | `mos.tasks` table + indexes + `set_updated_at` trigger attach |
| `supabase/migrations/20260611000008_mos_task_children.sql` | `mos.task_checklist_items` + `mos.task_events` + FKs + `updated_at` + `last_activity_at` AFTER-INSERT trigger |
| `supabase/migrations/20260611000009_mos_rls.sql` | grants; `mos.can_edit_task`; `mos._guard_archive` + trigger; RLS enable+force + policies on all three tables |
| `supabase/config.toml` (edit) | add `"mos"` to `[api].schemas` |
| `supabase/tests/11_mos_rls_enabled.sql` | RLS enabled+forced on the three `mos` tables; no DELETE grant |
| `supabase/tests/12_mos_task_read.sql` | AC-001/002/003 — org-read, cross-org block, children read |
| `supabase/tests/13_mos_task_create.sql` | AC-010/011/012 — create stamps org, spoof reject, CHECK reject |
| `supabase/tests/14_mos_task_edit_gate.sql` | AC-020..026 — R/A/mgr-R/mgr-A allow, other deny, A=R, C/I array edit |
| `supabase/tests/15_mos_task_archive.sql` | AC-030..034 — A allow, mgr allow, non-A R deny, unarchive, no hard delete |
| `supabase/tests/16_mos_children_gate.sql` | AC-040 — checklist write gate |
| `supabase/tests/17_mos_task_events.sql` | AC-050/051 — event→last_activity_at trigger, created event |

---

## DB layer — tasks (P2-1a)

### T-001 — Migration: `mos.tasks` table + indexes

**File:** create `supabase/migrations/20260611000007_mos_tasks.sql`.
Write exactly (§3.1, ADR-0003 — no `parent_task_id`/`output_id`/`type`):

```sql
-- P2-1 — mos.tasks: the core owned-work entity (OD-P2-1/4/5/6/9, ADR-0003).
create table mos.tasks (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references shared.orgs(id) on delete cascade
                           default shared.current_org_id(),
  title                  text not null check (btrim(title) <> ''),
  business_unit_id       uuid not null references shared.business_units(id),
  status                 text not null default 'Open'
                           check (status in ('Open','In Progress','Blocked','Done')),
  responsible_person_id  uuid not null references shared.people(id),
  accountable_person_id  uuid not null references shared.people(id),
  consulted_person_ids   uuid[] not null default '{}',
  informed_person_ids    uuid[] not null default '{}',
  description            text,
  due_date               date,
  last_activity_at       timestamptz not null default now(),
  archived_at            timestamptz,
  created_by             uuid not null references shared.people(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on table mos.tasks is 'Owned-work unit; cascade-bridgeable (ADR-0003). org-readable, R/A/mgr-write (OD-P2-3).';

create index tasks_org_idx              on mos.tasks (org_id);
create index tasks_business_unit_idx    on mos.tasks (business_unit_id);
create index tasks_status_idx           on mos.tasks (status);
create index tasks_due_date_idx         on mos.tasks (due_date);
create index tasks_responsible_idx      on mos.tasks (responsible_person_id);
create index tasks_accountable_idx      on mos.tasks (accountable_person_id);
create index tasks_consulted_gin        on mos.tasks using gin (consulted_person_ids);
create index tasks_informed_gin         on mos.tasks using gin (informed_person_ids);
create index tasks_active_org_idx       on mos.tasks (org_id) where archived_at is null;

create trigger tasks_set_updated_at
  before update on mos.tasks
  for each row execute function shared.set_updated_at();
```

**Verify:** `supabase db reset` runs clean, then:
`supabase db reset && psql "$(supabase status -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["DB_URL"])')" -c "\d mos.tasks"`
shows the table with 16 columns and the 9 indexes. (Simplest: `supabase db reset` exits 0.)
Implements FR-001..006, NFR-006.

### T-002 — Migration: `mos.task_checklist_items` + `mos.task_events` + triggers

**File:** create `supabase/migrations/20260611000008_mos_task_children.sql`.
Write exactly (§3.2, §3.3, §3.4):

```sql
-- P2-1 — task children: checklist items (OD-P2-7) + auto change-events (OD-P2-8, OD-P0-9b).
create table mos.task_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade
                default shared.current_org_id(),
  task_id     uuid not null references mos.tasks(id) on delete cascade,
  label       text not null check (btrim(label) <> ''),
  is_done     boolean not null default false,
  position    integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table mos.task_checklist_items is 'Lightweight subtask: label/done/order child of a task (OD-P2-7). No RACI/status/BU/due.';
create index task_checklist_task_idx on mos.task_checklist_items (task_id);

create trigger task_checklist_set_updated_at
  before update on mos.task_checklist_items
  for each row execute function shared.set_updated_at();

create table mos.task_events (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references shared.orgs(id) on delete cascade
                     default shared.current_org_id(),
  task_id          uuid not null references mos.tasks(id) on delete cascade,
  actor_person_id  uuid not null references shared.people(id),
  event_type       text not null check (event_type in
                     ('created','status_changed','field_edited','raci_edited','archived','unarchived')),
  from_value       text,
  to_value         text,
  created_at       timestamptz not null default now()
);
comment on table mos.task_events is 'Auto change-log (OD-P2-8). NOT comments (P2-1b). Drives tasks.last_activity_at.';
create index task_events_task_idx on mos.task_events (task_id, created_at desc);

-- §3.4: every event bumps the parent task's last_activity_at to the event time (one canonical clock).
create or replace function mos._touch_last_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update mos.tasks
    set last_activity_at = new.created_at
    where id = new.task_id;
  return new;
end;
$$;

create trigger task_events_touch_activity
  after insert on mos.task_events
  for each row execute function mos._touch_last_activity();
```

**Verify:** `supabase db reset` exits 0; `\d mos.task_events` and `\d mos.task_checklist_items` exist.
Implements FR-007, FR-013, §3.4, NFR-006.

### T-003 — Migration: grants + `mos.can_edit_task` helper

**File:** create `supabase/migrations/20260611000009_mos_rls.sql` (first section).
Write the base grants (SELECT/INSERT/UPDATE, **no DELETE** — NFR-002) and the edit helper (D3):

```sql
-- P2-1 — mos RLS (ADR-0004). RLS is the authority for the PostgREST-exposed mos schema.
-- Base privileges: SELECT/INSERT/UPDATE to authenticated on all three tables. NO DELETE grant
-- anywhere (NFR-002, FR-053): hard delete is structurally impossible for the app tier.
grant select, insert, update on mos.tasks                to authenticated;
grant select, insert, update on mos.task_checklist_items to authenticated;
grant select, insert, update on mos.task_events          to authenticated;

-- can_edit_task(task_id): the edit predicate (R OR A OR mgr-of-R OR mgr-of-A), org-scoped.
-- Reused by the tasks UPDATE policy and the child-table write policies (D3).
create or replace function mos.can_edit_task(p_task_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from mos.tasks t
    where t.id = p_task_id
      and t.org_id = shared.current_org_id()
      and (
        t.responsible_person_id = shared.current_person_id()
        or t.accountable_person_id = shared.current_person_id()
        or shared.is_manager_of(t.responsible_person_id)
        or shared.is_manager_of(t.accountable_person_id)
      )
  )
$$;
comment on function mos.can_edit_task(uuid) is 'Edit gate: current person is R/A/mgr-of-(R or A) for the task (OD-P2-3, FR-050).';
```

**Verify:** `supabase db reset` exits 0. (Behavioral proof comes in T-014/T-016.)
Implements FR-050, NFR-002.

### T-004 — Migration: archive-gate trigger `mos._guard_archive` (ADR-0004 D2)

**File:** append to `supabase/migrations/20260611000009_mos_rls.sql`.
Write the `BEFORE UPDATE` guard that makes the archive gate narrower than the edit gate (FR-051/052):

```sql
-- Archive gate (ADR-0004 D2): archived_at may change ONLY when the actor is A or mgr-of-(R or A) —
-- narrower than the general edit gate (which also allows a non-A Responsible). Covers archive
-- (NULL->ts) and unarchive (ts->NULL) symmetrically. Raises 42501 (insufficient_privilege).
create or replace function mos._guard_archive()
returns trigger
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at then
    if not (
      old.accountable_person_id = shared.current_person_id()
      or shared.is_manager_of(old.responsible_person_id)
      or shared.is_manager_of(old.accountable_person_id)
    ) then
      raise exception 'archive requires Accountable or a manager' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_guard_archive
  before update on mos.tasks
  for each row execute function mos._guard_archive();
```

**Verify:** `supabase db reset` exits 0. (Behavioral proof in T-015.)
Implements FR-051, FR-052.

### T-005 — Migration: RLS enable+force + policies on `mos.tasks`

**File:** append to `supabase/migrations/20260611000009_mos_rls.sql`.
org-read (FR-020/021), insert WITH CHECK (FR-006), update gated by `can_edit_task` (FR-050):

```sql
alter table mos.tasks enable row level security;
alter table mos.tasks force  row level security;

-- SELECT: org-readable (cross-unit visibility is the product, OD-P1-3).
create policy tasks_select_org on mos.tasks
  for select to authenticated
  using (org_id = shared.current_org_id());

-- INSERT: any org member; org_id defaulted + checked unspoofable; R and A must be set (NOT NULL backs it).
create policy tasks_insert_member on mos.tasks
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and shared.is_org_member()
  );

-- UPDATE: R/A/mgr-of-(R or A). USING gates which rows are visible-for-update; WITH CHECK keeps the
-- row in-org and still-editable after the change. archived_at column is further gated by the trigger.
create policy tasks_update_editor on mos.tasks
  for update to authenticated
  using (mos.can_edit_task(id))
  with check (org_id = shared.current_org_id() and mos.can_edit_task(id));

-- NO delete policy (FR-053): hard delete denied to authenticated; service_role bypasses RLS.
```

**Verify:** `supabase db reset` exits 0. Behavioral proof in T-012/013/014/015.
Implements FR-006, FR-020, FR-021, FR-050, FR-053.

### T-006 — Migration: RLS on `mos.task_checklist_items` + `mos.task_events`

**File:** append to `supabase/migrations/20260611000009_mos_rls.sql`.
Read org-scoped; writes gated by `can_edit_task(task_id)` (D3, D4):

```sql
-- task_checklist_items: read org-scoped; insert/update gated to who-can-edit-the-task.
alter table mos.task_checklist_items enable row level security;
alter table mos.task_checklist_items force  row level security;
create policy task_checklist_select_org on mos.task_checklist_items
  for select to authenticated using (org_id = shared.current_org_id());
create policy task_checklist_insert_editor on mos.task_checklist_items
  for insert to authenticated
  with check (org_id = shared.current_org_id() and mos.can_edit_task(task_id));
create policy task_checklist_update_editor on mos.task_checklist_items
  for update to authenticated
  using (mos.can_edit_task(task_id))
  with check (org_id = shared.current_org_id() and mos.can_edit_task(task_id));

-- task_events: read org-scoped; insert gated to editors (so only authorized writes advance activity).
-- No update/delete policy: events are append-only (immutable audit).
alter table mos.task_events enable row level security;
alter table mos.task_events force  row level security;
create policy task_events_select_org on mos.task_events
  for select to authenticated using (org_id = shared.current_org_id());
create policy task_events_insert_editor on mos.task_events
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and actor_person_id = shared.current_person_id()
    and mos.can_edit_task(task_id)
  );
```

**Verify:** `supabase db reset` exits 0. Behavioral proof in T-016/T-017.
Implements FR-040/041/042, FR-050, FR-054/055, §3.4.

### T-007 — Config: expose `mos` to PostgREST (ADR-0004 D1)

**File:** edit `supabase/config.toml` line 14.
Change `schemas = ["public", "graphql_public", "shared"]` to
`schemas = ["public", "graphql_public", "shared", "mos"]`.

**Verify:** from `mos-app`, after `supabase db reset` + stack up, a `mos`-scoped REST call returns 200
not 404: the pgTAP suite does not need this (it is in-DB), but the e2e (T-052/053) does. Confirm with
`grep -n '"mos"' /Users/ariefsaid/Coding/gordi-mos/supabase/config.toml`.
Implements ADR-0004 D1.

---

## pgTAP suite (P2-1a) — write each test RED first, then it passes against the migration

> Pattern: copy the harness shape from `supabase/tests/05_is_manager_of_dualhat.sql` /
> `06_org_id_spoof.sql` — `begin; create extension … pgtap; select plan(N); …; select * from finish();
> rollback;`. Build a multi-person fixture as table owner (bypasses RLS), then
> `set local role authenticated; set local request.jwt.claims = '{"org_id":…,"person_id":…}';` per
> assertion. Tag the AC id in each assertion's description string so `grep -r AC-0XX supabase/tests`
> finds the proof. Run all with `supabase test db`.

### T-010 — pgTAP: RLS enabled/forced + no DELETE grant on the three `mos` tables

**File:** create `supabase/tests/11_mos_rls_enabled.sql`. Assert (no claims needed — catalog checks):
- `mos.tasks`, `mos.task_checklist_items`, `mos.task_events` each have `relrowsecurity` AND
  `relforcerowsecurity` true (4 asserts via `pg_class`).
- `not has_table_privilege('authenticated','mos.tasks','DELETE')` and same for the two child tables
  (3 asserts) — proves NFR-002/FR-053 structurally.

**Verify:** `supabase test db` → `11_mos_rls_enabled.sql` passes (plan = 7).
Covers **NFR-001 (enable/force)** + **AC-034 (structural no-DELETE arm)**.

### T-011 — pgTAP: task read posture + org isolation (AC-001/002/003)

**File:** create `supabase/tests/12_mos_task_read.sql`. Fixture: two orgs (A, B), each with a BU, a
person, and a task; in org A a viewer person who is NOT in any RACI role of the task.
- **AC-001**: org-A viewer (different BU, no RACI role) selects the org-A task → 1 row.
  Assertion title contains `AC-001`.
- **AC-002**: org-A viewer selects (counts) the org-B task → 0 rows. Title contains `AC-002`.
- **AC-003**: a checklist item + a task_event for the org-A task → visible (count ≥1); for the org-B
  task's children → 0. Title contains `AC-003`.

**Verify:** `supabase test db` → `12_mos_task_read.sql` passes.
Covers **AC-001, AC-002, AC-003** (FR-020/021, NFR-001).

### T-012 — pgTAP: task create — org stamp, spoof reject, CHECK (AC-010/011/012)

**File:** create `supabase/tests/13_mos_task_create.sql`. Org-A member session.
- **AC-010**: `lives_ok` insert with title+BU+R+A and no org_id → succeeds, and a follow-up select
  shows `org_id = orgA` (the default stamped it). Title contains `AC-010`.
- **AC-011**: `throws_ok(..., '42501', ...)` insert with explicit foreign `org_id = orgB` → rejected by
  WITH CHECK. Title contains `AC-011`.
- **AC-012**: `throws_ok(..., '23514', ...)` insert with `status='Bogus'`; and a second `throws_ok`
  with blank `title=''` → both rejected by CHECK. Title contains `AC-012`.

**Verify:** `supabase test db` → `13_mos_task_create.sql` passes.
Covers **AC-010, AC-011, AC-012** (FR-006/010/001/002, NFR-003).

### T-013 — pgTAP: edit gate matrix (AC-020..026)

**File:** create `supabase/tests/14_mos_task_edit_gate.sql`. Reuse the role-tree fixture shape from
`05_is_manager_of_dualhat.sql`: a Lead role + a Staff role reporting to it; people R, A, Mgr-of-R,
Mgr-of-A, and an Unrelated member; a task with `responsible=R, accountable=A`.
- **AC-020**: as R, `update mos.tasks set status='In Progress'` affects 1 row. Title `AC-020`.
- **AC-021**: as A (distinct from R), update affects 1 row. Title `AC-021`.
- **AC-022**: as manager-of-R, update affects 1 row. Title `AC-022`.
- **AC-023**: as manager-of-A (R≠A), update affects 1 row. Title `AC-023`.
- **AC-024**: as an Unrelated org member, `update … set status='Done'` affects **0** rows (RLS USING
  hides it). Title `AC-024`. (Use `is((with u as (update … returning 1) select count(*) from u), 0)`.)
- **AC-025**: a second task with `responsible=A=samePerson`; as that person, update affects 1 row.
  Title `AC-025`.
- **AC-026**: as R, `update … set consulted_person_ids = array[someId]` affects 1 row; as the
  C-only member (not R/A/mgr), the same update affects 0 rows. Title `AC-026`.

**Verify:** `supabase test db` → `14_mos_task_edit_gate.sql` passes (plan = 8).
Covers **AC-020, AC-021, AC-022, AC-023, AC-024, AC-025, AC-026** (FR-050, FR-003, FR-033).

### T-014 — pgTAP: archive gate + no hard delete (AC-030..034)

**File:** create `supabase/tests/15_mos_task_archive.sql`. Same role-tree fixture; task with R≠A.
- **AC-030**: as A, `update … set archived_at = now()` affects 1 row. Title `AC-030`.
- **AC-031**: on a fresh active task, as manager-of-R, archive affects 1 row. Title `AC-031`.
- **AC-032**: on a fresh active task, as R (who is not A and not a manager), archive → `throws_ok(…,
  '42501', …)` (the `_guard_archive` trigger fires). Title `AC-032`.
- **AC-033**: on an archived task, as A, `update … set archived_at = null` (unarchive) affects 1 row.
  Title `AC-033`.
- **AC-034**: as any authenticated member, `delete from mos.tasks where id = …` → `throws_ok` with
  permission-denied (`42501`); plus the catalog no-grant assert already in T-010. Title `AC-034`.

**Verify:** `supabase test db` → `15_mos_task_archive.sql` passes (plan = 5).
Covers **AC-030, AC-031, AC-032, AC-033, AC-034** (FR-051/052/053, NFR-002).

> Note: confirm the non-A-Responsible can still edit *other* fields (proven by AC-020) but NOT
> `archived_at` (AC-032) — that contrast is exactly the FR-050-vs-FR-051 split ADR-0004 D2 enforces.

### T-015 — pgTAP: checklist write gate (AC-040)

**File:** create `supabase/tests/16_mos_children_gate.sql`. Task with R/A; an Unrelated member.
- **AC-040 (allow)**: as R, insert a checklist item (`position=0`) → succeeds; update its `is_done`
  → 1 row; update `position` → 1 row. Title `AC-040`.
- **AC-040 (deny)**: as the Unrelated member, insert a checklist item for that task →
  `throws_ok('… ', '42501', …)`; and update of the existing item affects 0 rows. Title `AC-040`.

**Verify:** `supabase test db` → `16_mos_children_gate.sql` passes.
Covers **AC-040** (FR-040/041/042, FR-050).

### T-016 — pgTAP: event → last_activity_at trigger + created event (AC-050/051)

**File:** create `supabase/tests/17_mos_task_events.sql`. Task with R as the session person.
- **AC-050**: capture the task's `last_activity_at`; insert a `status_changed` event with
  `created_at = now() + interval '1 hour'`; re-read the task → `last_activity_at` equals the event's
  `created_at` (the AFTER-INSERT trigger advanced it). Title `AC-050`.
- **AC-051**: simulate the create path — insert a task, then insert exactly one `created` event for it;
  assert exactly one `created` event exists for the task AND `last_activity_at` equals that event's
  `created_at`. Title `AC-051`.

**Verify:** `supabase test db` → `17_mos_task_events.sql` passes.
Covers **AC-050, AC-051** (FR-013/054/055, §3.4).

### T-017 — Run the full pgTAP suite green

**Verify:** from repo root, `supabase test db` runs all of `11_…`–`17_…` plus the existing
`00_…`–`10_…` with zero failures. This is the P2-1a DB gate.
Covers the integration arm of the traceability table (AC-001..051).

---

## Data layer + types (P2-1a, `mos-app/src/lib/db/`)

### T-020 — `mos` row types

**File:** create `mos-app/src/lib/db/tasks.types.ts` (kept separate from the shared
`database.types.ts` per its "shared schema only" comment). Hand-write, matching §3.1/3.2/3.3:

```ts
// Minimal hand-written types for the mos.* rows this app reads/writes (P2-1).
// Source of truth: supabase/migrations/20260611000007..9. Keep in sync by hand.
export type TaskStatus = 'Open' | 'In Progress' | 'Blocked' | 'Done'
export type TaskEventType =
  | 'created' | 'status_changed' | 'field_edited' | 'raci_edited' | 'archived' | 'unarchived'

export interface TaskRow {
  id: string
  org_id: string
  title: string
  business_unit_id: string
  status: TaskStatus
  responsible_person_id: string
  accountable_person_id: string
  consulted_person_ids: string[]
  informed_person_ids: string[]
  description: string | null
  due_date: string | null
  last_activity_at: string
  archived_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}
export interface ChecklistItemRow {
  id: string; org_id: string; task_id: string
  label: string; is_done: boolean; position: number
  created_at: string; updated_at: string
}
export interface TaskEventRow {
  id: string; org_id: string; task_id: string; actor_person_id: string
  event_type: TaskEventType; from_value: string | null; to_value: string | null; created_at: string
}
// List/detail joined shapes (R/A/BU names resolved via embedded selects — snake_case, consumed directly).
export interface TaskListRow extends TaskRow {
  business_unit: { id: string; name: string } | null
  responsible: { id: string; full_name: string } | null
  accountable: { id: string; full_name: string } | null
}
```

**Verify (test-first):** create `mos-app/src/lib/db/tasks.types.test.ts` with a compile-time assertion
(`const s: TaskStatus = 'Open'`) and one runtime `expect(true).toBe(true)`; run
`npm test -- tasks.types` — green. Then `npm run typecheck` clean.
Implements FR-001..007 (type fidelity), NFR-007.

### T-021 — WIB overdue/soon classifier (AC-062)

**File (test first):** create `mos-app/src/lib/dueStatus.test.ts`. Title each case with **AC-062**.
Mock a fixed clock (`new Date('2026-06-10T05:00:00Z')` = 12:00 WIB on Wed 10 Jun). Assert
`dueStatus(d, now)`:
- `due_date = '2026-06-09'` (today−1) → `'overdue'`.
- `due_date = '2026-06-10'` (today) → `'soon'` (0 days ≤ 3).
- `due_date = '2026-06-13'` (today+3) → `'soon'`.
- `due_date = '2026-06-14'` (today+4) → `'calm'`.
- `due_date = null` → `'none'`.
- A boundary case at `2026-06-09T22:00:00Z` (= 05:00 WIB Wed 10 Jun, still "today" in WIB) confirms no
  host-tz leak: same classifications hold.

**File (impl):** create `mos-app/src/lib/dueStatus.ts` reusing the `wibParts` +7h approach from
`lib/week.ts` (compute the WIB calendar day for `now` and for `due_date`'s midnight, diff in days):

```ts
export type DueStatus = 'overdue' | 'soon' | 'calm' | 'none'
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
// dueStatus: classify a plain DATE against today-in-WIB (NFR-004, OD-P2-6). Pure.
export function dueStatus(dueDate: string | null, now: Date): DueStatus { /* … per tests … */ }
```

**Verify:** `npm test -- dueStatus` green; `npm run typecheck` clean.
Covers **AC-062** (NFR-004, OD-P2-6, FR-023).

### T-022 — Data layer: list tasks with filters/sort

**File (test first):** create `mos-app/src/lib/db/tasks.test.ts` mirroring `viewer.test.ts`'s
`vi.mock('../supabase')` + chainable-mock pattern, but mocking `supabase.schema('mos').from('tasks')`.
Assert `listTasks`:
- builds the embedded select for BU/R/A names (`business_unit:business_units(id,name),
  responsible:people!responsible_person_id(id,full_name), accountable:people!accountable_person_id(...)`);
- by default filters `archived_at is null` (FR-025) and orders `due_date asc nullsLast` (FR-026);
- applies optional `businessUnitId`, `status`, `personId` filters (FR-024);
- **never** sends `org_id`;
- throws on a non-null PostgREST error (§8).
Title the throw/never-org-id cases generically (not AC-tagged — filter/sort *rendering* ACs are owned
by the component tests T-031..034).

**File (impl):** create `mos-app/src/lib/db/tasks.ts`. Use
`const mos = supabase.schema('mos')` then `mos.from('tasks').select(<embed>)...`. Signature:
```ts
export interface TaskListFilters {
  businessUnitId?: string; status?: TaskStatus; personId?: string; includeArchived?: boolean
}
export async function listTasks(f?: TaskListFilters): Promise<TaskListRow[]>
```

**Verify:** `npm test -- db/tasks` green; `npm run typecheck` clean.
Implements FR-020/024/025/026 (data path; rendering ACs in T-031..034).

### T-023 — Data layer: get-one (+ checklist + events)

**File (test first):** in `tasks.test.ts`, assert `getTask(id)` returns
`{ task: TaskListRow; checklist: ChecklistItemRow[]; events: TaskEventRow[] }`; checklist ordered by
`position asc`; events ordered by `created_at desc` (FR-034 newest-first); throws on error; never sends
org_id.

**File (impl):** add `getTask(id: string)` to `tasks.ts` (three `mos.from(...)` reads, or one task read
+ two child reads).

**Verify:** `npm test -- db/tasks` green; `npm run typecheck` clean.
Implements FR-030/034 (data path).

### T-024 — Data layer: create task (+ created event)

**File (test first):** in `tasks.test.ts`, assert `createTask(input)`:
- inserts into `mos.tasks` with title, business_unit_id, responsible_person_id, accountable_person_id,
  optional description/due_date/consulted/informed, and `created_by` = `input.createdBy`; **never** sends
  org_id (FR-006);
- then inserts a `created` `task_event` with `actor_person_id = input.createdBy` (FR-013);
- returns the new task id;
- throws if either insert errors.

**File (impl):** add to `tasks.ts`:
```ts
export interface CreateTaskInput {
  title: string; businessUnitId: string
  responsiblePersonId: string; accountablePersonId: string; createdBy: string
  description?: string; dueDate?: string | null
  consultedPersonIds?: string[]; informedPersonIds?: string[]
}
export async function createTask(input: CreateTaskInput): Promise<string>
```
Comment the two-statement (non-transactional) caveat per D5; note the future RPC hardening.

**Verify:** `npm test -- db/tasks` green; `npm run typecheck` clean.
Implements FR-010/013/014 (data path).

### T-025 — Data layer: update (status / fields / RACI) + matching events

**File (test first):** in `tasks.test.ts`, assert:
- `updateTaskStatus(id, from, to, actor)` updates `status` then inserts a `status_changed` event with
  `from_value=from, to_value=to, actor_person_id=actor` (FR-055).
- `updateTaskFields(id, patch, actor)` updates the given fields then inserts a `field_edited` event.
- `updateTaskRaci(id, patch, actor)` updates consulted/informed arrays then inserts a `raci_edited`
  event (FR-033/055).
- each throws on error; none sends org_id.

**File (impl):** add the three functions to `tasks.ts` with explicit typed signatures.

**Verify:** `npm test -- db/tasks` green; `npm run typecheck` clean.
Implements FR-031/033/055 (data path).

### T-026 — Data layer: archive/unarchive + checklist CRUD + events

**File (test first):** in `tasks.test.ts`, assert:
- `archiveTask(id, actor)` sets `archived_at = now()` then inserts an `archived` event (FR-054).
- `unarchiveTask(id, actor)` sets `archived_at = null` then inserts an `unarchived` event (FR-052/054).
- `addChecklistItem(taskId, label, position, actor)` inserts the item then a `field_edited` event
  (FR-040/041).
- `toggleChecklistItem(itemId, isDone, taskId, actor)` updates `is_done` then a `field_edited` event
  (FR-041).
- `reorderChecklistItem(itemId, position)` updates `position` (FR-042).
- each throws on error.

**File (impl):** add the functions to `tasks.ts`.

**Verify:** `npm test -- db/tasks` green; `npm run typecheck` clean; **and the full DB+data gate:**
`supabase test db` green + (from `mos-app`) `npm test && npm run typecheck && npm run lint`.
Implements FR-040/041/042/052/054 (data path). **End of P2-1a.**

---

## UI — Tasks list page (P2-1b) — visual detail per `docs/plans/2026-06-11-tasks-design.md`

> Component TDD: write the RTL test first (RED), tag the AC in the test title, mock the data layer
> (`vi.mock('../lib/db/tasks')`). The design-plan owns layout/tokens/density (DESIGN.md, OD-P0-7,
> NFR-008); these tasks own behavior + the AC oracle. Run `npm test -- <file>` per task.

### T-030 — TasksPage shell + data load + state machine

**File (test first):** create `mos-app/src/pages/TasksPage.test.tsx`. With the data-layer mocked to
(a) a pending promise → assert skeleton rows render; (b) reject → assert the inline
"Couldn't load tasks — Retry" banner renders with the toolbar still present; (c) resolve `[]` → assert
the empty state with a "+ New task" affordance. Title the resolve/loading/error cases **AC-067**.

**File (impl):** rewrite `mos-app/src/pages/TasksPage.tsx` (replace the placeholder): load via
`listTasks`, manage loading/error/empty/data states, render the toolbar + table shell from the
design-plan.

**Verify:** `npm test -- TasksPage` green.
Covers **AC-067** (FR-027).

### T-031 — List row rendering (title+BU, status pill, Owner R+N, due, activity)

**File (test first):** in `TasksPage.test.tsx`, with mocked tasks, assert a row shows: title + BU
subline, status pill text, Owner = R first-name + "+N" overflow when C/I present, due-date text, and
last-activity age (e.g. "3h"/"4d" — derive from `last_activity_at`). Title **AC-060**.

**File (impl):** add the row component (or inline `<tr>` render) to `TasksPage.tsx` per the design-plan.

**Verify:** `npm test -- TasksPage` green.
Covers **AC-060** (FR-022, OD-P0-8/9b).

### T-032 — Due-cell colouring (overdue/soon/calm) via `dueStatus`

**File (test first):** in `TasksPage.test.tsx`, with a clock-mocked `now` and tasks at today−1 /
today+2 / today+10, assert the due cell renders the overdue ("Overdue", red token), soon (amber), and
calm (muted) treatments respectively, driven by `dueStatus` (T-021). Title **AC-061**.

**File (impl):** wire `dueStatus` into the due cell class/label in `TasksPage.tsx`.

**Verify:** `npm test -- TasksPage` green.
Covers **AC-061** (FR-023, NFR-004).

### T-033 — Filters: Business Unit / Status / Person

**File (test first):** in `TasksPage.test.tsx`, render with a spread of tasks across BUs/statuses/people;
simulate selecting a BU filter → assert only matching rows; same for Status and Person. Title **AC-063**.

**File (impl):** add the three filter controls to the toolbar; pass selections to `listTasks` filters
(or filter client-side over the loaded set — design-plan decides; the AC asserts the *rendered* result).

**Verify:** `npm test -- TasksPage` green.
Covers **AC-063** (FR-024).

### T-034 — Segmented Mine / RACI-involved / All

**File (test first):** in `TasksPage.test.tsx`, with the viewer mocked (via `useAuth` person id) and
tasks where the viewer is variously R / A / C / I / none: assert "Mine" → only R-or-A rows;
"RACI-involved" → adds C/I rows; "All" → every loaded row. Title **AC-064**.

**File (impl):** add the segmented control; compute membership against the viewer's `person.id`.

**Verify:** `npm test -- TasksPage` green.
Covers **AC-064** (FR-024).

### T-035 — Archived toggle (hidden by default)

**File (test first):** in `TasksPage.test.tsx`, with a mix of active + archived tasks: assert archived
hidden on first paint; toggling the "archived" control shows them (and re-queries with
`includeArchived`). Title **AC-065**.

**File (impl):** add the archived toggle; pass `includeArchived` to `listTasks`.

**Verify:** `npm test -- TasksPage` green.
Covers **AC-065** (FR-025).

### T-036 — Default sort: due ascending (overdue first)

**File (test first):** in `TasksPage.test.tsx`, with tasks in scrambled due order, assert first paint
renders rows ordered by `due_date` ascending (overdue/earliest first). Title **AC-066**.

**File (impl):** ensure the default order matches (the data layer already orders; assert the rendered
DOM order). Add sortable column headers per the design-plan (sort *interaction* is design-plan-owned;
the AC asserts the default).

**Verify:** `npm test -- TasksPage` green.
Covers **AC-066** (FR-026).

### T-037 — Coverage scope: add list page + dueStatus to Vitest include

**File:** edit `mos-app/vite.config.ts` `test.coverage.include` to add
`'src/lib/dueStatus.ts'`, `'src/lib/db/tasks.ts'`, `'src/pages/TasksPage.tsx'`.

**Verify:** `npm test -- --coverage` reports ≥80% lines on the changed files.
Implements NFR-010.

> P2-1b mergeable when T-030..T-037 green + `npm run typecheck && npm run lint` clean.

---

## UI — Task detail, create, archive (P2-1c) — visual detail per the design-plan

### T-040 — Detail route + page shell + data load

**File (test first):** create `mos-app/src/pages/TaskDetail.test.tsx`. Mock `getTask`; assert the page
renders title, status pill, due, business unit, last-activity age, description, full R/A/C/I fields,
checklist, and the activity log region for a loaded task. Title **AC-070**.

**Files (impl):** create `mos-app/src/pages/TaskDetail.tsx`; add route `{ path: 'tasks/:taskId',
element: <TaskDetail /> }` under `AppShell` in `mos-app/src/router.tsx` (and update the route-comment
block). Load via `getTask(useParams().taskId)`.

**Verify:** `npm test -- TaskDetail` green; `npm test -- router` still green.
Covers **AC-070** (FR-030/032).

### T-041 — Inline status change

**File (test first):** in `TaskDetail.test.tsx`, as an authorized editor, pick a new status from the
inline control → assert the pill updates in place (no navigation) and `updateTaskStatus` is called with
`(id, oldStatus, newStatus, viewerPersonId)`. Title **AC-071**.

**File (impl):** add the inline status control to `TaskDetail.tsx`.

**Verify:** `npm test -- TaskDetail` green.
Covers **AC-071** (FR-031).

### T-042 — RACI add/remove (Consulted / Informed chips)

**File (test first):** in `TaskDetail.test.tsx`, as an editor, add and remove a Consulted person chip
and an Informed person chip → assert the chip set updates and `updateTaskRaci` is dispatched with the
new arrays. Title **AC-072**.

**File (impl):** add the C/I chip editors to `TaskDetail.tsx`.

**Verify:** `npm test -- TaskDetail` green.
Covers **AC-072** (FR-033).

### T-043 — Checklist add / toggle / reorder

**File (test first):** in `TaskDetail.test.tsx`, as an editor: add an item → `addChecklistItem`
dispatched, item appears; toggle done → `toggleChecklistItem` dispatched, checkbox reflects; reorder
→ `reorderChecklistItem` dispatched, order reflects. Title **AC-074**.

**File (impl):** add the checklist editor to `TaskDetail.tsx`.

**Verify:** `npm test -- TaskDetail` green.
Covers **AC-074** (FR-040/041/042).

### T-044 — Activity log render (events newest-first)

**File (test first):** in `TaskDetail.test.tsx`, with mocked events, assert the log lists auto
change-events newest-first, each showing actor + age + the from→to transition where present, and that
there is **no** free-text comment composer (P2-1 scope). Title **AC-075**.

**File (impl):** add the activity-log region to `TaskDetail.tsx`.

**Verify:** `npm test -- TaskDetail` green.
Covers **AC-075** (FR-034).

### T-045 — Read-only mode for non-editors

**File (test first):** in `TaskDetail.test.tsx`, with the viewer NOT R/A/manager for the task (compute
the same predicate the UI uses — e.g. a `canEdit(task, viewer)` helper), assert the status changer,
RACI edit, checklist edit, and archive control are hidden/disabled while the task renders read-only.
Title **AC-073**.

**File (impl):** add a `canEdit` gate in `TaskDetail.tsx` driving affordance visibility. (The DB is the
real authority via RLS; this is the UX pre-gate per FR-056.)

**Verify:** `npm test -- TaskDetail` green.
Covers **AC-073** (FR-056).

> `canEdit(task, viewer)` mirrors `mos.can_edit_task`: viewer is R, A, or — for the manager arm — the
> UI uses the already-resolved `viewer.isManager` plus the directory? **Decision:** the UI cannot
> cheaply recompute is_manager_of(R or A) client-side without the full role graph. For P2-1, gate the
> affordance on `viewer.person.id ∈ {R, A}` OR `viewer.isManager === true` (a manager sees edit
> affordances broadly; the DB still enforces the precise manager-of-(R or A) on write, returning a
> handled error if a manager-of-someone-else is not actually a manager of this task). This is a
> deliberate UX-vs-DB asymmetry: optimistic affordance, authoritative DB. Note it in the test comment.

### T-046 — Create-task form: pre-fill + BU default + validation

**File (test first):** create `mos-app/src/pages/TaskCreate.test.tsx` (modal or page per design-plan).
- **AC-080**: on open for a member, R and A pre-fill to the creator (`viewer.person.id`) and Business
  Unit defaults to the creator's primary-role BU — the earliest-assigned role's `business_unit_id`
  (reuse the `roles` ordering already resolved in `viewer.ts`); all editable. Title `AC-080`.
- **AC-081**: submitting with empty Title or empty Business Unit blocks submission with a field-level
  validation message; `createTask` is NOT called. Title `AC-081`.

**File (impl):** create the create form/modal; wire submit → `createTask` → navigate to the new
`tasks/:taskId`.

**Verify:** `npm test -- TaskCreate` green.
Covers **AC-080, AC-081** (FR-010/011/012).

### T-047 — Archive control on detail (authorized only)

**File (test first):** in `TaskDetail.test.tsx`, as A (or manager), assert an archive control is present
and dispatches `archiveTask(id, viewerPersonId)`; an unarchive control appears for an archived task and
dispatches `unarchiveTask`. (Non-A-R hidden is already covered by AC-073/T-045.) No new AC — this
realizes FR-051/052 at the UI; the contract is proven in pgTAP (AC-030..033) and e2e (AC-091).

**File (impl):** add the archive/unarchive control to `TaskDetail.tsx`, visible per the `canEdit`/A gate.

**Verify:** `npm test -- TaskDetail` green.
Implements FR-051/052 (UI).

### T-048 — Wire list → detail navigation + "All tasks" + create entry

**File (test first):** in `TasksPage.test.tsx`, assert clicking a row navigates to `tasks/:taskId`;
assert the "+ New task" affordance opens the create form. Also confirm `MyWeek`'s "All tasks →" link
already targets `/tasks` (no change needed — it does, per `MyWeek.tsx`).

**File (impl):** add row → `Link to={`tasks/${id}`}` and the create entry in `TasksPage.tsx`.

**Verify:** `npm test -- TasksPage` green; `npm test -- router` green.
Implements FR-022 (navigation).

### T-050 — e2e seed: tasks for the journeys

**File:** extend `mos-app/e2e/global-setup.ts` to seed (idempotently, via the `/pg/query` `execSql`
helper) a small set of `mos.tasks` for VIEWER (Cahya, `40000000-…-0001`): at least one active task
where VIEWER is A (for the archive journey AC-091) and clear the `mos.tasks` table for the e2e org at
setup start so runs are deterministic (`DELETE FROM mos.task_events; DELETE FROM mos.task_checklist_items;
DELETE FROM mos.tasks WHERE org_id = '10000000-…-0001';` then INSERTs). Add fixed task UUIDs to
`mos-app/e2e/fixtures/users.ts` (or a new `fixtures/tasks.ts`) so specs reference them.

**Verify:** `npx playwright test --list` shows the new specs; a dry `supabase db reset` + setup runs
without SQL error. (Functional proof in T-052/053.)
Implements the e2e data precondition.

### T-051 — e2e helper: create-task UI step

**File:** add a helper in `mos-app/e2e/helpers/` (e.g. `tasks.ts`) that, given a logged-in page, opens
the create form, fills Title + BU, submits, and returns the created task's detail URL — reused by
AC-090.

**Verify:** referenced by T-052; `npx playwright test --list` clean.

### T-052 — e2e AC-090: create → list → detail → status

**File:** create `mos-app/e2e/tasks-create-status.spec.ts`. Title contains **AC-090**. As VIEWER
(logged in via the existing `helpers/login.ts`): create a task (Title + BU; R/A pre-filled to self) →
assert it appears in the Tasks list → open it → change status to "In Progress" inline → assert the
detail pill shows "In Progress" AND the list row reflects it AND an activity event ("status_changed")
is shown in the log.

**Verify:** `npx playwright test tasks-create-status` passes (stack up).
Covers **AC-090** (FR-010/013/020/022/031/055).

### T-053 — e2e AC-091: archive → leaves default list

**File:** create `mos-app/e2e/tasks-archive.spec.ts`. Title contains **AC-091**. As VIEWER, open the
seeded task VIEWER is A on → archive it from detail → return to the Tasks list → assert it is absent
from the default list → toggle the archived filter → assert it reappears (no row destroyed).

**Verify:** `npx playwright test tasks-archive` passes.
Covers **AC-091** (FR-025/051/053).

### T-054 — Coverage scope finalize + full gate

**File:** edit `mos-app/vite.config.ts` `test.coverage.include` to add
`'src/pages/TaskDetail.tsx'` and the create form file.

**Verify (full P2-1c gate, from `mos-app`):**
`npm test -- --coverage` ≥80% lines on changed files; `npm run typecheck` clean;
`npm run lint` zero errors; `npm run build` clean; `npx playwright test tasks-create-status tasks-archive`
green; and (repo root) `supabase test db` green.
Implements NFR-010.

---

## Traceability (AC → task → owning test)

| AC | Layer | Task | Owning test file (AC tag in title) |
|---|---|---|---|
| AC-001 | pgTAP | T-011 | `supabase/tests/12_mos_task_read.sql` |
| AC-002 | pgTAP | T-011 | `supabase/tests/12_mos_task_read.sql` |
| AC-003 | pgTAP | T-011 | `supabase/tests/12_mos_task_read.sql` |
| AC-010 | pgTAP | T-012 | `supabase/tests/13_mos_task_create.sql` |
| AC-011 | pgTAP | T-012 | `supabase/tests/13_mos_task_create.sql` |
| AC-012 | pgTAP | T-012 | `supabase/tests/13_mos_task_create.sql` |
| AC-020 | pgTAP | T-013 | `supabase/tests/14_mos_task_edit_gate.sql` |
| AC-021 | pgTAP | T-013 | `supabase/tests/14_mos_task_edit_gate.sql` |
| AC-022 | pgTAP | T-013 | `supabase/tests/14_mos_task_edit_gate.sql` |
| AC-023 | pgTAP | T-013 | `supabase/tests/14_mos_task_edit_gate.sql` |
| AC-024 | pgTAP | T-013 | `supabase/tests/14_mos_task_edit_gate.sql` |
| AC-025 | pgTAP | T-013 | `supabase/tests/14_mos_task_edit_gate.sql` |
| AC-026 | pgTAP | T-013 | `supabase/tests/14_mos_task_edit_gate.sql` |
| AC-030 | pgTAP | T-014 | `supabase/tests/15_mos_task_archive.sql` |
| AC-031 | pgTAP | T-014 | `supabase/tests/15_mos_task_archive.sql` |
| AC-032 | pgTAP | T-014 | `supabase/tests/15_mos_task_archive.sql` |
| AC-033 | pgTAP | T-014 | `supabase/tests/15_mos_task_archive.sql` |
| AC-034 | pgTAP | T-010+T-014 | `supabase/tests/11_mos_rls_enabled.sql` + `15_mos_task_archive.sql` |
| AC-040 | pgTAP | T-015 | `supabase/tests/16_mos_children_gate.sql` |
| AC-050 | pgTAP | T-016 | `supabase/tests/17_mos_task_events.sql` |
| AC-051 | pgTAP | T-016 | `supabase/tests/17_mos_task_events.sql` |
| AC-060 | unit | T-031 | `src/pages/TasksPage.test.tsx` |
| AC-061 | unit | T-032 | `src/pages/TasksPage.test.tsx` |
| AC-062 | unit | T-021 | `src/lib/dueStatus.test.ts` |
| AC-063 | unit | T-033 | `src/pages/TasksPage.test.tsx` |
| AC-064 | unit | T-034 | `src/pages/TasksPage.test.tsx` |
| AC-065 | unit | T-035 | `src/pages/TasksPage.test.tsx` |
| AC-066 | unit | T-036 | `src/pages/TasksPage.test.tsx` |
| AC-067 | unit | T-030 | `src/pages/TasksPage.test.tsx` |
| AC-070 | unit | T-040 | `src/pages/TaskDetail.test.tsx` |
| AC-071 | unit | T-041 | `src/pages/TaskDetail.test.tsx` |
| AC-072 | unit | T-042 | `src/pages/TaskDetail.test.tsx` |
| AC-073 | unit | T-045 | `src/pages/TaskDetail.test.tsx` |
| AC-074 | unit | T-043 | `src/pages/TaskDetail.test.tsx` |
| AC-075 | unit | T-044 | `src/pages/TaskDetail.test.tsx` |
| AC-080 | unit | T-046 | `src/pages/TaskCreate.test.tsx` |
| AC-081 | unit | T-046 | `src/pages/TaskCreate.test.tsx` |
| AC-090 | e2e | T-052 | `e2e/tasks-create-status.spec.ts` |
| AC-091 | e2e | T-053 | `e2e/tasks-archive.spec.ts` |

All 39 ACs covered. Non-AC tasks (T-001..009, T-020, T-022..026, T-037, T-047, T-048, T-050, T-051,
T-054) build the schema/data/wiring/gates the AC tasks depend on.

## Open questions for the Director

1. **`mos` client access pattern** — the plan uses `supabase.schema('mos')` on the existing
   `shared`-pinned client (ADR-0004 D1). Confirm this over a second `createClient` bound to `mos`. (The
   `.schema()` approach is lighter — one session — and is the recommendation.)
2. **Manager-arm UI gate (T-045)** — the UI cannot cheaply recompute `is_manager_of(R or A)`
   client-side (no full role graph loaded). The plan gates edit affordances on
   `viewer ∈ {R,A} OR viewer.isManager`, accepting an optimistic-affordance / authoritative-DB
   asymmetry (a manager-of-someone-else gets the affordance but the DB rejects the write with a handled
   error). Acceptable for P2-1, or should the list/detail load enough role data to gate precisely?
   (Recommend: accept the asymmetry; revisit if it confuses users.)
3. **Sub-PR split** — recommend three PRs (P2-1a DB+data / P2-1b list / P2-1c detail+create+archive+e2e)
   per D7. Confirm sequencing, or build as one PR using the task order as-is.
4. **e2e seed reset scope (T-050)** — the seed deletes `mos.tasks` for the Gordi org at setup to keep
   runs deterministic. Confirm that is acceptable for the local/CI e2e stack (it is the same posture as
   the existing user delete-then-create). No effect on prod (seed runs only against the local stack).
