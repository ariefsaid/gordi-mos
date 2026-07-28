# Gordi MOS — backlog (living doc; created 2026-06-10)

> **STATE 2026-07-24 — the convergence is DONE; six open workstreams remain (banner:
> `docs/agent-context.md`):**
> ① **Phase-3 OFFICIAL Luna** — deferred ~1 week (Codex quota, owner-confirmed 07-24); on return:
> fresh pinned checkout at the then-tip, full register scope, verdict → `docs/reviews/v3-redesign.md`.
> ② **People + Inbox → RecordCollection grammar** (OD-91 #8) — owner-gated on a grammar walkthrough
> (:5199); Kitchen + AR Follow-ups stay off the engine for now, revisit after.
> ③ **Deputy mark redesign** (OD-91 #23) — icon proposals owed to the owner as a visual round.
> ④ **Shift+Enter live-keyboard verify** (OD-91 #10) — unit-green; browser automation could not
> synthesize the chord; one real-keyboard check at the next walkthrough.
> ⑤ **Phase-4 features** — the S1–S7 restoration queue
> (`docs/plans/2026-07-23-feature-parity-ledger.md` §5; S2/S3 owe their schema ADRs first) +
> Issue-10 editor, Shifts, module stubs. Opens after the Luna gate per OD-87, or earlier on owner
> word. ⑥ **Acceptance closure** — 9 audit-register surfaces are still DUE, formal spec/design
> review verdicts are absent, and the live 1280/1024/390 owner walkthrough has not run. **Merge-to-main**
> additionally requires the review-battery ledger verdicts (spec · code-quality) for the branch +
> `pre-merge-check.sh` exit 0.

- **R6(b) record-door unification (deferred from `v3/owner-r2`, 2026-07-23):** Tasks opens
  records path-based (`/work/tasks/:id`) while Signals uses the `?record=` query seam — two door
  grammars. Unify (likely on `?record=`), and make browser-Back-after-expand return to the drawer
  (needs the shared overlay-host `openPage` push-vs-replace change — entangles Signals + the
  AC-V3-008 dirty-guard suites, hence its own issue). Also: document.title for the drawer-open
  case. The 2026-07-23 interaction-consistency interrogation (`docs/plans/2026-07-23-interaction-consistency.md`)
  covers this verb — execute from its work-order.

- **Mechanical guard suite (lane `v3/mech-guards`, in flight 2026-07-23):** every owner-caught
  defect class becomes a deterministic guard — split height parity, no naked head numbers, one
  solid primary per surface, toolbar label gap, ≤1 permission note per record, token vocabulary
  scan widened beyond `ui/`, 44px tap targets (structural Vitest + Playwright geometry spec).
  Wire the geometry spec into `pre-merge-check.sh` once merged. **Master plan:**
  `docs/plans/2026-07-23-skill-rule-mechanization.md` — full skill-rule inventory (7 mechanized /
  43 mechanizable — ~35 already implemented in impeccable's detector, wire as gate / 18 census /
  5 judgment), the top-10 build order (closes defect classes D2–D9), and the binding 7-step audit
  protocol (an audit reporting a score without all 7 census artifacts is void).

- **Post-cockpit orphan sweep (2026-07-23):** the OD-85 deletion orphaned `directory.ts
  getRoles()`, `use-company-finance-kpis.ts`, and the e2e `MEMBER` fixture + its global-setup
  seeding (sole consumers deleted; they live in shared files so the deletion lane correctly left
  them). Delete in a follow-up once confirmed no in-flight lane readopts them.

- **Impeccable-audit P3s for owner walkthrough (2026-07-23):** (a) toolbar controls render 38px
  vs DESIGN.md's 32px control token — consistent, minor, taste call; (b) desktop Task full page
  leaves ~230px unused right gutter (spec caps measure, doesn't mandate filling) — taste call;
  (c) confirm the Home attention time-window behavior across the WIB midnight boundary (digest
  composition legitimately shifted mid-audit when the date rolled — likely correct, unconfirmed).

- **Dead-code sweep after the attention-pill fold (deferred 2026-07-23):** `DueRunsTrigger`
  (component + test + `.due-runs-trigger`/`.due-runs-chev` CSS in `due-runs.css`) went dormant
  when the two toolbar stat pills folded into one attention pill (commit `61f6087`). Deferred
  deliberately: the OD-84.1 toolbar disclosure rework (v3/luna-a lane) touches the same seam —
  sweep AFTER it merges, verifying what is actually dormant then. `DueRunsList` + `useDueRuns`
  remain live.

> ## CANONICAL CURRENT STATE — 2026-07-22
>
> The backlog’s dated strata below are historical evidence. Current reality is the local
> `v3-redesign` worktree at the latest committed docs checkpoint plus an uncommitted RecordViewer/collection slice;
> nothing is pushed, merged, deployed, or running Supabase. The current OOM-safe reconciled smoke proves
> **143/143 focused tests across 9 files**, typecheck, CSS lint, changed-file ESLint, and a fresh inventory
> (**58 routes / 13 shared jobs / 76 CSS families**). The earlier **25 failed / 77** TaskSurface/TasksLayout
> run was pre-reconciliation and is historical; it is not an active failure. The earlier **126/126** run
> is also pre-header evidence. None of this proves the full suite or owner-facing three-width rendering.
>
> The **34/40 · 9/10** and **28/40** score passages below are retained as historical checkpoints, not
> current acceptance. The latest independently rendered committed baseline is **26/40** and
> approximately **6–6.5/10 structural anti-slop**; E7 is **27/40 / ~7/10**, while the prior warmer
> prototype is **19/40 / ~4/10** (its task-table title/subline remains salvage only). Current verdict is
> **NO-SHIP / owner-eyes pending** until the E7 result-header/toolbar review, RecordViewer anatomy, Inbox seeded
> journey, Deputy stack decision, I5 disposition, and 1280/1024/390 renders are independently verified.
> See the canonical state block in [`docs/agent-context.md`](agent-context.md) and the latest correction
> in [`docs/reviews/v3-redesign.md`](reviews/v3-redesign.md); those win if any older backlog paragraph
> disagrees.

> **CURRENT (2026-07-22): V3 live application convergence on local branch `v3-redesign`; fresh
> audit baseline `a7eef31` plus the current documentation addendum (local and unpushed),
> all local and unpushed.**
> **AUDIT OVERRIDE (2026-07-22):** independent verification at `d63f20a` was **NO-SHIP**;
> see [`docs/reviews/v3-redesign-completion-audit-2026-07-22.md`](reviews/v3-redesign-completion-audit-2026-07-22.md).
> Checkpoint `fc10a8e` (including `08defcc`) has since closed the focused route-seam test failures, live
> Tasks/Signals host adoption, and Café first-Team heuristic; the branch is still NO-SHIP until the
> cross-surface collection grammar, Inbox seeded proof, Issue 10, spec/design review verdicts, and owner three-width gate
> close. Inventory freshness now passes; code-quality/security are recorded PASS in the ledger.
> Money's parameterized Detail door is now closed at the presentation-contract level; contributing-record
> drill-down remains deferred because the current reporting model is aggregate-only.
> Worktree consolidation is complete: `.claude/worktrees/v3-redesign` is canonical; clean historical
> worktrees and superseded dirty lanes were removed after archiving their residue outside the repo;
> stale Vite processes were stopped. Only the primary checkout, E7 prototype, and canonical V3
> worktree remain.
> Signals now shares Tasks’ capture-first phone disclosure for collection controls (focused evidence
> 82/82); desktop toolbar/presentation parity and the owner rendered gate remain open.
> The latest focused cleanup is 71/71 (cohesion focus guard, Inbox bell/page/host, Signals, and
> CollectionToolbar), with typecheck, ESLint, and Stylelint green; this does not replace the full
> rerun or rendered owner gate.
> The workstream label is `v3-redesign` (E8). E7 owns visual styling; current owner law owns IA and
> interaction behavior. Issues 3–6 foundations and broad Issue-11 page-family migration are now
> implemented locally; auth control convergence is landed and independently re-verified at `93555ac`.
> Tasks live-engine adoption is now integrated and independently re-verified at `15924dc`; Signal
> collection convergence is integrated and independently re-verified at `5ab6a51` + `3250aa8`. Home/
> People/More interaction cleanup remains preserved WIP for the next agent. The single production overlay-host mount is integrated and
> independently verified. The Director claims integration/review plus Inbox/Deputy, Follow-ups/Café,
> geometry, and final rendered owner acceptance.
> Issue-12 cleanup has also removed the
> unreachable legacy Sales and My Week page implementations rather than preserving their parallel
> page-head/CSS grammar. The exact active state and continuation
> order are in [`docs/agent-context.md`](agent-context.md) and the detailed resumable handoff is
> [`docs/reviews/v3-redesign-convergence-handoff-2026-07-21.md`](reviews/v3-redesign-convergence-handoff-2026-07-21.md);
> the governing delivery sequence remains
> [`docs/specs/v3-redesign.spec.md`](specs/v3-redesign.spec.md) §12;
> the deterministic proof is [`docs/reference/v3-storybook-matrix.md`](reference/v3-storybook-matrix.md)
> and the live inventory is [`docs/reference/v3-live-inventory.md`](reference/v3-live-inventory.md).
> The evidence ledger is [`docs/reviews/v3-redesign.md`](reviews/v3-redesign.md), with rendered files in
> [`docs/reference/evidence/v3-storybook-2026-07-20/`](reference/evidence/v3-storybook-2026-07-20/).
> The Storybook Issue-2 evidence remains valid but is no longer the live stopping point. Issue 3 **Page-family primitives and
> migration guards**; Issue 4 **Shared overlay/panel/navigation host**; Issue 5 **RecordViewer contract,
> field primitives, and Task adapter**; Issue 6 **RecordCollection/view engine and Tasks/Signals adapters**;
> Issue 7 **Inbox triage plus Deputy host integration**; Issue 8 **Café canonical-record integration and
> Team-context correction**; Issue 9 **Representative-slice rendered/driven owner gate; provisional IA
> ratification**; Issue 10 **Structured-content schema ADR, storage/RLS, editor, and typed embeds**; Issue 11
> **Remaining route migration by page/component family**; and Issue 12 **Full cross-surface acceptance,
> stale-style removal, documentation closure, and owner walkthrough**.
> The dated banners below are historical strata. `docs/plans/AUTONOMOUS-RUN-STATE.md` is the completed E7
> buildout record, not the live V3 plan.

> **LATEST VISUAL REGRESSION OVERRIDE (2026-07-22, local/uncommitted):** A fresh Impeccable/Taste/UI-styling
> comparison against E7 and pre-E7 confirms **NO-SHIP**. The current toolbar/rail/Home CSS pass is only a
> bounded improvement, not convergence. P0 blockers are Home task-title starvation, duplicate collection
> view axes/native Saved-views popup, and Signals' six-column identity anatomy. P1 blockers are the
> Tasks/Signals grammar parity matrix, Home card-remnant/record-open consistency, and driven rail containment
> proof. Numeric checklist score is 23/40; decorative anti-slop passes, structural slop does not. Full
> findings and focused evidence are in the latest section of [`docs/reviews/v3-redesign.md`](reviews/v3-redesign.md).

> **OWNER FEEDBACK / SCORE TARGET OVERRIDE (2026-07-22):** The owner’s verbatim acceptance complaint is
> preserved in the review ledger: “the table filters and views feels unpolished and too cluttered. it
> doesnt say tidy. it says confusing!”; “same goes for Home, styling feels unpolished. some has to big
> of whitespace, some feels too tight. when scrolled down, the sidebar follows to get scrolled as well”;
> “e7 has better table structure”; and “even the pre-e7 has better table layout.” The measurable goal is
> **≥27/40 Nielsen-style (E7's 27/40), ≥7/10 structural anti-slop (target 8/10), and no P0 duplicate
> axes/card soup/starved identity/collection-grammar divergence**, proven at 1280/1024/390 for Home,
> Tasks, and Signals. Current app baseline is 23/40; prior warmer is 19/40; prior task-table anatomy is
> ~3.5/4 for scanability and remains salvage reference only. Keep **NO-SHIP** until the target is rendered,
> scored, and owner-visible.
>
> **UI convergence execution rule (owner-directed 2026-07-21):** implement → bounded smoke check →
> render/owner-eye review → goal-level regression tests → commit. Do not delay visible UI/IxD progress
> for exhaustive red-test archaeology; this exception does not weaken integration gates or permit
> proxy-only evidence.
>
> **Standing oracle — `docs/reference/provenance/owner-directives-index.md`** (composite: owner-word →
> lost-good → owning-default, NOT e7-fidelity). Reviews check touched surfaces against it; transplants
> use the composite checklist per surface. Its OPEN-UNTRACKED list (desktop no-clip column invariant;
> café capture-link default-active) and CONFLICT-needs-owner list
> (action-verb family) are the redesign fix-queue + owner-A/B inputs.

## Fresh current-tip audit queue — 2026-07-22 (read-only, tip `a7eef31`)

Two bounded critics rechecked the live source and the historical owner oracle from the redesign,
50+ QnA, divergence/convergence, and E7 threads. No Supabase, dev server, or broad test fan-out was
used. The source guards pass (`v3-live-inventory`: 58 routes / 13 shared jobs / 74 CSS families;
RecordCollection conformance; Storybook matrix 35/36/3), but those guards do not prove the rendered
application is one coherent product. The branch remains **NO-SHIP**.

Current blockers and required proof:

- **P0 interaction (source-level follow-up now implemented locally):** the Task dirty-leave guard is
  attached to the live `OverlayEntry` only while the tenant is dirty; the shared ConfirmDialog owns
  retain/discard and the goal test drives the real overlay close path (FR-V3-009 / AC-V3-008). Fresh
  browser Back/three-width evidence remains open, and the direct route's browser blocker is still a
  separate seam.
- **P1 collection grammar (bounded source/test seam implemented locally):** Tasks and Signals keep
  their domain renderers, but both live tables now opt into one `record-collection-table` skin:
  full-width fixed layout, 14px table type, 38px headers, 52px rows, one padding/divider rhythm.
  Signal Occurred/Attention headers now use the same native keyboard-sort + `aria-sort` contract as
  Tasks and update the shareable collection query. Remaining gate: rendered computed-style proof and
  driven filter/group/saved-view/open/Back/focus comparison at 1280, 1024, and 390px; Feed/Card anatomy
  may remain domain-specific but must read as one collection family.
- **P1 host/IA (source seam largely closed):** Inbox page and Bell quick-triage now share the same
  `InboxTriageConnected` surface and shared host; Bell → queue → record → Back is covered by connected
  and host tests. Inbox intentionally remains a notification-specific list rather than a generic
  `RecordCollectionSurface`, and its All/Unread-only state is owner/data-gated until Handled is
  ratified. Remaining proof is seeded live notification data plus rendered three-width behavior—not
  another host rewrite.
- **P1 host grammar (shared chrome landed; route stack still open):** Deputy no longer owns a local
  fixed panel, header/Close, scrim, Escape listener, focus trap, or focus-return implementation.
  `OverlayCompanionSlot` renders its chrome-free content through `RecordPanelHost`, preserving the
  desktop adjacent/compact and phone-above-record preference. The phone goal test proves Escape closes
  only Deputy and leaves the record underneath mounted. Remaining gate: make Deputy a controller-owned
  session/Back participant (or ratify the companion exception), then render 1280/1024/390 geometry.
- **P1 RecordViewer:** Task/Signal live viewers still diverge in anatomy and expose empty relation
  arrays. Add a driven panel/page/related-record comparison before calling the abstraction complete.
- **P2 visual/token drift (measurable source seams closed locally):** Tasks and Signals share the
  explicit 14px / 38px-header / 52px-row collection skin; Profile cards now use the 12px E7 container
  radius and `RecordPanelHost` chrome uses the 32px control token while preserving 44px phone targets.
  Focused style/goal guards cover all three. Fresh three-width renders and the owner’s Feed/Card anatomy
  judgment remain open; do not resurrect the superseded 13px/50px or 8px/30px source findings.
- **P2 Café language (source/test closed locally):** captions, errors, aria labels, empty-state copy,
  route document titles, and retained translation values use Café/Kafe. `RI-IA-10` guards all five
  live route files while explicitly allowing internal `Kitchen*` names, import paths, i18n keys, and
  the stable form id. Fresh rendered owner proof remains part of the final three-width gate.
- **P2 I5 contract:** eager native selects are now documented as a provisional exception; owner
  disposition and keyboard/blur/Escape proof are still required. This is not universal I5 conformance.
- **P3 hygiene:** retire/guard dead Signals selectors and stale host/router/Profile comments. The
  current RecordCollection conformance script covers Tasks paths only; Signals, Inbox, and Deputy
  need explicit coverage later.

Resolved and not to re-open as current findings: Home Signal host/origin, Home routine Money KPI
duplication, Café explicit Team choice, Inbox page host geometry/Back seam, Deputy focus return,
Signals phone disclosure/native opener/Save View focus, and the old hardcoded Café phone-tab claim.
The owner still must judge the final “one app” visual/density/card-soup result and the strategic
Inbox/Deputy/I5 exceptions. Full current-tip screenshots and three-width driven evidence are absent.

## V3 Issue 2 local checkpoint (2026-07-20)

Verified in the isolated `v3-redesign` worktree and committed in implementation checkpoint `04cbe8b`:

- The Storybook workbench uses the canonical production components and runtime tokens across seven
  curated files: 35 stories, 36 state entries, 3 responsive entries, and 23 canonical jobs.
- Plain `npm ci` succeeds after a clean dependency install without `--legacy-peer-deps`. The accepted
  stack is Storybook 10.5.2 / `@storybook/react-vite` 10.5.2 / `@storybook/addon-a11y` 10.5.2 /
  external `@storybook/test-runner` 0.24.4. Vitest remains 3.2.6; no Vitest 4 or browser package was
  introduced, and the existing Vitest config/include/exclude behavior is unchanged.
- The Director’s Node guard evidence is 21/21 (12 matrix tests + 9 inventory tests), followed by 2/2
  deterministic artifact-freshness CLI checks; targeted Vitest is 120/120; typecheck, ESLint,
  Stylelint, and the
  post-comment-fix production build pass. The resource-saturated full-suite attempt had two unrelated
  5-second timeout flakes; both affected files reran alone at 30/30, so the full-suite gate is recorded
  as inconclusive rather than green. The external browser runner passes 7 suites / 35 tests with
  addon-backed a11y checks.
- The production corrections are limited to the existing ViewTabs, StatusPill, Button/CardHead, and
  CommandMenu seams. The only recorded Issue 2 debts are Button loading state → Issue 3 and future
  shared RecordPanelHost behavior → Issue 4. There is no Supabase, route migration, or representative
  application acceptance in this checkpoint.

Evidence and commands: [plan](plans/2026-07-20-v3-storybook-matrix.md), [spec §12](specs/v3-redesign.spec.md),
[matrix](reference/v3-storybook-matrix.md), [live inventory](reference/v3-live-inventory.md),
[screenshots and contrast evidence](reference/evidence/v3-storybook-2026-07-20/), and [review ledger](reviews/v3-redesign.md).
The final runner output is `/tmp/gordi-mos-v3-storybook-final.txt`; the final Vitest JSON is
`/tmp/gordi-mos-v3-vitest-command-fix-final.json`. `node scripts/v3-storybook-matrix.mjs --check`,
`node scripts/v3-live-inventory.mjs --check`, `git diff --check 0fd276f HEAD`, and `git diff --check`
all exit 0. Both `npm run build-storybook && npm run lint` and `npm run lint && npm run build-storybook`
exit 0 with generated `storybook-static/` ignored.

### Remaining V3 Issues 3–12

3. Page-family primitives and migration guards.
4. Shared overlay/panel/navigation host.
5. RecordViewer contract, field primitives, and Task adapter.
6. RecordCollection/view engine and Tasks/Signals adapters.
7. Inbox triage plus Deputy host integration.
8. Café canonical-record integration and Team-context correction.
9. Representative-slice rendered/driven owner gate; provisional IA ratification.
10. Structured-content schema ADR, storage/RLS, editor, and typed embeds.
11. Remaining route migration by page/component family.
12. Full cross-surface acceptance, stale-style removal, documentation closure, and owner walkthrough.

**Next action:** independent re-review confirms the Issue 2 evidence; then the owner explicitly
approves the Issue 3 gate. The next harness begins Issue 3 only after that approval.

- **DONE (2026-07-19) — C2 / OD-REDESIGN-22 I5 inline-edit retrofit:** free-typed text/number qty cells
  (`qty-cell.tsx`, `plan-qty-cell.tsx`) now route through the one `useInlineCommit` primitive —
  Enter/Tab/blur commit, Escape restores the saved qty. Record-details inline edits are native selects
  (eager commit is the correct I5 reading — no free-text field to defer). Contract rows flipped ❌→✅
  (`docs/interaction-contract.md`). Follow-up (out of this slice): phone siblings `plan-qty-stepper.tsx` /
  `wip-item-stepper.tsx` and the Task-record I5 row remain on the old model.

The durable record of what's next. NOT loaded as session context (kept out of CLAUDE.md).
Phasing detail: `docs/roadmap.md`. Locked decisions: `docs/decisions.md`. How the requirement
bar itself moved (era timeline E1→E8/V3): `docs/requirements-evolution.md`.

> **2026-07-09/10 — REDESIGN IS THE CURRENT DIRECTION.** The in-flight workstream tracked in the
> dated banners below (agent port, dashboard, sales read-models, UI-revamp) is **pre-redesign**.
> The owner approved a full redesign: authority is **ADR-0025**
> (`docs/adr/0025-ia-modules-in-rail-redesign-direction.md`) + **`docs/decisions.md` OD-REDESIGN-1..55**
> + **`CONTEXT.md`** (PIC + Supervisor; Signal; one record workspace; modules-in-rail). Canonical next
> step = **owner review of `docs/jtbd.md` v0.4 + `PROTOTYPE-BRIEF.md`, then update the stale redesign
> working set into one decision-complete prototype** (`docs/design-mockups/redesign-mockups-2026-07/`)
> → **owner prototype approval**
> **→ SDD → plan → TDD build → review → BDD acceptance**. A clean data baseline is authorized in
> direction (OD-REDESIGN-34) but **no reset/deploy is authorized**; the three redesign-derived
> deferrals already live at the bottom of this file (Blueprint, clean baseline, MCP). Read the
> banners below as history of what shipped, not as the live plan.

> ## 2026-07-28 — v4 REDESIGN: feature work the Nielsen gate identified (NOT design work)
>
> The v4 redesign ran the impeccable toolchain end to end and plateaued at **28.8/40 app-wide**
> against the owner gate of **>30** (`OD-V4-4`). Full record: `docs/v4-inheritance.md`,
> `docs/reviews/v4-nielsen-gate.md`, `docs/reviews/v4-crosscutting-audit-2026-07-27.md`.
>
> **The measured finding that matters:** across three scoring rounds, **layout and aesthetic passes
> moved zero points**, while fixes that closed a broken interaction moved **5–14 points each**
> (Café·Log +12 from one submit-flow bug fix; Inbox +6 from error recovery; Café·Plan +14.2pp from a
> filter). The remaining gap is **not reachable by redesign** — the items below are capability,
> routing and data work. Estimates are the scorers', not the Director's.
>
> | # | Item | Surface | Why it scores | Est. |
> |---|---|---|---|---|
> | **F1** | **Wire plan-edit capability for the Kitchen Lead.** `/cafe/plan` renders **fully inert** — zero controls — for the persona `jtbd.md` names as its primary user. Highest single-item gain on the board | Café·Plan | H7 flexibility (2.25/4 app-wide) | **+4–6** |
> | **F2** | **Objectives row drill-through** to a record view showing its Projects/Processes/Tasks + RACI. Rows are currently inert text where Tasks rows link | Objectives (18→23/40, lowest surface) | H4 consistency, H6 recognition | **+2–4** |
> | **F3** | **Apply the OD-V4-1 capability migration.** `supabase/migrations/20260727000001_od_v4_1_objective_lead_write.sql` is **authored but not applied**; `destinations.tsx` still gates the rail entry on `objective.manage` (admin only), so a Kitchen Lead sees no Objectives entry and a direct URL silently redirects. Needs RLS + security review — a client-only gate change would show UI that then 403s | Objectives | unblocks F2/F4; closes register item **X-6** | prereq |
> | **F4** | **Objectives owner/RACI display + BU/status filter**, mirroring Tasks' "View & filters" | Objectives | H7 | **+2** |
> | **F5** | **Money row/table drill-through to transactions.** `data-table.tsx` has **no row-click/href seam** — this is routing work, not styling | Money | H6, H7 | +1–2 |
> | **F6** | **Build out the desktop Home layout.** The money strip, ops-KPI row and cascade progress **already exist in source** behind `SHOW_HOME_STACKED` but are not live; desktop currently renders a stretched ~620px mobile feed column on a 1280px viewport | Home | H8, H7 | **+2–3** |
> | **F7** | **Failed-checks rows need a drill/acknowledge target.** A flagged problem with no adjacent action is the A4 dead-end trap named in `jtbd.md`'s own calibration anchors | Home | H1, H7 | +1–2 |
> | **F8** | **A real in-app help system.** H10 was the weakest heuristic app-wide (1.25/4, now 2.0/4). A shared HelpTip was extracted but reaches only 3 of 8 surfaces, and it is a `title`-attribute tooltip — genuinely fixing help means more than tooltips | app-wide | **H10, still weakest** | +1 per surface |
> | **F9** | **Source Café·Log's real logged total.** DD-7 *removed* "Made so far / % complete / vs plan" rather than sourcing them, because they were derived from unsaved form state ("visibly absent beats confidently wrong"). The live kitchen app already has this per dish as a **"sudah N"** badge — port that model | Café·Log | H1 visibility | +1–2 |
> | **F10** | **Extend the as-of/provenance stamp** (B-iii, PR #96) to Home's feed and Café·Plan's totals — both silently omit it | Home, Café·Plan | H1 | +1–2 |
>
> **F11 — test debt (`X-10`, owner decision pending).** **129 tests red across 45 files**, deferred
> deliberately by `OD-V4-4` while the design moved. This now overrides `OD-REDESIGN-88`
> ("no untested prod code, ever"; red-first still required for bug fixes). Three real correctness
> bugs were fixed this session with **no regression guard**: DD-7 (band reported typed-as-logged),
> DD-10 (attention count summed a `.slice(0,6)` display array), DD-18 (the variance-note field
> unmounted mid-typing, and Submit then unblocked on a one-character note). Recommendation on record:
> allow a failing-repro test for **correctness bugs only**, keep the deferral for everything
> presentational.
>
> **Also open, non-feature:** the contradiction register in `docs/v4-inheritance.md` carries
> **X-4** (FR-022 demands a written note whenever qty ≠ plan on a fast capture field) and **X-11**
> (the Director conflated "Events" with "Signals"; `OD-V4-2` was ratified on a false premise —
> recommend reverting the root label). Both need an owner call.
> *(Both resolved 2026-07-28: X-11 reverted in `8cf4976`; X-4 answered by `OD-V4-6` — FR-022 stands.
> The register is now empty of open items.)*

> # W1–W13 — FEATURES TO BUILD (the design-phase wanted list)
>
> **Owner ask (2026-07-28):** *"the feature I'm highlighting are features I want to add… the whole
> app is not live yet, still in design phase. The mockups had added these previously but the current
> implementation doesn't have them. Make sure these discussions are captured in a backlog of features
> needed to be added, and not get lost."*
>
> **What this list is.** Every feature that was designed, mocked up or decided across the eras
> (pre-E7 → E7 → v3 → v4) and is **not in the current implementation**. These are *wanted*, not
> defects and not disposals. Nothing here is "shipped and broken" — the app has never gone live.
>
> **Ordering is by user value, not by effort.** "Current state" was verified against **code, not
> docs** — routes, all 85 migrations, and `grep` over `mos-app/src` on `v4-redesign` @ `1e459b0` —
> because the era docs drift and the mockups outran the build.
>
> **Cross-refs:** `S#` = the silent-loss table in `docs/plans/2026-07-23-feature-parity-ledger.md` §2;
> `P-##` = `docs/reference/provenance/owner-directives-index.md`. Where one exists, it holds the
> longer history — this list is the single place that says **what still needs building**.
>
> ### The mockup→build loss lineage (six documents, read in this order)
>
> The owner asked (2026-07-28) whether a document already tracks what the mockups had and the build
> lost. **Six do**, written over eleven days, and the last two **disagree** — see the reconciliation
> below before trusting either.
>
> | Doc | Date | What it answers |
> |---|---|---|
> | `design-mockups/redesign-mockups-2026-07/CONVERGENCE-AUDIT.md` | 07-13 | Which of E7's 13 proposed changes were accepted vs overridden |
> | `design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` | 07-14 | Which mockup **owns** which surface + the 11 explicit "do NOT port" overrides |
> | `reviews/final-mockup-fidelity-audit-2026-07-18.md` | 07-18 | **The cross-version sweep** — every surface rendered in all five generations (G0 full-redesign → G1 e7 per-surface → G2 e7-prototype → G3 convergence-flows → G4 built app), each earlier good answer the build lacks classified LOST-GOOD / SUPERSEDED / EVOLVED-BETTER, build-only inventions flagged TWIST-IN-FLIGHT. **Verdict: MINOR-LOSSES, 3 lost-good** |
> | `reviews/final-intent-fidelity-audit-2026-07-18.md` | 07-18 | Build vs **owner intent** (not vs spec), adversarial |
> | `reference/provenance/owner-directives-index.md` | 07-19 | The composite oracle — P-01…P-39, per-directive status. Supersedes "match e7" as the scoring target |
> | `plans/2026-07-23-feature-parity-ledger.md` | 07-23 | **The silent-loss table** — S1–S7, features present in a prior generation, absent from the build, *with no OD and no backlog entry*. **Verdict: 7 losses, 5 of them never captured anywhere** |
>
> **Reconciliation — the 07-18 audit under-reported, and W5 is the proof.** It graded Tasks
> **"FAITHFUL — Table/Board/Calendar …"**. Verified in code on `v4-redesign` @ `1e459b0`: only
> `TaskTablePresentation` and `TaskCardPresentation` exist, and `task-collection-adapter.tsx:230`
> states outright *"There is no disabled Board/Calendar presentation."* No Board, Kanban, Calendar or
> Timeline component exists anywhere in `mos-app/src`. The 07-23 ledger (S1) is correct and the
> 07-18 audit is wrong on this row.
>
> **Why it missed it:** the 07-18 audit compared **surfaces as rendered**, so a view that was never
> built produced no screenshot to differ from — absence read as fidelity. The 07-23 ledger enumerated
> **capabilities** instead, and found seven. *Rendering-based audits cannot see a missing capability;
> only an enumeration can.* Treat the ledger + this W-list as authoritative on "what is missing", and
> the 07-18 audit as authoritative on "what drifted" (its LG-1/2/3 and TIF-1/2/3 remain valid).
>
> **Fossil found while verifying:** `tasks.tab.board` = `'Board'` / `'Papan'` exists in **both**
> locale catalogs (`messages.ts:133`, `:1463`) with **zero consumers** — left over from when Board
> was planned. Delete it, or keep it as W5's ready-made label.
>
> ### Owner-named 2026-07-28
>
> | # | Feature | What it gives the user | Where it was designed | Current state |
> |---|---|---|---|---|
> | **W1** | **Events calendar** | Outlet events — cuppings, workshops, bookings — as a real calendar: what's happening, where, when, who's running it. The Events rail root exists *for* this | `OD-REDESIGN-57(iii)` promoted Events to a rail root; `docs/specs/events-stub.spec.md` §1 names "a real calendar surface" as the intended collection | **Nothing but a shell.** `/events` renders `PageFamilyFrame` + a permanent `EmptyState`. The spec put schema, RLS and any data fetch explicitly out of scope. **Needs: `mos.events` schema + RLS → DAL → calendar view renderer.** The stub was built to prove this exact extension path — collection + view renderer + feed posts, no shell change |
> | **W2** | **Deputy composes a widget into the workspace** | Ask the Deputy a question, get a widget back, and **keep** it — pinned to Home or a workspace — instead of losing it when the transcript scrolls | ADR-0017 **D5** (declarative artifacts; `user_views` as an ordinary tenant row); prototype F028; e7-099/100/101/102. Headline `OD-REDESIGN-9/24/32` | **Half-built, and the half that exists is the hard half.** `mos.user_views` is a real table (migration `20260705000001` — `spec jsonb`, private/shared_team scope) with a working DAL. But **zero references to `user_views` anywhere under `lib/agent/` or `components/assistant/`** — the Deputy can render a widget and cannot save one. Reachable only behind dev-only `SHOW_USER_VIEWS` (`DevViewsPage`). **S4/S5** |
> | **W3** | **Composable Home canvas** | Arrange your own Home from widgets you're authorized to see — the manager's Home and the barista's Home stop being the same page | `OD-REDESIGN-17/25/26`; e7-025/102; prototype F019 | Home is a fixed attention/personal stream (`home-stream.tsx`); the only personal control is an order toggle. **W2 is its prerequisite** — the canvas is what W2's widgets land on. **S5** |
> | **W4** | **Shift scheduling / rostering** | Who is on shift, right now and this week. Feeds "your shift today" on the contributor Home, and completes the task-provenance line **"PIC: Ayu — via Barista *on shift* (Café HQ)"** | `OD-5`; prototype F093; e7. Owner-flagged NEAR-TERM: *"manual today, needed sooner than later"*. Demoed verbatim in the F2 café walkthrough (**P-09**) | **`job_function` and `shift` appear in zero of 85 migrations and zero non-test app files.** Occurrence→Task spawn and job-function binding did ship (ADR-0051, `mos_spawn_process_run`), so the Task knows the *role* — it renders "via Barista" and **silently drops "on shift"** because no roster exists to ask |
>
> ### Also designed, also missing — same era, same status
>
> | # | Feature | What it gives the user | Where it was designed | Current state |
> |---|---|---|---|---|
> | **W5** | **Multi-view database — Board/Kanban, then Timeline** | The same records as a status board or a date rail, not only a table. The signature "multi-view database" promise | `OD-REDESIGN-2/7/8` (locked); e7-033/034 had both live | `task-collection-adapter.tsx` presentation is `'table' \| 'card'`; its own line 230 reads *"There is no disabled Board/Calendar presentation."* **S1** |
> | **W6** | **Standards library + quality loop** | The "prove it was done right" spine: typed Standard steps → live pass/fail Checks → evidence required on fail → auto-raised Exception → correction Task → audit trail | `OD-REDESIGN-4/30/31` (locked); prototype F068/094/095; e7-066/067 | No Standard, Check or Exception record anywhere in `pages/` or `components/`. Needs the deferred typed-Standard schema ADR first. **S2** — the governance value proposition of the whole redesign |
> | **W7** | **Process designer + Process Runs** | Author a recurring workflow once; each occurrence spawns its Tasks and keeps run-level completion + history | `OD-REDESIGN-11/12/13/58` (locked); prototype F090; e7-060/065 | **The surfacing half shipped** — occurrence roll-up + due-runs list + assign-pending. The **definition half is absent**: no designer, no Run record, no Standard binding. Schema ADR owed since "buildout step 6". **S3** |
> | **W8** | **Agentic Deputy — the remaining five gaps** | A Deputy that *acts*: navigates you to a record, reaches `@`-people inline from any text box, makes reversible writes in context, keeps a thread per surface | `OD-REDESIGN-9/24/32` — the stated "agent-native" identity of the app | `AssistantPanel.tsx` has transcript, approval, rating and record-seed but **no navigate tool, no inline `@`, no in-context write**. Context-*aware*, not context-*acting*. **S4** (W2 is the widget-composition gap from the same set) |
> | **W9** | **Structured content editor + typed embeds** | Write a real document — a Standard, a brief, a process note — with `/` slash blocks and live typed embeds instead of a plain description field | ADR-0052 (**Proposed**, blocked at an owner storage gate); `OD-16`; prototype F050 | `authored_content` and its revision tables are **absent from every migration**. Tracked as backlog **Issue 10** (:253) |
> | **W10** | **Admin governance matrix** | See and set who can actually do what: the effective person × capability matrix, preview-as-person, role defaults, transfer-person, org/BU/Team config | `OD-REDESIGN-28/52`; e7-134..139 | `components/admin/` is people list + role editor + login management only. **S6** |
> | **W11** | **Cascade ladder view** | One screen showing Objective → Project/Process → Task end to end, with Mine/All and a workload caption | baseline BL-052 (this one was **built once and removed**) | `/work/cascade` now redirects to `/work/tasks` (`router.tsx:130`). Up/down-trace survives inside the catalogs. **S7** — lowest stakes of the set; may be genuinely absorbed |
> | **W12** | **Roastery Activity module** | The roastery's own operating surface — B2B sales orders, QC/cupping | ADR-0024 (boundary accepted); mockup `roastery.html` | No code. Explicitly **step 6 of 6** in ADR-0019 D14, so it is last by design, not by neglect |
> | **W13** | **Ecommerce Activity module** | Same, for the ecommerce line | ADR-0019 D14 Activity roll-in | No code. Pairs with W12 |
>
> ### Sequencing note (Director)
>
> Three of these unlock the others and should not be picked by appetite:
> **W2 before W3** (the canvas needs something to place on it). **W6 before/with W7** (a Process
> without Standards has nothing to check, and the two share one schema conversation). **W1, W12 and
> W13 are module work** — self-contained, parallelizable, and each needs its own schema + RLS slice.
>
> **Not on this list, deliberately.** The parity ledger's "mockup-only fiction" set was demo scaffolding
> that never described a real feature — persona/impersonation switcher, 4-button role-switch preview,
> drag-widgets-to-reorder chips, the Deputy-composed AR-aging/plan-adherence demo widgets (fixtures),
> the IA comparison-matrix page, the text-size S/M/L/XL picker, the settings rail stub. Retired
> cadence surfaces (Weekly Updates, Daily Log, My Week) are covered by `OD-REDESIGN-33/48` and are
> superseded, not missing.

> **NEXT SESSION:** read `docs/redesign-decision-index.md` first for product direction, then
> `docs/platform-workstream-status.md` only for legacy implementation and infrastructure facts.
> `docs/ui-revamp-status.md` is the older pre-kitchen UI-revamp handoff (2026-06-19 state);
> `docs/STATUS.md` is the older pre-2026-06-19 MVP status — both kept for history.
>
> **2026-07-06 — P3a Inbox/replay train + P2.1 aggregate RPC are built, pushed, and still CI-gated.**
> PR #88 (`feat/port-p3a-replay-inbox`) and PR #89 (`feat/p2.1-db-side-aggregate`, stacked on #88)
> are open against `dev`, not merged. The full P3a review battery is recorded at
> `docs/reviews/feat-port-p3a-replay-inbox.md`; P2.1 at `docs/reviews/feat-p2.1-db-side-aggregate.md`.
> The first CI red was the missing `mos.create_notification` EXECUTE revoke; that fix was pushed.
> GitHub then exposed additional verify/e2e reds. Current local CI-fix pass: non-blocking task comments
> load in `TaskSurface`, stale async task loads are ignored, Home-v1 e2e assertions are aligned to the live
> `Home` index route, Sales dashboard e2e KPI locators are scoped to `.sdp-kpi-grid`, and the recovery e2e
> now rotates to a password satisfying `lower_upper_letters_digits` while weak-password errors stay on the
> set-password form; full-coverage-only timeouts were stabilized without changing their behavioral oracles.
> Local P3a-base gates are green (2213 Vitest coverage, 437 pgTAP, targeted Playwright 6 passed/1 skipped,
> typecheck, lint, build). P2.1 adds the aggregate RPC pgTAP files and should rerun at 449 pgTAP after
> re-stack. Treat GitHub CI as **not green** until this fix is pushed/re-stacked and GitHub checks rerun
> green.
> Canonical state: `docs/platform-workstream-status.md`; task detail:
> `docs/plans/2026-07-06-port-p3-automations-inbox.md`.
>
> **2026-07-04 EOD — FOUR SLICES SHIPPED TO `dev` (full batteries in `docs/reviews/`); P2 in flight:**
> Home v1 + margin read-model (§7a interim contract) · helper dedup · **port P1 substrate**
> (viewspec + user_views + /dev/views harness, flags off) · **BU taxonomy remap** (6 team BUs,
> stable codes). P2 deputy train building on `feat/port-p2-panel-runtime` (edge functions done +
> deno-check clean; panel UI/harness/firewall via GLM). See
> `docs/platform-workstream-status.md` §Current focus for the full state + owner-gated queue
> (dev→main offer · staging db push ×3 · ESB PIC question).
>
> **2026-07-04 — IA NORTH-STAR + can() ACCEPTED (ADR-0019 / ADR-0020, OD-IA-1/2):** five destinations
> (**Home / Work / Operate / Plan / Inbox**; activity is a dimension, never a nav root); taxonomy
> **BU=team / Activity=workstream / Revenue stream=money lens** (old BU seed rows need re-mapping —
> tracked below); My Week → a *panel* on Home; MOS owns **settlement grain** for B2B AR + retail pending
> bills (ESB write-back gated on an API spike — inventory `gordi-esb-bak` first); reference data = ESB
> feeds / MOS owns; vendored `doc-editor` + `data-grid` kit primitives (AGPL out); phone-first + bottom
> tabs binding; bilingual en/id string catalog from the Home slice on; **backup/restore drill gates the
> AR bridge**; **ESB spike RESULT (2026-07-04): settlement write-back LIKELY-NOT → reconciliation
> branch** (`docs/reference/esb-settlement-api-spike.md`; owner action: ask ESB PIC re undocumented
> endpoints); authorization moves to **`shared.can(capability)` + admin-editable roles** (new modules
> from day one, existing RLS opportunistic). **ORDER: Home v1 + `sales_margin_daily` → agent port
> (P1–P3; ESB spike parallel) → Work spine (→ live management-week validation) → AR/pending-bills
> bridge → Plan/reference data → activity roll-ins.** Full spines: `docs/adr/0019-ia-north-star.md`,
> `docs/adr/0020-capability-authorization.md`.
>
> **2026-07-02 — Issue 1 COMPLETE (kit born); reporting live on staging; all on `dev`, not `main`:**
> - **Sales dashboard SHIPPED to `dev`** — the value-first Issue-1 build that *births the primitive kit*:
>   5 registry-ready primitives (`KPITile`/`ChartFrame`/`DataTable`/`FreshnessLabel`/`CutToggle` in
>   `mos-app/src/components/dashboard/`), the reporting DAL (`src/lib/db/reporting.ts`), the
>   `SalesDashboardPage` (`/mos/sales`, finance/admin-gated). **Director render-verified** populated +
>   responsive + B2B/Roastery end-to-end; 1725 tests green. Spec `docs/specs/sales-dashboard.spec.md`;
>   design-plan `docs/plans/2026-07-02-sales-dashboard-design.md`.
> - **`reporting.sales_daily_revenue` LIVE on staging** (Supabase Cloud `hvnwcsmkdeqmgqlbwflm`) —
>   snapshot-fed from the OLAP warehouse @03:30 JKT (day × channel × branch → revenue + txns). Spec
>   `docs/specs/reporting-sales-snapshot.spec.md`, plan `docs/plans/2026-07-01-reporting-sales-snapshot.md`,
>   runbook `docs/reference/warehouse-online.md`.
> - **ADR-0017 D3 extension + OD-AN-2 (2026-07-02):** `reporting` is a growing SET of bounded curated
>   read-models; drill-down is mostly a query-DSL problem not new-data; two-tier drill-down (deputy reads
>   curated read-models, server analyst agent explores raw OLAP + promotes); bounded curation ≠ wholesale
>   duplication. **MOS = analysis surface, OLAP = analysis engine.**
> - Node pinned to **22** via `mos-app/.nvmrc` (Vite needs 20.19+/22.12+).
> - **NEXT (three parallel, non-colliding):** (1) **`sales_margin_daily`** read-model — margin/COGS depth
>   from the warehouse `v_daily_cogs_comparison` (the "shallow data" answer + cashflow lens); (2) **font
>   regression fix** (see Debt — `.tabular`→SF Mono violates DESIGN.md — DONE 2026-07-02); (3) **Issue 2**
>   — extract the kit into the primitive **registry** (ADR-0017 §4a). Then Issue 3 (query-DSL/compiler).
>   **⚠ 2026-07-04 re-scope (ADR-0018): Issues 2–3 are no longer grown from scratch — the registry + DSL
>   arrive by port from PMO as the ADR-0018 P1 train (substrate, shippable with zero agent); see the
>   2026-07-04 banner above.** Memory `agent-native-ui-program`.
>
> **2026-06-30 — TWO NEW TRACKS (decisions on `dev`, not yet `main`):**
> - **Agent-native / user-composed UI — ADR-0017 ACCEPTED** (merged to new `dev` branch; +ADR-0010
>   2026-06-30 amendment; CONTEXT.md glossary; OD-AN-1). Deputy/RLS dual-plane model; **value-first build**
>   (Issue 1 = mobile-first ops dashboard that births the primitive kit → registry → DSL/compiler →
>   `user_views`+renderer → manual builder → agent sidecar behind a MOS spike). **NEXT = `feature-forge`
>   spec for Issue 1.** Full track in `docs/platform-workstream-status.md` §Current focus; memory
>   `agent-native-ui-program`.
> - **OLAP ESB warehouse ONLINE on the Tencent VPS** (PG17, loopback, self-sustaining op-native sync @3:05
>   JKT, monitored). Runbook + open owner-actions: **`docs/reference/warehouse-online.md`**. **NEXT on this
>   track = the `reporting` migration + warehouse→Supabase snapshot job** (feeds the sales dashboard).
>   Owner-actions pending: CloudMonitor webhook exposure + its 🔴 auth fix, a git deploy key.
>
> **Current main (2026-06-25):** kitchen Module shipped (#45/#41/#43/#62/#64/#65/#66); UI-revamp on main;
> **Strategy→Execution cascade FIRST SLICE SHIPPED** — PR #69 (task-centric: `objective_id`/`work_line_id`
> on `mos.tasks` + `mos.objectives`/`mos.work_lines` lookups + group-by-work-line + workload caption +
> pickers) and follow-ups PR #70 (app-shell mobile-overflow fix, ADR-0015 naming lock, curated e2e AC-230,
> machine **pre-merge review gate** `scripts/pre-merge-check.sh`). Memory: `cascade-first-slice-state`.
>
> **Staging is LIVE (2026-06-25):** Supabase Cloud + Cloudflare Pages at **https://gordi-mos.pages.dev/mos/**
> (testing only; **prod stays self-hosted**, ADR-0010). Setup + 6 gotchas in `docs/environments.md` (staging
> row) + memory `staging-deploy-state`. Cloud ref `hvnwcsmkdeqmgqlbwflm` (Singapore); DB connection string +
> Teable PAT in op (vault `AS`).
>
> **DONE (2026-06-26..29):**
> - **Kitchen data migration LOADED to staging** — 48 wip / 521 logs / 524 plans into `ops` on Supabase
>   Cloud, `posted_to_esb`/`esb_doc_num`/`posted_at` carried verbatim (no ESB re-POST), batch_id nulled,
>   fidelity-verified. **3 staff logins WIRED:** Riri=`riri@gordi.id` (ops_lead), Ibnu/Ansori=
>   `<name>@ops.gordi.local` (member) — temp pw, owner rotates. Synthetic-email domain `@ops.gordi.local`
>   (ADR-0011 D2 amended). Memory `kitchen-data-migration`.
> - **ESB push worker BUILT + SHIPPED** — extended `gordi-kitchen-app` (not a new service) to drain the MOS
>   outbox; gordi-kitchen-app PRs #1/#2/#3 + gordi-mos #76 (service_role grants) / #77 (docs). GOO validated
>   live. **Outstanding = deploy + flip on ris-dev** (owner-gated). `docs/platform-workstream-status.md` §3 +
>   `docs/reference/esb-goo-integration.md`; cross-repo ledger `docs/reviews/kitchen-app-worker-prs.md`.
> - **Task-drawer collapse-control fix** merged (PR #78).
>
> **READY TO MERGE — admin user management (`feat/admin-user-mgmt`, PR #80):**
> - `/admin/people` admin-only screen (list + search/status-filter, create person +optional login, reset pw,
>   disable/enable, grant/revoke roles, archive). Memory `admin-user-mgmt-state`.
> - **ADR-0016**: 3 admin-gated `SECURITY DEFINER` RPCs = interim STAGING provisioning; thin FastAPI backend
>   (ADR-0010 D6) stays PROD authority. Spec + plans under `docs/`.
> - **Review battery Round-2 = all cleared** (design PASS rendered-live; spec/CQ/security FIX-THEN-SHIP; H-1/M-1
>   security fixed, pgTAP `56`); `pre-merge-check.sh` exit 0; 1321 tests. Ledger `docs/reviews/feat-admin-user-mgmt.md`.
> - **NEXT: owner merge #80 → `supabase db push` to staging → rebase the stacked `feat/cascade-catalog` onto
>   main and merge.** Prod-deferred (ADR-0016): email validation, temp-pw entropy, clipboard auto-clear → thin backend.
>
> **READY, stacked behind admin-mgmt — cascade catalog (`feat/cascade-catalog`, worktree):** Objectives(admin) +
>   Projects&Processes(ops_lead/admin) management surfaces; review battery PASS, `pre-merge-check` exit 0; ships
>   after admin-mgmt lands (rebase onto main). Memory `cascade-catalog-state`.
>
> **Prod provisioning RESOLVED (2026-06-29, ADR-0016 amendment + D11 audit):** the thin FastAPI backend
>   (ADR-0010 D6) is **RETIRED** — both its concerns left the plan (ESB → `gordi-kitchen-app`; provisioning →
>   the `SECURITY DEFINER` RPCs). D11 security audit returned **CLEAR FOR PROD** (single-org). Prod shape =
>   SPA + Supabase (data/auth/RLS + provisioning RPCs), no bespoke MOS backend tier.
> **Follow-ups (open):**
>   - **B2B blocker (Medium, D11 audit):** `admin_create_login` cross-org duplicate-email → raw `23505`
>     (opaque error + minor cross-tenant existence oracle). Fix (clean error, no cross-org echo + stop
>     forwarding raw PG text in `admin-users.ts`) **before turning on multi-org**; unexercised single-org.
>   - **Advisory (D11):** GoTrue-upgrade smoke test in the prod runbook (provision→sign-in→reset→disable→enable);
>     `for update` on the create-login person read.
>   - Minor: status-pill radius 6px vs full (DESIGN.md). (`--radius-lg` 12px regression DONE #82; e2e-auth #57 DONE.)
>
> **In flight (2026-06-26) — two STACKED feature branches (NOT yet on main), built concurrently:**
> 1. **`feat/admin-user-mgmt`** (concurrent agent) — admin user provisioning: People admin page, login
>    create/reset/enable, role grant/revoke, `AdminRoute` guard, `ADMIN_SECTIONS` nav, interim
>    provisioning RPCs (ADR-0016). Committed on its branch in the **main checkout**; review/merge owned
>    by that workstream.
> 2. **`feat/cascade-catalog`** (this workstream — git worktree `../gordi-mos-cascade`) — in-app
>    management of **Objectives** (admin) + **Projects & Processes** (ops_lead/admin) under Workspace:
>    add/rename/archive, RLS tighten (objectives→admin-only, migration `20260626000003`), Work-line→
>    **Project/Process** UI relabel (ADR-0015), shared `CatalogManager`, `RequireAccessRole` guard.
>    **BUILT + full review battery PASS** (`docs/reviews/feat-cascade-catalog.md`, `pre-merge-check.sh`
>    green); spec `docs/specs/cascade-catalog.spec.md`, decision **OD-C-2**, plan
>    `docs/plans/2026-06-26-cascade-catalog.md`. Memory: `cascade-catalog-state`.
>    ⚠️ **Topology:** `feat/cascade-catalog` is **stacked on an OLDER commit of `feat/admin-user-mgmt`
>    (`7445396`)**, reusing its role-guard + nav-section pattern. **Merge order: admin-user-mgmt FIRST,
>    then rebase `feat/cascade-catalog` onto updated main and merge.** Deploy prereq: apply migration
>    `20260626000003`. Non-blocking follow-up: collapse `AdminRoute` into `RequireAccessRole` after both land.
>
> Git-hygiene: NEVER `git push origin HEAD:main` from a feature branch; rebase onto latest main
> before merging; feature code = branch → PR → merge; demo-login orphan → `supabase db reset`
> relinks (or PR #57 heals it permanently once merged). Render auth-gated pages via vite-on-worktree-port +
> the Director-demo-login persona before claiming UI done (code review misses visual defects).

## ✅ Phase 0 — frontend mockups (DONE)
- [x] **P0-1 — IA proposals.** `design-architect` → 2–3 competing static HTML shells for `/mos`
  (`docs/design-mockups/proposal-IA-<n>-<slug>.html`). Resolves WALL-1 into concrete options.
- [x] **P0-2 — Key-screen mockups.** My Tasks list · task detail · weekly update write + manager review ·
  daily ops feed. `docs/design-mockups/mock-<screen>.html` built; superseded by the shipped app (Phase 2).
- [x] **P0-3 — Owner IA pick.** DONE → OD-P0-6 (IA-8 balanced My Week) after two density redlines
  (OD-P0-7).

## ✅ Phase 1 — foundation (DONE)
- [x] P1-1 scaffold `mos-app/` + CI gates + Playwright harness — DONE, PR #1.
- [x] P1-2 Supabase foundation — DONE, PR #2: 6 migrations, 10 pgTAP / 41 assertions, ADR-0001.
- [x] P1-3 Auth — DONE, PR #3: login (password+magic link), session, viewer/isManager, guards,
  orphan fail-closed, recovery flow. 59 unit · 7 e2e · 47 pgTAP.
- [x] P1-4 App shell — DONE, PR #4: IA-8 rail/header/sections, My Week, mobile drawer, manager team
  module. 128 unit · 6 e2e.

## Security-audit deferrals (from P1-2 audit, 2026-06-11 — neither blocks ship)
- **L4:** no acyclicity constraint on `shared.roles.reports_to_role_id` → add CHECK/trigger when
  role-editing UI ships (Phase 2+).
- **L5 (extended by P1-3 audit):** P3-1 MUST: disable open signup both keys + live 422 probe ·
  password policy (≥8, mixed) · session `timebox` ~24h + `inactivity_timeout` · tight CSP · prod
  **Resend** SMTP (OD-P1-11). Password login works without SMTP.

## ✅ Phase 2 — first slice (DONE; P2-4 superseded by kitchen Module — see Phase 3)
- [x] P2-1 tasks + ownership + lightweight RACI — COMPLETE (PRs #5/#6/#7).
- [x] P2-2 weekly updates (write + manager review) — COMPLETE (PRs #8/#9/#10).
- [x] P2-3 Daily Log (daily ops feed, manual entry) — COMPLETE (PRs #11/#12).
- [~~P2-4 kitchen → ops mirror~~] **Superseded** by full kitchen Module in Phase 3 (ADR-0010/12,
  OD-P4). The ops Module is now built as a first-class MOS Module, not a mirror.

## ✅ Phase 3 — shipped (2026-06-13 → 21, all on `main`)

### Platform-foundation workstream (OD-P4, ADR-0010/11/12) — SHIPPED 2026-06-19..21
- [x] **ADRs + docs** — ADR-0010 (platform topology), ADR-0011 (auth/RBAC), ADR-0012 (ESB outbox),
  `docs/platform-workstream-status.md` (PRs #33/#36/#38).
- [x] **Kitchen Module spec** — `docs/specs/kitchen-module.spec.md` (PR #32).
- [x] **Access-role layer** — `shared.person_access_roles` table, JWT-claim hook, viewer integration
  (PRs #41/#43). Fixed-role set: admin · ops_lead · finance · member (+ derived `manager`).
- [x] **Kitchen Module DB substrate** — typed `ops.*` tables (`ops.wip_items`, `ops.kitchen_plans`,
  `ops.kitchen_logs`, `ops.kitchen_stock`), `integrations.esb_push` outbox, approval RPC, RLS,
  14 migrations (PR #45). Daily-Log mirror **deferred/removed** (migration `_014`; re-add when Daily
  Log module ships). Reject provenance, stock-for-date RPC included.
- [x] **Kitchen Module UI — all 5 screens** (PR #62):
  - `/mos/kitchen/log` — S1 daily log capture (WIP item stepper, action-type segmented control)
  - `/mos/kitchen/plan` — S2 plan editor (ops_lead/admin) + pesanan 14-day read-only view (member)
  - `/mos/kitchen/review` — S3 review/approve queue (ops_lead/admin)
  - `/mos/kitchen/stock` — S4 stock view (all authed members, read-only)
  - `/mos/kitchen/pushes` — S5 ESB push outbox monitor (ops_lead/admin)
- [x] **Kitchen sidebar nav** — role-aware Kitchen group in RailNav (PR #64).
- [x] **Kitchen dev seed** — 32 real Gordi WIP items + sample plan (PR #65).
- [x] **log_date bug fix** — plan/log queries used wrong column name `date` → `log_date` (PR #66).

  **Parity directive (OD-K-1, 2026-06-21):** kitchen = functional parity with the OLD app
  (`gordi-kitchen-app`) + better UI. NO new logic. Scope: logging + daily plan + review/approve +
  stock auto-compute + ESB push outbox + pesanan 14-day view. NOT in scope: receiving/GR,
  stock-opname, ESB-inventory reconciliation, multi-plan versioning, opening-balance seed, reports.
  Transfer-over → availability rejects (not caps); bulk-approve approves all Submitted.

### UI-revamp workstream (OD-P4/P5) — SHIPPED 2026-06-19..21
- [x] **Structural conventions** — `@/` alias (#30), no-hardcoded-colors (#31), named-exports (#34),
  kebab-case filenames (#40), drop Inter font dep (#55), drop components/ui barrel (#56).
- [x] **UI revamp PRs #1–6** — brand-left TopBar + nav-only RailNav (#42) · record table craft +
  TasksWorkspace decomposition (#47) · two-column hybrid record page (#49) · My-tasks card wired
  to real R/A data (#50) · ⌘K command palette + task-search (#51) · states + dark-mode AA pass (#52).
- [x] **Fidelity pass** — DM Sans + Tasks chrome + group-toggle (#53), +2px global type scale (#54).

### Earlier Phase 3 items (2026-06-13..16) — already on `main`
- [x] Dev demo login — PR #13.
- [x] Agentic workflow sync (4-lens, `docs/jtbd.md`, model-discipline).
- [x] Tasks split-view redesign — PRs #15–#18 (ADR-0007).
- [x] CI-green fix — PR #16.
- [x] Tasks DB-view redesign — PR #19 (ADR-0008, OD-P3-6/7/8).

## ⏳ Kitchen UI redesign — branch `feat/kitchen-log-redesign` (NOT merged; awaiting owner sign-off)
**OD-K-5** (2026-06-21; scope expanded 2026-06-22). Owner rejected the shipped stepper kitchen UI
(single-column 32-row steppers, no density, One-Blue violation). Phase-0 divergence → 3 mockups
(`docs/design-mockups/kitchen/`) → owner pick **A dense data-table + C KPI strip (desktop) + B floor-fast
cards (phone)**, one responsive screen via the `useIsDesktop()` 768px reflow + full-bleed
`PageFrame variant="data"`. Scope expanded to **all 4 functional screens** (Log · Plan · Pesanan ·
Stock · Review); the ESB-pushes page is untouched.
- Reusable pieces in `mos-app/src/components/kitchen/`: `kitchen-table.css` (shared dense grammar),
  `KitchenToolbar`, `KitchenKpiStrip` + per-screen KPI selectors, `qty-cell`, log/stock/pesanan/review
  table+cards, `kitchen-status`, `kitchen-group-header`.
- **PARITY HELD:** data layer untouched except a read-only `category` added to 2 SELECTs; submit payload
  byte-identical; FR-022/023 gates + Review approve/reject/bulk preserved.
- Log fixes landed: 3 One-Blue color defects, F1 sticky Submit bar (shell `h-screen`), F2 seed
  categories, F3 disable-submit-on-unresolved-note; **app-wide phone horizontal overflow** fixed
  (top-bar collapse + grid `minmax(0,1fr)`); action-type segmented control made clearly interactive.
- **Gates green** (1347 unit · typecheck · lint). Reviews: Log got the full cross-family battery; Plan/
  Stock/Review built by gpt-5.4 (z.ai 5h-limit fallback) + Director vision/parity-reviewed.
- Plans: `docs/plans/2026-06-21-kitchen-log-redesign.md` + `docs/plans/2026-06-22-kitchen-screens-redesign.md`.
- [ ] **NEXT (top gate):** owner visual sign-off + color redlines (built defaults: over=amber, under=red)
  → Director rebases + merges to main → **close PR #67 as superseded** (it edits the same status docs).

## ▶ NOW — Outstanding (as of 2026-06-22)

### 1. Merge the kitchen UI redesign (above) — top gate
Owner visual sign-off on `feat/kitchen-log-redesign` → Director merge. Gates all downstream kitchen
go-live work (e2e, deploy) and unblocks closing PR #67.

### 2. PR #57 — e2e auth fix (open, non-blocking for development)
PMO-style auth model: e2e logs in AS the dev personas; `global-setup` is additive/idempotent (heals
dev login instead of stealing rows). Dedicated e2e-only users for destructive cases (orphan, recovery).
**Merge when green** — heals the recurring demo-login orphan permanently. Branch: `fix/e2e-dev-login-isolation`.

### 3. Kitchen e2e / qa-acceptance layer (MISSING — must be built)
There are NO curated e2e journeys for the kitchen Module. The `date`/`log_date` SPA↔DB bug (fixed in
PR #66) slipped through because unit tests mock Supabase — a live-query bug is invisible to unit tests.
**Lesson: verify-live is required for any DB-column-name or RPC-contract change.** Kitchen needs:
- E2e spec covering the core S1→S3 journey (log → review → approve).
- Any future kitchen DB column rename / RPC change must be verified against a running stack, not just
  unit tests.

### 4. ESB push worker (not built yet)
Port the old `esb_poller`/`esb_client` from `gordi-kitchen-app`; reconcile bulk-approve batch-grain.
The `integrations.esb_push` outbox + `ops.approve_kitchen_log` RPC are ready; the worker is missing.
GOO target = TEST DATA ONLY (untrusted env; spec FR-084, OD-K-3).

### 5. Production deploy (Phase 3.1, plan #33, owner-gated; schedule after the redesign merge)
Runbook: `docs/environments.md` (§Production deploy) + `supabase/README.md` (§Production email).
L5 hardening checklist (disable open signup + live 422 probe · password policy · session timebox ·
CSP · Resend SMTP). Open owner Qs: API hostname under CF Tunnel · secret-zero approach · R2/PostHog/
Healthchecks accounts. **Blocked on owner decision**.

### 6. Thin FastAPI backend + user provisioning
Hosts the outbox worker + user provisioning for kitchen members (prereq for kitchen go-live).

## ⏳ Tasks tidy-up + UI-convention re-converge (branch `fix/tasks-tidy-reconverge`, NOT merged)
Post-ship design review found `/tasks` drifted from its signed mockup. Two commits on the branch:
- `8699614` tidy-up → re-converge to `tasks-dbview-final.html`.
- `44e9ce1` conventions → view-tab strip REMOVED, chevron filter, grey selection, max-width:1280.
- Gates green. **NEXT:** owner verifies wide-width → merge → update spec (remove FR-121/AC-122).

## Doc & code debt (non-blocking)
- [x] **`.tabular` → SF Mono app-wide DESIGN.md violation — FIXED (2026-07-02).** Re-imported
  `@fontsource-variable/inter`, scoped to a new `--font-tabular` token used ONLY by `.tabular`
  (`mos-app/src/index.css`); body/UI stays DM Sans/Plus Jakarta. Regression guard added
  (`src/styles/css-var-wiring.test.ts`) asserting `.tabular` never references `--font-mono` again.
- [ ] **ADR-0007 Decision snippet uses pre-impl names** (`TasksSplitView`/`TaskSurface` children);
  as-built is `TasksLayout` + `TaskDrawer`(→`TaskSurface`). Add an "As-built" note.
- [ ] **`docs/environments.md` P3-1 section is a stub** — write the actual ris-dev deploy runbook.
- [x] **e2e dev-login fix** — PR #57 (PMO-style auth model, heals demo login permanently). Merge when green.
- [ ] **auth-recovery.spec.ts e2e flake** — intermittent mailpit timing under full-suite load.
  Stabilize (poll with retry, or isolate the recovery mailbox).
- **P2-1a / P2-2a quality deferrals** — pgTAP fixture extraction, Promise.all, db/client.ts
  wrapper — see old backlog entry; non-blocking.

## 🧱 THE WALL — open owner decisions
- ~~WALL-1~~ CLOSED → OD-P0-6.
- ~~WALL-2~~ CLOSED → OD-P0-4.
- ~~WALL-3~~ CLOSED → Kitchen Module built (OD-K-1..4). ESB worker still needed.
- ~~WALL-4~~ CLOSED → Kitchen uses typed `ops.*` tables; Daily Log mirror deferred until Daily Log
  module ships. Director rec = generic typed events validated by parity build.

## Polish / follow-ups (non-blocking)
- UserChip menu: outside-click dismissal (Esc-only today).
- P2-2c — transitive/CEO-org-wide review roster (moot at Gordi scale today).
- P2-1c polish deferrals: create-form R/A native `<select>` · shared `<PersonField>` · generalized
  `ConfirmDialog` · `PersonPicker` empty state.
- P2-2b polish: shared `<TintPill>` · inline-style → co-located CSS · marker-picker up-flip.

## ✅ Pre-F hardening — DONE (2026-07-07, `feat/harden-round2`; task #17)
Source: `docs/reviews/mvp-readiness-audit-round2-2026-07-07.md`. Battery: `docs/reviews/feat-harden-round2.md`
(pgTAP 570 · unit 2345 · coverage 95.43% · typecheck/lint green). A1 task-tenancy guard · A2 comments
entity-guard · A3 error-boundary+telemetry · A5 atomic budget RPC + server-recompute (+ owning_bu_id guard)
· A6 coverage globs + CI plan-budget flag — all merged. **A4 was reframed:** null/bogus org already blocked
by `NOT NULL`+FK; the RLS exists-check was broken+redundant → reverted to documentation; the real fix
(per-run org scoping) is an F item ↓.
- **F (owner-gated) absorbs ops/infra:** ESB worker DEPLOY · edge rate-limit/quota · VAPID · prod auth config
  (`enable_signup`/`confirmations`) · request-id tracing · admin audit trail ·
  **A4 reporting_writer true org-scope:** snapshot job (`scripts/reporting_snapshot.py`) sets
  `set_config('app.reporting_org', <org>, false)` at session start; each `reporting.*` write policy becomes
  `with check (org_id = current_setting('app.reporting_org', true)::uuid)` — scopes the writer to one org
  per run (deferred: changes + redeploys the Python job).

## ▶ Pre-rollout UI polish (from the 2026-07-07 4-lens design review — gates flag-flip; task #19)
> **Pre-redesign (E6) — moot under the full redesign** (top banner; ADR-0025). Do not action these
> against the old app; the redesign build supersedes the flag-flip gate. Kept as review history.

Source: `docs/reviews/design-mvp-push-2026-07-07.md`. All on **dark** surfaces → don't block `dev`; gate the cohort flag-flip.
- **[BLOCKER] B-1/C-1** Follow-up row drills `/work/follow-ups/:id` but no route exists → 404. Add read-only detail route or pull the link.
- **[BLOCKER] D-2** Home AR + AP placeholder slots are dead-end (anchor A4). AR → `/work/follow-ups?filter=overdue`; AP → drill or explicit visibility-only.
- Polish: follow-up pill per-state dot+tint (A-1) · Button-ify follow-up/cascade controls + `seg` for Mine/All (A-2,A-3) · `SkeletonRows` on follow-ups+cascade (B-2) · transition success toast (B-3) · budget token drift `--border`/600 overline (A-4,A-5) · cascade inline-px→grid grammar (A-6) · localize follow-up enum via `t()` (D-7) · **A-8 [render-found] OPERATE rail label collision — "Daily Log" vs "Log", and "Plan" (kitchen) vs Plan destination; disambiguate kitchen items**.
- **[owner confirm] C-3** Plan gated finance/admin but jtbd assigns pricing pre-flight to Marketing/BU-head — confirm intended Plan visibility.
- **Render debt:** authenticated states were NOT rendered (local Supabase port/seed mismatch) — Director owes a per-persona render taste-check before sign-off (owner judges look-vs-mockup).
- Add 4 regression-invariant tests (settle-needs-evidence · no label-only Home slots · `/work/follow-ups/:id` resolves · BU-scope hides whole-co money) — see ledger.

## Near-term follow-ups (from the 2026-07-06 IA/product grill — see `docs/decisions.md` "Continued grill session 2")
- **Shift scheduling / rostering** — flagged NEAR-TERM by owner ("manual today, needed sooner than later").
  Contributor Home is capture-first w/ no roster in MVP but leaves a "your shift today" seam; this fills it.
- **Notification re-push trigger** — re-nudge untriaged/unread Inbox notifications after an interval (single
  PWA push is insufficient). Near-term; cheaper than any external channel.
- **External notification channel** — **Telegram or in-app group chat** (WhatsApp deprioritized — too tedious
  to integrate). Channel-adapter seam (P3a) takes either; doorbell-only, conversation stays on the entity.
- **Agent experience batch** (next agent work, before automations): **C2 safe-markdown + C3 typed-widget tables
  are DONE on `dev`** via `feat/ui-coherence` (`docs/adr/0049-safe-markdown-rendering.md`,
  `docs/adr/0045-typed-transcript-widgets.md`, ledger `docs/reviews/feat-ui-coherence.md`). Remaining:
  C4 layered prompt, then C1 automations (P3b). See `docs/specs/agent-capability-expansion.md`.

## Deferred (post-MVP — see roadmap "Post-MVP")
Objectives/outcomes · programs/processes · SWPs · RACI matrix UI · OKR cascade ·
roastery app · ESB write-back visibility · shared UI package extraction ·
agent attachments (C5) · agent credits/metering (C8) · roastery QC/cupping module ·
bank-feed auto-matching (AR recon) · certified-metric admin UI · WhatsApp channel.

- **Evidence-gated Blueprint hypothesis (OD-REDESIGN-29):** do not build a generic Template/Blueprint
  table or UI. Use code-owned Object Contracts plus Duplicate as Draft. Reconsider only when multiple
  independent Process/Standard definitions are repeatedly copied and manually synchronized across BUs;
  then grill version propagation, adoption, permissions, and explicit upgrades as a separate issue.
- **Clean data baseline (OD-REDESIGN-34, owner-gated):** eng-planner authors the dedicated architecture
  ADR + environment reset/rollback plan after the redesign Object Contracts are signed. Squash legacy
  business migrations into a small domain-ordered baseline; rebuild seeds/tests; revalidate ESB/reporting
  contracts and the snapshot job. No local/staging reset or deploy occurs merely from the grill decision.
- **Remote MCP transport (OD-REDESIGN-35, deferred):** baseline provides the protocol-neutral authorized,
  idempotent, audited domain-command/query seam. Before exposing MCP, eng-planner authors a dedicated
  current-spec OAuth/client-trust/threat-model ADR; prove per-person identity, audience validation,
  revocation, no token passthrough/service-role access, consequential-action approval, and full audit.

---

## Gotcha / workflow notes

### verify-live requirement (lesson from kitchen log_date bug, 2026-06-21)
The `date`/`log_date` SPA↔DB column-name mismatch (PR #66) slipped through unit tests because they
mock Supabase. A contract-level bug (wrong column name, wrong RPC signature) is invisible to mocked
unit tests — it surfaces only against a real running stack. **Rule: any DB-column-name reference or
RPC-call signature change must be verified against a live local stack, not just by unit tests.** A
curated e2e journey or a manual smoke-test is sufficient; the point is that real PostgREST rejects it
with a 400 while mocked calls pass silently.

### Demo-login orphan (recurring until PR #57 merged)
Every `npx playwright test` run clobbers the `*.dev` persona `user_id` links → "Your account isn't
set up yet." Quick fix: `supabase db reset` or `UPDATE shared.people p SET user_id=a.id FROM
auth.users a WHERE p.email=a.email AND p.email LIKE '%.dev@example.test';`. PR #57 fixes permanently.

### Structural conventions (enforced by lint)
No `../` imports (use `@/`), no hardcoded colors (use `--ds-*`), no default exports in `src`.

### ESB / GOO safety
GOO (Core API `stg7.esb.co.id/core-stg`; `stg-erp.esb.co.id` was the web UI — corrected 2026-06-26) =
TEST DATA ONLY. Never push real GKID product/BOM IDs to GOO. Real-data validation = single-WIP proof-push
on GKID at the owner-gated switch (OD-K-3/K-4). NB: `/assembly-actual` isn't validatable on GOO (standard-
costing tenant); Transfer path is. See `docs/reference/esb-goo-integration.md`.

- **Brand coherence: app vs Document System** (surfaced 2026-07-14, owner: leave for now) — the MOS app (Plus Jakarta + action-blue, E7-derived) and the client-facing Gordi Document System v2 (Arkhip + Lato, navy `#1B3A6B` + ember `#EE6C3D` + pine, built on Gordi's 2018 brand guideline) read as two different brands. Not de-reference (Gordi's own brand). Options if revisited: selective navy/ember alignment (small) or full 2018-brand re-skin (replaces E7, reshapes redesign). Doc system: `~/Library/CloudStorage/GoogleDrive-arief@gordi.id/My Drive/Consultation/Sami - Vila Mule/Gordi Document System/`.

- **Step 7 (Café retrofit) collision check** (flagged 2026-07-16 by a fresh-agent doc audit) — before
  starting step 7, verify the unmerged `feat/kitchen-log-redesign` branch (kitchen UI redesign, "built
  + verified, awaiting sign-off" per memory) does not collide with the Café retrofit, which builds on
  the existing kitchen module. Either merge/close it first or rebase step 7 onto it.
- **Gordi local Supabase is DOWN** (stopped after an OOM, 2026-07-15/16) — blocks the design half of the
  review gate (needs the live app to log in). Bring up with `supabase start` (api :44321) when RAM
  allows. The running docker containers are PMO-portal's, a different project — do not stop those.

- **▶ Cloud agent: redesign steps 4→11 autonomous** (OD-REDESIGN-67, 2026-07-16) — charter +
  environment/piping in `docs/plans/CLOUD-AGENT-HANDOFF.md`. Both review batteries stay mandatory per
  step; owner reviews ONCE after step 11. Open items it must surface, not decide: Q1 Signal-on-Home
  (provisional), Modules-in-rail window, and every `RATIFY-BEFORE-MERGE:` conservative default it takes
  on the step 4 & 6 schema/RLS work.
- **Cohesion program (standing)** — `docs/reviews/cohesion-debt-2026-07-19.md`: the mechanical sources of the owner's "several apps thrown together" (4 modals · 4 scrims · 4 close glyphs · 2 money formats · 3 empty-state grammars · 2 list grammars · z-index tiers). Sequenced 1–6; items 5–6 need owner calls. Paired with `docs/interaction-contract.md` (behavioural half).

- **More-drawer focus return (deferred, 2026-07-21):** both the TopBar hamburger and the
  BottomTabBar "More" open the same MobileDrawer, but only the hamburger registers a focus-return —
  close always focuses the hamburger regardless of the actual launcher (I2 gap, found by the hpm
  lane, out of its bounded scope). Fix = per-open launcher registration (pattern:
  AgentRuntimeContext opener capture) in app-shell/bottom-tab-bar/mobile-drawer + an I2 test.

- **Deputy phone coexistence (verified source/test, 2026-07-22):** when a record is mounted and
  side-by-side space is unavailable, Deputy may sit above the record; one Escape closes Deputy first.
  Independent verification at `3d6c39c` is 94/94 focused tests plus typecheck, ESLint/CSS lint, and
  diff-check. Remaining gates are controller-owned browser-Back/one-session stack semantics and
  rendered 1280/1024/390 geometry/focus/phone scroll containment. No new chrome rewrite is needed.

- **Pre-existing storybook red (deferred 2026-07-23):** `overlays.stories.tsx › CurrentRecordPanelShell`
  play-test — panel never receives the `complementary` role after the open click; fails identically on
  the baseline before the story-coverage lane. Diagnose the shell's role timing (story vs component).

- **Signal composer modal dirty-guard (deferred 2026-07-23, from the ix-guards lane):** the
  composer's own draft has no leave-guard on modal close (only the mention-picker Escape isolation
  shipped). A full composer leave-guard is a create-grammar concern — align with GAP-5/GAP-6 rulings
  when the owner takes the interaction decision sheet.

- **ESB push retry action (deferred 2026-07-23, kitchen census FLAG-B):** a retryable `failed`
  push (e.g. HTTP 502) offers no in-app recovery while `dead_letter` says "Escalate to platform".
  A row-level Retry needs the ESB worker's retry semantics — design it with the ESB worker
  workstream, not as a UI-only affordance.

- **Money drill-through to contributing records (deferred 2026-07-23, journey JQ-5):** the dip
  investigation dead-ends at the branch aggregate — J19 half-met. Needs read-model support for
  record-level attribution; scope with the reporting schema, Phase-4 feature work.

- **STAGING DEPLOY CHECKLIST — kitchen RLS migration (BLOCKING for the next `db push`):**
  20260723000001 fail-closes kitchen-log writes to BU members — wire Ibnu + Ansori (and any real
  kitchen member staff) into a retail_ops-BU team membership in the same deploy, or they lose
  submit (audit verify 2026-07-23). Also: 3 positive-branch pgTAP follow-ups + align
  viewerSeesCafe's basis with membership once the viewer payload carries teams.
