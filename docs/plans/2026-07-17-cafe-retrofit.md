# Plan — Café Retrofit (redesign buildout Step 7)

**Spec (contract):** `docs/specs/cafe-retrofit.spec.md`. **Substrate (binding):**
`docs/adr/0051-occurrence-as-tasks-schema.md` D6/D7/D8/D9/**D11** · `docs/specs/occurrence-as-tasks.spec.md`
· `docs/plans/2026-07-16-occurrence-as-tasks.md` (Step 6 — its tables/RPCs/DAL are **consumed, not
rebuilt**). **Master plan row:** `docs/plans/2026-07-14-redesign-buildout.md` Step 7 (DB/RLS **"no"**).
**Read-first:** `docs/experience-contract.md` Rules 1–12 (blocking), `docs/jtbd.md` (barista/J16/S1),
`docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` (convergence owns F2 "Start today's
opening"), `docs/plans/CLOUD-AGENT-HANDOFF.md` §2 (conservative-default + RATIFY policy).

> **No-placeholder rule.** Every task carries an exact path, real code/SQL, a cited `AC-###` (behavior
> tasks), and an exact verify command. **TDD order:** the failing test is written first, then the
> implementation makes it pass.
>
> **Sandbox execution (this step):**
> - **pgTAP runs LOCALLY** (no Docker): `bash scripts/sandbox-pg.sh` then
>   `sudo -u postgres pg_prove -U postgres -d gordi_mos_sandbox --host /var/run/postgresql --ext .sql
>   supabase/tests/<file>.sql` — **NOT** `supabase test db`.
> - **Unit:** `cd mos-app && npm test -- <file>`.
> - **E2E written locally, EXECUTED via CI dispatch:** `gh workflow run integration.yml --ref <branch>`
>   then `gh run watch`. **Never** point tests/reset at cloud staging.

> **No new schema (NFR-701).** This step ships **data seed + DAL + UI** only. The one DB object it adds is
> a `SECURITY DEFINER` **test-only** seed fixture (revoked from `public,anon,authenticated`, DOWN-dropped),
> mirroring `mos._test_seed_process_tree()`. No `ops.kitchen_*` change, no new business RPC/RLS/column.
> If any RATIFY (§8 of the spec) is resolved toward a schema/capability/RPC change, this plan grows a
> Track-A migration + a mandatory security-auditor pass — flag it, don't sneak it.

## Parallelization map

- **Track A — Café seed + pgTAP** (`supabase/`): **A1–A8**. A1 (test fixture) + A2 (dev seed) first;
  A3–A7 (pgTAP) parallel once A1 lands; A8 is the local gate. Reuses Step-6 tables/RPCs — **no migration
  DDL** beyond the test fixture.
- **Track B — Café DAL + surface** (`mos-app/`): **B1–B8**. Depends only on the **Step-6 type/DAL contract**
  (`processes.types.ts` / `processes.ts` — already frozen by Step 6), not on a live DB (DAL tests mock
  supabase; component tests mock the DAL). **A and B run fully in parallel.**
- **Track C — Wiring + e2e + reviews + gates** (`mos-app/` + `docs/`): **C1–C4**. Depends on **A and B
  landed**.

Recommended split: **Builder 1 = Track A** (sonnet — reuses Step-6 machinery, low novelty), **Builder 2 =
Track B** (sonnet; opus only if the two-front UI proves hard), **Director = Track C** + both review
batteries. **This step consumes Step 6 — do not start until `feat/redesign-step6-*` is landed in the base
you branch from** (stack Step 7 on Step 6's tip per CLOUD-AGENT-HANDOFF §4).

---

## Track A — Café seed + pgTAP (`supabase/`)

### A1 — Migration: `mos._test_seed_cafe_opening()` test fixture (no business schema)
**File:** `supabase/migrations/20260717000001_mos_cafe_opening_test_seed.sql` (create). Reuses the Step-6
tree (`mos._test_seed_process_tree()` — org `…a1`, BU Unit-1 `…a2`, Team `own_team`, people Solo `…f001` /
Twin A `…f002` / Twin B `…f003` / Boss `…f004`, roles Opener `…e001` / Twin `…e002`) and adds a
**café-meaningful** def set: one checklist Task + one independently-owned production-log def + one ambiguous
(twin) barista def.
```sql
-- Step 7 (café retrofit) TEST-ONLY fixture. SECURITY DEFINER, revoked. NO business schema/column/RLS/RPC
-- (NFR-701) — data + a test seed function only, mirroring mos._test_seed_process_tree (Step 6). DOWN drops
-- the function. Builds the "Café Opening" occurrence entirely on Step-6 tables (ADR-0051 D11 map).
create or replace function mos._test_seed_cafe_opening()
returns void language plpgsql security definer set search_path = '' as $$
declare v_org  uuid := '00000000-0000-0000-0000-0000000000a1';
        v_bu   uuid := '00000000-0000-0000-0000-0000000000a2';   -- Unit-1 (stands in for the café Retail-Ops BU)
        v_team uuid;
begin
  perform mos._test_seed_process_tree();                          -- org+BU+Team(own_team)+people+roles+memberships
  select id into v_team from shared.teams where org_id = v_org and code = 'own_team';

  -- Reuse the Step-6 "Café Opening" process (…c001) + daily cadence (…c002); (re)author café defs (…ca01..03).
  -- Idempotent: archive any prior café defs on this process so counts are deterministic under re-seed.
  update mos.process_task_defs set archived_at = now()
   where work_line_id = '00000000-0000-0000-0000-00000000c001' and org_id = v_org
     and id not in ('00000000-0000-0000-0000-0000000ca01','00000000-0000-0000-0000-0000000ca02','00000000-0000-0000-0000-0000000ca03');

  insert into mos.process_task_defs
    (id, org_id, work_line_id, title, position, due_offset_days, checklist_items, pic_role_id, pic_team_id) values
    -- ca01: single-operator opening steps → ONE Task with checklist_items (OD-12). PIC = Opener (Solo, 1 holder).
    ('00000000-0000-0000-0000-0000000ca01', v_org, '00000000-0000-0000-0000-00000000c001',
     'Open the café floor', 0, 0,
     '["Unlock the door","Turn on the espresso machine","Check pastry stock","Wipe the bar"]'::jsonb,
     '00000000-0000-0000-0000-00000000e001', v_team),
    -- ca02: independently-owned step → its OWN Task (deep-links to /cafe/log in the UI). PIC = Opener (Solo).
    ('00000000-0000-0000-0000-0000000ca02', v_org, '00000000-0000-0000-0000-00000000c001',
     'Log today''s production', 1, 0, '[]'::jsonb,
     '00000000-0000-0000-0000-00000000e001', v_team),
    -- ca03: ambiguous barista step → 2 holders (Twin A + Twin B) ⇒ a pending "to assign" item (OD-41).
    ('00000000-0000-0000-0000-0000000ca03', v_org, '00000000-0000-0000-0000-00000000c001',
     'Brew station handover', 2, 0, '[]'::jsonb,
     '00000000-0000-0000-0000-00000000e002', v_team)
  on conflict (id) do update
    set title = excluded.title, position = excluded.position, checklist_items = excluded.checklist_items,
        pic_role_id = excluded.pic_role_id, pic_team_id = excluded.pic_team_id, archived_at = null;
end $$;
comment on function mos._test_seed_cafe_opening() is
  'TEST-ONLY (SECURITY DEFINER): café-opening def set on the Step-6 Café Opening process (…c001). Reuses _test_seed_process_tree. ADR-0051 D11 map; no kitchen-schema change.';
revoke execute on function mos._test_seed_cafe_opening() from public, anon, authenticated;
-- DOWN: drop function if exists mos._test_seed_cafe_opening();
```
**Verify:** `bash scripts/sandbox-pg.sh` applies all migrations clean (this file included); the fixture is
exercised by A3–A7.

### A2 — Dev seed: café-opening def enrichment for the running app / e2e
**File:** `supabase/seed.dev-cafe-opening.sql` (create); `supabase/config.toml` (edit).
- DEV-only, idempotent (mirrors `seed.dev-processes.sql` from Step 6): resolve the café BU by stable
  `code = 'retail_ops'` (the `KITCHEN_BU_CODE`, `mos-app/src/lib/db/kitchen-logs.ts`), resolve the demo
  branch Team + an "Opener"/"Barista" Role + dev people by their `*.dev@example.test` emails / team codes,
  then upsert the *"Café Opening"* `work_lines` (`type='process'`, that BU, A = a dev lead), a `daily`
  `mos.process_cadences`, and three `mos.process_task_defs` matching A1's shape (checklist "Open the café
  floor"; own-def "Log today's production"; ambiguous "Brew station handover" bound to a Role held by two
  dev people). Guard the whole block with
  `if exists (select 1 from mos.work_lines where type='process' and name='Café Opening' limit 1) then return; end if;`
  so a re-seed is a no-op (idempotent, reversible-by-omission).
- In `config.toml` `[db.seed] sql_paths`, add `"seed.dev-cafe-opening.sql"` **after**
  `"seed.dev-processes.sql"` (so the Step-6 process/team substrate exists first).
**Verify:** `bash scripts/sandbox-pg.sh` (runs the seed list) exits READY with no seed error.

### A3 — pgTAP: seed maps onto the runtime, **no schema change** (**AC-701**)
**File:** `supabase/tests/95_cafe_opening_no_schema.sql` (create). Follow the `83_signal_substrate.sql`
layout (`begin; create extension if not exists pgtap …; select plan(N); select mos._test_seed_cafe_opening();`).
Assert (tag each `AC-701`):
- `mos.work_lines` has a `type='process'` row named `'Café Opening'` (`is((select count(*) …), 1)`).
- `mos.process_cadences` for it has `cadence_kind='daily'`; `mos.process_task_defs` for it (active) count `= 3`.
- `hasnt_column('ops','kitchen_logs','process_run_id')` — the no-bridge guard (RATIFY-7B).
- `has_column('ops','kitchen_logs','batch_id')` + `has_column('ops','kitchen_plans','qty_porsi')` — the
  kitchen tables are intact/unchanged.
- No fifth occurrence table: `hasnt_table('mos','cafe_openings')` (the retrofit invented no table).
**Verify:** `bash scripts/sandbox-pg.sh && sudo -u postgres pg_prove -U postgres -d gordi_mos_sandbox --host /var/run/postgresql --ext .sql supabase/tests/95_cafe_opening_no_schema.sql`.

### A4 — pgTAP: café-lead spawn + idempotency (**AC-702**)
**File:** `supabase/tests/96_cafe_opening_spawn.sql` (create). Seed, then set the caller to Boss (`…f004`)
with claims `access_roles:["admin"]` + `org_id`/`person_id` (mirror the claim idiom in
`supabase/tests/92_process_holder_resolution.sql`; `set local role authenticated` + `set_config('request.jwt.claims', …, true)`).
- Call `select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001', <own_team>, current_date)`;
  assert one `mos.process_runs` row for that key and a `mos.tasks` row with
  `generated_from_task_def_id='…ca01'` (Open the café floor) carrying `process_run_id` = the run
  (single-holder path). Tag `AC-702`.
- Call the identical spawn again; assert `(result->>'idempotent')::bool` is true, the run count for the key
  is still `1`, and the `mos.tasks where process_run_id = run` count is unchanged. Tag `AC-702`.
**Verify:** `bash scripts/sandbox-pg.sh && sudo -u postgres pg_prove … supabase/tests/96_cafe_opening_spawn.sql`.

### A5 — pgTAP: ambiguous barista step → pending → resolve (**AC-703**)
**File:** `supabase/tests/97_cafe_opening_resolution.sql` (create). Seed; spawn today's run as admin Boss.
- Assert **no** Task exists for `…ca03` and a `mos.process_run_pending_tasks` row `reason='multiple'` with
  `candidate_person_ids @> array['…f002','…f003']::uuid[]` exists (`AC-703`).
- Call `select mos.resolve_pending_task(<that pending id>, '00000000-0000-0000-0000-00000000f002')`
  (`lives_ok`); assert a `mos.tasks` row now exists (`generated_from_task_def_id='…ca03'`,
  `responsible_person_id='…f002'`, `process_run_id` = the run) and the pending row has `resolved_at` +
  `materialized_task_id` set (`AC-703`).
**Verify:** `bash scripts/sandbox-pg.sh && sudo -u postgres pg_prove … supabase/tests/97_cafe_opening_resolution.sql`.

### A6 — pgTAP: café **member** cannot start the opening (**AC-704**)
**File:** `supabase/tests/98_cafe_opening_member_denied.sql` (create). Seed; ensure a member person (reuse
a Step-6/signal fixture person who is an **active member of `own_team`** but holds only `member`) — set
claims `access_roles:["member"]` + that person's `person_id` + `org_id`.
- `select throws_ok($$ select mos.spawn_process_run('…c001', '<own_team>', current_date) $$, '42501')` —
  member with Team membership but **without** `process.start` is rejected (RATIFY-7A). Tag `AC-704`.
- Belt-and-braces: assert `mos.can_start_process_for_team('<own_team>')` is **true** for this member (so
  the denial is proven to come from the missing `process.start` capability, not from Team-auth). Tag `AC-704`.
**Verify:** `bash scripts/sandbox-pg.sh && sudo -u postgres pg_prove … supabase/tests/98_cafe_opening_member_denied.sql`.

### A7 — pgTAP: checklist-vs-def boundary + kitchen untouched by spawn (**AC-705**)
**File:** `supabase/tests/99_cafe_opening_checklist_vs_def.sql` (create). Seed; capture the pre-spawn
`ops.kitchen_logs` row count; spawn today's run as admin Boss.
- Assert the `…ca01` Task (Open the café floor) has exactly **4** `mos.task_checklist_items` rows (Unlock /
  Turn on / Check pastry / Wipe) and that **no extra Task** was created for those four steps (`AC-705`).
- Assert `…ca02` (Log today's production) is a **separate** `mos.tasks` row (`generated_from_task_def_id='…ca02'`)
  (`AC-705`).
- Assert `ops.kitchen_logs` row count is **unchanged** post-spawn — the opening writes zero kitchen facts
  (`AC-705`, FR-708).
**Verify:** `bash scripts/sandbox-pg.sh && sudo -u postgres pg_prove … supabase/tests/99_cafe_opening_checklist_vs_def.sql`.

### A8 — Local pgTAP gate (whole café suite + no Step-6 regression)
**Verify:** `bash scripts/sandbox-pg.sh` then
`sudo -u postgres pg_prove -U postgres -d gordi_mos_sandbox --host /var/run/postgresql --ext .sql supabase/tests/*.sql`
— the café files (95–99) pass **and** the full pre-existing suite (Step-6 90–94, signals 83–89, etc.) shows
no regression. (CI `integration.yml` re-runs the same suite on dispatch in C3.)

---

## Track B — Café DAL + "Start today's opening" surface (`mos-app/`)

### B1 — Café DAL types + `getCafeOpeningProcessId` + `getTodayOpeningForTeam` (**AC-710 backing**)
**Test first (AC-710):** `mos-app/src/lib/db/cafe-opening.test.ts` (create) — mock a supabase shape (mirror
`processes.test.ts` / `kitchen-logs.test.ts` mocks). Assert `getTodayOpeningForTeam(processId, teamId)`
selects `mos.process_runs` filtered `.eq('work_line_id', processId).eq('owning_team_id', teamId).eq('period_key', <todayWIB>)`
and, when a run exists, reads `process_run_rollup` for it and returns `{ started:true, runId, rollup }`;
when none, returns `{ started:false, runId:null, rollup:null }`; an error is re-thrown. Tag the started-path
assertion `AC-710`.
**Impl:** `mos-app/src/lib/db/cafe-opening.ts` (create):
```ts
import { supabase } from '@/lib/supabase'
import { getRunRollup } from './processes'
import type { ProcessRunRollup } from './processes.types'

const mos = () => supabase.schema('mos')

/** WIB "today" as YYYY-MM-DD (fixed +7h; mirrors kitchen-log-page.wibToday). */
export function wibToday(): string {
  const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`
}

/** Resolve the "Café Opening" process id by name (org-scoped by RLS). RATIFY-7F: name-based v1 seam. */
export async function getCafeOpeningProcessId(): Promise<string | null> {
  const { data, error } = await mos()
    .from('work_lines').select('id')
    .eq('type', 'process').eq('name', 'Café Opening').limit(1).maybeSingle()
  if (error) throw new Error(`getCafeOpeningProcessId failed — ${error.message}`)
  return (data as { id: string } | null)?.id ?? null
}

export interface TodayOpening {
  started: boolean
  runId: string | null
  rollup: ProcessRunRollup | null
}

export async function getTodayOpeningForTeam(processId: string, teamId: string): Promise<TodayOpening> {
  const { data, error } = await mos()
    .from('process_runs').select('id')
    .eq('work_line_id', processId).eq('owning_team_id', teamId).eq('period_key', wibToday())
    .limit(1).maybeSingle()
  if (error) throw new Error(`getTodayOpeningForTeam failed — ${error.message}`)
  const runId = (data as { id: string } | null)?.id ?? null
  if (!runId) return { started: false, runId: null, rollup: null }
  const rollup = await getRunRollup(runId)
  return { started: true, runId, rollup }
}
```
**Verify:** `cd mos-app && npm test -- src/lib/db/cafe-opening.test.ts`.

### B2 — Café DAL: `startTodayOpening` + `listStartableCafeTeams` (**AC-711 backing**)
**Test first (AC-711):** in `cafe-opening.test.ts` — `startTodayOpening(processId, teamId)` calls Step-6
`startRun(processId, teamId, wibToday())` and returns the `SpawnResult`; an RPC error is re-thrown;
`listStartableCafeTeams(processId)` calls `listDueRuns()` and returns only the rows whose
`work_line_id === processId`. Tag the start assertion `AC-711`.
**Impl:** add to `cafe-opening.ts` (reuse Step-6 `startRun` / `listDueRuns` — do **not** re-implement the RPC
calls, Rule 11):
```ts
import { startRun, listDueRuns } from './processes'
import type { SpawnResult, DueProcessRun } from './processes.types'

export function startTodayOpening(processId: string, teamId: string): Promise<SpawnResult> {
  return startRun(processId, teamId, wibToday())
}

export async function listStartableCafeTeams(processId: string): Promise<DueProcessRun[]> {
  const due = await listDueRuns()
  return due.filter(d => d.work_line_id === processId)
}
```
**Verify:** `cd mos-app && npm test -- src/lib/db/cafe-opening.test.ts`.

### B3 — Ensure `process.start` in the client capability mirror (**RATIFY-7E**)
**Test first:** `mos-app/src/lib/capabilities.test.ts` (extend, or create if absent) — assert
`can(['ops_lead'], 'process.start')` and `can(['admin'], 'process.start')` are **true**, and
`can(['member'], 'process.start')` is **false** (the Café Start gate authority mirror; matches the DB seed
`shared.role_capabilities`, ADR-0051 D8).
**Impl:** in `mos-app/src/lib/capabilities.ts`, add `'process.start'` to the `admin` and `ops_lead` arrays
in `ROLE_CAPABILITIES` **iff not already present** (Step-6 may have added it — idempotent verify).
**Verify:** `cd mos-app && npm test -- src/lib/capabilities.test.ts`.

### B4 — i18n strings for the opening surface
**File:** `mos-app/src/i18n/messages.ts` (edit — **both** the `en` block ~L376 and the `id` block ~L833).
Add: `nav.cafe.opening` (`Opening` / `Buka`); `cafe.opening.start` (`Start today's opening` /
`Mulai pembukaan hari ini`); `cafe.opening.notStartedLead` (`Not started yet — start today's opening.` /
`Belum dimulai — mulai pembukaan hari ini.`); `cafe.opening.notStartedMember`
(`Not started yet — your shift lead starts today's opening.` /
`Belum dimulai — pemimpin shift memulai pembukaan hari ini.`); `cafe.opening.rollup`
(`{done}/{total} done · {overdue} overdue · {pending} to assign` /
`{done}/{total} selesai · {overdue} terlambat · {pending} perlu ditugaskan`); `cafe.opening.viewTasks`
(`View opening tasks` / `Lihat tugas pembukaan`). No new test — `messages.test.ts` (key-parity) + typecheck
cover key existence.
**Verify:** `cd mos-app && npm test -- src/i18n/messages.test.ts && npm run typecheck`.

### B5 — `CafeOpeningPanel` — capability-gated Start + read-only member state (**AC-712, AC-713**)
**Test first (AC-712 + AC-713):** `mos-app/src/components/cafe/cafe-opening-panel.test.tsx` (create) —
render with mocked `cafe-opening` DAL + the `useAuth`/`can` capability source:
- **AC-712:** viewer `access_roles:['ops_lead']`, `getTodayOpeningForTeam` → `{started:false}` ⇒ a control
  with accessible name exactly **"Start today's opening"** renders (assert it is **not** a bare "Start"/
  "Create" — Rule 7); clicking it calls `startTodayOpening(processId, teamId)`.
- **AC-713:** viewer `access_roles:['member']`, `{started:false}` ⇒ **no** button with an accessible name
  matching `/start/i` is in the DOM; the read-only `cafe.opening.notStartedMember` copy renders.
**Impl:** `mos-app/src/components/cafe/cafe-opening-panel.tsx` (create). Derive `canStart` via
`can(viewer.accessRoles, 'process.start')` (reuse `@/lib/capabilities` — do not re-implement). Props:
`{ processId, teamId, teamName }`. Reuse shared `Button`/`Pill`/`state-kit` primitives (Rule 11); no bespoke
card editor. The Start button uses `btn btn-primary`, `aria-label={t('cafe.opening.start')}`.
**Verify:** `cd mos-app && npm test -- src/components/cafe/cafe-opening-panel.test.tsx`.

### B6 — `CafeOpeningPanel` started state: caption + roll-up + pending (**AC-714, AC-715**)
**Test first (AC-714 + AC-715):** extend `cafe-opening-panel.test.tsx`:
- **AC-714:** `getTodayOpeningForTeam` → `{started:true, runId, rollup:{caption:'Café Opening · 17 Jul 2026',
  done:2, total:5, overdue:1, pending_unresolved:1, …}}` ⇒ the panel renders the **caption** header, the
  `cafe.opening.rollup` summary (`2/5 done · 1 overdue · 1 to assign`), and a link whose href targets
  `/work/tasks` scoped to that caption/run; assert the string `'Process Run'` is **never** in the DOM
  (FR-611).
- **AC-715:** with a `reason='multiple'` pending item (mock `listPendingTasks(runId)`) and a
  `process.start`-capable viewer, the reused Step-6 `PendingResolution` renders and selecting a candidate
  calls `resolvePendingTask(id, picId)`; with a `member` viewer the resolve control is absent.
**Impl:** extend `cafe-opening-panel.tsx` — when `started`, render the caption + roll-up + the `Link to`
`/work/tasks?occurrence=<runId>` (reuse the Step-6 occurrence group-by param wired in Step-6 C1) and mount
the **Step-6** `PendingResolution` component (import from `@/components/processes/pending-resolution`) gated
on `canStart`. Reuse Step-6 DAL `listPendingTasks`/`resolvePendingTask` — no café copy.
**Verify:** `cd mos-app && npm test -- src/components/cafe/cafe-opening-panel.test.tsx`.

### B7 — Café Module home page (hosts the panel + existing capture links) (**AC-716**)
**Test first (AC-716):** `mos-app/src/pages/cafe-opening-page.test.tsx` (create) — render the page (mock the
DAL: resolve process id, resolve the viewer's branch team via `listStartableCafeTeams` or a started run).
Assert it mounts `CafeOpeningPanel` and renders links to `/cafe/log`, `/cafe/plan`, `/cafe/stock`,
`/cafe/review` (the existing capture entry points, FR-708). Tag `AC-716`.
**Impl:** `mos-app/src/pages/cafe-opening-page.tsx` (create) — `PageFrame` + `PageHead` (title
`Café Operations`, meta = WIB today), resolve `processId` via `getCafeOpeningProcessId()`; resolve the
branch `teamId`/`teamName` from `listStartableCafeTeams(processId)[0]` (unstarted) or from the started
run's team; render `<CafeOpeningPanel …/>` then a compact **"Continue in the kitchen"** link row to
`/cafe/log|plan|stock|review` (reuse `Link` + existing nav labels). Loading/empty/error via `state-kit`.
Handle "no Café Opening process configured" with an `EmptyState` (not a crash) — RATIFY-7C: seed may be
absent in a bare org.
**Verify:** `cd mos-app && npm test -- src/pages/cafe-opening-page.test.tsx`.

### B8 — Route `/cafe` → Café home; nav entry (**RATIFY-7D**)
**Test first:** `mos-app/src/router.test.tsx` (extend) — navigating to `/cafe` renders the Café Operations
home (asserts a hook from `CafeOpeningPage`, e.g. the `Café Operations` heading), **not** an immediate
redirect to `/cafe/log`; `/cafe/log|plan|stock|review|pushes` still resolve to their existing pages
(no regression). Add/adjust `mos-app/src/shell/sections.tsx` test expectation if `CAFE_SECTIONS` gains an
`Opening` leaf.
**Impl:**
- `mos-app/src/router.tsx`: replace `{ path: 'cafe', element: <Navigate to="/cafe/log" replace /> }` with
  `{ path: 'cafe', element: <CafeOpeningPage /> }` (import it); keep the old `/kitchen` → `/cafe` redirects
  and all `/cafe/*` children unchanged.
- `mos-app/src/shell/sections.tsx`: prepend `{ path: '/cafe', label: 'Opening', labelKey: 'nav.cafe.opening', Icon: CafeIcon }`
  to `CAFE_SECTIONS` (so the sub-nav shows Opening · Log · Plan · Stock · Review · Pushes and the breadcrumb
  resolves `/cafe`). Leave the `SECTIONS` `/cafe` "Café" root entry as-is.
**Verify:** `cd mos-app && npm test -- src/router.test.tsx && npm test -- src/shell`.

---

## Track C — Wiring, e2e, reviews, gates (depends on A + B)

### C1 — E2E: F2 "today's opening" journey (**AC-720**)
**Test first (this IS the test):** `mos-app/e2e/AC-720-cafe-today-opening.spec.ts` (create) — follow the
e2e conventions (`e2e/helpers/login.ts`, `e2e/fixtures/users.ts`). As an authorized café shift-lead (a
fixture user with `process.start` + branch-Team membership; the `seed.dev-cafe-opening.sql` def + a Step-6
dev lead cover this — add the fixture user if absent): open `/cafe`, click **"Start today's opening"**;
assert the single-holder opening Tasks (e.g. *Open the café floor*, *Log today's production*) appear in
`/work/tasks` grouped under the *"Café Opening · &lt;today&gt;"* caption; assert the *Brew station handover*
step shows as **"1 to assign"**; open it, resolve to a PIC, and assert that Task now appears in the same
group; assert the *Log today's production* Task links to `/cafe/log`; assert `'Process Run'` appears nowhere
in the DOM. Tag the title `AC-720`. This IS **F2** (standing curated journey — must not regress).
**Verify (CI dispatch — no local Docker):** `gh workflow run integration.yml --ref <branch>` then
`gh run watch` (e2e runs on the live stack).

### C2 — Wire the occurrence group filter link end-to-end (no rebuild)
**Test first:** `mos-app/src/pages/tasks-page.test.tsx` (extend) — visiting `/work/tasks?occurrence=<runId>`
groups/filters to that occurrence's caption (reusing the Step-6 occurrence group-by from Step-6 C1); assert
`'Process Run'` never appears. **Impl:** ensure the Café panel's `/work/tasks?occurrence=<runId>` link
(B6) is honored by the shipped Tasks page — this is **reuse** of the Step-6 grouping param; if Step 6 keyed
the group-by differently, adapt the Café link to that param (do NOT add a new grouping mechanism — Rule 11).
**Verify:** `cd mos-app && npm test -- src/pages/tasks-page.test.tsx`.

### C3 — Review-ledger scope card + both batteries
**File:** `docs/reviews/<branch>.md` (create/append). Record the Step-7 **scope card**:
- **IN:** café-opening seed (data only), café DAL, the "Start today's opening" surface (`/cafe` home),
  occurrence-caption grouping reuse, pending-PIC reuse, F2 e2e.
- **DEFERRED (do NOT fail here):** café-member start = RATIFY-7A (upheld ops_lead+admin); kitchen bridge
  column = RATIFY-7B (none); production branch adoption = RATIFY-7C; closing/opname/roster Runs +
  Standards/Checks (OD-REDESIGN-4/5/30/31); Roastery/Ecommerce retrofits; stable `work_lines.code` =
  RATIFY-7F.
- **Ratify-before-merge list:** RATIFY-7A..7F (spec §8), each with the chosen conservative default + the
  recorded alternative.
Run **both** batteries and record BLOCK→fix→re-verify→APPROVE: (a) **code-quality + spec** review (reads
diff + `docs/specs/cafe-retrofit.spec.md`); (b) **4-lens design** review on the **rendered, logged-in** app
(`bash scripts/cloud-agent-bootstrap.sh` → `npm run dev` → `/cafe`) — score Rules 1–12 pass/fail, the Rule-12
cold-start as the **barista** (OD-REDESIGN-66), **both fronts** (manager `/work/tasks` density unharmed +
barista obviousness), and **mockup fidelity vs the convergence F2 "Start today's opening" flow**
(SALVAGE-INVENTORY) incl. cross-version regression. **security-auditor is NOT triggered by scope** (no new
auth/RLS/schema path) — record that verdict explicitly; it becomes mandatory only if a RATIFY is resolved
toward a schema/capability/RPC change (spec §7). (Doc only; no verify command — Director's review input.)

### C4 — Final gates (blocking; whole slice)
Run and confirm green:
- `bash scripts/sandbox-pg.sh` then `sudo -u postgres pg_prove -U postgres -d gordi_mos_sandbox --host /var/run/postgresql --ext .sql supabase/tests/*.sql` — café suite (95–99) + no Step-6/signal regression.
- `gh workflow run integration.yml --ref <branch>` → `gh run watch` — CI pgTAP suite + live-stack e2e (**AC-720 / F2**) green.
- `cd mos-app && npm run typecheck` — zero errors.
- `cd mos-app && npm run lint -- --max-warnings=0` — zero.
- `cd mos-app && npm test` — full Vitest suite green; coverage ≥80% changed lines (`src/lib/db/cafe-opening.ts`
  + `src/components/cafe/*` + `src/pages/cafe-opening-page.tsx`).
- `cd mos-app && npx playwright test` — curated journeys green (F1/F2/F3 no regression; F2 is AC-720).
- `bash scripts/pre-merge-check.sh` — exit 0 (ledger present; both batteries recorded; RATIFY list present).
**Verify:** all commands above exit 0 / the CI `db` + `e2e` jobs are green.

---

## Task count & coverage

**19 tasks:** Track A = A1–A8 (8), Track B = B1–B8 (8), Track C = C1–C4 (3 numbered + the scope-card doc; C3
is one task).  *(Count numbered tasks: A1–A8, B1–B8, C1–C4 = 20.)*

**AC → task map:**
- **AC-701** → A3 · **AC-702** → A4 · **AC-703** → A5 · **AC-704** → A6 · **AC-705** → A7 (local gate A8).
- **AC-710** → B1 · **AC-711** → B2 · **AC-712/713** → B5 · **AC-714/715** → B6 · **AC-716** → B7.
- **AC-720** (e2e / F2) → C1.

**FR → task map:** FR-701 → A1/A2/A3 · FR-702 → B1/B5 · FR-703 → A4/B2 · FR-704 → B6/C2 · FR-705 → A5/B6 ·
FR-706 → A7 · FR-707 → A6/B3/B5 · FR-708 → A7/B7 · FR-709 → A1/A2 · FR-710 → B1/B6.
NFR-701 → A3 (+ every task adds no schema) · NFR-702 → B5/B6/B7 + C3 (design battery) · NFR-703 → C4.

**RATIFY (spec §8) → where addressed:** 7A → A6/B5 (+ ledger C3) · 7B → A3 (`hasnt_column`) · 7C →
A2/B7 (+ ledger) · 7D → B8 · 7E → B3 · 7F → B1 (name-based resolution, flagged).

**Parallelizable:** Track A and Track B run concurrently (B depends only on the frozen Step-6 DAL/type
contract; A only on the Step-6 migrations being in the base). A3–A7 parallel after A1; B5–B8 after B1–B4.
Track C is the integration seam — after A + B land. **Prerequisite:** branch Step 7 on the **landed Step-6
tip** (CLOUD-AGENT-HANDOFF §4); Step 7 builds nothing Step 6 owns.
