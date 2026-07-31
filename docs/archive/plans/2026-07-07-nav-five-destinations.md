# Plan — Five-destination nav shell: regroup + Work-spine absorption (2026-07-07)

- Feature: complete the **five-destination IA regroup** (Home · Work · Operate · Plan · Inbox) in the
  shell + absorb the held **Work spine** (cascade everyone-view + `can()` substrate) so Work is whole,
  with the catalog becoming **Work's manage-mode** (retire standalone nav, relocate routes under `/work/`,
  add up/down trace context). Spec: `docs/specs/nav-five-destinations.spec.md`.
- Branch: `feat/ia-nav-work-spine` (cut from `dev`; currently == `dev` — no commits yet).
- Authority: ADR-0019 D2/D8/D12/D14-step-3 · `docs/jtbd.md` §2 · `docs/decisions.md` "Catalog placement"
  (2026-07-06) · OD-C-1/OD-C-2 · ADR-0020 (`can()`) · ADR-0021 (i18n). Spec FR-400..450, AC-400..411.
- Patterns cloned: `mos-app/src/shell/{destinations.tsx,rail-nav.tsx,bottom-tab-bar.tsx,breadcrumb.tsx}`,
  `mos-app/src/components/catalog/catalog-manager.tsx`, `mos-app/src/lib/cascade/build-ladder.ts`
  (held, `feat/work-spine`), `mos-app/src/lib/db/{objectives.ts,work-lines.ts,tasks.ts}`.
- Do NOT touch: the agent/deputy panel (ADR-0018), Home internals, the task editor, the shell grid CSS,
  the cascade page's ladder logic. **No migrations authored here** (NFR-402) — the `can()` substrate
  arrives via § Work-spine reconciliation.

## 0. Scope & sequencing

**In scope (one slice):**
1. **Absorb** the held `feat/work-spine` (`0bf7cdd`) onto this branch via rebase (§ Work-spine reconciliation)
   — brings `cascade-page.tsx`, `build-ladder.ts`, `capabilities.ts`, `RequireCapability`, the `can()`
   migrations (`20260708000001` + `20260708000002`), pgTAP 72/73, and the cascade i18n strings; **revert**
   its feature-flag flip; **keep** its stray-root-PNG / `.pyc` deletions.
2. **Regroup** the five destinations to the accepted IA (Work sheds Daily Log → Operate; Operate gains
   Daily Log; Plan gains Sales, finance/admin-gated; catalog nav group retired).
3. **Catalog → Work manage-mode**: relocate `/objectives` + `/projects-processes` under `/work/`, redirect
   the old top-level paths into the cascade, add up/down trace context to the reused manage pages, rewire
   the cascade's Manage affordance to the new paths.
4. **i18n sweep**: every nav label through the catalog (`en` + `id`).
5. **Tests**: rewrite `destinations.test.ts` + `rail-nav.test.tsx` (they encode the old wrong state);
   add router-redirect, trace-context, breadcrumb, i18n-parity unit tests; add 2 e2e journeys.

**Out of scope:** Follow-up queues (D14-4), Plan budget/COGS (D14-5), Operate activity roll-ins, Home
redesign, the agent port, admin-editable-roles UI, per-entity comments, retrofitting non-nav i18n.

