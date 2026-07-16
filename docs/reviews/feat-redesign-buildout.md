# Review ledger — `feat/redesign-buildout`

Diff scope: `git diff $(git merge-base main HEAD)..HEAD` — redesign buildout steps 1–3 (styling pass,
shell + routes, Tasks re-home) + design-remediation waves 1 / 2 / 2b / 2c.

## Verdicts

<!-- Machine-read by scripts/pre-merge-check.sh. Format: - <review>: <VERDICT> — <reviewer / notes>
     Accepted: PASS SHIP FIX-THEN-SHIP APPROVE | Blocking: REWORK FAIL STILL-FAILING BLOCK NOT-RUN
     The LAST line for a review wins (BLOCK -> fix -> re-verify -> APPROVE).
     These verdicts judge the BRANCH TIP, not the best moment in its history. Do not record a
     verdict a review did not actually return. -->

- spec: NOT-RUN — tip `8ab3235` (Wave 2c) has gates only, no spec review. Steps 1–3 + waves 1/2/2b
  each ran BLOCK → fix → **APPROVE** (gpt-5.4/luna cross-family) — see the sections below; that
  APPROVE does not extend to the Wave 2c delta.
- spec: APPROVE — Wave 2c (`8ab3235`) spec review ran 2026-07-16 (spec-reviewer, opus, cloud run
  OD-REDESIGN-67). Option A verified exactly: 7-col priority table (thead/body/skeleton/colSpan all
  7), optional columns genuinely reachable in drawer/full page (test-proven AC-W2C), no new renderer
  (Rule 11), tests adjusted honestly (goal-oracles preserved, Due assertions strengthened),
  OD-61..64 not regressed in code. 1 Minor: column order Title·Status·PIC·Supervisor·Due is
  set-identical to spec's literal order (non-load-bearing). § "Wave 2c code reviews" below.
- code-quality: NOT-RUN — same as spec: Wave 2c (`8ab3235`) changed the desktop Tasks table and was
  never code-reviewed. Prior steps/waves are APPROVE below.
- code-quality: APPROVE — Wave 2c (`8ab3235`) code-quality review ran 2026-07-16 (code-quality-
  reviewer, opus, cloud run). 0 Critical / 0 Important. Minors (cleanup, non-blocking, folded into
  the step-11 sweep list): dead `'activity'` SortCol + accessor (tasks-workspace.tsx:42,233-236),
  orphaned `.td-bu`/`.td-workline`/`.td-objective` CSS, column-count `7` magic literal in 3 files
  (pre-existing pattern; follow-up: shared column-descriptor array). § "Wave 2c code reviews" below.
- design: BLOCK — the 4-lens design re-review has not been re-run against Wave 2c's rendered result;
  no APPROVE recorded. **THE next open item** (`docs/plans/AUTONOMOUS-RUN-STATE.md`). Acceptance: at
  1280px the Due column is visible with no horizontal clip; optional fields reachable in the
  drawer/full page; no regression of the resolved OD-61..64 findings.
- security: BLOCK — OWASP/STRIDE audit RAN 2026-07-17 (`security-auditor`, opus; Director-verified
  every load-bearing claim against the code). **0 Critical. 2 High, 1 Medium, 1 Low.** Nothing
  injectable, no secret exposure, no tenancy/`org_id` bypass, no ungated sensitive route, no
  capability-guard bypass — the blockers are one regression and the test that hid it. Full findings:
  § "Security audit (2026-07-17)" below.

> **Why this block exists (2026-07-17).** This ledger had **zero** verdict lines in the template's
> format, so `scripts/pre-merge-check.sh` — the gate `CLAUDE.md` calls binding — reported
> `MISSING × 4` and exited 1 on every run, and had never passed on this branch. It was red for a
> parsing artifact while also red for four real reasons; a gate that can never go green gets
> bypassed, not fixed. The verdicts above are derived only from what this ledger already records.
> Fixing them means running the reviews, never editing this block.

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

## Remediation (waves 1+2) — code review (Luna cross-family)

**Verdict: BLOCK**

### Strengths

