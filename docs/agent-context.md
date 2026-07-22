# Agent context — read me first (owner prefs · hard rules · gotchas · pointers)

Fast cold-start for a fresh agent (esp. post-compaction). This is the human/process layer; the
authoritative product/decision docs are linked at the bottom. Keep this file updated as things change.

> **This file owns STATE. `CLAUDE.md` / `AGENTS.md` own the standing RULES and deliberately carry no
> state** (tidied 2026-07-16, owner-directed: "it needs to be the rules spanning over time, it cannot
> be for ephemeral notes"). So: what's in flight, what's next, which gate is open, who's running it →
> **here**. A rule that outlives the workstream → there. Putting state back into `CLAUDE.md` is a
> regression, not an update.

> **Working in a fresh sandbox / cloud agent / new clone?** Run **`bash scripts/cloud-agent-bootstrap.sh`**
> first: `mos-app/.env*` are gitignored, so a clone has **no anon key** — the dev server boots but login
> is dead and **no design review is possible**. The script starts Supabase, writes the env, installs deps
> + Chromium, and verifies the app renders. Verified from a bare clone 2026-07-16 (bootstrap → login →
> Home with live data).

> **Product/IA direction below is superseded (2026-07-09/10) by ADR-0025 + `docs/decisions.md`
> OD-REDESIGN-1..79** (era **E8**, `docs/requirements-evolution.md`) — a full redesign, not a
> continuation of the "Current state" / "Headline current state" workstream dated 2026-07-07 below.
> Quick map: `docs/redesign-decision-index.md` (its **§ Provenance** maps the source threads).
> **Need the *why* behind a decision? → `docs/reference/provenance/`** — extracted grill + frustration
> threads, owner prompts verbatim, in-repo. Owner prefs, hard rules, multi-agent/git gotchas, and
> the delegation posture below are **not** superseded and remain binding.
>
> **WHERE ARE WE RIGHT NOW → [`docs/reviews/v3-redesign-convergence-handoff-2026-07-21.md`](reviews/v3-redesign-convergence-handoff-2026-07-21.md),**
> then [`docs/reviews/v3-redesign.md`](reviews/v3-redesign.md) and [`docs/reference/v3-live-inventory.md`](reference/v3-live-inventory.md).
> The active `v3-redesign` branch is now an implementation branch through V3 page families,
> RecordCollection foundations, and the shared centered-modal grammar; the old Issue-2-only status
> below is historical. The closed `docs/plans/AUTONOMOUS-RUN-STATE.md` /
> `CLOUD-AGENT-HANDOFF.md` material is historical; do not use it as the current V3 workstream state.

> **CURRENT WORKSTREAM (2026-07-21): V3 live application convergence**, branch `v3-redesign`,
> local implementation checkpoint `3250aa8` plus subsequent documentation state commits; nothing has
> been pushed. The durable goal, audit ledger,
> provider failures, active worker/thread map, and exact next dependencies are in
> [`docs/reviews/v3-redesign-convergence-handoff-2026-07-21.md`](reviews/v3-redesign-convergence-handoff-2026-07-21.md).
> E7 owns visual styling while the
> composite owner oracle owns IA/IxD. Page-family migration now covers Home, catalog, Money, Café,
> and Follow-ups in addition to the prior wave. Tasks and Signals share the visible collection
> control grammar; live Tasks now consume the engine at `15924dc`, while Signal collection
> convergence is integrated at `5ab6a51` + `3250aa8`. The production overlay host is mounted before
> Task/Signal records move onto RecordViewer.
>
> **New local checkpoints after `d85126f`:** `2351e26` Café frames; `cb2d239` Money frames;
> `eb47a61` catalog frames; `f13c7a8` Home frame; `ef3314d` inventory composition; `15a9571` +
> `a6fb3fe` + `60ecf24` + `73ed343` + `8266553` one ModalShell for confirmations, command,
> Signal capture, assignment, Add Person, Role Editor, and show-once password reveal; `bce94fe` +
> `0a23ceb` Follow-ups Workspace frame and shared labeled inputs; `a83750f` + `eb32fd4` delete the
> unreachable legacy Sales and My Week page implementations/tests while preserving `/sales` →
> Money and the current Home/MyWeekPanel behavior. Modal/command/composer focused
> battery: 136 tests green; follow-up/page-family/inventory batteries green; typecheck and changed
> ESLint green. Legacy-page cleanup: 1,313 deleted lines, route/cohesion 71/71, current Home/task
> 70/70, inventory 10/10, typecheck/changed lint green. This is not yet the final full-suite/rendered
> acceptance gate.
>
> **In flight in isolated worktrees/threads:**
> The production overlay host is now integrated and independently verified at `9e2a8d1` (36 focused
> shell/overlay tests, typecheck, ESLint, Stylelint, diff clean). Live Tasks collection migration is
> integrated and independently re-verified at `15924dc` (70 focused tests, typecheck, ESLint,
> Stylelint, conformance guard, diff clean). Signal grouping/opening/selection/page-family behavior
> is integrated at `5ab6a51` + `3250aa8`; Luna thread `019f8421-5176-7fe2-89e0-c3ad6a8cc30d` landed
> auth controls as `93555ac`. Luna thread `019f844c-a942-7c12-992f-ae86618cfc88` now owns the
> bounded Home/People/More interaction slice. All active work must be independently reviewed before
> cherry-pick.
> Only one local Supabase exists; no active lane may start it. Keep memory bounded, avoid browser/full-suite
> fan-out, and inspect redirected logs only once after a process exits. The full active map and failed
> provider attempts are recorded in the convergence handoff.
>
> **Next action:** the next agent resumes the preserved RecordViewer and Home/People/More WIP; I
> (Director) then own Inbox/Deputy, Follow-ups/Café, geometry, and final
> three-width acceptance in the dependency order in the
> convergence handoff. Issue 10 structured content remains gated until the live viewer/collection/host
> dependencies and Issues 7–9 are actually complete.

> **CURRENT-TIP CRITIC OVERRIDE (2026-07-22, tip `a7eef31`):** A bounded read-only integration
> UX/IA/IxD pass and a visual/cohesion/Impeccable/Taste-equivalent anti-slop pass rechecked the
> application against the owner’s verbatim redesign / 50+ QnA / divergence-convergence / E7 oracle.
> Source guards pass at that baseline (inventory 58 routes / 13 shared jobs / 73 CSS families; the
> current refreshed inventory is 58 routes / 13 shared jobs / 74 CSS families); RecordCollection
> conformance; Storybook 35/36/3), but no current computed-style or driven 1280/1024/390 evidence
> exists. The branch remains **NO-SHIP**. At that audit baseline the highest open gaps included the
> Task dirty-leave guard not being attached to the live OverlayEntry; the local follow-up below now
> closes that seam at source/test level. Remaining gaps include Tasks/Signals still rendering different
> table/CSS families; the local table-convergence follow-up below now closes that concrete rhythm seam;
> Inbox remains a
> bespoke collection without seeded Bell→queue→record→Back proof; Deputy has a separate fixed host;
> Task/Signal RecordViewer relation/anatomy proof is incomplete; the local follow-ups now close Café
> user-facing noun leakage plus measurable table/radius/control token drift at source/test level; and the documented provisional I5
> native-select exception. Details are in the fresh sections of the completion audit and review ledger.
> Automation can prove geometry, computed parity, keyboard/Esc/Back/focus, dirty-veto, seeded journeys,
> and overflow; only the owner can ratify the final “one app” visual/density/card-soup verdict and
> strategic Inbox/Deputy/I5 exceptions. Resolved/stale findings are listed explicitly in those docs;
> do not resurrect them from historical audit sections.

