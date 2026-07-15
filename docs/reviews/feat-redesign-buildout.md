## Step 1 — styling (spec + code-quality, gpt-5.4 cross-family)

Verdict: **BLOCK**

### Strengths
- The diff stays within the intended surface area: CSS/token files, `DESIGN.md`, two new test files, and the guard script. I found **no `*.tsx` changes and no production `*.ts` behavior change**.
- The `--warning-foreground` cascade fix looks correct: deep-brown now wins in light, dark, Tailwind mapping, and bare shadcn compat (`mos-app/src/index.css:34`, `mos-app/src/index.css:46`, `mos-app/src/index.css:119`, `mos-app/src/index.css:182`). I found no remaining red fallback in the token path.
- The dark neutral ramp is consistently warmed (`mos-app/src/styles/tokens/theme-dark.css:96-99`, `mos-app/src/styles/tokens/theme-dark.css:131-157`).
- I found **no `--e7-*` runtime token leak** in the reviewed app CSS files.

### Issues

#### Critical
- `mos-app/src/styles/tokens/theme-light.css:103`, `mos-app/src/styles/tokens/aliases.css:39` — **FR-013 / “no new token names” is violated.** This commit introduces `--ds-background-sunken` and `--accent-tint`. The signed spec says E7 values must be ported onto existing app token names, not add new ones.
- `scripts/pre-merge-check.sh:47-53` — **AC-002 guard is over-broad and contradicts the approved step scope.** It fails on any `*.ts`/`*.tsx` file, which includes the two explicitly allowed new test files in this step. As written, once the ledger exists this branch will still fail its own guard.

#### Important
- `mos-app/src/styles/tokens/contrast.test.ts:50-63` — the dark-theme contrast fixture uses **approximate / stale hardcoded values** (`0.09/0.106/0.922/0.702`) instead of the warmed dark values now shipped in `theme-dark.css`. That weakens AC-007 as a behavior check.
- `mos-app/src/styles/tokens/contrast.test.ts:164-168` — the test title says it checks `warning-foreground-dark`, but the assertion actually checks `--ds-color-amber11-dark` on `--ds-color-amber3-dark`. That means the named token is **not** what the test proves.
- `DESIGN.md:105` — docs/runtime drift remains for the overlay shadow. Runtime now uses navy-tinted overlay shadow, but the doc still points `overlay` at `var(--ds-font-color-primary)` rather than the navy-tinted formulation. That leaves **FR-014 only partially satisfied**.

### Spec conformance summary
- **Satisfied:** warm surfaces/text/borders/action/status/shadows, warning-foreground bug fix, warmed dark ramp, and zero TS/TSX behavior change.
- **Not satisfied:** **FR-013** (new token names introduced), **AC-002** guard correctness, and **FR-014** full DESIGN/runtime sync.
- **No scope creep found** beyond the two test files and guard script already called out by the request.

### Test integrity (BDD)
- `token-values.test.ts` makes the right harness correction by reading source CSS directly instead of pretending jsdom resolves the cascade.
- But it also locks in the two new token names, so it currently enforces a spec violation rather than catching it.
- `contrast.test.ts` still proves intent only partially because of the stale dark fixture values and the mislabeled dark-warning assertion.

### Overall assessment
**BLOCK** — visually this is close and the warning/deep-brown fix is correct, but I would not approve until the new-token-name breach, the AC-002 guard bug, and the stale/mislabeled contrast assertions are corrected.

### Step 1 — BLOCK resolution (Director, 2026-07-14)

All 5 findings fixed in the commit above; re-verified:
- **FR-013 (Critical):** `--accent-tint` + `--ds-background-sunken` were dead (only a code comment / nothing consumed them) → **removed**, not renamed. Breach gone + dead code deleted.
- **AC-002 guard (Critical):** the blanket `*.ts/*.tsx` guard was wrong for the shared gate (blocks steps 2+ on the stacked integration branch) → **removed**; AC-002 stands as a verified property of the step-1 commit (this review confirmed zero *.tsx / zero prod *.ts change).
- **contrast.test dark fixture (Important):** stale cool values → **warmed** to shipped theme-dark values.
- **contrast.test mislabel (Important):** dark-warning test now asserts `--warning-foreground-dark` (was amber11/amber3).
- **DESIGN.md overlay (Important):** overlay shadow → navy-tinted, matches runtime (FR-014).