- **OD-61 partial success:** `TasksWorkspace` uses the existing `viewer.isManager` seam (derived by `deriveIsManager`) to give members the collapsed `View options` surface and managers the dense toolbar (`mos-app/src/components/tasks/tasks-workspace.tsx:103-108,700-723`). The member/manager component tests and phone e2e cover the disclosure goal.
- **OD-62 core renderer:** `TaskSurface` remains the one view/create renderer. `raci-card` was replaced by `TaskOwnershipCard`; the record/drawer and list/card ownership fields now use Team/PIC/Supervisor and source, while the record surfaces expose completion. No Objective/Project/Process production surface was deleted or modified, so governance RACI was not accidentally removed.
- **OD-63 main path:** `TaskRecordPage` reuses `TaskSurface` with `presentation="page"`; normal row/link/card opens carry panel state, the explicit “Open full page” action exists, and `?view=` preservation is covered across the tested open/close/refresh paths.
- **OD-64:** Home hides the legacy update/Daily Log strips in both Home compositions (`home-page.tsx:119-121`, `stacked-union-home.tsx:167-168`), while manager review data remains available. The phone Work tab uses the `/work` prefix and the targeted `aria-current` tests pass.
- Verification: full unit suite **250 files / 2,605 tests passed**; targeted Playwright **12/12 passed**; typecheck and ESLint/stylelint passed. `git diff --check` is clean.

### Issues

#### Critical

- **OD-62 is still violated by the shipped Home Task surface.** `MyWeekPanel` always renders `MyTasksCard`, but `mos-app/src/components/weekly/my-tasks-card.tsx:65,77,131,144,183-208,221-263` still filters/displays R/A, renders `Owner (R)`, says “Responsible or Accountable”, and exposes the legacy owner/`+N` grammar. Home mounts it at `mos-app/src/pages/home-page.tsx:121`. This is a visible Task surface and directly triggers A4, even though the main `TaskSurface` passes. The corresponding tests still encode that old goal (`my-tasks-card.test.tsx:141,227,263`). Extend/re-home this existing card to typed Team/PIC/Supervisor (or deliberately hide it), then update its BDD contract; do not remove RACI from governance surfaces.
- **OD-63’s page-mode detector can turn a normal in-list click into a full page.** `mos-app/src/components/tasks/task-page-mode.ts:41-64` captures `BOOT_DIRECT_RECORD_ID` once and ignores `{ taskSurface: 'panel' }`. After a direct load of record `X`, navigating SPA-style to the list and clicking `X` again leaves the boot id equal to `X`, so `TasksLayout` (`pages/tasks-layout.tsx:55-68`) renders page mode instead of the required split drawer. Add a real SPA-vs-hard-navigation seam/state precedence and a regression test for direct record → list → same-record click; retain full-page behavior on an actual refresh.

#### Important

- **OD-61 is incomplete.** The member wrapper is present, but there is no persistent phone `+` launcher: `bottom-tab-bar.tsx:45-80` has only Home/Work/Café/Inbox/More, while the only task CTA is the conditional content-header link at `tasks-workspace.tsx:651-654`. Also, the overdue filter and clear control remain outside `View options` (`tasks-workspace.tsx:666-692`), contrary to OD-61/Rule 8’s “all filters behind one control” requirement. Reuse the approved launcher grammar and keep the member first viewport capture-first; add tests for the launcher and the collapsed overdue controls.
- **New remediation copy is not localized.** The typed labels/actions and disclosure copy are hardcoded in `task-ownership-card.tsx:34-78`, `task-drawer-header.tsx:61-128`, and `tasks-workspace.tsx:653-730`; `TasksToolbar` also hardcodes the saved-view/filter copy (`tasks-toolbar.tsx:42-180`). There are no corresponding `useT`/EN+ID message keys, so the shipped Indonesian locale renders the new OD-61/62/63 grammar in English. Add message keys and use the shared i18n seam.
- **Changed-code coverage misses the new navigation seam.** The coverage run reports `task-page-mode.ts` at **70.96% lines**, below the project’s ≥80% changed-code gate; its boot-navigation branches (`task-page-mode.ts:20-39`) are not unit-covered. The e2e proves a browser path but does not satisfy the instrumented coverage gate by itself. Add deterministic tests around the boot-navigation seam.
- **BDD cleanup is incomplete beyond the new record tests.** The new typed Task tests correctly assert Team/PIC/Supervisor, completion, and absence of visible RACI (`task-record-redesign.test.tsx:85-118`; e2e `tasks-canonical-page.spec.ts:63-90`). However, list/Home tests still make the old RACI goal explicit (`tasks-page.test.tsx:372-401,430-447`, plus `my-tasks-card.test.tsx` above). Rename/re-specify any intentionally retained PIC/Supervisor filtering; do not leave old RACI semantics as the Task UX contract.

#### Minor