> **LATEST MOCKUP-REGRESSION OVERRIDE (2026-07-22, local/uncommitted):** An independent read-only critic
> compared the current Home/Tasks/Signals surfaces against the E7 visual authority, pre-E7 table salvage,
> the composite owner oracle, JTBD, Impeccable, Taste, and UI-styling checklists. Verdict remains
> **NO-SHIP** (23/40 checklist score): Home task titles are visibly starved; Signals retains duplicate
> collection axes and a native Saved-views popup; Signals still has a six-column identity layout unlike
> E7's primary title/subline anatomy; Tasks/Signals share a wrapper but not a full grammar; Home still has
> a card remnant and direct-link viewer exception. Source now bounds rail and page scrolling, and a local
> browser check showed page scroll while the rail stayed anchored, but the required 1280/1024/390 proof is
> not complete. See the latest `v3-redesign.md` section for the exact P0/P1 queue. Do not treat the
> uncommitted CSS pass as acceptance or completion.

> **OWNER VERBATIM FEEDBACK + SCORE TARGET (2026-07-22):** The owner said: “the table filters and views
> feels unpolished and too cluttered. it doesnt say tidy. it says confusing! why not use ui-ux-pro-max,
> taste and impeccable skills for how to structure this neatly. same goes for Home, styling feels
> unpolished. some has to big of whitespace, some feels too tight. when scrolled down, the sidebar follows
> to get scrolled as well”; “e7 has better table structure”; and “even the pre-e7 has better table layout.”
> These are acceptance requirements, not optional polish. Current baseline is 23/40, E7 is 27/40,
> prior warmer is 19/40, and prior task-table anatomy is ~3.5/4 for scanability. Target: ≥27/40
> Nielsen-style, ≥7/10 structural anti-slop (target 8/10), no P0 card soup/duplicate view axes/starved
> identity/native saved-view popup, and rendered 1280/1024/390 proof for Home/Tasks/Signals. The next
> implementer owns visible convergence; the Director verifies actual renders and updates this ledger.

> **GIT CONSOLIDATION (2026-07-22, Director):** `v3-redesign` is now **pushed to origin** and is THE
> single redesign integration branch — it strictly contains `feat/redesign-buildout`, both `cohesion/*`
> halves, and all four `claude/redesign-buildout-completion-*` cloud runs (ancestry-verified). Deleted
> after verification: local `cohesion/chrome|content`, `feat/dashboard`, `feat/ui-coherence`,
> `fix/ui-coherence-followups`; remote cloud-completion ×4 + merged-to-main `feat/dashboard`,
> `feat/ui-b{i,ii,iii}-*`, `feat/ui-w6-quickwins`, `feat/work-spine`. Superseded-but-unique tips are
> preserved as annotated tags **`archive/v3-issue2-candidate`** and **`archive/redesign-step1-styling`**
> (pushed). The `../gordi-mos-e7-prototype` worktree was removed (clean; branch `codex/e7-prototype`
> kept local+origin). **Conventions from here:** one integration branch per wave (`v3-redesign`);
> short-lived lane branches `v3/<topic>` in their own worktrees, deleted after merge; superseded
> attempts become `archive/<slug>` tags, never long-lived branches; `feat/redesign-buildout` is kept
> (local+origin) only as the steps-1–3 PR unit until the owner decides the merge shape. Kitchen
> (`feat/kitchen-ui-*`, `docs/kitchen-*`) and docs proposal branches are unmerged and untouched.
>
> **INDEPENDENT COMPLETION AUDIT (2026-07-22):** The current tip `d63f20a` is **NO-SHIP**. Fresh
> verification is recorded in [`docs/reviews/v3-redesign-completion-audit-2026-07-22.md`](reviews/v3-redesign-completion-audit-2026-07-22.md): typecheck/lint/build and the RecordCollection guard pass, but live-inventory freshness fails, the full Vitest run is **3,212 passed / 15 failed / 14 errors**, and `pre-merge-check.sh` has no current review verdict lines. The route-seam failures, Tasks-vs-Signals collection grammar divergence, Café first-Team heuristic, unimplemented Issue 10, and missing owner three-width gate remain release blockers. Do not use the historical `3195/3196`, `329/329`, or `7cc45f2` figures as current completion evidence.

> **OWNER UI-FAST-PATH (2026-07-21):** For visual/IxD convergence slices, implement the smallest
> visible end-to-end behavior first, run bounded smoke/typecheck/lint checks, render it for the
> owner's eye, then add/tighten goal-level tests and commit. Do not block on exhaustive red-test
> archaeology. This is scoped to UI behavior only; tests still gate integration, proxy assertions
> remain invalid, and schema/security/data work keeps normal pre-change verification.

> **LOCAL CONVERGENCE UPDATE (2026-07-22, superseded by canonical tip `e1eb140`):** The active `v3-redesign` worktree has a
> bounded follow-up slice beyond `d63f20a`. Tasks and Signals live record opening now use the single
> production overlay host (including mobile Tasks); Café Team resolution renders an explicit picker
> for multi-Team members; and Signals table has the shared RecordCollection outer surface. Focused
> proof is Tasks workspace/mobile 80/80 + page 45/45, Signals archive 18/18 + presentations 16/16,
> Café/Team 17/17, Home Signal host 10/10, route seam 8/8, combined shell/overlay 54/54, and the single-worker full Vitest
> run 3,234/3,234 across 319 files. The route seam's former
> unhandled errors were isolated to a jsdom AbortSignal crossing into Node/undici Request and
> contained at the test boundary. This is not a completion claim: spec/design verdicts remain BLOCKED,
> the rendered three-width owner gate remains open, and Tasks/Signals control parity,
> Inbox seeded proof/handled semantics, Follow-ups, contributing-record Money drill-down, and
> owner-gated Issue 10/typed embeds remain open. No push, merge, or Supabase start occurred. Details
> are appended to the completion audit and review ledger linked above.

