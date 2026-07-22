# V3 redesign convergence handoff — 2026-07-21

> **LATEST HANDOFF OVERRIDE — 2026-07-22:** Read `docs/agent-context.md`’s canonical current-state
> block first. This handoff contains historical lanes and is intentionally not rewritten line-by-line.
> The active local state is `v3-redesign` at committed tip `6ad6dc7` plus an uncommitted RecordViewer
> slice; no push/merge/deploy/Supabase start. The current post-slice collection/header smoke is 107/107
> focused tests, typecheck/CSS lint/changed ESLint, and inventory 58/13/76. The earlier 126/126 run is
> pre-header evidence. The focused TaskSurface/TasksLayout regression run is RED (25 failed / 77), so
> the old drawer goal tests and the new RecordViewer journey are not yet reconciled. The 34/40·9/10
> passage is historical, not current acceptance. Fresh 1280/1024/390 renders, E7 result-header/toolbar
> framing, and owner-eye RecordViewer/collection review remain open.

## Third-session correction (2026-07-21, current Director session)

The second-session handoff below claimed `v3/route-seam` and `v3/inbox-failclosed` were dispatched
to GLM-5.2 workers. **That was drift — both branches had ZERO commits, ZERO dirty files, ZERO
reflog movement. They were never started.** Treated as never-started; the Director implemented
their intended work directly across the third session:

- Lane A1 (inbox fail-closed) — `4de6339` (real `can()` wiring + 6 production-deps tests)
- Lane B3 (inbox pageTo + route-seam fallback) — `3ad5d9d` (`pageTo` on `OverlayEntryDraft`,
  bespoke `openFull` button retained as R-T-4 fallback)
- Lane B4 (follow-up drawer-first) — `f9c0d26` (`FollowUpRow` opens via shared host; drawer-first
  test proven)
- Lane B1 (Bell shell-slot 44% track) — `1c7da9b` (`drawer-shell-split` CSS, right-anchored track)
- Lane B2 (Deputy ↔ shell-overlay mutual-exclusion) — `7cc45f2` (`useDeputyOverlayCoexistence`
  hook; newest-intent-wins reconciliation)

The stale-base hazard (`v3/rv-live` and `v3/taskspage-fix` branched before the Inbox-live merge,
which a naive merge would have deleted) was resolved by rebasing both onto the post-Inbox-live
tip and merging cleanly (`e211c64`, `c9122b3`). Tip is now `7cc45f2`.

The second-session "ACTIVE LANES" and "QUEUED BEHIND route-seam" blocks in `docs/agent-context.md`
have been rewritten to match this reality. The claims table below stands as written evidence of
the second session's intent; the lane-state column should be read against the correction above.

**Multimodal audit blocker:** all three multimodal paths (NIM minimax-m3, NIM inkling, pi
gpt-5.6-luna) are currently unusable — NIM minimax-m3 hangs on image input (0% CPU after 3+ min),
and all 5 pi providers show unauthed since the prior session's tokens expired. The Wave-2c
4-lens audit and three-width representative gate are blocked on this. Geometry + diff evidence
stands in for the B1/B2 visual audits in the meantime; a batched re-audit is queued for when
owner re-auths pi or NIM recovers.

## Purpose

This is the resumable handoff for the current V3 redesign convergence wave. It exists so a new
Director or implementation harness can continue with the same product intent, evidence standard,
and adversarial quality bar without re-litigating the owner's history.

This is not a ship declaration. The local `v3-redesign` branch is still incomplete, unpushed, and
requires independent review plus the owner's walkthrough before merge or deploy.

## Owner goal and non-negotiable design intent

The redesign is meant to become one cohesive Management Operating System, not several old pages
assembled behind a new rail. The owner explicitly likes E7's visual styling, but not E7's inherited
IA/IxD. The target is therefore:

- E7 is the visual foundation: typography, color, density, tokens, cards, borders, and restrained
  geometry remain the authority.
- Owner law is the IA/IxD authority: collection-first work, drawer-first contextual records,
  canonical direct URLs, one overlay grammar, explicit Back/Escape/focus behavior, and no hidden
  page-only doors.
- Task, Signal, SOP/Standard, Inbox, and future records remain distinct database/domain models.
  Their UI may share a typed RecordViewer/RecordCollection grammar, but they are not one universal
  renderer and not one collapsed model.