- **Dead task-row RACI plumbing remains.** `TasksWorkspace` still builds `OwnerCellRaciMember[]` (`tasks-workspace.tsx:302-318`) and passes `others` (`tasks-workspace.tsx:547-559`), while `TaskRow` no longer consumes it (`task-row.tsx:35,53-57`). `TasksTableBody`/`MobileGroupedCards` likewise retain an unused `buildOthers` prop (`tasks-table-body.tsx:105,122-185`, `mobile-grouped-cards.tsx:54`). Remove this task-only dead path after the Home card is migrated; `OwnerCellRaciMember` may remain where the genuine legacy card still needs it.
- A few comments still describe the removed six/ten-column layout (`tasks-workspace.tsx:582-584`) and the old Mine/RACI toolbar (`tasks-toolbar.tsx:1-5`); update them with the typed column contract while touching the cleanup.

### OD/rule verdict

| Area | Result |
|---|---|
| OD-61 | **Partial** — role gate and disclosure pass; persistent launcher and full filter disclosure do not. |
| OD-62 | **Fail** — core renderer is typed, but Home still ships a RACI Task surface; governance RACI remains untouched. |
| OD-63 | **Fail** — tested paths pass, but the module-global boot id violates the normal-click rule after an SPA round trip. |
| OD-64 | **Pass** — dead links are hidden and phone Work-child current-location behavior is covered. |
| Rule 11 | **Pass for the remediation implementation** — no second Task editor/table/drawer was introduced; `TaskRecordPage` is a thin host and `TaskOwnershipCard` is the ratified extension. The existing Home mini-table is a remaining contract gap, not a new duplicate. |
| BDD | **Partial** — new OD-62/63 journeys assert the new goal, but old Home/list RACI-goal tests and the old visible Home grammar remain. |

**Overall assessment: BLOCK.** Fix the Home Task surface and the page-mode navigation edge case first; then complete the launcher/disclosure, i18n, coverage, and BDD cleanup before code approval.

REVIEW-DONE

## Remediation re-review after wave-2b (Luna cross-family)

**Verdict: APPROVE**

### Verification

- **OD-62 / JTBD A4 — fixed.** Task list/table/card surfaces now expose Team/PIC/Supervisor (`mos-app/src/components/tasks/tasks-table-body.tsx:219-229`, `mos-app/src/components/tasks/mobile-grouped-cards.tsx:104-110`); the drawer/full-page ownership blocks use the same typed grammar (`mos-app/src/components/tasks/task-ownership-card.tsx:36-84`, `mos-app/src/components/tasks/task-drawer-header.tsx:123-135`); Home's mini-card is also typed (`mos-app/src/components/weekly/my-tasks-card.tsx:134-140,213-215,265-278`). The visible-RACI negative contracts pass in `task-record-redesign.test.tsx:86-118`, `tasks-page.test.tsx:236-259`, `my-tasks-card.test.tsx:140-150`, and the canonical-page e2e (`e2e/tasks-canonical-page.spec.ts:77-90`).
- **OD-63 / Rule 4 — fixed.** `isTaskPageMode` gives PUSH/REPLACE panel state precedence over the boot record (`mos-app/src/components/tasks/task-page-mode.ts:70-83`), while direct/refresh loading still selects page mode. The exact direct-record → list → same-record SPA regression and refresh case are covered at `task-page-mode.test.ts:15-31`; the layout and browser drawer checks are at `tasks-layout.tsx:58-72`, `tasks-layout.test.tsx:540-547`, and `tasks-canonical-page.spec.ts:45-60`.
- **OD-61 / Rule 8 — fixed.** The persistent phone `+` launcher is rendered and wired to the shared action menu (`mos-app/src/shell/bottom-tab-bar.tsx:84-94`, `app-shell.tsx:82-87`, CSS `bottom-tab-bar.css:45-66`), with a behavior test at `bottom-tab-bar.test.tsx:83-90`. Member phone options are collapsed behind the single control (`tasks-workspace.tsx:660-677`); overdue count and clear controls now live inside that toolbar (`tasks-toolbar.tsx:200-220`), covered by `tasks-workspace.test.tsx:185-203`.
- **Rules 5/11 and OD-64 — confirmed.** Work-child phone location remains exactly-one via the `/work` prefix (`bottom-tab-bar.tsx:11-15,51-72`, `bottom-tab-bar.test.tsx:146-164`). The canonical page is a thin host over the existing `TaskSurface` (`tasks-layout.tsx:99-110`), with no duplicate Task renderer/plumbing. Home hides the retired dead-link cadence cards in both compositions (`home-page.tsx:119-121`, `stacked-union-home.tsx:166-168`).
- **i18n — fixed.** The remediation grammar has matching EN/ID catalog keys (`mos-app/src/i18n/messages.ts:63-233,485-655,850`), and the new member and record journeys assert Indonesian output (`tasks-workspace.test.tsx:205-220`, `task-drawer-header.test.tsx:103-126`).
- **Coverage — fixed.** A focused V8 run of `task-page-mode.test.ts` reports **97.43% lines**, **93.75% branches**, and **100% functions** for `task-page-mode.ts` (above the 80% requirement).
- **BDD/dead plumbing — fixed.** The former list/Home RACI goals are now PIC/Supervisor goals (`tasks-page.test.tsx:372-423`, `my-tasks-card.test.tsx:140-150`), with no positive old Task-RACI UX assertion remaining; remaining RACI identifiers are storage/authorization compatibility or the localized `raci_edited` → “People updated” event mapping (`activity-card.tsx:13`). The task-only `OwnerCellRaciMember`/`buildOthers`/`others` path is gone; current component props show no replacement dead path (`task-row.tsx:19-52`, `tasks-table-body.tsx:82-120`, `mobile-grouped-cards.tsx:46-62`).