> **WORKTREE CONSOLIDATION (2026-07-22):** `/Users/ariefsaid/Coding/gordi-mos/.claude/worktrees/v3-redesign`
> is the canonical V3 consolidation worktree and branch. Clean historical V3/Codex worktrees were
> removed with `git worktree remove`; superseded dirty lane material was archived outside the repo at
> `/tmp/gordi-mos-v3-stale-lanes-20260722` and the lane branches were deleted. The only retained
> worktrees are the primary checkout (`feat/redesign-buildout`, dirty), the E7 prototype, and this
> canonical V3 worktree. Do not recreate a lane unless it has a named issue and an isolated base.
> Stale Vite/esbuild processes for `v3-redesign` and `v3-rv-live` were stopped; no Supabase process was
> started. Untracked browser captures in the canonical worktree remain intentionally excluded from commits.

> **RESPONSIVE COLLECTION FOLLOW-UP (2026-07-22, local):** Signals now uses the same capture-first
> `ViewOptionsDisclosure` contract as Tasks on phone widths. The complete Signal toolbar remains
> available behind one disclosure, while the first record leads; desktop behavior is unchanged.
> Focused Signals/toolbar/Tasks evidence is 82/82; typecheck, ESLint, Stylelint, diff check, and live
> inventory pass. This is a code-owned IxD closure, not a live rendered owner-gate claim.

> The Signal table message opener is now a native `button` with an injected shared-record opener;
> the former `span role="button"` seam is covered by the Signal presentation test.

> The shared Save View editor restores focus to its trigger on Escape, Cancel, and successful Save;
> CollectionToolbar owns this contract for Tasks and Signals.

> **INBOX PAGE GEOMETRY FOLLOW-UP (2026-07-22, local):** `/inbox` now opens records through the
> page-owned `OverlayHostSlot owner="inbox"` inside the shared `.record-split`; the bell’s ephemeral
> quick triage remains `owner="shell"`. The host primitive, 44% track, focus, Escape, and page door are
> shared. Focused Inbox/host evidence is 51/51 plus typecheck/lint; seeded-notification and handled
> semantics remain owner/data-gated.

> **CLEANUP + TEST RESIDUE (2026-07-22):** The canonical branch fixed two stale post-convergence
> residues: the mobile collection-options trigger now uses the shared outward `+2px` focus ring, and
> the Inbox bell goal test now names the canonical host action `Open full page`. Focused closure is
> **71/71** across the cohesion guard, Inbox bell/page/host, Signals, and CollectionToolbar suites;
> typecheck, changed-file ESLint, and Stylelint are green. The prior single-worker full run reached
> **3,238 passed / 2 failed**; both failures were these stale expectations/guard and are covered by the
> focused rerun. A full rerun and rendered owner gate remain intentionally open.

> **MOCKUP PRESERVATION AUDIT (2026-07-22):** The E7 prototype worktree/branch
> (`codex/e7-prototype`, commit `6f0a46a`) is retained verbatim as a runnable reference, but it is
> not the only preserved design history and is not the current oracle by itself. The canonical
> `v3-redesign` tree contains 104 versioned mockup files, including the older IA archive, the
> 2026-07-08 A/B/C exploration, the consolidated E7 candidate, and convergence-flow payload added
> in `962de90`. The origin critique, 50+ QnA grill, and frustration/buildout prompts are extracted
> verbatim in `docs/reference/provenance/`; `docs/requirements-evolution.md`,
> `docs/redesign-decision-index.md`, `SALVAGE-INVENTORY.md`, and Git history provide the
> cross-version/supersession map. The deleted V3 implementation lanes contained no unique mockup
> generation; their residue was archived outside the repo and their product commits were already
> represented by the canonical history. Raw source-session JSONL remains local/unversioned as noted
> by the provenance README; the in-repo extracts are the durable handoff.