Re-run: token-values + contrast green (94), typecheck clean, earlier full suite (2548) + e2e (38) unaffected (CSS/test-only). **Step-1 verdict now: APPROVE** (findings cleared; Director visual lens passed light+dark earlier). Formal owner visual sign-off still pending (owner AFK).

## Step 2 — shell + routes (spec + code-quality, gpt-5.4 cross-family)

**Verdict: BLOCK** (0 Critical · 5 Important · 2 Minor). IA move + routing/aria-current strong; not spec-clean. Findings:
- IMPORTANT top-bar.tsx:247-291 — FR-006: header still renders UserChip; spec = header ends at Search·Inbox·Deputy, profile in rail footer.
- IMPORTANT rail-nav.tsx:168-197 — FR-005: footer shows name+role, spec = {Site} {role}.
- IMPORTANT context-row.tsx:20-33 — FR-024: uses person.full_name as scope, spec = resolved scope/team/BU.
- IMPORTANT router.tsx + slice-stub-page.tsx — NFR-007: stub titles hardcoded English (no ID locale).
- IMPORTANT command-menu.tsx + top-bar.tsx — new chrome strings hardcoded English (Ask Deputy/Share Signal/Create Task/Navigate/Recent/Search/placeholders) — EN/ID parity.
- MINOR shell-routes-redirects.spec.ts — /kitchen→/cafe redirect not in e2e table.
- MINOR rail-nav.test.tsx:101-105 — footer test weaker than FR-005.
- Director live-verify (rail/redirects/aria/⌘K) + gates (2572 unit, 41 e2e) already green; these are code+spec-conformance gaps.

### Step 2 — BLOCK resolution (fix round gpt-5.4 + Director verify, 2026-07-15)

All 7 findings fixed (commits a658a0a..eb248ec) + re-verified:
- FR-006 header UserChip **removed** (Director live-confirmed: header = logo+breadcrumb · Search·Inbox·Deputy, no chip).
- FR-005 rail footer → **{Site} {role}**; footer test tightened (finding 7).
- FR-024 context-row → **resolved scope**, not person name.
- NFR-007 stub route titles → **localized** via useT (H1 + document.title).
- i18n chrome strings → **localized** (Director live-confirmed ID: Tanya Deputi · Bagikan Sinyal · Buat Tugas · Beranda · Kerja · Cari).
- MINOR /kitchen→/cafe **added** to redirect e2e (AC-005 green).
Re-run: typecheck clean · 2575 unit green · shell e2e 8/8. **Step-2 verdict now: APPROVE.** Formal owner visual sign-off + walkthrough still pending (owner AFK); Director live-verified the shell.

## Step 3 — Tasks re-home (spec + code-quality, gpt-5.4)

**Verdict: BLOCK**

Saved-view grammar is correctly wired for `?view=mine|team|overdue|followups` with safe `all`/unknown fallback, and the accepted deviations are honored: **My/Overdue** reuse real filters, **Team** is label-level on the org-visible set, and **Follow-ups** shows explicit reserved-state copy instead of fake task filtering. Rule 11 also looks good: **`mos-app/src/components/tasks/use-tasks-saved-view.ts` is the only new production file**; `TasksLayout`/`TasksWorkspace`/`TasksToolbar`/`TaskDrawer`/`TaskSurface` are rewired, not rebuilt, and I found no duplicate table/drawer/record surface.

### Strengths
- `mos-app/src/components/tasks/use-tasks-saved-view.ts:1-57` cleanly centralizes saved-view parsing/canonicalization and maps to the existing workspace knobs (`segment`, `overdueOnly`, reserved follow-ups state).
- `mos-app/src/pages/tasks-layout.tsx:24-26,58-61`, `mos-app/src/components/tasks/tasks-workspace.tsx:428-430,531-537,603-718`, `mos-app/src/components/tasks/task-drawer.tsx:72`, and `mos-app/src/components/tasks/task-surface.tsx:369-414,624-740,972-972` correctly preserve the current search on the main rewired paths: row click, keyboard open/close, `+ New task`, `+ Add task`, drawer close, not-found return, create cancel/create success, and archive success.
- The updated component/e2e coverage does exercise the main saved-view journeys, including overdue open → refresh → close and create-context preservation.