### Validation

- Six most recent `fix:` commits in `5e81ccd..HEAD`: `21de6a4`, `d4b2583`, `ebbaaf9`, `4fe8cfc`, `5acc8b5`, `111e04e`; the Home re-home is present immediately before them at `0dd8d89`.
- `npm test -- --run --no-file-parallelism --maxWorkers=1`: **251 files / 2,617 tests passed**.
- `npm run typecheck` and `npm run lint`: passed.
- Targeted Playwright remediation journeys: **8/8 passed**.

No remaining findings for the wave-2b remediation. REVIEW-DONE

## Design RE-review steps 1–3 (Luna, after remediation)

**Verdict: BLOCK.** The five OD-61–64 findings below are resolved in the rendered app, but one remaining in-scope Tasks DB-view regression still fails the desktop fidelity bar from the e7 reference (Rule 9 / `SALVAGE-INVENTORY.md`). This is not deferred Step 4/5/7 work.

### Review method and evidence

I read `docs/experience-contract.md` Rules 1–12, `docs/jtbd.md` (including A4), `docs/reference/twenty-ixd-patterns.md`, `SALVAGE-INVENTORY.md`, and OD-REDESIGN-61–64 before rendering. I used clean browser sessions for each URL, logged in through the dev persona picker as **Cafe Ops / Cahya** and spot-checked **Director / Dewi**, at 1280×900 and 390×844. Branding was verified as **Gordi MOS** on titles/desktop wordmark/phone logo label; no PMO text was rendered.

Rendered evidence is in `/tmp/gordi-review/` (Playwright captures: `cafe-home-desktop-playwright.png`, `cafe-tasks-phone-playwright.png`, `cafe-task-drawer-real-playwright.png`, `cafe-task-direct-real-playwright.png`, `director-tasks-phone-playwright.png`). The targeted Playwright run from `mos-app/` passed **21/21**, including shell aria-current/redirects, saved-view links, OD-62, OD-63, and mobile capture-first journeys.

### Lens (a) — Visual / correctness

- **Pass:** warm cream surfaces, navy structural accents, blue actions, restrained borders/shadows, Plus Jakarta/DM Sans, and the Gordi MOS shell render consistently. The centered ⌘K palette is 560px wide, modal/aria-modal, and contains Ask Deputy · Share Signal · Create Task.
- **Pass:** the member phone Tasks surface shows cards before controls; no clipped grid, RACI, PMO branding, or purple/AI-slop treatment appeared.
- **Important remaining finding:** at 1280px the built Tasks table is a 1,284px table inside a 994px `.tasks-scroll`; Due, Source, and Activity sit beyond the first viewport. e7’s owned table fits the decision columns (Title/Ownership/Supervisor/Status/Due) in the calm first view. This is the only rendered design blocker found in scope.
- Fixture strings such as `URL row-menu…`, `OD63…`, and `AC-305…` were observed but explicitly waived as data, per the scope card.

### Lens (b) — IxD / task-flow naturalness

- **Pass:** Cafe Ops opens Tasks to work cards, uses one `View options` disclosure for filters, and has a persistent 56px phone `+` launcher. Director retains the dense filter view as permitted by OD-61.
- **Pass:** normal list click keeps the table and opens the split drawer; the drawer exposes `Open full page`, `Mark complete`, Team, PIC, Supervisor, Due, and source. Direct record URLs open the standalone page.
- **Pass:** the Home → My tasks → task drawer path exposes an obvious next action without a dead-end. Legacy update/log links are absent. The deferred attention-Home and Signal-feed jobs are not scored.

### Lens (c) — IA / structure & navigation