- Feed, table, triage, board, list, or card are presentations over one collection engine. Grouping,
  filtering, sorting, saved views, URL state, permissions, selection/bulk-action capability,
  loading/error/empty/filtered-empty states, and record opening must not disappear when a
  presentation changes.
- Mockups are standing references, not a single snapshot to copy. The composite oracle is
  owner-word > lost-good behavior across versions > owning-mockup default. This is the protection
  against the moving-quicksand regression the owner described.
- Taste and Impeccable are anti-slop/craft lenses subordinate to the above: no decorative filler,
  dead controls, misleading success states, generic dashboard chrome, or interaction contracts
  that vary merely because a different page was built.

## Owner-directed UI convergence loop (2026-07-21)

The owner has explicitly shortened the loop for this redesign's visual/IxD convergence slices. Do
not make a worker spend an entire turn manufacturing red tests or re-reading the history before
the first visible implementation. The order is:

1. Implement the smallest end-to-end behavior against the existing contracts and owner oracle.
2. Run a bounded smoke check (focused tests if available, typecheck, changed lint/style, diff check).
3. Render the real surface at the relevant desktop/intermediate/phone widths; the owner's eye is the
   acceptance oracle for visual grammar, IA, and IxD.
4. Add or tighten goal-level tests after the behavior is visible, locking the observed journey and
   preventing regression. Tests still gate integration; this is not permission for proxy tests or
   unverified code.
5. Commit the coherent slice and record evidence in the ledger.

This is scoped to UI convergence work (RecordViewer, RecordCollection presentations, page-family,
overlay, and route interaction seams). Schema/security/data work retains the normal red-first and
stronger pre-change verification requirements. Historical TDD plans remain useful as acceptance
checklists, but a worker must not block a small visible UI implementation on exhaustive test
archaeology when the owner has already supplied the interaction intent.

## Authoritative reading order

Read these in order on a cold start:

1. `CLAUDE.md` and `AGENTS.md` — standing operating rules, gates, delegation, and no-push/merge
   checkpoint rules.
2. `docs/agent-context.md` — current state and active workers (this handoff is the detailed
   companion).
3. `docs/requirements-evolution.md` E8, `CONTEXT.md`, `DESIGN.md`, and `docs/specs/v3-redesign.spec.md`.
4. `docs/decisions.md` OD-REDESIGN-1..79 and `docs/reference/provenance/owner-directives-index.md`.
5. `docs/jtbd.md`, `docs/experience-contract.md`, `docs/interaction-contract.md`, and
   `docs/reference/twenty-ixd-patterns.md`.
6. `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` plus the referenced E7/lost-good
   artifacts; use the composite oracle above rather than treating E7 as the whole redesign.
7. This handoff, `docs/reviews/v3-redesign.md`, and `docs/reference/v3-live-inventory.md` for
   evidence and current implementation state.

## Current branch state

Target branch: `v3-redesign`, local only, implementation checkpoint `3250aa8` plus subsequent
documentation state commits. The branch includes the prior page-family/collection/modal/legacy-page
cleanup wave through `9695fd2`, the independently reviewed auth migration `93555ac`, and this
handoff. Nothing has been pushed, merged, or deployed.

### Completed and independently re-verified

Tasks live collection is landed at `15924dc` (source `542002b` from the Luna worktree) after an
independent Director verification. The production `TasksWorkspace` now consumes one typed
`useRecordCollection` loader/projection and `RecordCollectionSurface`; the mature Task table, card,
group, keyboard, phone, saved-view, loading/error/empty, and virtualization behavior remains the
goal-level oracle. Independent proof on the source worktree: 70 focused Tasks tests, typecheck,
ESLint, Stylelint, `git diff --check`, and the 10-test RecordCollection conformance guard all pass.
The worker's docs edits were intentionally not taken during cherry-pick because this handoff and
ledger are the newer canonical state; the evidence is recorded here instead. RecordViewer opening,
Inbox/Deputy host consumers, and rendered three-width acceptance remain open.

Signal collection convergence is landed at `5ab6a51` plus integration correction `3250aa8` (source
`30e816f`). The production Signal collection now visibly renders controlled grouping/collapse,
uses the injected opener while preserving collection query state, removes phantom selection and
misleading ambient Create Task actions, and separates archive workspace from direct focused-record
page family. Independent integrated proof: 56 focused Signal tests, typecheck, ESLint, Stylelint,
and `git diff --check` pass. Rendered owner review remains part of the final representative gate.