### Issues

#### Critical
- `mos-app/src/components/tasks/task-row.tsx:81-88`, `mos-app/src/components/tasks/row-menu.tsx:35-37`, `mos-app/src/components/tasks/mobile-grouped-cards.tsx:84` — **Rule 4 / FR-305 / FR-306 are not fully satisfied.** These links still hardcode `/work/tasks/:id` without the active search string. That means clicking the task name, using **Row actions → Open**, middle-click/open-in-new-tab on the name link, or opening a mobile task card drops `?view=` and loses the saved-view context. Suggested fix: thread a search-aware `to`/`recordHref` prop from `TasksWorkspace` into `TaskRow`, `RowMenu`, and `MobileGroupedCards`, and use `{ pathname, search: savedView.search }` everywhere a record can open.

#### Important
- `mos-app/e2e/shell-url-state.spec.ts:52-70`, `mos-app/src/components/tasks/tasks-workspace.test.tsx:535-536`, `mos-app/src/components/tasks/tasks-workspace.test.tsx:889-891`, `mos-app/src/components/tasks/task-row.test.tsx:62-76`, `mos-app/src/components/tasks/row-menu.test.tsx:47` — the updated tests **miss the broken link-based/mobile journeys**, and some unit tests still explicitly assert the old bare `/work/tasks/:id` href. So the suite proves row-click preservation, but not the full “normal click / new-tab safe” contract from Rule 4 / AC-307, and it currently locks the regression in place. Suggested fix: update the href assertions and add coverage for task-name link, row-menu open, and mobile-card open with `?view=` preserved.

#### Minor
- `mos-app/src/components/tasks/tasks-workspace.tsx:531-537`, `mos-app/src/components/tasks/task-surface.tsx:627-630` — saved-view parsing is centralized, but search-param composition is still somewhat spread. Not a functional defect on its own, but it falls a bit short of the stated “centralize URLSearchParams logic” goal. A tiny shared helper for collection/search-param merging would keep this seam tighter.

### Overall assessment
**BLOCK** — the spec mapping and rewire-first implementation are largely right, but Rule 4 is not fully met because several real record-open paths still drop `?view=`. Fix those search-blind links and align the tests, then this should be ready to approve.

REVIEW-DONE

## Step 3 — Tasks re-home (spec + code-quality, gpt-5.4 cross-family)

**Verdict: BLOCK** (1 finding). Saved-view URL grammar + Rule-11 reuse are sound (only use-tasks-saved-view.ts new; DAL/workspace/drawer rewired), but Rule-4 `?view=` preservation is INCOMPLETE — fixed on row-click, dropped on 3 other open paths:
- task-row.tsx:81 (task-name Link)
- row-menu.tsx:36 (row-menu Open)
- mobile-grouped-cards.tsx:84 (mobile card open)
So new-tab/name-link/row-menu/mobile open lose the saved view. Fix + per-path test required.

### Step 3 — BLOCK resolution (fix round gpt-5.4 + Director verify, 2026-07-15)

The 3 record-open paths now thread `search: recordSearch` (commit fdee22e):
- task-row.tsx (name Link, via `recordTo`) + passes recordSearch to RowMenu
- row-menu.tsx (Open) — `to={{pathname, search: recordSearch}}`
- mobile-grouped-cards.tsx — same
Re-verify: typecheck clean · 2592 unit green · saved-view + split-view e2e 7/7. Director live-confirmed
the name-link preserves `?view=overdue` on open. **Step-3 verdict now: APPROVE.** Owner visual sign-off
+ walkthrough pending (AFK).

## Design/UX review — steps 1–3 (Luna, autonomous)

**Overall: BLOCK.** The warm palette, shell header, saved-view URL wiring, centered command palette, and
role-gated rail are solid. The rendered product is not yet the owner-approved redesign experience: Home
still exposes the retired cadence model, mobile Tasks violates capture-first disclosure, the Task record
leaks RACI onto a Task and has no obvious completion action, and one phone route has zero current-location
markers. These are contract failures, not polish nits.