- **Pass:** `/work/tasks?view=mine|overdue|followups` is canonical and chips update the URL; task-name/row-menu/mobile opens preserve the query in the tested journeys.
- **Pass:** direct `/work/tasks/:id` is the full canonical page; in-list click is the drawer; direct → list → same-record click returns to the drawer. The same `TaskSurface` renderer is used in both modes.
- **Pass:** exactly one `aria-current="page"` was observed on phone `/work/signals`, `/work/projects`, `/work/objectives`, `/events`, and `/inbox` (Work/More is the single phone destination marker where the child is behind the menu). Home dead links are hidden.

### Lens (d) — Product / intent / JTBD

- **Pass for the scoped Task job:** A Cafe Ops person can find owned work, recognize Team/PIC/Supervisor, and see Mark complete adjacent to the record. A4 is absent on Home, list/card, drawer, and full page. RACI remains a governance concern and was not moved onto Task surfaces.
- **Pass:** the manager exception is useful rather than confusing: Director sees the dense filter controls and an honest empty state with “Create one or switch to All.”
- The Home attention brief, Signals feed, Café naming, and fixture realism are explicitly outside this re-review’s acceptance bar.

### Original BLOCK findings

| Finding | Result | Rendered evidence |
|---|---|---|
| 1. Cafe Ops phone Tasks must be cards-first; one options disclosure; persistent `+`; manager may retain filters | **RESOLVED** | At 390px, first card begins at y≈262; `View options` is collapsed (`aria-expanded="false"`) and the `Open actions` launcher is 56×56 at the bottom. After opening options, Group/Unit/Status/Person/Search/archived controls appear behind that one control. Director’s phone view intentionally shows the dense controls first. |
| 2. No RACI on any Task surface; Team/PIC/Supervisor + Mark complete | **RESOLVED** | Home mini-card headers are Task/Status/Team/PIC/Supervisor/Due/Activity; table/card/drawer/page show Team/PIC/Supervisor and no RACI/Owner (R)/R·A·C·I/Responsible/Accountable/Consulted/Informed text. Drawer and page both show `Mark complete`. Playwright OD-62 passed. |
| 3. Direct record = full page; in-list click = drawer; direct → list → same record = drawer | **RESOLVED** | Direct `/mos/work/tasks/a000…?view=mine` rendered no table and showed the full two-column record page. In-list `E2E Archiveable Task` kept the table mounted beside the drawer and showed `Open full page`; the direct → list → same-record manual path returned to the drawer. Playwright OD-63 passed. |
| 4. Cafe Ops Home legacy dead links hidden | **RESOLVED** | At desktop and phone, no Home anchor matched the retired update/Daily Log/ops destinations; `Write update →` and `Open the Daily Log →` were absent. |
| 5. Phone `/work/*` children have exactly one current marker | **RESOLVED** | `/work/signals`, `/work/projects`, and `/work/objectives` each had exactly one page marker (the Work bottom-nav destination); `/events` and `/inbox` also had exactly one. Playwright AC-007/008 passed. |

### Rules 1–12 (scoped)

| Rule | Result | Scoped assessment |
|---|---|---|
| 1 — destination jobs | **PASS** | Home/Work/Café rail jobs and the Tasks job sentence are present; deferred Home attention and later module depth are not scored. |
| 2 — typed contracts → UI families → destinations | **PASS** | Task list/card/drawer/page use the typed Task family; no RACI is leaked into the Task contract and no duplicate editor was observed. |
| 3 — rail/surface budgets | **PASS** | Cafe Ops is correctly gated; Director gets governance destinations; one contextual `+ New task` action coexists with the universal launcher and no duplicate rail roots appeared. |
| 4 — canonical routes + URL state | **PASS** | Saved-view chips, redirects, query-preserving links, direct page mode, and drawer mode all held in rendered checks. |
| 5 — one `aria-current="page"` | **PASS** | Exactly one marker held on the tested desktop/phone routes; Work children use the single active Work phone destination. |
| 6 — one page anatomy | **PASS (scoped)** | The shell has brand/header, context row, content, and the shared Task drawer/page presentation on the inspected routes; deferred stubs are not used to fail this slice. |
| 7 — verb+object actions | **PASS** | The shared launcher reads Ask Deputy, Share Signal, Create Task; Task actions are New task, Mark complete, Reassign PIC, and Open full page rather than a bare Create/Add. |
| 8 — capture-first mobile disclosure | **PASS** | Cafe Ops work cards precede configuration and all options are behind one control; the manager exception is explicitly permitted by OD-61. |
| 9 — responsive parity | **FAIL** | Phone execution/capture and bottom-nav reachability pass, but the desktop Tasks DB-view loses the e7 first-viewport decision columns to horizontal overflow at 1280px. |
| 10 — extension test | **PASS (scoped/attested)** | Steps 1–3 add no new rail root, anatomy, or drawer host; the existing shell and record grammar remain extensible. |
| 11 — component reuse | **PASS** | Direct page and drawer are one `TaskSurface` renderer with mode differences; no duplicate table/drawer/record editor was rendered. |
| 12 — zero-training usability | **PASS for the scoped Task cold start** | See the cold-start verdict below; optional later Home/Signal/module jobs are excluded by the scope card. |

