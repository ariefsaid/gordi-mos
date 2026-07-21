# V3 redesign convergence handoff — 2026-07-21

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

Target branch: `v3-redesign`, local only, current tip `93555ac` (`refactor(auth): adopt shared
control grammar`). The branch includes the prior page-family/collection/modal/legacy-page cleanup
wave through `9695fd2`, plus the independently reviewed auth migration below. Nothing has been
pushed, merged, or deployed.

### Completed and independently re-verified

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
| Overlay host | NIM Nemotron 3 Ultra 550B | `.claude/worktrees/v3-record-viewer-live` / `v3/record-viewer-live` | Active; production edits in `app-shell.tsx`, `overlay-host.tsx`, tests, plus setup lockfile drift | Must prove exactly one shell-level provider/slot, owner-agnostic host, focus/Back/phone behavior; review before cherry-pick |
| Signal collection | NIM Nemotron 3 Ultra 550B | `.claude/worktrees/v3-signals-frame` / `v3/signals-frame` | Active; production and test edits | Must prove real grouping headers/collapse, opener/query preservation, no phantom selection, archive-vs-focused page families; do not accept adapter-only tests |
| Tasks live collection | Luna xhigh | Codex worktree from `v3/task-live-migration` (thread `019f8423-d2c9-7523-88cc-c470c2597a3e`) | Active; narrowing onto the live wiring seams | Must make production `TasksWorkspace` use one collection loader/projection and `RecordCollectionSurface`, preserve mature Task table/card/group/keyboard behavior, and avoid shell/RecordViewer scope |
| Auth controls | Luna xhigh | Codex worktree from `v3/auth-control-grammar` (thread `019f8421-5176-7fe2-89e0-c3ad6a8cc30d`) | Complete; source commit `c4bf105` cherry-picked as `93555ac` | Already independently re-verified; do not duplicate |

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

1. Review and cherry-pick the exiting Overlay host and Signal collection lanes independently. Run
   focused tests, typecheck/lint/style, and inspect the actual rendered/keyboard contracts.
2. Review the Tasks Luna result and prove the real production workspace uses one loader/projection.
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

At the time of writing, only auth is landed on `v3-redesign` (`93555ac`). Overlay and Signal have
uncommitted active work in their isolated branches; Tasks and auth follow-up have active Luna
threads. No production merge, push, deploy, or owner walkthrough has occurred. A future agent must
update this section and `docs/agent-context.md` immediately after each reviewed cherry-pick.