### Review method and evidence

I started with `docs/experience-contract.md` Rules 1–12, `docs/jtbd.md`, and
`docs/reference/twenty-ixd-patterns.md`, then read `SALVAGE-INVENTORY.md` before opening mockups. I used
fresh named browser sessions, verified **Gordi MOS** branding (not PMO Portal), and inspected:

- Built app: `http://localhost:5173/mos/`, Cafe Ops at 1280×900 and 390×844; Director at 1280×900.
- Mockups: `http://localhost:8766/e7-prototype.html` and `http://localhost:8134/` at both widths.
- Built surfaces: Home, `/work/tasks?view=mine|team|overdue|followups`, the centered ⌘K palette,
  `/work/tasks/:id?view=...`, phone More, `/work/signals`, and `/cafe`.
- Mechanical checks: URL/query preservation, `aria-current`, responsive widths, palette focus/dialog
  semantics, rail gating, and direct record navigation. Captures are in the temporary
  `/tmp/gordi-review/` directory.

### Lens (a) — Visual / correctness: **FAIL**

**What passes**

- Step 1's warm cream surfaces, navy/blue action color, restrained borders, type scale, and low-depth
  shadows read as the same Quiet Control Surface identity. I saw no purple wash, generic gradient, or
  token-slop tell.
- The desktop and phone shell are coherent: brand, breadcrumb, Search, Inbox, Deputy, context row,
  bottom nav, and More are visually consistent.
- The built ⌘K palette is correctly centered (`role=dialog`, `aria-modal=true`, focused combobox):
  560px wide at desktop and inset at phone. Its actions are visibly ordered **Ask Deputy · Share Signal
  · Create Task**.
- Cafe Ops correctly does not see Money or Admin; Director sees the full authorized rail.

**Findings**

- **Home is visually the old app, not the reference Home.** Cafe Ops sees “Your week at a glance”,
  KPI cards, a large legacy task table, “My weekly update”, and “Today on the Daily Log”. Director sees
  `—` revenue/margin cards and “No snapshot yet · next sync 03:30 WIB”, which is a dead cockpit state,
  not an attention brief. The e7/convergence reference puts consequence-ordered attention first.
- **Tasks is horizontally over-dense at desktop.** At 1280px the old table has an internal 1,284px
  scroll surface inside a 994px content area; the right-side Due/Activity columns are cut from the first
  view. The e7 task table fits the decision columns (Title, Ownership, Supervisor, Status, Due) in one
  calm review surface.
- **Rendered fixtures are not production-like Gordi records.** The first rows are named
  `URL row-menu 1784062219837`, `URL overdue 1784062211102`, `E2E Archiveable Task`, and `AC-305…`.
  This is visually noisy and destroys recognition for the intended operator.
- Follow-ups does truthfully show a reserved state rather than fake rows, but the visible copy
  “Follow-ups are not task-backed in this step” is implementation language and has no useful next action.
- The Task panel is structurally tidy but visually presents a generic admin editor: “OWNERSHIP (RACI)”
  plus R/A/C/I pills and `Project/Process`/`Objective` selectors. The reference presents a typed Task
  with Team, PIC, Supervisor, due/source provenance, and a clear completion path.

### Lens (b) — IxD / task-flow naturalness: **FAIL**

- **Mobile Tasks leads with configuration, contrary to the real job.** At 390px, the user sees Table /
  Board / Calendar, four saved-view chips, Group, Unit, Status, Person, search, and Show archived before
  the first task card (the first card starts around y=523). The convergence mockup uses one
  **“View options · Tasks · All”** control, then work cards. This is exactly the Rule-8 regression the
  redesign was opened to remove.
- **There is no persistent phone Action Launcher/FAB.** The task page has an in-content `+ New task`
  link, but not the thumb-reachable `+` command surface shown by convergence. A phone operator must
  know where the task page's contextual link is instead of having one stable creation grammar.