> **SECOND-SESSION STATE (2026-07-21 late — quota handoff; read WITH the claims table in
> `docs/reviews/v3-redesign-convergence-handoff-2026-07-21.md`).** Tip `8cd1053` at session start.
> Earlier-second-session merges (each Director-close-reviewed; Luna cross-family review verdicts
> recorded in the ledger): `9c59eac` follow-up record door + R-OWNER-5 workspace reclassification +
> Café copy; geometry parity (rail 232, panel 44%/45vw/phone, split-Escape via leaveGuard,
> oracle-on-sheet); `fef7054` Inbox LIVE through the mounted host (triage doors, Bell quick-open,
> Deputy focus return); hpm slice (Home retry idempotence + StrictMode mount fix, People ViewTabs
> keyboard, More focus return, canonical /work/tasks links).
>
> **THIRD-SESSION STATE (2026-07-21, current Director session; tip now `7cc45f2`).** Resumed from
> `8cd1053` after the prior session's handoff. Reconciled drift and completed all four QUEUED lanes:
> - `e211c64` — rebased `v3/rv-live` (RecordViewer live content) onto the post-Inbox-live tip and
>   merged; clean.
> - `c9122b3` — rebased `v3/taskspage-fix` (tasks-page 8 failures + `.split` 33vw→44% parity + 3
>   context-row job-sentence failures) and merged; drawer.css comment conflict resolved.
> - `4de6339` — **Lane A1 (inbox fail-closed):** the prior session's handoff claimed
>   `v3/inbox-failclosed` and `v3/route-seam` were dispatched to GLM workers. Both branches had
>   ZERO commits, ZERO dirty files, ZERO reflog movement — they were never started. Treated as
>   never-started. Director implemented A1 directly: real `can()` capability wiring into
>   `buildInboxTargetDeps`, `isSameOrg`/`recordExists` document the structural causes (RLS gates org,
>   canonical page renders not-found), 6 production-deps tests.
> - `3ad5d9d` — **Lane B3 (historical inbox pageTo seam):** `pageTo` was added to the inbox record
>   door's `OverlayEntryDraft`. R-T-4 later landed; the bespoke fallback button is removed at the
>   current Inbox convergence tip, and host chrome owns page promotion.
> - `f9c0d26` — **Lane B4 (follow-up drawer-first):** `FollowUpRow` opens via the shared host
>   (`openRoot` with `FollowUpRecordHost mode="panel"`); counterparty cell is a button when
>   `onOpenRecord` is provided, else legacy `<Link>`. Test asserts `[data-overlay-host]` length === 1
>   and the counterparty name appears twice (queue row + panel title) — drawer-first proven.
> - `1c7da9b` — **Lane B1 (Bell shell-slot 44% track):** `OverlayHostSlot` passes
>   `rootClassName="drawer-shell-split"` when `owner === "shell"`; new `.drawer-shell-split` CSS rule
>   (desktop ≥1100px: `position: fixed; right: 0; width: min(44%, 480px); full-height; z-drawer`).
>   Reuses the `minmax(360px, 44%)` token (Rule 11). Rendered geometry verified:
>   `x=800, width=480, height=900` in a 1280×900 viewport.
> - `7cc45f2` — **Lane B2 (Deputy ↔ shell-overlay mutual-exclusion):**
>   `useDeputyOverlayCoexistence()` hook mounted in `ShellContent`. Single-effect reconciliation:
>   the NEWEST intent wins (shell overlay just opened → close Deputy; Deputy just opened → close
>   shell overlay through its leaveGuard). Collection-owner overlays (Tasks/Signals records) coexist
>   with Deputy — they sit in the page `.record-split` grid, not floating. 4 new + 401 existing
>   shell+assistant+inbox tests pass; both conflict paths verified end-to-end via programmatic open.
>
> **REMAINING (this redesign pass):** (a) Wave-2c design re-review multimodal audit (structural
> PASS; the 4-lens minimax/inkling/luna audit is BLOCKED — NIM minimax-m3 hangs on image input,
> all 5 pi providers show unauthed since the prior session's tokens expired; needs owner to re-auth
> pi or NIM to recover); (b) three-width representative gate + provisional IA ratification (same
> multimodal blocker); (c) Issue 10 structured-content schema/editor (ADR-0052 + plan exist);
> (d) final whole-app acceptance, stale-style cleanup, docs closure, owner walkthrough.
>
> **KNOWN PRE-EXISTING FAILURES — RESOLVED this session (`3865d33`).** The 5 Task-record test
> failures (4e4a952 WIP fallout) are now GREEN. Root causes were test-vs-app drift (PIC/Supervisor
> render as selects not text; Due renders as date-input; RACI regex matched fixture names; Due null
> shows 'No due date' not '—'; 'Reassign PIC' button never wired — journey updated to the PIC
> select's onChange). Full battery at tip `3865d33`: **3195/3196 pass** (1 flaky kitchen-plan test
> passes in isolation). Typecheck, eslint, stylelint clean.
>
> **DEFERRED ARCHITECTURAL DECISION (owner/eng-planner):** `TaskOwnershipCard` is an orphaned
> component — built + tested in isolation, NEVER imported by any production component. The record
> adapter rolls its own ownership display via generic `RecordFieldSpec` with `control: 'person'`.
> Either (A) wire the canonical card into the adapter, or (B) remove `TaskOwnershipCard` as dead
> code. Tests now match the field-list pattern (B); choosing (A) would require reverting the test
> journey updates. Not blocking — recorded for the next Task-record workstream.
>
> **INTEGRATION RULES for whoever resumes:** ONE full battery (full vitest + lint + build +
> conformance guards + pgTAP if schema touched) on the final tip only (memory-frugal — the machine
> has OOMed); the review battery + `bash scripts/pre-merge-check.sh` + the owner's rendered
> three-width walkthrough (Issue 9) gate any merge-to-main. Deferred/backlog items live in
> `docs/backlog.md` (owner rule 2026-07-21: no task chips — take on or backlog, nothing else).

### Historical planning-era V3 continuation map (2026-07-20; superseded by current state above)

All useful parallel planning work is committed on this Director branch; the source worktrees are
clean and no remote action occurred. A replacement harness should resume from this branch, not from
the source worktrees.

| Issue | Director commit / artifact | State and exact continuation |
|---:|---|---|
| 2 | `4fa90c1` plus prior Issue 2 commits | Implemented and locally verified; independent re-review and owner issue-boundary approval remain. |
| 3 | `80e5199`, `docs/plans/2026-07-20-v3-page-families.md` | Plan only. After Issue 2 approval, execute first with TDD; no Supabase required. |
| 4 | `2493506`, `docs/plans/2026-07-20-v3-shared-overlay-host.md` | Plan only. Execute after Issue 3; final async `leaveGuard(intent)` contract is binding. |
| 5 | `0d685d8` + `cf34354`, `docs/plans/2026-07-20-v3-record-viewer.md` | Plan only. Task adapter uses PIC/Supervisor and preserves distinct domain models. |
| 6 | `7798366`, `docs/plans/2026-07-20-v3-record-collection.md` | Plan only. Execute after Issues 3–5; owns persisted views and Tasks/Signals adapters. |
| 7 | `f0e585f`, `docs/plans/2026-07-20-v3-inbox-deputy.md` | Plan only. Owner must ratify provisional read-versus-handled semantics before implementation. |
| 8 | `6611c1b`, `docs/plans/2026-07-20-v3-cafe-canonical-records.md` | Plan only. Requires Issues 5–7 and explicit resolution of ambiguous legacy Task-to-Team mappings. |
| 10 | `afa9d35`, ADR-0052 + `docs/plans/2026-07-20-v3-structured-content.md` | ADR/plan only. Owner ratification and Issues 3–9 precede implementation. |

Issues 9, 11, and 12 remain specified by `docs/specs/v3-redesign.spec.md` and are not falsely marked
planned or implemented here. Do not collapse the above plans into one parallel implementation wave:
their dependency order is intentional, and the single local Supabase means database/e2e work must be
serialized.

## V3 Issue 2 resumable checkpoint (2026-07-20)

This is the canonical handoff for the locally implemented Issue 2 work, pending independent
re-review. Do not infer state from a running process or an uncommitted generated directory.

### Verified

- Scope: Storybook workbench only; the seven curated story files contain 35 indexed stories. The
  deterministic guard excludes only each file's `v3Matrix` metadata export from CSF indexing and
  derives canonical coverage from actual production named imports.
- Matrix totals: 36 state entries, 3 responsive entries (`desktop1280` 1280px, `intermediate`
  1024px, `phone390` 390px), and 23 canonical component/job representations.