### New regression check and remaining scoped regression

**No new regression was introduced by waves 1/2/2b.** The following pre-existing cross-version mismatch remains in scope and is not deferred work.

**Important — Tasks desktop first-viewport fidelity.** The e7 reference at `http://localhost:8766/e7-prototype.html#/work` renders a calm decision table with Title/Ownership/Supervisor/Status/Due visible at 1280px. The convergence phone reference at `http://localhost:8134/#/work/tasks` correctly supplies the mobile `View options`/cards grammar, which the build now ports. The built 1280px list instead renders headers Task/Status/PIC/Supervisor/Project-Process/Objective/Team/Due/Source/Activity in a 1,284px table inside a 994px viewport; the first paint ends at Team and the decision-critical Due column is off-screen. This is a cross-version regression against the e7-owned table grammar, not a future-step complaint and not a fixture-name complaint.

**Suggested fix:** keep the typed Task contract, but use the e7 priority columns/condense ladder at 1280px (hide or move optional Project/Process, Objective, Source, and Activity into the record/drawer) or add an explicit, calm horizontal-scroll affordance. No new domain or renderer is needed.

### Rule-12 cold-start verdict — Cafe Ops

**PASS for the scoped job: find and complete owned Task work.** In a clean Cafe Ops phone session, Home was recognizable, `My tasks` exposed tappable records, the first record opened the shared drawer, and `Mark complete` was adjacent to Team/PIC/Supervisor/status. The phone `+` launcher remained available and no RACI/system ownership jargon interrupted the core path. No backtracking or dead Home link was required. The deferred Home attention-first job and synthetic fixture-name issue are intentionally not used to fail this verdict.

### Owner A/B fork

No owner decision is required for OD-61–64; all four decisions were rendered as locked. The remaining table fix is an implementation choice, not a new product fork: **A (recommended)** condense to e7’s priority columns at 1280px, or **B** retain horizontal overflow with an explicit affordance.

### Consolidated issues

**Critical:** none among OD-61–64.

**Important:**
1. `/mos/work/tasks?view=mine` at 1280px — the typed table’s optional columns push Due/Source/Activity outside the first viewport, regressing the e7 DB-view review grammar and failing scoped Rule 9. Reduce/condense optional columns or make the overflow affordance explicit.

**Minor:** none.

**Overall assessment: BLOCK.** The original five remediation findings are all **RESOLVED** at the rendered level, but the design gate remains blocked by the in-scope desktop Tasks table fidelity regression above. After that one table fix, re-run the 1280px/390px visual pass; no further owner decision is needed.

DESIGN-REVIEW-DONE

### Wave 2c — desktop table density (fix for the design RE-review's last BLOCK)

**Status: BUILT, DESIGN-REVIEW PENDING — steps 1–3 are NOT closed.**

Commit `8ab3235` "trim desktop table to e7 priority columns so Due never clips". Applies the reviewer's
recommended **Option A**: at desktop, show the e7 priority decision columns (Title · PIC · Supervisor ·
Status · Due); the optional columns (Project/Process, Objective, Team, Source, Activity) move to the
record drawer / full page, where the typed Task already carries them. No new renderer (Rule 11).

- **Gates:** typecheck 0 · lint 0 · unit green (~2619) · Playwright green (49) · task tests 303 green.
- **NOT DONE:** the 4-lens design re-review has **not** been re-run against the rendered result, so no
  APPROVE is recorded. **NOT blocked (corrected 2026-07-16):** an earlier note here claimed Supabase was
  down — that was a mis-read; Supabase is UP (containers healthy, :44321 → 200, app authenticates). The
  review is simply outstanding. See `docs/plans/AUTONOMOUS-RUN-STATE.md` § THE NEXT OPEN ITEM.
- **Acceptance when it runs:** at 1280px the Due column is visible with no horizontal clip; optional
  fields reachable in the drawer/full page; no regression of the four already-resolved OD-61..64
  findings.

---

## Security audit (2026-07-17) — `security-auditor` (opus), OWASP Top 10 + STRIDE