- **A Cafe operator cannot see the next action in the Task record.** The record exposes a status
  dropdown and an “Archive task” control, but no visible “Mark complete”/“Complete task” action. The
  convergence record makes the next step adjacent to the evidence with **Mark complete** and
  Reassign PIC.
- **Home has dead ends.** On the rendered Home, “Write update →” goes to `/mos/updates`, which redirects
  to the Signals stub at `/mos/work/signals`; “Open the Daily Log →” goes to `/mos/ops`, which redirects
  back to Home. These are visible promises that do not complete a job.
- The command palette itself is natural and keyboard-ready, but it is not a substitute for clear
  first-paint actions. Its phone presentation is good; its invocation still relies on an unfamiliar
  ⌘K convention unless the user sees the Search button.

### Lens (c) — IA / structure and navigation: **FAIL**

- Saved-view chips correctly write `?view=mine|team|overdue|followups`; task-name links,
  row-menu Open, and mobile card links preserve that query. This is a real Step-3 success.
- **Phone current-location semantics fail on Work children.** On
  `/mos/work/signals` at 390px, the live DOM contains **zero** `[aria-current="page"]` elements.
  Work's phone tab points at `/work/tasks` and is not active for `/work/signals` (the same risk applies
  to Projects/Objectives). This violates the exact-one-location contract and leaves the user without a
  selected destination.
- **Deep links do not escalate to a canonical full page.** A direct
  `/mos/work/tasks/:id?view=overdue` renders the same desktop split table + TaskDrawer used by a normal
  click. The record has an “Expand to full width” icon, but direct/new-tab/refresh does not start in the
  canonical page mode promised by Rule 4; the visible escalation is also less discoverable than the
  reference’s “Open full page →”.
- The four shell markers (header/context/content) are present, and the Tasks route has one drawer. But
  Home, Signals, and the other stub routes have no identifiable shared record-drawer host; Tasks mounts
  a route-local drawer. Thus the rendered app does not yet demonstrate one shared panel host for
  record, Inbox, and Deputy as required by Rules 2/6 and the Twenty grammar.
- `/work/signals`, `/events`, Ecommerce, and Roastery are navigable but are stubs, so their canonical
  destination exists without actually being a useful destination. This is understandable as step
  scope, but it is still a rendered IA dead end under the binding contract.

### Lens (d) — Product / Intent / JTBD: **FAIL**

- **Home does not serve J01/J02 first.** A Cafe operator starting a shift needs today’s Shift/Run/
  Checks/assigned work and the next action. The built first viewport instead leads with old “log/update”
  counters and a generic My Tasks table. A Director needs consequence-ordered attention and scoped
  operating signals; the built Director Home leads with blank financial KPIs and old cadence cards.
- **The Task record triggers JTBD calibration anchor A4.** It visibly labels a Task’s ownership as
  `RACI` and offers Responsible / Accountable / Consulted / Informed editing. Per `jtbd.md`, RACI belongs
  on Objective/Project/Process; a Task carries PIC + Supervisor. This is both a domain-mental-model
  failure and a Rule-12 language failure for a barista.
- The Task table’s `OWNER (R)` column reinforces the same RACI leak. “Project/Process”, “Objective”,
  “Activity & updates”, and “Checklist” are data-model labels without a job-first explanation.
- `/money` (Director-only) resolves to the old Dashboard component/title. The visible `—` financial
  cards have no decision-relevant drill or certified basis in the reviewed first viewport, which is
  the JTBD A10 risk.
- A1–A3 were **not observed** on a rendered Signal record: Signals is still a stub. That is not evidence
  that those anchors are safe; the build currently prevents a real Signal visibility/action walkthrough.
- The honest Follow-ups reservation avoids pretending ordinary Tasks are Follow-ups, but
  “task-backed” is not Café language and the reservation is a dead end for the person who selected it.

### Rule-by-rule result (Rules 1–12)

