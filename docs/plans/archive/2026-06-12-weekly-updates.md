# Implementation plan — P2-2 Weekly updates

- Spec (authority): `docs/specs/weekly-updates.spec.md` (42 ACs, EARS FR/NFR).
- Decisions: `docs/decisions.md` OD-P2-10..14, OD-P0-1/9, OD-P1-3/4/7, OD-P1-1.
- Design-plan (UI visuals — authoritative for the panes): `docs/plans/2026-06-12-weekly-updates-design.md` (design-architect; referenced by the UI tasks below, not authored here).
- Mirrors: `mos.tasks` schema (`20260611000007`), children (`...0008`), RLS + `_guard_archive` trigger (`...0009`); data layer `mos-app/src/lib/db/tasks.ts` §8 shape; `mos-app/src/lib/week.ts` + `dueStatus.ts` WIB fixed-offset arithmetic; pgTAP fixtures `supabase/tests/12`/`14`.

## Architecture & key decisions (carry into ADRs)

1. **Upward-only read** is the one non-org-readable posture. SELECT = `org_id = current_org_id() AND (person_id = current_person_id() OR shared.is_manager_of(person_id))`. Reuses `shared.is_manager_of` (recursive union, cycle-safe, OD-P1-7) verbatim — no new chain logic. Wrapped in `mos.can_read_weekly_update(p_person_id uuid)` so the parent SELECT and the child (lines) policies share one definition. ADR-0005.

2. **Line-write lock (submit-lock for lines): RLS predicate on parent status (chosen).** Line INSERT/UPDATE/DELETE are gated by `mos.can_write_own_update(p_weekly_update_id uuid)` = parent is the caller's own (`person_id = current_person_id()`) **AND** parent `status = 'draft'` **AND** org-scoped. Rationale vs. a trigger: mirrors P2-1's `can_edit_task` child-table pattern exactly (one helper reused across child policies), is a single provable gate, and fails closed (submitted parent => 0 writable rows). A trigger would duplicate the author+draft check the policy already needs for INSERT and would not fire on rows RLS hid.