**Verdict: BLOCK** · 0 Critical · **2 High** · 1 Medium · 1 Low.
Scope: `git diff f2546f66..HEAD` — 133 code files (+6919/-4170). **Zero migrations changed**, so
server-side RLS is unchanged from `main`; this audit is about the client and what it now exposes.
Every load-bearing claim below was **re-verified by the Director against the code** (the auditor's
summary was not taken on trust).

### HIGH-1 — Sign-out removed from the authenticated UI; a session cannot be terminated (A07)

The redesign unmounted the **only** sign-out affordance. Verified:
- merge-base `top-bar.tsx:3,304` imported and rendered `<UserChip variant="header">`; at HEAD
  `top-bar.tsx` has **0** references. `git grep UserChip HEAD -- mos-app/src` returns only
  `user-chip.tsx` and its own test → **unmounted dead code**.
- `user-chip.tsx:135` held the only `signOut?.()` for an authenticated viewer. The sole remaining
  reachable caller is `orphan-screen.tsx:51`, which renders only when `status === 'orphan'`.
- Its replacement is a bare `NavLink to="/profile"` (`rail-nav.tsx:185`); `/profile` → `SliceStubPage`
  (`router.tsx:150`) = "not in this slice".

**Why it matters here:** `supabase.ts:13` sets `persistSession: true, autoRefreshToken: true`, so the
refresh token in `localStorage` renews indefinitely. The deployment IS shared terminals (café/kitchen
screens, ~30 staff, mixed roles). Shift ends, no way to sign out → the next person inherits the prior
session, including `admin`/`finance` access roles (which unlock `/money`, `/admin/people`). Writes
stamp `actor_person_id = shared.current_person_id()` → misattributed. STRIDE: Spoofing + EoP +
Repudiation. Aggravated by `rail-nav.tsx:116` showing only "{site} {role}" + initials — the person's
name is gone from the shell, so a stale session is unlikely to be *noticed*.
**Local-access-only** — if shared terminals were out of scope this would be Medium; they are not.
**Fix is small:** `handleSignOut` (`auth-provider.tsx:28`) is intact; only the UI entry point is gone.

### HIGH-2 — AC-002's sign-out journey rewritten to a storage wipe, masking HIGH-1

`e2e/auth-signout-back.spec.ts` — the test named "sign-out and back-button guard":
- **Before:** `getByRole('button', {name:/cahya cafe/i}).click()` → `getByRole('menuitem',
  {name:/sign out/i}).click()` — drove the real affordance.
- **After:** `clearSession(page)` = `localStorage.clear()` + `sessionStorage.clear()`.

Clearing storage is **not signing out**: it never calls `supabase.auth.signOut()` and never revokes
the refresh token server-side. `signOut()` could be deleted entirely and AC-002 would still pass.
This is the **"app conforms to the test, never the test to the app"** rule inverted — and it is the
direct reason a shipped auth-control regression reached this gate green. Same substitution at
`auth-recovery.spec.ts:62-66`.

### MEDIUM-1 — Identity goal-oracle now vacuous in three auth journeys

`auth-password-login.spec.ts:21`, `auth-magic-link.spec.ts:32`, `auth-recovery.spec.ts:62,82`: the
assertion moved from the viewer's name (`getByText('Cahya Cafe')`) to `a[href="/mos/profile"]` — a
static nav link rendered for **any** authenticated viewer. It proves the login gate was passed, not
**which identity resolved**; if `resolveViewer` returned the wrong person, all three still pass.
FR-006 is unproven at the e2e layer. (Partly forced by HIGH-1 removing the name from the shell.)

### LOW-1 — `user-chip.test.tsx` is green for an unmounted component

13 assertions incl. `describe('AC-005: UserChip and sign-out menu')` render `<UserChip/>` directly, so
they pass while nothing mounts it — false assurance that sign-out works.

### Verified clean (what was actually checked, not assumed)

- **`require-capability.tsx` fail-closed, not bypassable.** Only change is the redirect target
  (`/work/cascade` → `/work/tasks`). No loading fail-open: nested under `ProtectedRoute`
  (`router.tsx:86-91`) which returns a loading `<div role="status">`, **not** `<Outlet/>`, while
  `status === 'loading'` (`protected-route.tsx:14-20`). Unknown capability → `ROLE_CAPABILITIES[role]
  ?? []` → deny (`capabilities.ts:14`). No session → `roles = []` → deny.
- **Route→guard mapping got STRONGER, not weaker.** `/money*` → `RequireAccessRole
  ['finance','admin']`; `/admin/people` → `AdminRoute`; `/work/projects` → `workline.manage`;
  `/work/objectives` → `objective.manage`; `/cafe/review`,`/cafe/pushes` → `RequireAccessRole
  ['ops_lead','admin']` — **newly gated; `main` had NO route guard on `kitchen/review|pushes`**.
  `/events`,`/ecommerce`,`/roastery`,`/profile`,`/work/signals` are stubs (zero data access).
  `/dev/*` stripped by `import.meta.env.DEV`.