Auth control grammar is landed at `93555ac` (source commit `c4bf105`):

- Login and Recovery use the shared E7 `TextInput` for labelled credential fields and shared
  `Button` for primary submits.
- Auth-specific alerts, copy, labels, autocomplete, focus/error wiring, loading/double-submit
  behavior, and recovery flow remain page-owned where they carry domain semantics.
- Proxy CSS-class assertions were replaced with user-goal keyboard/required-field/aria-busy
  behavior coverage; no password-reveal affordance was invented where the existing contract had
  none.
- Luna evidence: 77 targeted tests, typecheck, ESLint, Stylelint, production build, and diff
  checks green. Director re-run on integrated `v3-redesign`: Login/Recovery 36 tests, typecheck,
  ESLint, and Stylelint green.

The production overlay host is landed at `9e2a8d1` (source `8934353` plus a whitespace-only gate
fix). `AppShell` now mounts exactly one shell-level `OverlayHostProvider` and one physical
`OverlayHostSlot owner="shell"`, preserving provider ordering, SHOW_ASSISTANT behavior, and
display-contents shell geometry. Director re-run: 36 shell/overlay tests, typecheck, ESLint,
Stylelint, and diff checks green. RecordViewer consumer migration is still pending; this commit
only establishes the production host.

Prior verified local wave (before `93555ac`) includes V3 page-family migration across Home,
catalog, Money, Café, and Follow-ups; shared collection controls for Tasks/Signals; ModalShell
convergence; deletion of unreachable Sales and My Week page islands; and deterministic inventory /
cohesion guards. See the latest sections of `docs/reviews/v3-redesign.md` for their exact commits
and batteries. This remains evidence, not a substitute for the final rendered three-width gate.

## Active implementation lanes

Only one local Supabase exists. None of these lanes may start it, run database reset, or run broad
browser/full-suite fan-out. Logs are redirected and non-streamed; inspect a lane's log once only
after its process exits.

| Lane | Substrate | Worktree / branch | Current state | Dependency / review rule |
|---|---|---|---|---|
| Overlay host | NIM Nemotron 3 Ultra 550B | `.claude/worktrees/v3-record-viewer-live` / `v3/record-viewer-live` | Complete; cherry-picked as `9e2a8d1` and independently verified | Host is landed; consumer RecordViewer/Inbox/Deputy migrations remain separate |
| Signal collection | NIM Nemotron 3 Ultra 550B → Luna xhigh verifier | `.claude/worktrees/v3-signals-frame` / `v3/signals-frame`; verifier thread `019f843e-6dd0-76d0-b4f0-9bed74b4b2d3` | Complete at source `30e816f`; integrated as `5ab6a51` + `3250aa8`; independently verified | 56 focused tests, typecheck/lint/style/diff green; final rendered owner review remains in Issue 9 |
| Tasks live collection | Luna xhigh | Source thread `019f8423-d2c9-7523-88cc-c470c2597a3e` | Complete at `542002b`; cherry-picked as `15924dc`, independently verified | Production `TasksWorkspace` uses one typed collection loader/projection and `RecordCollectionSurface`; RecordViewer remains separate |
| Home / People / More | Luna xhigh | Worktree `/Users/ariefsaid/.codex/worktrees/aaca/gordi-mos`; thread `019f844c-a942-7c12-992f-ae86618cfc88` | Active; owner-fast-path implementation | Must fix Home retry/projection duplication, People ViewTabs keyboard behavior, More focus return, and visible legacy `/tasks` links; no RecordViewer/Signal/Inbox/Café scope |
| Auth controls | Luna xhigh | Codex worktree from `v3/auth-control-grammar` (thread `019f8421-5176-7fe2-89e0-c3ad6a8cc30d`) | Complete; source commit `c4bf105` cherry-picked as `93555ac` | Already independently re-verified; do not duplicate |

## Ownership commitments (owner-directed, 2026-07-21)

The Director claims responsibility for independently reviewing and integrating the Signal,
RecordViewer, and Home/People/More worker results, then owning the remaining cross-surface work:

| Owner | Claimed work | Acceptance handoff |
|---|---|---|
| Signal worker | **Complete** — integrated `5ab6a51` + `3250aa8`; grouping/collapse, opener/query preservation, dead selection/Create Task removal, archive-vs-focused page family | Director independently reran 56 focused tests, typecheck/lint/style/diff; rendered review remains Issue 9 |
| RecordViewer worker | Task/Signal viewer bridge, drawer-first host opening, focus return, canonical page parity | Director focused tests, typed adapter inspection, then rendered review |
| Home/People/More worker | Retry callback, shared Tasks projection direction, ViewTabs keyboard contract, mobile More focus, canonical links | Director focused tests, keyboard journey, then rendered review |
| Director | Integration/review of all three lanes; representative gate; final docs and owner walkthrough | No push/merge/deploy until the owner sees the rendered representative slice |
| Inbox/Bell + Deputy | Claude opus (second Director session, owner-directed 2026-07-21) | `.claude/worktrees/v3-inbox-deputy` / `v3/inbox-deputy` | MERGED `fef7054`; Luna BLOCK findings routed (Critical → v3/inbox-failclosed; shell items queued behind route-seam) | Wire InboxTriage into production + Bell quick-open via the mounted host; Deputy focus-return via opener ref; shared state semantics; no Signal/Home/People scope |
| Follow-ups + Café | Claude opus (second Director session) | `.claude/worktrees/v3-cafe-followups` / `v3/cafe-followups` | MERGED `9c59eac`; Luna I1 finding queued behind route-seam | Typed Follow-up viewer adapter + drawer-first opening + URL door; R-OWNER-5 provisional reclassification; Café copy/nouns/routes centralization; no Signal/Home/People scope |
| Geometry/legacy | Claude opus (second Director session) | `.claude/worktrees/v3-geometry` / `v3/geometry` | MERGED; Luna .split parity finding owned by v3/taskspage-fix | Rail 236→232 binding parity; RecordPanelHost 40–45% track / intermediate sheet / phone geometry + split-Escape (R-T-5); no engine/adapter scope |
| RecordViewer live migration | Claude opus (second Director session) | `.claude/worktrees/v3-rv-live` / `v3/rv-live` | ACTIVE; owner-fast-path | Task+Signal panel CONTENT onto the Issue-5 RecordViewer via the mounted host; record-panel-host.tsx frame/CSS is OWNED BY the geometry lane — content only |
| Home / People / More (restart) | Claude sonnet (second Director session) | `.claude/worktrees/v3-hpm` / `v3/hpm` | MERGED `67a738f` (More-launcher focus gap → backlog) | Prior codex WIP not found (4380 missing, aaca clean) — restarted from integrated tip; Home retry/projection duplication, People ViewTabs keyboard, More focus return, legacy /tasks links |

No worker may claim another lane's acceptance, and no lane may start Supabase or broad browser/full-suite
fan-out. A worker's green result is a handoff, not completion; the Director owns the final visual/IxD
judgment and merge gate.

### Provider failures to preserve as handoff evidence

- Original NIM GLM Tasks call ended with an internal server error and no product diff.
- NIM DeepSeek Tasks and auth retries ended with HTTP 429 and no product diff (Tasks had only
  install-generated `package-lock.json` drift; auth had an uncommitted proxy-test block).
- Requesty Nemotron fallback ended with HTTP 502 provider-stream errors and no product diff.
- The failed lanes were not treated as green. Their setup-only lockfile/test artifacts were not
  cherry-picked. If a future retry needs those worktrees, inspect and remove only setup drift by
  evidence; never reset away real product edits.

## Luna adversarial audit ledger

These audits are the acceptance lens for the owner's repeated complaint that the app still feels
like several apps thrown together. They were read-only, source-evidenced, and explicitly used the
historical prompts, JTBD, E7 styling, composite oracle, Impeccable, and Taste. Thread IDs are kept
for provenance: `019f83f1-adcd-72b3-8ced-7640784d8758` and
`019f8405-bfd5-7953-b14f-4eeacf610a42`.

### Audit A — Tasks/Signals/geometry and collection grammar

Critical findings:

1. Signal grouping was computed and persisted by `signal-collection-adapter.tsx`, but the real
   table flattened `visibleRecords` in `signal-table-presentation.tsx`. A selected Team/Category/
   Attention grouping could therefore appear active while the table remained flat. Required proof
   is a driven URL/saved-view journey whose production presentation visibly renders group headers and
   collapse state.
2. Signal table opening hardcoded `/work/signals?record=...` instead of using the injected
   `onOpenRecord` contract. Filter/group/saved-view query state was dropped, making Back return to a
   different collection. Feed and table must share the opener and preserve the originating query.