| Rule | Result | Live assessment |
|---|---|---|
| 1 — destination jobs | **FAIL** | Tasks answers its job, but Home answers with legacy cadence/KPIs and Signals/Events/other Module stubs do not complete their stated jobs. |
| 2 — domain contract → UI family → destination | **FAIL** | The Task family is reused correctly, but Home still exposes superseded Weekly Update/Daily Log contracts and the Task editor leaks RACI into a Task. |
| 3 — rail/surface budgets | **FAIL** | Authorized rail counts/gating are right (Cafe Ops hides Money/Admin; Director has the expected roots and four governance children), but legacy Home exposes several co-equal actions and Tasks exposes contextual filtering plus creation rather than one clear contextual action. |
| 4 — canonical routes + URL state | **FAIL** | `?view=` survives all observed Task open paths, refresh/direct URL, and chips, but direct records remain the split drawer instead of the promised full canonical page mode. |
| 5 — one `aria-current="page"` | **FAIL** | Desktop Home/Tasks and phone Tasks pass; phone `/work/signals` has zero current-page markers. |
| 6 — one page anatomy | **FAIL** | Header/context/content are present, but there is no identifiable shared drawer host on Home/stubs and the Task drawer is route-local rather than the one shared host. |
| 7 — verb+object actions | **FAIL** | Palette passes with Ask Deputy/Share Signal/Create Task; the visible primary `+ New task` is adjective+noun rather than verb+object, and legacy update/log actions remain. |
| 8 — capture-first disclosure | **FAIL** | 390px Tasks front-loads controls and shows no single View options disclosure; the first work card comes only after the configuration block. |
| 9 — responsive parity | **FAIL** | Bottom nav/More reach Cafe Ops’s authorized destinations, but Work-child highlighting is broken on phone and the persistent phone FAB/command grammar is missing. |
| 10 — extension test | **PASS (attested)** | A future collection can use the existing route/shell/context/content family and an existing record surface without a new rail root or drawer host; the architecture is describable even though Modules are not yet converged. |
| 11 — component reuse | **PASS (attested)** | Step 3 reuses TasksLayout/TasksWorkspace/TasksToolbar/TaskDrawer/TaskSurface; the only new production seam is the thin saved-view hook. No duplicate table/drawer/record renderer was found. |
| 12 — high-school-grad usability | **FAIL** | The cold-start Cafe walkthrough hits unexplained RACI/system nouns, synthetic test data, configuration overload, missing completion feedback, and dead-end legacy links. |

### Mockup-regression list

These are cross-version regressions, not requests to invent a new surface. The mockups had already solved
these problems and `SALVAGE-INVENTORY.md` gives them a presumption of correctness.

| Surface | What the mockup got right | What the build lost/changed for the worse | Mockup + version |
|---|---|---|---|
| Home — desktop | Attention brief first: failed chiller Check and overdue correction, then today/this-week work; consequences are scannable. | `Your week at a glance` KPI cards and old My Tasks/weekly-update/Daily-Log blocks replace attention ordering; Director gets blank `—` financial tiles above the work. | e7 `#/home` and convergence `#/home`, 2026-07 reference build |
| Home — phone | Attention cards and Signal feed are first; “Share a Signal” and `Create Task` are adjacent; bottom nav plus persistent `+` is thumb reachable. | Old KPI cards and the legacy task table consume the first viewport; no Signals feed, no FAB, no obvious capture action. | convergence `#/home`, phone 390px |
| Work → Tasks — phone | One `View options · Tasks · All` disclosure puts work before filters; mobile cards carry Work/Team/PIC/Due/Status. | Table/Board/Calendar, four chips, four selectors, search, and archived control appear before cards; no single disclosure. | convergence `#/work/tasks`, phone 390px |
| Work → Tasks — desktop | Calm task-first DB view with Title, Ownership, Supervisor, Status, Due and realistic records. | Legacy RACI-shaped table adds Project/Process, Objective, Business Unit, Last Activity and clips the right edge; test fixture titles dominate. | e7 `#/work`, desktop 1280px |
| Task record — desktop panel | Typed Task panel has Team/PIC/Supervisor, Status & Timing, Details, Activity, source links, and explicit **Open full page →**. | Generic `OWNERSHIP (RACI)` editor, internal selectors, no source/provenance hierarchy, and icon-only “Expand to full width”. | e7 record panel, `#/record/t_fix_chiller` |
| Task record — phone | The next action is adjacent to evidence: PIC/Supervisor/Team/Due/description plus **Mark complete** and Reassign PIC. | Full-width panel exposes status dropdown/RACI selectors and Archive task; no obvious completion action. | convergence `#/record/t_fix_chiller`, phone 390px |
| Demo data / fixtures | Realistic Gordi names (“Café opening — today”, “Replace HQ chiller unit”, “New menu taste test”) support recognition and JTBD walkthrough. | `URL row-menu…`, `E2E Archiveable Task`, `AC-305…` are test names visible to the least-technical user. | e7 and convergence fixtures, 2026-07 |
| Café route naming | The redesign frame uses Café as the module and the job sentence is “Run today’s café floor work…”. | Rail says Café but the canonical `/cafe/log` surface still says **Kitchen · Log** and document title is `Kitchen Log — Gordi MOS`. | convergence frame + built re-home comparison |