3. **Summary submit-lock: `BEFORE UPDATE` trigger** `mos._guard_weekly_update_lock` (mirrors `mos._guard_archive`): if `old.status = 'submitted'` AND `new.summary IS DISTINCT FROM old.summary` AND `new.status` is not `'draft'` (i.e. not a Reopen) => raise `42501`. Reopen (`submitted`→`draft`) passes; summary edits on a still-submitted row are frozen. RLS cannot do this alone (it cannot allow Reopen's UPDATE while blocking a summary-only UPDATE on the same visible row).

4. **status ↔ submitted_at coupling, two layers (§3.4):** (a) CHECK `((status = 'submitted') = (submitted_at IS NOT NULL))` rejects any desynced literal write; (b) `BEFORE INSERT OR UPDATE` trigger `mos._stamp_submitted_at` owns the timestamp — into `submitted` sets `submitted_at = now()` when NULL; on `draft` forces `submitted_at = NULL`. The data layer sets `status` only.

5. **No DELETE on `weekly_updates`** (mirrors `mos.tasks` NFR-006 — updates soft-exist as draft). Lines DO get DELETE grant + policy (line removal is a real edit), author+draft gated.

6. **Directory name resolution client-side** (P2-1b / Fix C1): the data layer returns raw `mos.*` rows; the review roster joins people via `directory.getPeople()` + the viewer's team, NOT a cross-schema PostgREST embed (PGRST200).

7. **pgTAP fixture helper `mos._test_seed_role_tree()` — extract now (recommended yes).** 4th heavy role-tree fixture (after 05/14/16). A `SECURITY DEFINER` function (new test-support migration) seeds org + 2 BUs + Lead/Staff role tree + a grand-manager tier + a dual-hat person + a foreign org (fixed UUIDs). New weekly-update pgTAP files call it; existing tests untouched.

8. **week.ts additions are pure**, reuse `WIB_OFFSET_MS` + `wibParts`; `weekStartISO` returns bare `YYYY-MM-DD`; `weeklyUpdateTiming` compares an ISO `submitted_at` to the week's Friday-17:00-WIB instant.

---

## Sub-PR split recommendation

- **PR-a — schema + RLS + pgTAP + data layer + week.ts** (T-001..T-031). Backend-complete, no UI; merges behind the placeholder page.
- **PR-b — write pane** (T-040..T-052): UpdatesPage write pane, ProgressMarker component, write-pane states.
- **PR-c — review pane + My Week strip + e2e** (T-060..T-075): review pane, My Week strip wiring, 2 curated e2e, coverage close-out.

Rationale: PR-a is the security heart and is independently provable; PR-b/PR-c are UI-only and depend on PR-a's data layer. Each PR is one issue-sized review.

---

## Phase 1 — Migrations (PR-a)

> File: `supabase/migrations/20260612000001_mos_weekly_updates.sql` (tables + indexes + triggers), `20260612000002_mos_weekly_updates_rls.sql` (helpers + RLS). Reversibility: each task lists its down-side; collect down statements in a trailing `-- DOWN` comment block per existing convention (migrations are forward-only files but must be cleanly droppable — list the exact `drop` order).

### T-001 — `mos.weekly_updates` table + indexes + CHECK + UNIQUE
File: `supabase/migrations/20260612000001_mos_weekly_updates.sql` (new).
Add:
```sql
-- P2-2 — mos.weekly_updates: person-keyed weekly recap (OD-P2-10/11/13/14). UPWARD-ONLY read (OD-P1-3).
create table mos.weekly_updates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references shared.orgs(id) on delete cascade
                  default shared.current_org_id(),
  person_id     uuid not null references shared.people(id),
  week_start    date not null,
  summary       text not null default '',
  status        text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at  timestamptz,
  created_by    uuid not null references shared.people(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint weekly_updates_status_submitted_ck
    check ((status = 'submitted') = (submitted_at is not null)),
  constraint weekly_updates_person_week_uq
    unique (org_id, person_id, week_start)
);
comment on table mos.weekly_updates is 'Person-keyed weekly update (OD-P2-10/13). UPWARD-ONLY read: author + manager chain only (OD-P1-3), NOT org-readable. Author-only write.';
create index weekly_updates_person_week_idx on mos.weekly_updates (person_id, week_start);
create index weekly_updates_org_week_idx    on mos.weekly_updates (org_id, week_start);
create trigger weekly_updates_set_updated_at
  before update on mos.weekly_updates
  for each row execute function shared.set_updated_at();
```
Covers: FR-001/002/003/005/006. Down: `drop table mos.weekly_updates cascade;`.
Verify: `cd supabase && supabase db reset` exits 0 (migration applies). Also `npm run typecheck` unaffected.

### T-002 — `mos.weekly_update_items` table + indexes
File: same migration, after T-001.
Add:
```sql
create table mos.weekly_update_items (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references shared.orgs(id) on delete cascade
                      default shared.current_org_id(),
  weekly_update_id  uuid not null references mos.weekly_updates(id) on delete cascade,
  label             text not null check (btrim(label) <> ''),
  progress          text not null default 'in_progress'
                      check (progress in ('done','in_progress','blocked')),
  position          integer not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table mos.weekly_update_items is 'Update line: free text + progress marker + order (OD-P2-10). NO FK to mos.tasks. Inherits parent upward-only read; writes require parent own + draft.';
create index weekly_update_items_parent_idx on mos.weekly_update_items (weekly_update_id, position);
create trigger weekly_update_items_set_updated_at
  before update on mos.weekly_update_items
  for each row execute function shared.set_updated_at();
```
Covers: FR-004/007. Down: `drop table mos.weekly_update_items cascade;` (before T-001's table in down order).
Verify: `supabase db reset` exits 0.

### T-003 — `mos._stamp_submitted_at` trigger (owns submitted_at)
File: same migration, after T-002.
Add:
```sql
-- Owns submitted_at from the status transition so the app sets status only (§3.4, FR-005/013/014).
create or replace function mos._stamp_submitted_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'submitted' then
    if new.submitted_at is null then new.submitted_at := now(); end if;
  else
    new.submitted_at := null;
  end if;
  return new;
end;
$$;
create trigger weekly_updates_stamp_submitted
  before insert or update on mos.weekly_updates
  for each row execute function mos._stamp_submitted_at();
```
Covers: FR-005/013/014 (AC-015/016 mechanism). Down: drop trigger + function.
Verify: `supabase db reset` exits 0.

### T-004 — `mos._guard_weekly_update_lock` trigger (summary submit-lock)
File: same migration, after T-003.
Add:
```sql
-- Submit-lock for the summary (mirrors mos._guard_archive). Freezes summary edits while submitted,
-- but lets Reopen (submitted->draft) through. Raises 42501 (insufficient_privilege). (FR-015, AC-023 summary side)
create or replace function mos._guard_weekly_update_lock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'submitted'
     and new.status <> 'draft'
     and new.summary is distinct from old.summary then
    raise exception 'weekly update is submitted; reopen before editing the summary'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger weekly_updates_guard_lock
  before update on mos.weekly_updates
  for each row execute function mos._guard_weekly_update_lock();
```
Covers: FR-015 (summary lock). Down: drop trigger + function.
Verify: `supabase db reset` exits 0.

### T-005 — RLS helpers `can_read_weekly_update` + `can_write_own_update`
File: `supabase/migrations/20260612000002_mos_weekly_updates_rls.sql` (new), first.
Add:
```sql
-- P2-2 — mos.weekly_updates RLS (ADR-0005). Upward-only read; author-only write.
-- Read gate: author OR up-chain manager, org-scoped (mirrors can_edit_task shape; reuses is_manager_of).
create or replace function mos.can_read_weekly_update(p_person_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.current_org_id() is not null
    and (
      p_person_id = shared.current_person_id()
      or shared.is_manager_of(p_person_id)
    )
$$;
comment on function mos.can_read_weekly_update(uuid) is 'Read gate: current person is the author OR an up-chain manager of the author (OD-P1-3/P1-7).';

-- Write gate for lines: parent update is the caller's OWN and in DRAFT, org-scoped (FR-011/015).
create or replace function mos.can_write_own_update(p_weekly_update_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from mos.weekly_updates w
    where w.id = p_weekly_update_id
      and w.org_id = shared.current_org_id()
      and w.person_id = shared.current_person_id()
      and w.status = 'draft'
  )
$$;
comment on function mos.can_write_own_update(uuid) is 'Line-write gate: parent is the caller''s own update and still draft (FR-011/015).';
```
Covers: FR-011/015/020/021 (mechanism). Down: drop both functions.
Verify: `supabase db reset` exits 0.

### T-006 — Grants + RLS enable/FORCE + policies on `weekly_updates`
File: same RLS migration, after T-005.
Add:
```sql
grant select, insert, update on mos.weekly_updates      to authenticated; -- no delete (soft-exists as draft)
grant select, insert, update, delete on mos.weekly_update_items to authenticated;

alter table mos.weekly_updates enable row level security;
alter table mos.weekly_updates force  row level security;

-- SELECT: upward-only (author OR manager-of-author), org-scoped. NOT org-readable.
create policy weekly_updates_select_upward on mos.weekly_updates
  for select to authenticated
  using (org_id = shared.current_org_id() and mos.can_read_weekly_update(person_id));

-- INSERT: author-only; org defaulted + unspoofable.
create policy weekly_updates_insert_author on mos.weekly_updates
  for insert to authenticated
  with check (org_id = shared.current_org_id() and person_id = shared.current_person_id());

-- UPDATE: author-only (managers never write). Summary submit-lock enforced by the trigger.
create policy weekly_updates_update_author on mos.weekly_updates
  for update to authenticated
  using (org_id = shared.current_org_id() and person_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and person_id = shared.current_person_id());
-- No delete policy.
```
Covers: FR-006/011/020/021/022/023, NFR-001/002/003 (parent). Down: drop policies + `alter table ... disable row level security`.
Verify: `supabase db reset` exits 0.

### T-007 — RLS enable/FORCE + policies on `weekly_update_items`
File: same RLS migration, after T-006.
Add:
```sql
alter table mos.weekly_update_items enable row level security;
alter table mos.weekly_update_items force  row level security;

-- SELECT: inherit the parent's upward-only posture (read line iff may read parent).
create policy weekly_update_items_select_upward on mos.weekly_update_items
  for select to authenticated
  using (org_id = shared.current_org_id() and exists (
    select 1 from mos.weekly_updates w
    where w.id = weekly_update_id and mos.can_read_weekly_update(w.person_id)
  ));

-- INSERT/UPDATE/DELETE: author-only AND parent draft (submit-lock for lines).
create policy weekly_update_items_insert_own on mos.weekly_update_items
  for insert to authenticated
  with check (org_id = shared.current_org_id() and mos.can_write_own_update(weekly_update_id));
create policy weekly_update_items_update_own on mos.weekly_update_items
  for update to authenticated
  using (mos.can_write_own_update(weekly_update_id))
  with check (org_id = shared.current_org_id() and mos.can_write_own_update(weekly_update_id));
create policy weekly_update_items_delete_own on mos.weekly_update_items
  for delete to authenticated
  using (mos.can_write_own_update(weekly_update_id));
```
Covers: FR-007/015/024, AC-021/023 (lines). Down: drop policies + disable RLS.
Verify: `supabase db reset` exits 0; `psql` `\d mos.weekly_update_items` shows 4 policies.

---

## Phase 2 — pgTAP (PR-a, RED FIRST — write before/with the migrations above so they fail then pass)

> New files numbered after `17_mos_task_events.sql`. Each begins `begin; create extension if not exists pgtap ...; select plan(N);` and ends `reset role; select * from finish(); rollback;` (existing convention). Allow/deny by EFFECT (12/14 pattern). Run all: `cd supabase && supabase test db` exits 0.

### T-010 — Test-support fixture migration `mos._test_seed_role_tree()`
File: `supabase/migrations/20260612000003_mos_test_seed.sql` (new). **Gate it behind a guard so it never ships to prod data** — define the function only; it inserts fixed-UUID fixtures and is called solely inside `begin;...rollback;` pgTAP transactions.
Add a `SECURITY DEFINER`, `set search_path = ''` function seeding (fixed UUIDs, prefix `0000...wu`):
- org WU-A (`...0a01`) + foreign org WU-B (`...0b01`);
- BUs Unit-1/Unit-2 in WU-A;
- role tree: `Exec` (top, no parent) -> `Lead R` -> `Staff R`; `Lead A` (reports to Exec); plus a second-BU `Lead 2`;
- people: Author (`...0d01`, holds Staff R), DirectMgr (`...0d02`, holds Lead R), GrandMgr (`...0d03`, holds Exec), Peer (`...0d04`, holds Staff R sibling — NOT in author chain), Report (`...0d05`, reports to Author's role — downward), DualHat (`...0d06`, holds Staff R AND a role under Lead 2 so M1=DirectMgr and M2=Lead2-holder), Lead2Holder (`...0d07`, holds Lead 2), ForeignMgr (`...0b04` in WU-B);
- person_roles wiring the above.
Comment documents the exact tree so each pgTAP file can assert against it.
Covers: fixture for AC-001..023. Down: `drop function mos._test_seed_role_tree();`.
Verify: `supabase db reset` exits 0; `select mos._test_seed_role_tree();` inside a tx inserts rows.

### T-011 — pgTAP: upward-only READ matrix (parent)
File: `supabase/tests/18_mos_weekly_update_read.sql` (new). `plan(7)`. Call `select mos._test_seed_role_tree();`, insert one `mos.weekly_updates` row for Author (status submitted), then per session assert visible-count:
- AC-001 author reads own => 1.
- AC-002 DirectMgr reads => 1.
- AC-003 GrandMgr reads => 1.
- AC-004 Peer reads => 0.
- AC-005 Report (downward) reads Author's update => 0.
- AC-007 ForeignMgr (org WU-B) reads => 0.
- AC-006 DualHat's own update is read by BOTH M1 (DirectMgr) and M2 (Lead2Holder) — assert each session sees DualHat's row (combined into this file's plan or split; keep here, +adjust plan count to 7 by folding M1/M2 into two `is()`).
Covers: AC-001..007 (FR-020/021/022/023/036). Verify: `supabase test db` passes file 18.

### T-012 — pgTAP: lines inherit upward-only read
File: `supabase/tests/19_mos_weekly_update_items_read.sql` (new). `plan(3)`. Seed + an update with 1 line.
- AC-008a permitted reader (DirectMgr) sees the line => 1.
- AC-008b Peer sees the line => 0.
- AC-008c Report (downward) sees the line => 0.
Covers: AC-008 (FR-024). Verify: file 19 passes.

### T-013 — pgTAP: author-only WRITE + manager-no-write + cross-org
File: `supabase/tests/20_mos_weekly_update_write.sql` (new). `plan(6)`. Allow/deny by effect.
- AC-010 Author inserts own update => row exists, `org_id` = WU-A (stamped).
- AC-011 Author inserts with `person_id = Peer` => raises / 0 rows (WITH CHECK). Use `throws_ok`/expect 0.
- AC-012 DirectMgr UPDATEs Author's summary => no-op (USING hides row; summary unchanged).
- AC-013 Peer inserts/updates Author's update => denied.
- AC-014 Author inserts with `org_id = WU-B` => rejected by WITH CHECK (`throws_ok`).
- AC-012b GrandMgr UPDATE => no-op (managers never write).
Covers: AC-010..014 (FR-006/011/034, NFR-002/003). Verify: file 20 passes.

### T-014 — pgTAP: status transitions + submitted_at + CHECK + invalid enums
File: `supabase/tests/21_mos_weekly_update_lifecycle.sql` (new). `plan(6)`.
- AC-015 Author `update ... set status='submitted'` (submitted_at left null) => after write `submitted_at is not null` (trigger stamped) and CHECK holds.
- AC-016 then `set status='draft'` (Reopen) => `submitted_at is null`.
- AC-017a force `status='submitted', submitted_at=null` by disabling the stamp path — assert the CHECK rejects a literal desync: `throws_ok($$ update mos.weekly_updates set status='submitted' where ... $$)` is auto-fixed by trigger, so instead assert the CHECK directly via an insert that bypasses the trigger is impossible; **prove the CHECK with a `set status='draft', submitted_at=now()` style desync attempt** — trigger nulls it, so assert post-state consistent (CHECK can't trip from app). Document that the CHECK is belt-and-suspenders; the provable assertion is "no desynced row can exist after any write".
- AC-017b direct desync proof: `throws_ok` on a raw insert with explicit mismatched literals using `set local session_replication_role = replica;` to suppress the trigger, then the CHECK fires.
- AC-018a `status='archived'` invalid => CHECK rejects (`throws_ok`).
- AC-018b line `progress='nope'` / blank `label` => CHECK rejects (`throws_ok`).
Covers: AC-015/016/017/018 (FR-001/004/005). Verify: file 21 passes.

### T-015 — pgTAP: UNIQUE, line write gate, locked-edit denial, cascade
File: `supabase/tests/22_mos_weekly_update_constraints.sql` (new). `plan(5)`.
- AC-020 second update for same (Author, week) => UNIQUE rejects (`throws_ok`).
- AC-021a Author (draft) inserts/updates/deletes a line => succeeds; AC-021b Peer line write => denied (0 rows / throws).
- AC-022 delete parent update => its lines gone (count 0) — cascade.
- AC-023 Author submits, then attempts a line INSERT without reopening => denied (`can_write_own_update` false: parent not draft). Also assert summary edit on submitted parent raises 42501 (`throws_ok` on the guard trigger).
- AC-006-org spoof double-check: line insert with `org_id = WU-B` => rejected.
Covers: AC-020/021/022/023 (+ org spoof) (FR-002/007/015/016/017). Verify: file 22 passes; full `supabase test db` exits 0.

---

## Phase 3 — week.ts helpers (PR-a, TDD)

### T-020 — RED: `weekStartISO` + `weeklyUpdateTiming` unit tests
File: `mos-app/src/lib/week.test.ts` (extend existing if present, else new). Title tests with AC ids.
- `AC-030`: `weekStartISO(now, 0)` returns the WIB Monday `YYYY-MM-DD` for a clock at Mon 00:00 WIB, Sun 23:59 WIB, and a UTC instant straddling WIB midnight (e.g. `2026-06-08T16:30:00Z` = Mon 23:30 WIB → `2026-06-08`); `offsetWeeks=-1` → prior Monday; cross-month and cross-year cases; assert no host-tz leak by running under a non-UTC `process.env.TZ` note (pure arithmetic — value identical).
- `AC-031b`: `weeklyUpdateTiming(submittedAt, weekStart)` → `'on-time'` when `submittedAt` ≤ Friday 17:00 WIB of `weekStart` (i.e. `weekStart`+4d at 10:00:00Z), `'late'` after; boundary exactly at 17:00:00 WIB = on-time; a Saturday submit = late; cross-year week.
Covers: AC-030, AC-031b (FR-003/033, NFR-004). Verify: `cd mos-app && npm test -- week` FAILS (functions absent).

### T-021 — GREEN: implement `weekStartISO` + `weeklyUpdateTiming`
File: `mos-app/src/lib/week.ts` (append).
```ts
/** Monday (WIB) of the week containing `now`, offset by `offsetWeeks`, as 'YYYY-MM-DD'. Pure. */
export function weekStartISO(now: Date, offsetWeeks = 0): string {
  const { year, month, day, jsDay } = wibParts(now)
  const dow = toMonBased(jsDay)
  const todayWibMidnightUTC = new Date(Date.UTC(year, month - 1, day) - WIB_OFFSET_MS)
  const mondayUTC = addDays(todayWibMidnightUTC, -dow + offsetWeeks * 7)
  const m = wibParts(mondayUTC)
  const mm = String(m.month).padStart(2, '0')
  const dd = String(m.day).padStart(2, '0')
  return `${m.year}-${mm}-${dd}`
}

export type WeeklyUpdateTiming = 'on-time' | 'late'
/** on-time iff submittedAt <= Friday 17:00 WIB of weekStart's week, else late. Pure. */
export function weeklyUpdateTiming(submittedAt: string, weekStart: string): WeeklyUpdateTiming {
  const [y, mo, d] = weekStart.split('-').map(Number)
  // weekStart is the Monday (WIB). Friday 17:00 WIB = Monday + 4 days at 17:00 WIB = 10:00:00Z.
  const fridayDueUTC = Date.UTC(y, mo - 1, d + 4, 17, 0, 0) - WIB_OFFSET_MS
  return new Date(submittedAt).getTime() <= fridayDueUTC ? 'on-time' : 'late'
}
```
Covers: AC-030, AC-031b. Verify: `npm test -- week` PASSES; `npm run typecheck` clean.

---

## Phase 4 — Data layer (PR-a, TDD)

### T-030 — Types file `weeklyUpdates.types.ts`
File: `mos-app/src/lib/db/weeklyUpdates.types.ts` (new). Mirror `tasks.types.ts` hand-written style.
```ts
export type WeeklyUpdateStatus = 'draft' | 'submitted'
export type ProgressMarker = 'done' | 'in_progress' | 'blocked'

export interface WeeklyUpdateRow {
  id: string; org_id: string; person_id: string; week_start: string
  summary: string; status: WeeklyUpdateStatus; submitted_at: string | null
  created_by: string; created_at: string; updated_at: string
}
export interface WeeklyUpdateItemRow {
  id: string; org_id: string; weekly_update_id: string
  label: string; progress: ProgressMarker; position: number
  created_at: string; updated_at: string
}
export interface MyUpdate { update: WeeklyUpdateRow; items: WeeklyUpdateItemRow[] }
export interface TeamUpdateRow {  // review roster row — person + their update state (names resolved client-side)
  person_id: string; full_name: string; role_label: string | null
  state: 'filed' | 'draft' | 'not_started'
  summary_excerpt: string | null; submitted_at: string | null
}
```
Covers: type seam for FR-010..036. Verify: `npm run typecheck` clean.

### T-031 — RED+GREEN: `weeklyUpdates.ts` data layer
File: `mos-app/src/lib/db/weeklyUpdates.test.ts` (new, RED) then `mos-app/src/lib/db/weeklyUpdates.ts` (GREEN). Mirror `tasks.ts` (uses `supabase.schema('mos')`, NEVER sends `org_id`, throws on PostgREST error). Mock the supabase client as in `tasks.test.ts`.
Functions:
```ts
const mos = () => supabase.schema('mos')
// getMyUpdate(weekStart): load author's update + items for (current person, week) or null.
export async function getMyUpdate(personId: string, weekStart: string): Promise<MyUpdate | null>
// upsertDraft: insert-or-update the parent (status forced 'draft'), then diff lines (insert new, update edited, delete removed). Returns the update id.
export async function upsertDraft(input: { id?: string; personId: string; weekStart: string; createdBy: string; summary: string; lines: { id?: string; label: string; progress: ProgressMarker; position: number }[] }): Promise<string>
export async function submit(id: string): Promise<void>   // update status='submitted'
export async function reopen(id: string): Promise<void>    // update status='draft'
// line CRUD (parent must be draft — RLS enforces):
export async function addLine(updateId: string, label: string, progress: ProgressMarker, position: number): Promise<string>
export async function updateLine(itemId: string, patch: Partial<Pick<WeeklyUpdateItemRow,'label'|'progress'|'position'>>): Promise<void>
export async function removeLine(itemId: string): Promise<void>
// listTeamUpdates(weekStart): raw mos.weekly_updates for the viewer's team-visible set (RLS already returns author+upward only — for a manager that is their team's updates), joined to people via directory.getPeople() + the team roster from viewer/directory; returns TeamUpdateRow[]. NO cross-schema embed.
export async function listTeamUpdates(weekStart: string, team: { person_id: string; full_name: string; role_label: string | null }[]): Promise<TeamUpdateRow[]>
```
Tests (titled with the ACs the data path serves): getMyUpdate returns null when no row; upsertDraft sends NO `org_id` and forces `status='draft'`; submit sends `status='submitted'`; reopen sends `status='draft'`; each throws on a non-null PostgREST error; listTeamUpdates maps submitted→'filed', draft→'draft', missing person→'not_started' and resolves names from the passed roster (not an embed).
Covers (data path for): FR-010/012/013/014/016/017/030/031. Verify: `npm test -- weeklyUpdates` PASSES; `npm run typecheck` clean.

> `database.types.ts` is shared-schema-only (per `tasks.types.ts` note) — no regen needed; hand-written types above are the source for mos.* (mirrors P2-1).

---

## Phase 5 — Write pane (PR-b, TDD; visuals per design-plan)

> Visuals/layout/tokens are owned by `docs/plans/2026-06-12-weekly-updates-design.md`. Tasks below name states + ACs only — do NOT hardcode pixel/color choices here.

### T-040 — RED+GREEN: `ProgressMarker` pill component
File: `mos-app/src/components/ProgressMarker.test.tsx` then `ProgressMarker.tsx` (new). A small pill distinct from task `StatusPill`: renders Done / In progress / Blocked for `progress ∈ {done,in_progress,blocked}` using DESIGN.md tokens (tints per design-plan). Test: renders the correct label per value; has an accessible name.
Covers: NFR-007 (vocabulary). Verify: `npm test -- ProgressMarker` PASSES.

### T-041 — RED: write-pane state tests (states + validation)
File: `mos-app/src/pages/UpdatesPage.test.tsx` (new) — write-pane block. Mock the data layer. Title each with its AC:
- AC-031 submitted update → summary + lines read-only, **Reopen** shown, no edit affordances.
- AC-032 draft → Save draft + Submit both visible; summary + lines editable.
- AC-033 empty draft (empty summary + 0 lines) → Submit disabled, Save draft enabled; adding a line/summary enables Submit.
- AC-034 add line / edit text / set progress marker / reorder / remove → UI reflects + correct mutation dispatched.
- AC-035 Save draft → dispatches `upsertDraft` (status draft) + quiet "Draft saved" confirm (inline, not modal/toast).
- AC-036 Submit (non-empty) → dispatches `submit` (status submitted) + pane transitions to locked read-only.
- AC-037 Reopen → dispatches `reopen` (status draft) + pane editable again.
- AC-038 loading → skeletons; load error → inline "Couldn't load your update — Retry", surface stays usable.
Verify: `npm test -- UpdatesPage` FAILS.

### T-042..T-052 — GREEN: implement the write pane
File: `mos-app/src/pages/UpdatesPage.tsx` (replace placeholder) + extract `mos-app/src/components/WeeklyUpdateWritePane.tsx` if it keeps UpdatesPage thin. Build to the design-plan:
- summary textarea; update-line rows (text input + ProgressMarker picker + reorder + remove);
- co-located Save draft + Submit; quiet "Draft saved" confirm; Submit-disabled-when-empty (AC-033);
- locked read-only render + Reopen (AC-031/037); skeleton + inline error+Retry (AC-038);
- week pill + prior-week navigation via `weekStartISO(now, offset)`; wire to `getMyUpdate/upsertDraft/submit/reopen`.
One task per state slice to stay 2–5 min (T-042 layout+load, T-043 line CRUD, T-044 progress picker, T-045 save-draft+confirm, T-046 submit+lock, T-047 reopen, T-048 submit-disabled, T-049 read-only render, T-050 skeleton, T-051 error+retry, T-052 week nav).
Covers: AC-031..038, FR-010/012/013/014/015/016/017/018/019. Verify after each: `npm test -- UpdatesPage` greener; final `npm run typecheck` + `npm run lint -- --max-warnings=0` clean.

---

## Phase 6 — Review pane + My Week strip + e2e (PR-c)

### T-060 — RED: manager review pane tests
File: `mos-app/src/pages/UpdatesPage.test.tsx` (review-pane block). Mock data layer + a team roster. Title with ACs:
- AC-040 team of N → one row per person with name + role, summary excerpt (or "No update yet"), state pill.
- AC-041 mixed states → submitted→Filed, draft→Draft, none→Not started; counts (N filed · M draft · K not started) match rows.
- AC-042 filed row → on-time/late signal from `weeklyUpdateTiming(submitted_at, weekStart)`.
- AC-043 no edit/acknowledge/comment affordances anywhere (read-only).
- AC-044 prior-week navigation → roster recomputes for that week_start.
- AC-045 team with no updates → all Not started; counts "0 filed · 0 draft · N not started".
- AC-046 review query error → inline "Couldn't load team updates — Retry"; write pane stays usable.
Verify: `npm test -- UpdatesPage` FAILS on the new block.

### T-061..T-066 — GREEN: implement the review pane
File: `mos-app/src/pages/UpdatesPage.tsx` (review section, manager-conditional via `viewer.isManager`) + optional `WeeklyUpdateReviewPane.tsx`. Build to design-plan: roster rows (Filed/Draft/Not-started pills), summary excerpt, submit time, on-time/late signal, summary counts, empty + error states. Wire `listTeamUpdates(weekStart, team)` where `team` derives from the viewer's manager roster (directory + chain). One task per slice (T-061 roster+pills, T-062 counts, T-063 on-time/late, T-064 prior-week, T-065 empty, T-066 error+retry).
Covers: AC-040..046, FR-030..036. Verify: `npm test -- UpdatesPage` PASSES; typecheck/lint clean.

### T-070 — RED+GREEN: My Week strip wiring
File: `mos-app/src/pages/MyWeek.test.tsx` (extend) then `mos-app/src/pages/MyWeek.tsx`. Replace the static "No update" strip (lines ~114-138) with live state for the current WIB week via `getMyUpdate(viewer.personId, weekStartISO(now))`:
- AC-050 no row → "No update" pill + "No weekly update for this week yet." + `Due Fri {wib.fridayShort}` (keep existing copy/link).
- AC-051 draft → Draft pill; submitted → Submitted pill + on-time/late indicator via `weeklyUpdateTiming`.
Keep the Updates link. Tests titled with AC-050/051.
Covers: AC-050/051, FR-040/041/042. Verify: `npm test -- MyWeek` PASSES.

### T-071 — Extend e2e seed for weekly updates
File: `mos-app/e2e/fixtures/` + `mos-app/e2e/global-setup.ts` (+ a `helpers/weeklyUpdates.ts`). Add an author-with-manager pair (reuse the existing role-tree seed users if present in `fixtures/users.ts`) so an author can submit and a manager can review. No new prod data path.
Verify: `npx playwright test --list` shows the new specs; `global-setup` runs clean.

### T-072 — E2E: write → submit → appears Filed in review (AC-090)
File: `mos-app/e2e/weekly-update-submit.spec.ts` (new). Author logs in, writes summary + a line with a progress marker, Submits; assert My Week strip shows **Submitted**; manager logs in, opens Updates review for the week, sees the author's row **Filed** with the summary excerpt.
Covers: AC-090 (FR-012/013/030/031/040). Verify: `npx playwright test weekly-update-submit` passes.

### T-073 — E2E: reopen → edit → resubmit (AC-091)
File: `mos-app/e2e/weekly-update-reopen.spec.ts` (new). From a submitted update: author Reopens, edits summary/a line, re-Submits; assert editable in between, locks on resubmit, manager review reflects updated content for same (person, week).
Covers: AC-091 (FR-013/014/015/017). Verify: `npx playwright test weekly-update-reopen` passes.

### T-074 — Coverage + gates close-out
Run `cd mos-app && npm test -- --coverage` and confirm changed files (`week.ts`, `weeklyUpdates.ts`, `UpdatesPage.tsx`, `MyWeek.tsx`, `ProgressMarker.tsx`) ≥80% lines; `npm run typecheck` zero errors; `npm run lint -- --max-warnings=0` zero. `cd supabase && supabase test db` all green.
Covers: NFR-010. Verify: all three commands exit 0.

---

## Phase 7 — ADRs (PR-a)

### T-080 — ADR-0005 weekly-updates upward-only RLS
File: `docs/adr/0005-weekly-updates-upward-only-rls.md` (new). Context: one non-org-readable entity (OD-P1-3); Decision: SELECT via `can_read_weekly_update` (author OR `is_manager_of`), author-only write, line submit-lock via `can_write_own_update` (parent draft predicate, NOT a trigger), summary submit-lock via `_guard_weekly_update_lock` trigger, `submitted_at` owned by `_stamp_submitted_at` + CHECK coupling; Consequences: managers read-not-write; reuses `is_manager_of`; lines fail-closed when parent submitted; future task↔update FK is additive.

---

## Traceability — AC → owning task → layer

| AC | Task | Layer |
|---|---|---|
| AC-001 author reads own | T-011 | pgTAP |
| AC-002 direct manager reads | T-011 | pgTAP |
| AC-003 grand-manager reads | T-011 | pgTAP |
| AC-004 peer denied | T-011 | pgTAP |
| AC-005 downward denied | T-011 | pgTAP |
| AC-006 dual-hat union (M1+M2) | T-011 | pgTAP |
| AC-007 cross-org denied | T-011 | pgTAP |
| AC-008 lines inherit read | T-012 | pgTAP |
| AC-010 author insert + org stamp | T-013 | pgTAP |
| AC-011 foreign person_id rejected | T-013 | pgTAP |
| AC-012 manager-no-write | T-013 | pgTAP |
| AC-013 peer write denied | T-013 | pgTAP |
| AC-014 foreign org_id rejected | T-013 | pgTAP |
| AC-015 submit stamps submitted_at | T-014 | pgTAP |
| AC-016 reopen clears submitted_at | T-014 | pgTAP |
| AC-017 status↔submitted_at CHECK | T-014 | pgTAP |
| AC-018 invalid status/progress/blank | T-014 | pgTAP |
| AC-020 unique per week | T-015 | pgTAP |
| AC-021 author line write / non-author denied | T-015 | pgTAP |
| AC-022 line cascade on delete | T-015 | pgTAP |
| AC-023 locked-edit denial (line + summary) | T-015 + T-004 | pgTAP |
| AC-030 weekStartISO WIB | T-020/T-021 | unit |
| AC-031b on-time/late timing | T-020/T-021 | unit |
| AC-031 submitted read-only + Reopen | T-041/T-049 | unit |
| AC-032 draft Save+Submit editable | T-041/T-042 | unit |
| AC-033 empty → Submit disabled | T-041/T-048 | unit |
| AC-034 line add/edit/marker/reorder/remove | T-041/T-043/T-044 | unit |
| AC-035 Save draft + quiet confirm | T-041/T-045 | unit |
| AC-036 Submit → lock | T-041/T-046 | unit |
| AC-037 Reopen → editable | T-041/T-047 | unit |
| AC-038 write-pane skeleton/error | T-041/T-050/T-051 | unit |
| AC-040 review roster rows | T-060/T-061 | unit |
| AC-041 state pills + counts | T-060/T-061/T-062 | unit |
| AC-042 on-time/late signal | T-060/T-063 | unit |
| AC-043 read-only (no edit/ack/comment) | T-060/T-061 | unit |
| AC-044 prior-week recompute | T-060/T-064 | unit |
| AC-045 empty team | T-060/T-065 | unit |
| AC-046 review error+retry | T-060/T-066 | unit |
| AC-050 strip No update | T-070 | unit |
| AC-051 strip Draft / Submitted+signal | T-070 | unit |
| AC-090 write→submit→Filed | T-072 | e2e |
| AC-091 reopen→edit→resubmit | T-073 | e2e |

All 42 ACs covered. No `[OWNER-DECISION]` remains (spec §9).