**Sequencing (TDD, red→green per concern):** absorb the spine first (it's the base) → write failing tests
for the regroup → make them green → trace context → i18n → e2e → verify → ship. Tasks are 2–5 min each.

> **Pre-flight (Task 0):** confirm `feat/ia-nav-work-spine` is clean and == `dev`
> (`git status` clean; `git log --oneline -1` == `dev`'s tip). If the reconciliation in § Work-spine is
> deferred, swap Phase A and Phase B order and rebase at the end instead — but absorbing first is
> lower-conflict (the cascade link then already exists when Work is regrouped).

---

## § Work-spine reconciliation — integrate `feat/work-spine` (`0bf7cdd`)

**Recommendation: REBASE `feat/work-spine` onto this branch** (not merge, not cherry-pick).

- **Why rebase.** The held branch is 10 commits carrying an interdependent stack
  (`can()` substrate → gate-writes → i18n+ladder → cascade page → nav wiring → phone test → review fixes).
  Rebase replays that stack onto `feat/ia-nav-work-spine` as a **linear, reviewable** sequence and lets
  us **supersede FR-310–313 during conflict resolution** (relocate routes, rewire the cascade Manage
  affordance) as visible edits, not a buried merge commit. The branch also **deletes stray root PNGs +
  `.pyc` files + tweaks `scripts/reporting_snapshot.py`** — those apply cleanly (no conflict); **KEEP them**
  (they're repo hygiene).
- **Why not merge.** A `--no-ff` merge entangles the two histories behind a merge commit, hides the
  FR-310–313 supersession, and makes the PR harder to review line-by-line.
- **Why not cherry-pick.** 10 commits with internal dependencies (can() before cascade-page before
  nav-wiring) cherry-pick one-by-one with the same conflicts as rebase but no clearer story; strictly
  more fiddly.

**Exact sequence:**

```bash
# 0. This branch is bare (== dev). Fast-forward it to the held branch's tip (no conflicts yet —
#    nothing on this branch diverges). This is the cleanest "absorb" for a bare branch and is the
#    linear-history equivalent of rebase-with-nothing-to-replay.
git switch feat/ia-nav-work-spine
git merge --ff-only feat/work-spine          # now == work-spine tip (dev + 10 commits)

# 1. REVERT the feature-flag flip the held branch made for its own local testing (decisions §7-g).
#    Resolve to `true` (dev's posture) so all five destinations render.
git switch -c _tmpff                          # or just edit + commit on this branch
# edit mos-app/src/config/features.ts → all five flags back to `true`
git add mos-app/src/config/features.ts && git commit -m "revert: restore feature flags to true (post work-spine merge)"

# 2. NOW author the nav-regroup + FR-310–313 supersession as clean commits ON TOP (Phases B–F below).
#    The cascade link + can() substrate already exist, so Work-regroup edits are additions, not conflicts.
```

> **Alternative (if the owner wants work-spine's commits *replayed* rather than ff-merged):** after the
> nav-regroup commits land, `git rebase --onto feat/ia-nav-work-spine dev feat/work-spine` replays the
> 10 held commits onto this branch, resolving the conflicts below + superseding FR-310–313 inline, then
> `git switch feat/ia-nav-work-spine && git merge --ff-only feat/work-spine`. Higher-conflict, same end
> state. The ff-merge-first path above is recommended for the lower-conflict authoring experience.

**Conflict-risk files (resolve to the FINAL spec state):**

| File | Risk | Resolution |
|---|---|---|
| `mos-app/src/shell/destinations.tsx` | **HIGH** | held adds the Cascade link to Work; this slice **also** moves Daily Log out, adds Sales to Plan, adds the two `railHidden` manage routes. Final: see Task C2. |
| `mos-app/src/router.tsx` | **HIGH** | held adds `/work/cascade` + switches objectives/projects-processes guards to `RequireCapability`; this slice **relocates** those two routes to `work/objectives` + `work/projects-processes` and adds `<Navigate>` redirects for the old paths. Final: see Task C5. |
| `mos-app/src/shell/destinations.test.ts` + `rail-nav.test.tsx` | **HIGH** | held lightly adjusts these; this slice **rewrites** them (old assertions encode the wrong IA). Final: Phase B. |
| `mos-app/src/config/features.ts` | **HIGH (intentional)** | held flips all flags `false`; resolve to `true` (Task 0.1). |
| `mos-app/src/shell/sections.tsx` | LOW | held adds `labelKey?: MessageKey` to `Section`; this slice adds `railHidden?: boolean` + labelKeys to all. Additive — likely auto-merges. |
| `mos-app/src/shell/rail-nav.tsx` | MED-LOW | held adds `useT()`/labelKey rendering; this slice **removes the Catalog group** + filters `railHidden`. |
| `mos-app/src/i18n/messages.ts` | LOW | held adds `cascade.*` keys; this slice adds `nav.*` keys. Different keys — auto-merges. |
| `mos-app/src/pages/cascade-page.tsx` | LOW | held authoring; this slice edits the Manage-affordance links to `/work/*` (Task D4). |
| root PNGs / `.pyc` / `scripts/reporting_snapshot.py` | NONE | deletions/tweaks apply clean — **KEEP**. |
| `supabase/migrations/2026070800000{1,2}*.sql` + `supabase/tests/7{2,3}*.sql` | NONE | held authoring; this branch doesn't touch `supabase/` — **KEEP** (the `can()` substrate; NFR-402). |

**Held commits — keep / amend / drop:**

- **KEEP (as-is):** `0c8ce85` (can substrate) · `90e8bd2` (gate cascade writes) · `eb48b2f` (cascade i18n
  + ladder) · `7b4084b` (cascade page) · `cecdeab` (phone journey test) · `0bf7cdd` (review fixes) · the
  two migrations + pgTAP 72/73.
- **AMEND (during/after absorb):** `99b0b5e` (nav wiring) — its `/objectives` + `/projects-processes`
  route-guard switch + cascade-link wiring must be re-edited to the **relocated** `/work/*` paths and the
  cascade Manage-affordance links updated (Tasks C5, D4). The held spec (`4f22ea5`) and plan (`566e584`)
  carry FR-310–313 as "manage links out to standalone pages" — **amend the spec's FR-310–313** to the
  decisions.md refinement (relocate + redirect + trace) and cite this slice.
- **DROP:** none. (The feature-flag flip is reverted as a new commit, not dropped, to preserve history.)

**Verify after absorb:**
```bash
cd mos-app && npm run typecheck && npm run lint && npm test -- --run
cd supabase && supabase db test          # pgTAP 72/73 must pass (the can() substrate)
git log --oneline dev..HEAD              # expect the 10 work-spine commits + the flag-revert on top
```

---

## 1. Design decisions (brainstorm output)

- **1.1 Relocate, don't just retire-nav.** Manage routes move to `/work/objectives` + `/work/projects-processes`
  (FR-421). The old `/objectives` + `/projects-processes` become `<Navigate to="/work/cascade" replace />`
  (decisions.md: "direct visits redirect into it"). Gives the "Work › Objectives" breadcrumb (FR-424) for
  free and removes zombie top-level routes. Page components are reused unchanged.
- **1.2 `railHidden` for manage routes.** The two manage routes are added to Work's `links` (so
  `destinationForPath` + bottom-tab `isDestinationActive` resolve them → Work, and the breadcrumb reads
  "Work › …") but flagged `railHidden: true`; `rail-nav` filters them so they never appear as rail items
  (FR-420 — catalog reachable only from the cascade). Minimal additive change to `Section`.
- **1.3 Trace context = derived read, no schema.** `work_lines` has no `objective_id` column (verified —
  the FKs are on `tasks`); the Project/Process→Objective link is **inferred from task linkage**. Down-trace
  (objective → child work_lines + task count) and up-trace (work_line → parent objective(s) + task count)
  are computed from `listTasks` + the catalog loaders — exactly what `buildLadder` (held) already groups.
  Rendered as a one-line context block under each manage row via a new optional `traceFor` prop on
  `CatalogManager` (NFR-404 — reuse, don't rebuild).
- **1.4 Plan is a real destination now.** Sales moves from "drill-only from Home KPI" (home-v1 §2.5) into
  Plan as a visible, finance/admin-gated link. `Plan.anyOf = ['finance','admin']` → `isLive` hides the
  whole destination for a `member` (FR-410, no dead-end). Supersedes home-v1 — flagged in spec §7-e.
- **1.5 i18n = one-time nav sweep.** Every `Section` gains a `labelKey`; rail + breadcrumb render via
  `useT()`. Extends home-v1's "new strings only" to all nav labels (FR-440) — the cheap moment.
- **1.6 Follow-ups / Plan-budget stubs are NOT rendered.** No dead-end links (NFR-403); they land with
  their D14 slices.

---

## 2. Tasks (TDD; each 2–5 min; red first)

### Phase A — Absorb the Work spine (see § Work-spine reconciliation above)
- **A0** `git switch feat/ia-nav-work-spine && git merge --ff-only feat/work-spine` → run
  `cd mos-app && npm run typecheck && npm test -- --run` (green) + `cd supabase && supabase db test`
  (72/73 green). Commit the feature-flag revert (`features.ts` → all `true`).
  **Verify:** `git log --oneline dev..HEAD | head` shows the 10 held commits + the revert.

### Phase B — RED: failing tests for the regroup (rewrite the old-state tests)
- **B1** `mos-app/src/shell/destinations.test.ts` — replace the assertions that encode the wrong IA
  (`work has a single link to /tasks`, `plan/inbox have zero links`, `/sales returns null`). New asserts:
  ```ts
  it('AC-400: Work links = Tasks, Cascade, Updates(flag); NO Daily Log', () => {
    const work = DESTINATIONS.find((d) => d.id === 'work')!
    const paths = work.links.filter((l) => !l.railHidden).map((l) => l.path)
    expect(paths).toEqual(['/tasks', '/work/cascade', ...(SHOW_WEEKLY_UPDATES ? ['/updates'] : [])])
    expect(work.links.some((l) => l.path === '/ops')).toBe(false)
  })
  it('AC-401: /ops resolves to Operate (not Work)', () => {
    expect(destinationForPath('/ops')?.id).toBe('operate')
  })
  it('AC-400/402: Operate includes Daily Log + Kitchen; Plan = [Sales] gated finance/admin', () => {
    const operate = DESTINATIONS.find((d) => d.id === 'operate')!
    expect(operate.links.map((l) => l.path)).toContain('/ops')
    const plan = DESTINATIONS.find((d) => d.id === 'plan')!
    expect(plan.anyOf).toEqual(['finance', 'admin'])
    expect(plan.links.map((l) => l.path)).toEqual(['/sales'])
    expect(isLive(plan, ['member'])).toBe(false)
    expect(isLive(plan, ['finance'])).toBe(true)
  })
  it('AC-408: /work/objectives + /sales resolve through their destination', () => {
    expect(destinationForPath('/work/objectives')?.id).toBe('work')
    expect(destinationForPath('/sales')?.id).toBe('plan')
  })
  ```
  **Verify:** `cd mos-app && npm test -- --run shell/destinations.test.ts` → RED (current model fails).
- **B2** `mos-app/src/shell/rail-nav.test.tsx` — **delete** the `AC-002/003: cascade catalog nav
  visibility` block + the `Sales dashboard is NOT in the rail` block (they assert the retired posture).
  **Add:** Plan group appears for `finance`, absent for `member`; Daily Log renders under Operate; no
  Catalog group for any role; no Objectives/Projects&Processes rail links for admin.
  ```ts
  it('AC-404: admin sees NO Catalog group, NO Objectives/Projects&Processes rail links', () => {
    setAuthAs(['admin']); renderRailNav('/work/cascade')
    expect(queryGroupLabel('Catalog')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Objectives' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Projects & Processes' })).toBeNull()
  })
  it('AC-402: finance sees a Plan group + Sales link; member sees neither', () => {
    setAuthAs(['finance']); renderRailNav('/sales')
    expect(groupLabel('Plan')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sales' })).toHaveAttribute('href', '/sales')
    setAuthAs(['member']); renderRailNav('/tasks')
    expect(queryGroupLabel('Plan')).toBeNull()
  })
  it('AC-401: Daily Log renders under the Operate group', () => {
    renderRailNav('/ops')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Daily Log' })).toHaveAttribute('href', '/ops')
  })
  ```
  **Verify:** `npm test -- --run shell/rail-nav.test.tsx` → RED.
- **B3** `mos-app/src/router.test.tsx` — add redirect assertions (AC-405):
  ```ts
  it('AC-405: /objectives + /projects-processes redirect to /work/cascade', () => {
    // render router in a test harness; assert a Navigate to /work/cascade for both old paths
  })
  ```
  **Verify:** RED.
- **B4** `mos-app/src/pages/objectives-page.test.tsx` + `projects-processes-page.test.tsx` (new) —
  AC-406 trace context with mocked `listTasks`/`listWorkLinesAll`/`listObjectivesAll`:
  ```ts
  it('AC-406: ObjectivesPage shows down-trace (child work_line + task count)', () => {
    // mock: objective O, work_line W, 3 tasks under (O,W) → assert "3 tasks · W" under O's row
  })
  it('AC-406: ProjectsProcessesPage shows up-trace (parent objective + count)', () => {
    // mock: work_line W, tasks linking W→O → assert "Under: O · N tasks"
  })
  ```
  **Verify:** RED (files don't exist / trace absent).
- **B5** `mos-app/src/i18n/messages.test.ts` — extend the parity test (AC-409): assert every `nav.*` key
  + the existing `dest.*`/`cascade.*` keys exist in both `en` and `id` with identical shape.
  **Verify:** RED (nav.* keys missing).
- **B6** `mos-app/src/shell/breadcrumb.test.tsx` (extend or new) — AC-408: at `/work/objectives`
  breadcrumb reads "Work › Objectives"; at `/sales` "Plan › Sales"; at `/ops` "Operate › Daily Log".
  **Verify:** RED.

### Phase C — GREEN: the regroup
- **C1** `mos-app/src/shell/sections.tsx` — add `railHidden?: boolean` to `Section`; add `labelKey` to
  every shipped section (KITCHEN items, SECTIONS). Remove the `Catalog`-as-nav usage but **keep
  `CATALOG_SECTIONS` exported** only if `sectionForPath` still needs it (it won't, after C2 relocates the
  routes — so delete `CATALOG_SECTIONS` and drop it from `sectionForPath`'s scan; the manage routes are
  resolved via `destinationForPath`/links now). Sketch:
  ```tsx
  export interface Section {
    path: string; label: string; labelKey?: MessageKey; Icon: React.FC
    railHidden?: boolean   // FR-420: manage-mode routes resolve via breadcrumb/active, not shown in rail
  }
  export const KITCHEN_SECTIONS: Section[] = [
    { path: '/kitchen/log', label: 'Log', labelKey: 'nav.kitchen.log', Icon: KitchenIcon },
    // …plan/stock/review/pushes with labelKeys
  ]
  // CATALOG_SECTIONS deleted (retired — FR-420)
  ```
  **Verify:** typecheck.
- **C2** `mos-app/src/shell/destinations.tsx` — the headline regroup:
  ```tsx
  { id: 'work', labelKey: 'dest.work', Icon: TasksIcon, links: [
      { path: '/tasks', label: 'Tasks', labelKey: 'nav.tasks', Icon: TasksIcon },
      { path: '/work/cascade', label: 'Cascade', labelKey: 'cascade.link', Icon: ObjectiveIcon },
      ...(SHOW_WEEKLY_UPDATES ? [{ path: '/updates', label: 'Weekly Updates', labelKey: 'nav.updates', Icon: UpdatesIcon }] : []),
      { path: '/work/objectives', label: 'Objectives', labelKey: 'nav.objectives', Icon: ObjectiveIcon, railHidden: true },
      { path: '/work/projects-processes', label: 'Projects & Processes', labelKey: 'nav.projectsProcesses', Icon: WorkLineIcon, railHidden: true },
  ]},
  { id: 'operate', labelKey: 'dest.operate', Icon: KitchenIcon, links: [
      ...(SHOW_DAILY_LOG ? [{ path: '/ops', label: 'Daily Log', labelKey: 'nav.dailyLog', Icon: OpsIcon }] : []),
      ...KITCHEN_SECTIONS,
  ]},
  { id: 'plan', labelKey: 'dest.plan', Icon: PlanIcon, anyOf: ['finance', 'admin'], links: [
      { path: '/sales', label: 'Sales', labelKey: 'nav.sales', Icon: SalesIcon },
  ]},
  ```
  **Verify:** `npm test -- --run shell/destinations.test.ts` → GREEN (AC-400/401/402).
- **C3** `mos-app/src/shell/rail-nav.tsx` — remove the entire `visibleCatalogSections`/`Catalog` NavGroup
  block; filter `railHidden` in the Work group render:
  ```tsx
  const sections = d.links.filter((l) => !l.railHidden)   // FR-420
  // …then the existing Kitchen Review/Pushes role-filter for operate stays
  ```
  Drop the `CATALOG_SECTIONS` import. **Verify:** `npm test -- --run shell/rail-nav.test.tsx` → GREEN.
- **C4** `mos-app/src/shell/bottom-tab-bar.tsx` — verify `isDestinationActive` already matches via links
  (it does); confirm Plan hides for `member` via `isLive` (no code change expected). Re-run its test.
- **C5** `mos-app/src/router.tsx` — relocate + redirect:
  ```tsx
  // FR-421: retired standalone catalog routes → cascade
  { path: 'objectives', element: <Navigate to="/work/cascade" replace /> },
  { path: 'projects-processes', element: <Navigate to="/work/cascade" replace /> },
  // relocated manage-mode (held RequireCapability stays; it bounces non-holders to /work/cascade)
  { element: <RequireCapability capability="objective.manage" />,
    children: [{ path: 'work/objectives', element: <ObjectivesPage /> }] },
  { element: <RequireCapability capability="workline.manage" />,
    children: [{ path: 'work/projects-processes', element: <ProjectsProcessesPage /> }] },
  ```
  (Delete the old top-level `objectives` / `projects-processes` route blocks.) **Verify:**
  `npm test -- --run router.test.tsx` → GREEN (AC-405).
- **C6** `mos-app/src/shell/breadcrumb.tsx` — ensure the leaf uses `t(section.labelKey)` when present
  (the held `NavItem` already does this pattern; mirror it). The `promotesDestinationLabel` path already
  yields "Work › Objectives" once `/work/objectives` resolves to the Work destination (C2). **Verify:**
  `npm test -- --run shell/breadcrumb` → GREEN (AC-408).

### Phase D — GREEN: trace context + manage-mode affordance
- **D1** `mos-app/src/components/catalog/catalog-manager.tsx` — add an optional trace render:
  ```tsx
  export interface CatalogTrace { line: string }
  export interface CatalogManagerProps { /* …existing */ traceFor?: (item: CatalogItem) => CatalogTrace | undefined }
  // in the active <li>, after the Rename/Archive buttons:
  {traceFor?.(item) && (
    <span className="basis-full text-xs text-muted-foreground" data-testid="catalog-trace">
      {traceFor(item)!.line}
    </span>
  )}
  ```
  **Verify:** typecheck; existing catalog tests still green.
- **D2** `mos-app/src/pages/objectives-page.tsx` — down-trace. Load `listTasks` + `listWorkLinesAll`
  once; build `Map<objectiveId, {workLines: {name,count}[], total}>`; pass `traceFor`:
  ```tsx
  const traceFor = useObjectiveDownTrace()   // small hook in this file
  return <CatalogManager … traceFor={(it) => {
    const t = traceFor_map.get(it.id); if (!t || !t.total) return undefined
    return { line: `${t.total} task${t.total===1?'':'s'} · ${t.workLines.map(w=>w.name).join(', ')}` }
  }} />
  ```
  (Down-trace counts non-archived tasks grouped by their `work_line_id`.) **Verify:** objectives test GREEN (AC-406).
- **D3** `mos-app/src/pages/projects-processes-page.tsx` — up-trace. Load `listTasks` +
  `listObjectivesAll`; build `Map<workLineId, {parents: {name,count}[], total}>`; pass `traceFor`
  rendering "Under: O1 (2), O2 (1)" (the parent objectives inferred from task linkage). **Verify:**
  projects-processes test GREEN (AC-406).
- **D4** `mos-app/src/pages/cascade-page.tsx` (held) — rewire the Manage affordance links to the
  relocated routes:
  ```tsx
  {can(accessRoles, 'objective.manage') && <Link to="/work/objectives">{t('cascade.manage.objectives')}</Link>}
  {can(accessRoles, 'workline.manage') && <Link to="/work/projects-processes">{t('cascade.manage.projects')}</Link>}
  ```
  **Verify:** cascade test (held) + AC-407 unit (affordance links + absence when no capability) GREEN.

### Phase E — i18n sweep
- **E1** `mos-app/src/i18n/messages.ts` — add the `nav.*` keys (en + id, identical shape):
  `nav.tasks`, `nav.updates` (Weekly Updates), `nav.dailyLog`, `nav.sales`, `nav.objectives`,
  `nav.projectsProcesses`, `nav.kitchen.{log,plan,stock,review,pushes}`. (Reuse existing `cascade.link`
  for the cascade item; `dest.*` already present.) Example:
  ```ts
  'nav.tasks': 'Tasks', 'nav.dailyLog': 'Daily Log', 'nav.sales': 'Sales',
  'nav.objectives': 'Objectives', 'nav.projectsProcesses': 'Projects & Processes',
  // id:
  'nav.tasks': 'Tugas', 'nav.dailyLog': 'Log Harian', 'nav.sales': 'Penjualan',
  'nav.objectives': 'Objective', 'nav.projectsProcesses': 'Proyek & Proses',
  ```
  **Verify:** `npm test -- --run i18n/messages.test.ts` → GREEN (AC-409); full `npm test -- --run` green.

### Phase F — e2e + verify + ship
- **F1** `mos-app/e2e/AC-410-nav-five-destinations.spec.ts` (new) — phone viewport; `finance` sees 5
  tabs (no Catalog); `member` sees no Plan tab; active `aria-current`. (Reuse `e2e/global-setup.ts` +
  `fixtures` the held branch extended.)
- **F2** `mos-app/e2e/AC-411-catalog-manage-mode.spec.ts` (new) — `admin`: Work → Cascade → Manage
  objectives → `/work/objectives` with down-trace visible; direct visit `/objectives` → redirected to
  `/work/cascade`. (Update the held `AC-305-cascade.spec.ts` if it references the old manage paths.)
- **F3** Verify gates:
  ```bash
  cd mos-app && npm run typecheck                      # zero errors
  cd mos-app && npm run lint                           # --max-warnings=0, zero errors
  cd mos-app && npm test -- --run                      # all unit/integration green
  cd mos-app && npm run test:coverage 2>/dev/null || npm test -- --run --coverage   # ≥80% changed
  cd mos-app && npx playwright test e2e/AC-410-nav-five-destinations.spec.ts e2e/AC-411-catalog-manage-mode.spec.ts
  ```
- **F4** Update the held `docs/specs/work-spine.spec.md` FR-310–313 in-place to the decisions.md
  refinement (relocate + redirect + trace), citing this slice + ADR-0019 / decisions.md. (Spec amendment,
  not a new ADR — the relocation is reversible UI routing, not architectural.)
- **F5** **Ship** (release-engineer): branch → commit → push → PR (one issue, one PR). Commit trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Director merges after spec-reviewer +
  code-quality-reviewer + design-reviewer (3-lens, since nav is UI) pass.

---

## 3. Risks & mitigations

- **Rebase conflict surface** is concentrated in `destinations.tsx` + `router.tsx` + the two shell tests
  (§ reconciliation table). Absorbing work-spine **first** (ff-merge onto the bare branch) eliminates
  authoring-time conflicts; the supersession then lands as clean edits.
- **Trace data freshness:** creating/renaming an objective doesn't change tasks, so the trace map is
  stable across catalog edits; it loads once on mount. If a task is reassigned mid-session, the trace
  updates on next page entry (acceptable for a manage surface — not live-cohorted).
- **`railHidden` is a new Section flag** — keep it the *only* behavioral flag on `Section`; do not add
  more (YAGNI). The bottom-tab bar must still treat railHidden links as active-matchers (so the Work tab
  stays active on `/work/objectives`) — verified by AC-408/410.
- **Feature-flag posture** — the held branch's `false` flip is reverted to `true`; confirm with the owner
  that the full five-destination IA is intended visible (spec §7-g). If a gated rollout is wanted, flip
  `SHOW_INBOX` last.

## 4. Definition of Done

- All AC-400..411 green at their owning layer; `grep -r AC-41[01]` finds the e2e; `grep -r AC-40[0-9]`
  the unit tests. FR→AC coverage table in the spec is complete.
- `npm run typecheck` + `npm run lint --max-warnings=0` zero errors; ≥80% coverage on changed code.
- pgTAP 72/73 (held, absorbed) green; no new migrations authored (NFR-402).
- Bilingual: locale `id` renders every nav label from the catalog (AC-409).
- work-spine.spec FR-310–313 amended to the decisions.md refinement; the held branch absorbed (no dangling
  `feat/work-spine`); stray PNGs/.pyc stay deleted.
- design-reviewer 3-lens pass on the rail + bottom-tab + breadcrumb (nav is user-facing UI).