- **No RACI-style leak** (the project's two prior findings): `record-details-panel`,
  `task-ownership-card`, `owner-cell`, `person-picker`, `record-feed` are props-driven, no fetching.
  `my-tasks-card.tsx:45` uses RLS-scoped queries; `tasks_select_org` / `people_select_org` are
  deliberately org-readable (OD-P1-3) — excluded by query/RLS, not by the UI.
- **Command palette not an over-fetch:** `searchTasksByTitle` (`db/tasks.ts:194-206`) is `.ilike` +
  `.limit(20)` on the RLS-scoped client; postgrest-js URL-encodes filter values → no PostgREST filter
  injection. No `.or()`/`.filter()` string building anywhere in `src/lib/db/`.
- **XSS:** zero `dangerouslySetInnerHTML` / `.innerHTML` / `eval` / `new Function` / `document.write`
  in `src/`. i18n interpolation returns plain strings into React-escaped JSX text nodes. The one
  markdown sink (`AssistantMarkdown.tsx:10-25`, unchanged) protocol-allowlists via `transformUrl`.
- **Secrets/tenancy:** no key material in `src/` or history. `cloud-agent-bootstrap.sh:65` writes
  `SUPABASE_SERVICE_ROLE_KEY` **without** a `VITE_` prefix → never bundled into the client.
  **38/38 business tables** RLS enabled + forced (an initial regex said 36 — false positive from
  double-spaced `alter table mos.follow_ups        enable`; verified directly at
  `20260709000001_mos_follow_ups.sql:315-318`). Both views are `security_invoker = true` → no
  view-level RLS bypass.
- **`features.ts` not client-toggleable:** all flags build-time constants; no localStorage/query-param
  toggle. Flipping any flag still leaves `RequireAccessRole` + RLS in front of the data.

### To clear this BLOCK

1. Restore a sign-out affordance (rail-footer menu, or implement `/profile`). `handleSignOut` is
   intact. This is a `*.tsx` shell change → **design review is required on the fix too**.
2. Re-author AC-002 against the real affordance — goal-oracle: *user signs out → back button reaches
   no protected content*, driven **through the UI**, not a storage wipe. Do not delete the journey.
3. Restore an identity assertion (MEDIUM-1) once the viewer's name is back in the shell.
4. Re-run the audit → record `security: APPROVE` above only when High findings are cleared.

---

## Wave 2c code reviews (2026-07-16, cloud autonomous run — OD-REDESIGN-67)

### Spec review (spec-reviewer, opus) — **APPROVE**

Static review of `8ab3235` against the Option A spec (§ Design RE-review above). Verified:
(a) column trim = Option A exactly — thead/body/skeleton each 7 cells (`tasks-table-body.tsx:195-224`,
`task-row.tsx:76-113`), old 10-col min-width 1284px → `min-width:0; table-layout:fixed`, Cascade-D1
override block deleted so it can't shadow the grid; at 994px fixed cols leave Task ~280px → Due
cannot clip. (b) Optional fields reachable: `record-details-panel.tsx` renders Team/Source/
Work-line/Objective; wired in both drawer + full page (`task-surface.tsx:433-441,566-574`);
test-proven (`task-record-redesign.test.tsx:102-142`, `cascade-d1.test.tsx:393-409`).
(c) Rule 11: zero new component files; single `TaskSurface` renderer preserved. (d) Tests adjusted
honestly: FR-234/235, AC-060, AC-113 updated to the moved-to-drawer contract (deliberate UX change;
goal-oracles preserved); new AC-W2C asserts priority-only headers + drawer reachability; Due
assertions strengthened. OD-61..64 not regressed. 1 Minor: literal column order differs from spec
wording (set-identical, non-blocking).

### Code-quality review (code-quality-reviewer, opus) — **APPROVE**

0 Critical / 0 Important. Strengths: column count consistent across all 6 render sites; net
simplification (dual-count regime collapsed); props/imports cleaned at call sites; header tests
assert accessible contract (role+name). Minors → step-11 sweep list: dead `'activity'` sort union +
accessor (`tasks-workspace.tsx:42,233-236` — no trigger can reach it); orphaned `.td-bu`/
`.td-workline`/`.td-objective` CSS (`TasksWorkspace.css:376,599-607`); colSpan `7` magic literal in
3 files (pre-existing; recommend shared column-descriptor array as follow-up).