- Package compatibility: Storybook `10.5.2`, `@storybook/react-vite` `10.5.2`,
  `@storybook/addon-a11y` `10.5.2`, and external `@storybook/test-runner` `0.24.4`; the existing
  Vitest `3.2.6` project and `mos-app/vite.config.ts` test behavior remain unchanged. No Vitest 4,
  `@vitest/browser`, `@vitest/browser-playwright`, or `@storybook/addon-vitest` was installed.
- Production corrections are locked in the existing ViewTabs, StatusPill, and CommandMenu suites;
  Button/CardHead/CommandMenu changes are narrow E7/interaction/a11y corrections with rendered or
  behavioral evidence. Storybook overlay mocks remain on the Storybook-only alias boundary and are
  absent from `mos-app/dist`.
- Evidence: [matrix](reference/v3-storybook-matrix.md), [live inventory](reference/v3-live-inventory.md),
  [rendered evidence](reference/evidence/v3-storybook-2026-07-20/), [plan](plans/2026-07-20-v3-storybook-matrix.md),
  and [review ledger](reviews/v3-redesign.md).

### Gate record

| Command | Result |
|---|---|
| `node --test scripts/v3-storybook-matrix.test.mjs` | 0; 12 passed (21/21 when combined with the 9 inventory tests) |
| `node --test scripts/v3-live-inventory.test.mjs` | 0; 9 passed |
| `node scripts/v3-storybook-matrix.mjs --check` / `node scripts/v3-live-inventory.mjs --check` | 0; current |
| Plain `npm ci` in `mos-app/` after clean `node_modules` | 0; no resolver flag |
| `npm ls --depth=0 ... vitest ...` | 0; Vitest 3.2.6, no Vitest 4/browser package |
| `npm run typecheck` | 0 |
| `npm run lint` | 0; ESLint and Stylelint, zero warnings |
| `npm test -- src/components/command/command-menu.test.tsx --run` | 0; 35 passed, including loading → ArrowDown → ready → Enter |
| Full `npm test` attempt | Inconclusive under resource contention: two unrelated 5-second timeout flakes; both affected files reran alone at 30/30 |
| `npm run test:coverage -- --reporter=dot` | 0; 2,878 passed; 92.52% statements/lines, 86.93% branches, 88.34% functions |
| `npm run build` | 0; 665 modules; post-comment-fix CSS syntax warning gone; only the pre-existing >500k chunk advisory remains |
| `npm run build-storybook` | 0; Storybook 10.5.2; generated output ignored |
| `npm run build-storybook && npm run lint` | 0 |
| `npm run lint && npm run build-storybook` | 0 |
| `npm run test-storybook` from `mos-app/` | 0; 7 suites / 35 tests passed in 83.085s after the final viewport-runner and hook-shape corrections |
| `git diff --check 0fd276f HEAD` and `git diff --check` | 0 |

### Remaining delivery sequence

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

Issue 3 unlock condition: owner approval of this Issue 2 evidence and explicit confirmation at the
issue boundary. No Issue 3+ claim is included in this checkpoint.

## Reading order for a cold start (30+ docs; these are the ones that bind)

Read in this order. Everything else is evidence you consult when a specific question arises.