Important findings:

- Signal selection was advertised and checkboxes rendered, but no bulk action/selection bar
  existed. Remove the capability until a real action exists, or add one meaningful action; never
  leave a dead checkbox affordance.
- Signal “Create Task” opened the Signal rather than creating a Task. Hide/rename until it routes
  to the canonical Task composer with Signal context, or implement that real path later.
- Direct Signal URLs were classified as focused records but still used raw `PageFrame` and a bespoke
  record host. The collection workspace and direct focused record need their correct page families;
  shared RecordViewer/host migration remains a separate dependency.
- Runtime E7 geometry still differs from binding DESIGN values (`--rail-w: 236px` vs 232px and
  50px rows vs 52px). Normalize only with computed desktop/intermediate/phone evidence, not a
  token-string test.
- Visible legacy `/tasks` links remain in Home/My Tasks even though router aliases pass redirect
  tests. Canonical links must be checked in driven journeys.

Proxy checks that are specifically unsafe: adapter tests that prove `groups` exists, table tests
that assert the stale `?record=` link, synthetic RecordCollection renderers, CSS token presence
checks, and route redirect tests that never drive the production source link.

### Audit B — Home/Inbox/Deputy/Follow-ups/Café/People and state grammar

Important findings:

- Inbox/Bell still uses the old standalone `/inbox` door and production `InboxList`; the implemented
  `InboxTriage` is not wired. After the host lands, Bell should quick-open triage in context on
  desktop/intermediate and navigate on phone, with one loader/target resolver/read-handled contract.
- Deputy closes without returning focus to its launcher. Pass an opener ref through the shared host
  close path and test launcher → open → Escape/X → launcher focus; do not add another overlay.
- Follow-ups still behave as a mini-app: a queue plus bespoke in-flow `<aside>` rather than a shared
  record door. It needs a typed Follow-up viewer adapter, drawer-first row opening, and direct URL
  focused-page promotion while preserving its distinct domain model.
- Café still leaks Kitchen/Pesanan nouns and `/kitchen/*` links in permission copy, review/back links,
  and role-dependent titles. Centralize Café-facing copy and canonical `/cafe/*` routes without
  renaming internal Kitchen modules or database schemas.
- Loading/empty/error semantics are not shared in Café, Inbox, and Follow-ups: bare skeletons,
  wrong “Couldn’t load tasks” copy, and success checkmarks for missing configuration. Use `LoadingShell`
  and `awaiting`/`blank`/`next-step` variants that describe reality.
- Home says “Refresh to try again” but its attention error branch supplies no lane retry callback.
  Add a local retry action and driven test.
- Home fetches tasks for attention/KPIs and separately mounts a bespoke My Tasks query/table/card
  renderer. After live Tasks lands, consume one projection/result and keep only a compact summary.
- People’s status filter uses raw tablist buttons instead of shared ViewTabs roving Arrow/Home/End
  behavior; add radiogroup semantics or the shared keyboard contract.
- Mobile More destination links call `onClose` without the route-safe focus return used by Escape/
  backdrop/X; focus can land on an unmounted link. Test navigation plus opener focus.

Proxy checks include standalone InboxTriage tests while production renders InboxList, pending host
  guards gated by `runIf`, Follow-ups tests that bypass the feature-flag redirect, Home tests that
  check retry copy without a callback, and People click/aria-selected tests without Arrow/Home/End.

## Dependency-ordered next work

1. Treat Signal collection convergence as complete at the bounded code/keyboard proof recorded
   above; final rendered owner review remains Issue 9 work.
2. Treat the Tasks live collection migration as complete only at the bounded unit/conformance
   layer proven above; rendered owner acceptance and RecordViewer opening remain separate.
3. Migrate Task and Signal record opening to the shared RecordViewer only after the host and live
   collection invariants are green. Preserve typed adapters and drawer-first/direct-page parity.
4. Cut Inbox/Bell and Deputy onto the shared host, including opener focus and phone behavior.
5. Migrate Follow-ups to its typed record door, then clean Café vocabulary/routes/state semantics.
6. Converge Home’s duplicate task query/retry path, People’s filter keyboard grammar, and More’s
   route-safe focus return.