**Fidelity win worth preserving:** the built ⌘K palette did not regress to the convergence bottom sheet. It
matches e7’s centered modal while retaining the correct universal action set; do not replace it with the
phone bottom-sheet presentation.

### Cross-module reusability

**Good seams**

- `ContextRow`, `RailNav`, `DestLink`, BottomTabBar/More, Breadcrumb, and the command menu form a shared
  shell grammar. Café/Ecommerce/Roastery appear under the same BU grouping and gating rules; Cafe Ops
  sees no unauthorized Money/Admin, while Director sees the complete rail.
- Tasks uses the existing shared Task row/table/drawer/surface rather than a second implementation.
- The palette’s action registry is shared across routes and its action names are stable.

**Gaps**

- The Café route is still the legacy Kitchen Log (`Kitchen · Log`, production KPI/table/quantity editor),
  not the same occurrence/task/record/action grammar as Work. Ecommerce and Roastery are stubs, so the
  extension/reuse story is not rendered end-to-end.
- The record host is not shared across Task, Inbox, Deputy, and future Module records; the Task route owns
  its own drawer while Home/stubs have none. A user cannot yet learn one record panel and carry that
  knowledge across modules.
- Legacy Home Weekly Update/Daily Log regions remain a second cadence grammar beside Work Tasks. This is
  exactly the “several apps” failure the redesign is meant to remove.

### Rule-12 cold-start verdict — Cafe Ops

**FAIL — an untrained high-school-graduate barista cannot complete the core reviewed job unaided on the
first try.**

Observed cold-start path:

1. **Starting point:** Home is recognizable, but its first viewport says “Your week at a glance” and
   surfaces old log/update counters instead of today’s opening, checks, exceptions, and next action.
2. **Find work:** Work → Tasks is discoverable, and **Overdue** is a recognizable chip. However, the
   phone page makes the user pass a long configuration block before the first work item.
3. **Recognize work:** the first records are test/URL names, not café work. “Owner (R)”,
   `Project/Process`, `Objective`, and `RACI` require knowledge of the internal model.
4. **Act:** opening a record offers no obvious Mark complete action; the user sees status/RACI controls
   and Archive task. There is no clear saved/completed feedback path for the core task.
5. **Recover:** “Write update” lands on a Signals placeholder and “Open the Daily Log” returns Home;
   both are dead ends/backtracking.

Criteria: (a) starting point = partial; (b) completes job = fail; (c) no unexplained noun = fail;
(d) obvious next action/no backtracking = fail. This is a Rule-12 failure, not a training/documentation
problem.

### Owner-decision forks (do not silently choose)

#### Fork 1 — Phone Tasks disclosure

- **Option A — keep the current control wall:** expose Table/Board/Calendar, saved-view chips, Group /
  Unit / Status / Person, search, and archived controls immediately. **Tradeoff:** best for a trained
  manager who filters constantly; fails Rule 8, increases first-try cognitive load, and hides work for
  Cafe Ops.
- **Option B — port the convergence capture-first pattern (recommended):** show the first task cards
  immediately, collapse collection/view/saved-view/presentation/filter controls behind one “View options”
  control, and restore the persistent `+` Action Launcher. **Tradeoff:** one extra tap for an occasional
  filter; meets Rule 8/9/12 and preserves the same controls after disclosure.