**1. The LAW (what you must obey — read all four, they're short):**
- `CLAUDE.md` — the loop, the gates, model discipline. Rules only, no state.
- `docs/experience-contract.md` — Rules 1–12, the UI acceptance bar (incl. Rule 8-desktop no-clip).
- **`docs/interaction-contract.md`** — ONE behaviour per interaction class (I1–I10) + a per-surface
  conformance table. **Behaviour is first-class here** because three audit generations measured
  statics and let the interaction layer fracture. Lens (b) must DRIVE these, not read code.
- `CONTEXT.md` — the domain vocabulary. "Process Run" is not a user-facing noun; PIC/Supervisor,
  not RACI; Signal replaced Weekly Update + Daily Log.

**2. The DECISIONS (why anything is the way it is):**
- `docs/decisions.md` — OD-REDESIGN-1..79. The owner's word, chronological.
- `docs/reference/provenance/owner-directives-index.md` — **the composite oracle**: every verbatim
  owner directive across every era, traced to its shipped state. Use this before assuming intent.
  Its tiers: owner-word > lost-good (things an EARLIER mockup got right, including things e7 itself
  dropped) > owning-mockup default. **The oracle is the composite, never one snapshot** — the owner:
  "i dont want to look exactly like e7… that's why i keep calling it a moving quicksand."
- `docs/adr/` — architecture (0025 = the redesign direction; 0050/0051 = Signal + occurrence schema).

**3. The STATE (what's done / open):**
- `docs/reviews/v3-redesign.md` — current Issue 1 evidence, inventory totals, contradictions, and the exact Issue 2–12 delivery sequence/gates.
- `docs/reference/v3-live-inventory.md` — reproducible route/component/style evidence.
- `docs/backlog.md` — current V3 banner plus standing programs and historical strata.
- `docs/plans/AUTONOMOUS-RUN-STATE.md` and `docs/reviews/claude-redesign-buildout-completion-vdrd17.md` — historical E7 evidence only; do not treat them as the current V3 state.

**4. The DEBT MAPS (what's known-broken and why):**
- `docs/reviews/cohesion-debt-2026-07-19.md` — the mechanical sources of "several apps thrown
  together" + what shipped against them.
- `docs/reviews/parity-sweep-2026-07-18.md` — fidelity/provenance audits + the convention audit.

## The five traps this project has actually paid for (do not re-learn these)

1. **A check whose failure is silent is not a check.** Real instances: a secret scan that "passed"
   because grep crashed; a merge gate that skipped design+security when `git diff` failed; an auth
   e2e rewritten to a `localStorage.clear()` that never called `signOut()`; e2e runs piped through
   `tail` that ate a 6-failure block AND the exit code; the orphan-doc gate that exited 1 silently
   *at the moment it found an orphan*. **Always capture exit codes; never `| tail` a verification.**
2. **Measure the goal, not a proxy.** "Tokens are in-palette" passes with the WRONG token — the rail's
   selected-state shipped invisible that way. Design fidelity = **computed-style parity** against the
   owning mockup (`design-reviewer.md` Lens a); interaction = **driven**, not read.
3. **An owner artifact's omission IS a decision.** The frame sketch had no module blocks; that was
   flagged, unanswered, defaulted-around, and the default got enshrined in OD text — then six audits
   verified the text. Every build-time deviation from an owner artifact MUST become a
   `RATIFY-BEFORE-MERGE:` ledger line (CLAUDE.md, binding).
4. **"Stale" is quicksand.** Superseded ≠ wrong ≠ deletable. Prove it by diff, preserve on a branch,
   name the decision that supersedes.
5. **Parallel agents need isolation + the correct base.** Agents sharing a worktree while the Director
   runs `git reset --hard` lose their work; `isolation:worktree` branched off the WRONG base (main,
   not the feature tip) and three agents correctly refused to build. Create the worktree yourself off
   the verified tip, one branch each, and merge serially.

**Historical evidence of record:** `docs/reviews/feat-redesign-buildout.md` (steps 1–3 + base closure). Current evidence of record is `docs/reviews/v3-redesign.md`.
>
> **UPDATE 2026-07-14 — mockup phase CLOSED (historical; superseded by V3 Issue 1 evidence).** The
> E7/convergence mockups remain standing references with a presumption of correctness for later in-app
> migration, and their ownership map is `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md`.
> Issue 1 creates no standalone mockups; direct in-app iteration and the owner-approved representative
> slice begins only at the separately numbered Issue 9 representative owner gate, after Issues 2–8 have
> completed their own acceptance and the owner approves that gate.

## Who the owner is (Arief) & how he works
- **Concise reporting** — sacrifice grammar for concision; lead with the answer, not the journey.
- **"Make it work", pragmatic, one-step infra** — prefers the shortest correct path; dislikes
  over-engineering (a `ponytail` lazy-mode is often active). But **not** at the cost of safety/correctness.
- **Director posture is expected** (you are the Director; he is the board): challenge bad decisions, ask
  clarifying questions, verify everything yourself — never rubber-stamp a subagent's summary
  (close-review the actual artifacts/diffs/code).
- **Visual fidelity bar** — he judges UI by *look-vs-mockup*, not green tests. Render + eyeball at real
  widths (incl. ≤380px phone) before claiming a UI change done. jsdom/RTL computes no layout.
- **Follows the verbatim product charter** (`docs/product-expectations.md`). The review battery is a
  **binding gate**, not optional (see Hard rules).
- **Credentials/secrets:** NEVER enter his credentials; NEVER read `~/.op-token` or any `.env`. Fetch
  secrets only via **`op-get.sh <item> <vault> <field>`** (1Password vaults **AS** + **Gordi**). When op
  isn't authenticated in the shell, ask him to unlock / provide — don't work around it.
- When Claude is overloaded/rate-limited, he's fine delegating heavy work to **pi CLI** (GLM builders +
  gpt-5.6-luna cross-family reviewers, `docs/pi-delegation.md`); vision/design-review stays Claude/Director.

## Hard rules (non-negotiable)
1. **Review battery before EVERY merge-to-main.** Run `bash scripts/pre-merge-check.sh` (exit 0) + record
   `docs/reviews/<branch>.md` (spec + code-quality always; security if auth/RLS/schema; design if
   `*.tsx`/`*.css`). Green tests ≠ reviewed. **Separate repos (`gordi-kitchen-app`) have NO gate script —
   they need the SAME battery, recorded in gordi-mos `docs/reviews/kitchen-app-worker-prs.md`.** (Missed
   this twice; the 2nd miss hid a real fail-open security bug — see `review-battery-before-merge` memory.)
2. **Secrets** — see owner section. `op-get.sh` only; never `.env`/`.op-token`.
3. **ESB GOO = TEST DATA ONLY** (spec FR-084). Never send Gordi's real GKID product/BOM IDs to GOO (it's a
   shared multi-tenant sandbox). Details: `docs/reference/esb-goo-integration.md`.
4. **De-reference firewall** — no external/brand/AGPL references in MOS design artifacts; the design kit is
   MOS's own. (ESB API coordinates are fine — ESB is the real integration partner, not a design reference.)
5. **Git hygiene** — branch → PR → merge; the concurrent agent works on its own branch; **`git push
   origin HEAD:main` is blocked**; **rebase onto latest `origin/main` before merging** (your local `main`
   ref goes stale — `git fetch` first, and rebase any worktree you cut from a stale local main).
6. **One issue / one PR.** Pause at issue boundaries; owner approves spec sign-off + prod deploy /
   irreversible infra; Director approves merge-to-main within the signed spec.

## Multi-agent dispatch — worktrees are the DEFAULT (owner-directed 2026-07-06)
Dispatch every role/build agent in its **own git worktree** (`isolation: "worktree"` on the Agent tool,
or the pi equivalent) so parallel agents never share one checkout. The shared-tree clobber that bit us on
2026-07-06 (a Codex session moved our HEAD mid-merge) does not happen when each agent has its own tree.
- **Never put `git checkout`/`checkout -b` in an agent's brief** — the harness already parks it on its own
  `worktree-agent-<id>` branch; a `checkout` in the brief leaks to the MAIN tree's HEAD. Tell it to work in
  place, commit to its branch, and report; the Director merges from `worktree-agent-<id>`.
- **After merging an agent's work, clean up:** `bash scripts/worktree-cleanup.sh [target=dev] [--remote]`
  removes merged worktrees + deletes merged local (and optionally remote) branches. Protected: main/dev/
  staging/current. It only ever deletes MERGED branches — unmerged work is safe.
- **After any worktree-agent dispatch,** confirm your own HEAD didn't wander:
  `git branch --show-current` + `git rev-parse --short HEAD`. See [[mos-multiagent-git-gotchas]].

## Gotchas (will bite you)
- **Stale local `main`:** `git worktree add … main` uses your *local* ref, which lags `origin/main` after
  you merge a PR. `git fetch` + rebase the worktree, or it'll miss/clobber recent merges.
- **Multi-agent repo:** subagents only see their own worktree; a separate session (even a non-Claude one
  like Codex) may share the primary checkout. Keep agents in worktrees; verify HEAD after dispatch.
- **Mocked unit tests miss DB reality:** a wrong column name / RPC signature passes mocked Vitest but 400s
  against real PostgREST (the `log_date` bug). Verify-live any DB-column/RPC change against a running stack.
- **GOO ≠ `stg-erp`:** GOO Core API is `stg7.esb.co.id/core-stg`; `stg-erp.esb.co.id` is the ESB web UI.
  Auth = login (not the static token, which is the OMS read API's bearer). `docs/reference/esb-goo-integration.md`.
- **Costing-model asymmetry:** GKID = actual-costing (`/assembly-actual`); GOO's SAE tenant = standard-
  costing (`/assembly`). The worker's assembly call can't be validated on GOO — GKID flip is its only proof.
- **Commit trailer (gordi-mos):** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Dev-login orphan after schema work → `supabase db reset` relinks (or PR #57 heals it permanently).

## Current state — where to read what
| Need | Doc |
|---|---|
| **How the requirement evolved (era timeline — read before any older doc)** | `docs/requirements-evolution.md` |
| **Current redesign direction + next work** | `docs/specs/v3-redesign.spec.md` + `docs/plans/2026-07-20-v3-design-foundation.md` + `docs/reviews/v3-redesign.md` |
| **Legacy implementation + infrastructure status** | `docs/platform-workstream-status.md` |
| **Agent-native port (ADR-0018) — plans per train** | `docs/plans/2026-07-04-port-p1-substrate.md` · `docs/plans/2026-07-05-port-p2-panel-runtime.md` · `docs/plans/2026-07-06-port-p3-automations-inbox.md` |
| **Review battery ledgers (per branch)** | `docs/reviews/feat-port-p1-substrate.md` · `feat-port-p2-panel-runtime.md` · `feat-bu-taxonomy-remap.md` · `feat-home-v1-margin.md` · `feat-port-p3a-replay-inbox.md` · `feat-p2.1-db-side-aggregate.md` · `release-staging-bu-remap.md` · `feat-work-spine.md` · **MVP-push (2026-07-07): `feat-ia-nav-work-spine.md` · `feat-ar-followup-bridge.md` · `feat-plan-v1.md` · `feat-home-stacked-union.md`** · **pre-F hardening A1–A6: `feat-harden-round2.md`** |
| **MVP-readiness audits** | `docs/reviews/mvp-readiness-charter-audit-2026-07-06.md` (round 1, charter) · `mvp-readiness-audit-round2-2026-07-07.md` (round 2, gpt-5.5 ×3 — the pre-F hardening blocklist A1–A6, **now DONE**) |
| **Design reviews (rendered)** | `docs/reviews/design-mvp-push-2026-07-07.md` (4-lens, render-verified) · **`ui-coherence-audit-2026-07-07.md` (whole-app coherence — the task #19 retrofit plan; verdict: application-gap, not ground-up)** |
| **Current JTBD design oracle (Lens-D) — E7, pending written-form owner review** | `docs/jtbd.md` (**v0.4** — 9 job families · 23 journeys · 6 scenario threads) |
| **IA/product ADRs (Accepted 2026-07-06)** | `docs/adr/0022-plan-destination-cogs-budget.md` · `docs/adr/0023-multi-location-inventory-internal-replenishment.md` · `docs/adr/0024-roastery-esb-sales-order-push.md` · decisions.md "Continued grill session 2" block |
| **Work-spine slice (D14 step 3, held on `feat/work-spine`)** | `docs/specs/work-spine.spec.md` · `docs/plans/2026-07-06-work-spine.md` · `docs/reviews/feat-work-spine.md` |
| **Roastery Operate requirements (10 owner-decisions in §6)** | `docs/specs/roastery-module.requirements.md` |
| **PMO→MOS agent-capability expansion (feeds next grill)** | `docs/specs/agent-capability-expansion.md` |
| Full task list / backlog | `docs/backlog.md` |
| Locked owner decisions (OD-*) + ADRs | `docs/decisions.md`, `docs/adr/` (0017–0021 = agent-native/IA/can()/i18n; **0022 Plan-COGS-budget · 0023 multi-location-inventory · 0024 roastery-ESB-sales-order-push = Accepted 2026-07-06**) |
| Domain glossary | `CONTEXT.md` (repo root) |
| Binding charter + per-layer Definition of Done | `docs/product-expectations.md` |
| Director runbook / loop / UI cycle | `docs/director-playbook.md`, `docs/design-workflow.md` |
| **ESB / GOO integration (coords, auth, recipe, gotchas)** | `docs/reference/esb-goo-integration.md` |
| **ESB warehouse online (box · op map · cron · observability · owner-actions)** | `docs/reference/warehouse-online.md` |
| Kitchen module spec (FR/AC) | `docs/specs/kitchen-module.spec.md` |
| Delegation via pi CLI | `docs/pi-delegation.md` |
| Staging env + gotchas | `docs/environments.md` |

## V3 Issue 1 local checkpoint (2026-07-20)

- **Status:** documentation truth reset, deterministic inventory, and binding DESIGN.md reconciliation are complete locally; owner review is pending.
- **Evidence:** [`docs/plans/2026-07-20-v3-design-foundation.md`](plans/2026-07-20-v3-design-foundation.md), [`docs/reference/v3-live-inventory.json`](reference/v3-live-inventory.json), [`docs/reference/v3-live-inventory.md`](reference/v3-live-inventory.md), [`DESIGN.md`](../DESIGN.md), and [`docs/reviews/v3-redesign.md`](reviews/v3-redesign.md).
- **Inventory:** 58 route declarations (29 page, 25 redirect, 4 DEV-only), 13 shared interaction jobs, 67 CSS families; 7 route records are bespoke/missing frames and 13 are bespoke/missing heads in the current source scan.
- **Resolved contradictions:** old Page Archetypes/Write-Review/Catalog-Manage language and deleted-route examples are gone from DESIGN.md; rail geometry is 232px; E7 row geometry is 52px; V3 separates E7 styling from owner IA/IxD law; record opening, focus, Back, direct editing, and responsive rules are explicit.
- **Not migrated:** no Storybook, route migration, RecordViewer/RecordCollection application code, shared overlay host migration, CSS/token consumer migration, database/JSONB work, Supabase command, dev server, or rendered application acceptance.
- **Gate:** Issue 2 starts only after owner approval of the plan, inventory, and DESIGN.md foundation. Issue 2 is Storybook component/state/responsive proof only; Issues 3–8 own the application migrations by capability, and Issue 9 owns the later representative rendered/driven owner gate.

## Legacy headline state (historical — do not use as current V3 state; 2026-07-07 late)
- **⚠️ READ the `## Current focus (2026-07-07 late)` block in `docs/platform-workstream-status.md` first** — full state + branch map + ▶ NEXT. Summary: `dev` includes the UI-coherence merge, closure regression guards, and post-merge IA cleanup. **Pre-F hardening A1–A6 DONE + merged** (`docs/reviews/feat-harden-round2.md`; pgTAP 570 · unit 2345 · cov 95.43%). **Nav catalog FR-424** (Objectives/Projects&Processes back as capability-gated Work rail entries). **MVP-push design review render-verified** (`design-mvp-push-2026-07-07.md`). **UI-coherence polish + deputy battery DONE + merged** (`docs/reviews/feat-ui-coherence.md`): Select retrofit, shared tables/state/header cleanup, no-FAB deputy launcher, phone MyTasks reflow, and Deputy **C2 safe markdown + C3 typed widgets**; closure guards and IA cleanup also landed. **F (task #16, owner-gated)** = promote + deploy + secrets + backup drill + prod security gate + A4 job-GUC org-scope.
- *(Prior, 2026-07-07 — now history:)* MVP push shipped 5 slices A–E to `dev` dark behind flags; round-2 gpt-5.5 ×3 audit → SHIP-WITH-FIXES (blocklist A1–A6, now done).
- *(Prior, 2026-07-06 EOD — now history:)* staging LIVE up-to-BU-remap; COGS root-cause fix deployed; ADR-0022/0023/0024 + JTBD v0.3 accepted + merged to dev; grill session-2 decisions in `docs/decisions.md`.
- Kitchen Module + access roles + UI-revamp + Strategy→Execution cascade first slice **SHIPPED to main**.
- Agent-native platform port P1/P2/**P3a/P2.1 all on `dev`** (green CI, PRs #88/#89 MERGED 2026-07-06). `main`/`staging` deliberately conservative at up-to-BU-remap (`669ee0a`).
- CI-fix pass (task-detail async races, Home-v1 e2e `My Week`→Home route, Sales KPI locator scope,
  recovery password-policy, coverage timing budgets) landed via `c96fb5a` + `4f67080`; full local battery
  re-verified green (typecheck/eslint/2217 unit/449 pgTAP/22 e2e/build) + fresh GitHub `verify`+`db` green
  before merge.
- **Multi-agent hazard (hit + resolved 2026-07-06):** a parallel Codex session shared this working tree and
  moved HEAD mid-work. Two agents on one checkout = clobber risk. Owner stopped Codex; Director took sole
  ownership, adopted Codex's clean rebased stack (verified byte-identical code), merged, cleaned up stale
  branches. If HEAD ever looks wrong, check `git branch --show-current` + reflog before acting.
- **Delegation posture (owner-directed 2026-07-06):** orchestrate heavy build/fix via **pi** (GLM-4.7/GLM-5.2
  builders, gpt-5.6-luna cross-family reviewers — `docs/pi-delegation.md`) to preserve Anthropic tokens;
  Director retains verify + merge/git + final visual taste. (The #88/#89 close-out needed no code fix — it
  was git orchestration + CI-watch, no pi spend.)
- Remaining user-facing rollout work is owner-gated: staging db push, edge-function model secret/live
  deputy verify, P3b generateLink hook check, VAPID keys, and ESB PIC settlement answer.

## Current V3 follow-up — 2026-07-22 (local, unpushed)

- The Task collection's live `OverlayEntry` now receives a tenant-owned `leaveGuard` only while a
  record draft is dirty. The shared ConfirmDialog drives retain/discard for Close, Escape, and stack
  Back; `tasks-workspace.test.tsx` covers the real edit → failed save → Close → Cancel/Discard journey
  (`AC-V3-008`). Explicit full-page promotion also preserves `taskSurface: page` through router state.
- Focused evidence is **153/153** across Tasks workspace, Task surface, Task page mode, overlay host,
  and ConfirmDialog, with typecheck, ESLint, and Stylelint green. This is source/test evidence only:
  direct-route dirty browser navigation, fresh render, and three-width Back proof remain open.
- **Deputy coexistence preference (provisional owner note):** do not cover an open record with a second
  unrelated full-height desktop drawer. At wide widths use adjacent/side-by-side when the canvas
  supports it, otherwise a compact chat/launcher in the remaining canvas. On phone, the record stays
  primary and Deputy may sit on top as a compact chat surface because horizontal space is scarce.
  Shared host/stack still owns open/close, Back, focus, and promotion; Deputy owns transcript/actions.
- **Deputy shared-chrome companion cutover (local):** `AssistantPanel` is now chrome-free content
  mounted through `OverlayCompanionSlot` → the shared `RecordPanelHost`. The shared host owns border,
  shadow, header/Close, responsive modality, scrim, focus entry/trap/return, and Escape; the runtime
  context is state-only. Desktop still contracts beside an active record, while phone may layer above
  it; the phone goal test proves one Escape closes Deputy while the primary record remains mounted.
  This is a truthful partial stack migration: Deputy is not yet a primary `OverlaySession` frame, so
  browser Back and one-session route-stack ownership remain open, as does rendered 1280/1024/390 proof.
- **Tasks/Signals table convergence (local):** both live table renderers now consume the same explicit
  `record-collection-table` skin (full-width fixed layout · 14px body type · 38px header · 52px row ·
  shared padding/divider). Signals keeps its own Message/Author/Team/Occurred/Attention/Category
  anatomy, with stable column proportions, and its Occurred/Attention headers now use the same native
  keyboard-sort/`aria-sort` contract as Tasks while updating the URL-owned query. Focused source/goal
  evidence is recorded in `docs/reviews/v3-redesign.md`; no current render or owner three-width verdict
  is implied.
- **Deputy verification addendum (local):** independent rerun at `3d6c39c` is **94/94 focused tests**
  plus typecheck, ESLint/CSS lint, and diff-check. The phone preference is explicit: Deputy may layer
  above a mounted record when there is not enough horizontal space; one Escape closes Deputy first.
  Controller-owned browser Back/one-session stack semantics and live 1280/1024/390 geometry,
  focus, and phone scroll containment remain open. No server or Supabase was started.

- **Table convergence update (local, uncommitted, 2026-07-22):** Home's My Tasks table now reserves a
  proportional 34% title column so task identity is readable at desktop widths; Signals now uses a
  title/body cell with author/category metadata followed by Team, Occurred, and Attention (four decision
  columns, matching the E7/pre-E7 collection anatomy). The shared collection toolbar is split into primary
  view and query/filter/view-options bands. Focused evidence is MyTasksCard 17/17, SignalTable 6/6,
  Signals archive 20/20, and typecheck green. This remains **NO-SHIP** until the owner sees the live
  1280/1024/390 surfaces and the remaining card-remnant, shared-record-open, and final taste gates are
  explicitly resolved. A live Tasks render caught and fixed a P0 width regression (Task column computed
  at 0px); proportional columns now retain a readable identity column at 1024px. Driven proof covers
  Tasks/Signals at 1280/1024/390 and Home at 390; at 1024, page scrollTop moved while rail top stayed
  pinned at 56px.