7. Normalize E7 geometry and canonical links using computed three-width evidence.
8. Only then execute the structured-content dependency gate (Issues 7–9 first), representative
   rendered/driven owner gate, full stale-style cleanup, documentation closure, owner walkthrough,
   and only after approval push/merge/deploy.

## Completion standard for every slice

Do not accept a “green” source-only proxy as completion. Each slice must have a failing goal-level
test before production code, a narrow green proof at the owning layer, typecheck, changed ESLint /
Stylelint, `git diff --check`, and a real responsive/keyboard/focus check when the slice changes
interaction or geometry. Review the diff against the exact owner directive and the prior mockup
versions; document any deliberate deviation in the review ledger. Never start Supabase or broad
browser/full-suite fan-out in parallel. The owner must still see the rendered app before merge.

## Current handoff truth

At the time of writing, auth, the production overlay host, live Tasks collection migration, and this
documentation handoff are landed on `v3-redesign` (`93555ac`, `9e2a8d1`, `15924dc`, and the docs
checkpoints). Signal has active isolated review work; no production merge, push, deploy, or owner
walkthrough has occurred. A future agent must
update this section and `docs/agent-context.md` immediately after each reviewed cherry-pick.

## Current-tip audit addendum — 2026-07-22 (`a7eef31`)

The older Audit A/B lists above are historical strata. A fresh read-only integration UX/IA/IxD critic
and a visual/cohesion/Impeccable/Taste-equivalent critic rechecked the current source against the
owner’s redesign, 50+ QnA, divergence/convergence, and E7 oracle. The current **NO-SHIP** blockers are:

1. Task dirty-leave guard is not attached to the live overlay entry; real edit → Escape/Back retain or
   discard proof is missing.
2. Tasks and Signals still have parallel table/CSS families despite shared outer collection primitives;
   computed-style and driven 1280/1024/390 parity is missing.
3. Inbox remains bespoke outside `RecordCollectionSurface`; seeded Bell → queue → record → Back proof
   and final handled semantics are open (owner/data-gated, not guessed).
4. Deputy still has a separate fixed host/visual contract; focus return is fixed, host/stack choice is not.
5. Task/Signal RecordViewer anatomy and relation arrays are incomplete; cross-surface panel/page proof is open.
6. Café user-facing “Kitchen” strings, token/rhythm drift, and the provisional native-select I5 exception remain.

The source guards pass, but the conformance script covers Tasks paths only, not Signals/Inbox/Deputy, and
current screenshots are stale. Automation can cover geometry, computed parity, keyboard/Esc/Back/focus,
dirty-veto, seeded journeys, and overflow. The owner still must judge the final E7-styled “one app” result,
Signal card-soup/density, and strategic Inbox/Deputy/I5 exceptions. Do not treat the older “production
host still unmounted”, “Deputy focus return missing”, “Café first-Team heuristic”, or “phone Café tab
hardcoded” statements as current; those are resolved/stale and are called out in the completion audit.

## Owner table/Home feedback and next-agent score gate — 2026-07-22

The owner’s current feedback, preserved verbatim:

> “the table filters and views feels unpolished and too cluttered. it doesnt say tidy. it says confusing!
> why not use ui-ux-pro-max, taste and impeccable skills for how to structure this neatly. same goes for
> Home, styling feels unpolished. some has to big of whitespace, some feels too tight. when scrolled down,
> the sidebar follows to get scrolled as well”

> “e7 has better table structure”

> “even the pre-e7 has better table layout”

This is an acceptance gate, not a request for cosmetic tweaking. The current structured scores are:
current app **23/40**, E7 **27/40**, prior warmer/pre-E7 **19/40**; the prior task-table anatomy is
approximately **3.5/4** for scanability. Structural anti-slop is E7 **7/10** and prior warmer **4/10**.
These are rubric scores, not official Nielsen or automated Impeccable measurements.

Next implementation must aim for **≥27/40**, **≥7/10 structural anti-slop (target 8/10)**, and zero
P0 card soup, duplicate collection axes, browser-native saved-view primary UI, starved identity column,
or Tasks/Signals grammar divergence. It must be rendered at **1280/1024/390px** for Home, Tasks, and
Signals, with page scroll independent from the rail. E7 owns styling; pre-E7 task-table anatomy is
salvage only; the composite owner oracle owns IA/IxD. The next agent may implement visible behavior first,
then smoke-test, render/inspect, and add goal-level tests under the owner UI-fast-path rule. Do not claim
completion from source tests alone.