**Recommendation: Option B.** This is a contract requirement, not merely a taste preference; if Option A
is chosen, the owner must explicitly amend Rule 8.

#### Fork 2 — Home migration timing

- **Option A — retain legacy Home until Signals/Home steps:** lowest short-term build scope and protects
  old route components, but keeps retired Weekly Update/Daily Log nouns, blank KPI dead ends, and broken
  visible links in front of the least-technical user.
- **Option B — port the reference attention brief + Signal region now (recommended):** give Home the
  job-first attention queue, preserve the mockup ordering, and make legacy update/log entry points either
  useful successors or remove them. **Tradeoff:** pulls part of Steps 4/5 forward and requires a deliberate
  compatibility decision for old data.

**Recommendation: Option B.** If the owner chooses A, record a time-bounded exception and hide the
legacy cards from Cafe Ops rather than shipping dead links.

#### Fork 3 — Task ownership and completion grammar

- **Option A — keep the existing RACI editor/status dropdown:** smallest code change and familiar to
  current managers, but violates JTBD A4, leaks governance vocabulary onto Tasks, and gives a barista no
  obvious “done” action.
- **Option B — port the typed Task record:** Team + PIC + Supervisor + Due + source/details, a visible
  **Mark complete** action, and a clear Reassign PIC path; reserve RACI for Objectives/Projects/Processes.
  **Tradeoff:** requires changing the canonical existing Task renderer and reworking manager edit affordances,
  but is correct for the domain and Rule 12.

**Recommendation: Option B.** The owner should ratify the Task panel verbs and ownership fields before the
next implementation round so this cannot regress through “rewire” work.

#### Fork 4 — Direct record URL presentation

- **Option A — direct/new-tab/refresh opens the same split drawer:** preserves dense triage and minimizes
  routing work, but contradicts Rule 4 and makes a copied record link depend on the collection shell.
- **Option B — normal click opens the shared panel; direct/new-tab/refresh opens the same renderer in full
  canonical page mode (recommended):** matches the reference grammar and makes URLs independently usable.
  **Tradeoff:** requires explicit panel/page mode and focus/back semantics.

**Recommendation: Option B.** This is already the contract language; only choose A by amending Rule 4.

### Consolidated issues and suggested fix order

**Critical / blocking**

1. **Task record A4 + Rule 12** — remove RACI from Task surfaces; use PIC/Supervisor and a clear completion
  action; replace synthetic fixtures with realistic demo data. Routes: `/mos/work/tasks/:id` desktop/phone.
2. **Rule 8/9 mobile disclosure** — port one View options control, cards first, and persistent `+` launcher.
   Route: `/mos/work/tasks?view=mine` at 390px.
3. **Rule 5/9 phone location** — make Work active for all `/work/*` children; observed zero
  `aria-current="page"` at `/mos/work/signals` 390px.
4. **Home intent/dead ends** — replace or hide legacy update/log cards and ship the attention-first Home
   reference before owner approval.

**Important**

5. **Canonical record mode** — implement page mode for direct/new-tab/refresh and visibly label the panel
  escalation “Open full page”.
6. **Task table fidelity** — preserve the existing renderer but skin/shape it to the e7 grammar: realistic
  title/ownership/supervisor/status/due first, no first-paint clipping.
7. **Reserved/stub language** — remove “task-backed”/internal nouns from Cafe Ops paths and give every
  visible stub a useful next action or hide it until its destination is real.
8. **Café module convergence** — relabel “Kitchen · Log” to Café language and bring module execution into
  the same shared record/action conventions before using it as the extension proof.

**Minor**

9. Add a visible Utility grouping/separator for Admin Settings so it cannot visually read as another B2B
   module root; keep Profile in the footer.
10. Add a visible horizontal-scroll affordance or reduce default columns at 1280px; the current table’s
    right-edge clipping makes desktop review less calm.

**Assessment: BLOCK.** The palette and URL-chip mechanics are promising and the code-level reuse rule is
honored, but the rendered user job is not yet safe to approve. Fix the four critical items, rerun the
four lenses at 1280px/390px, and recheck the mockup-regression list.

DESIGN-REVIEW-DONE
