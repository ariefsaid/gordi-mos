# V3 Issue 7 — Inbox triage + Deputy host adoption

> **Execution gate (mandatory):** This plan must be executed in a visible Codex task using
> `superpowers:executing-plans`. Do not use `superpowers:subagent-driven-development`, any
> subagent, or another execution lane. Stop at every dependency or owner gate below.
>
> **Issue boundary:** This is Issue 7 only. It consumes the landed Issue 3 page-family shell,
> Issue 4 shared overlay/panel/navigation host, Issue 5 RecordViewer opening contract, and Issue
> 6 RecordCollection contract. It does not re-implement or alter those architectures, and it does
> not include Café (Issue 8), the representative owner gate (Issue 9), or Issues 10–12.
>
> **Data-contract gate:** read/handled semantics below are provisional and owner-gated. This plan
> never equates read with handled. If the owner has not ratified the separate handled prerequisite,
> execution stops before the Handled view and no master acceptance criterion is marked complete.

## Outcome

Make Inbox and Deputy feel like members of the same product. An Inbox bell opens quick triage in
the shared host; selecting a notification pushes its canonical record into that same host stack.
Tasks, Signals, Inbox, and Deputy therefore share one opening grammar:

- 1280px and 1024px use the landed shared right-panel treatment; 390px uses the landed full-screen
  sheet. The exact breakpoint behavior is owned by Issue 4's `RecordPanelHost`, not by Inbox or
  Deputy.
- A direct URL, refresh, bookmark, or new tab promotes the same RecordViewer information
  hierarchy to the canonical full page. It is a second door to one record, not a second record or
  renderer.
- One physical host owns the surface. Related records push onto one stack; a new root replaces the
  current root. There is no top drawer, nested competing modal, or double panel.
- Browser Back, internal Back, Escape, explicit Close, opener focus return, dirty-state protection,
  anchored menus, and centered confirmations use the existing shared contracts.
- Notification, Task, Signal, and Follow-up remain separate typed domain/data models. Inbox only
  resolves a safe, permitted target into the landed RecordViewer adapter; it does not turn rows
  into a universal record union.

The user journey to prove is: a manager notices why something needs attention, opens the item in
context, understands the underlying record without losing the queue, takes an allowed action with
honest feedback, and can return to the exact place that started the work.

## Authorities and non-negotiable constraints

Read these again at the start of execution, then keep them open during implementation:

1. `CLAUDE.md` and `AGENTS.md` (repo charter and gates).
2. `docs/requirements-evolution.md`, `CONTEXT.md`, `docs/decisions.md` OD-REDESIGN-72 through
   OD-REDESIGN-79, and the applicable ADRs.
3. `DESIGN.md`, `docs/experience-contract.md`, `docs/interaction-contract.md`, and `docs/jtbd.md`.
4. `docs/specs/v3-redesign.spec.md` §§6.3–6.6, FR-V3-003/004/005/006/008/009/012/013,
   NFR-V3-001/003/004/005/006/007/008/009, and the exact master acceptance ownership table below;
   `docs/specs/record-panel-host.spec.md` FR-4/5/6 and AC-RPH-4/5/6 are separate host proofs.
5. `docs/reference/provenance/owner-directives-index.md`, the provenance prompt containing the
   verbatim owner feedback “inbox drawer opens on top, task drawer opens on the side… no cohesion”,
   the prompt containing “always be aware of the interaction layer,”
   `docs/reference/twenty-ixd-patterns.md`, and the E7/SALVAGE authority material.
6. The landed Issue 3/4/5/6 source, tests, and review-ledger entries. The current base has only the
   planning checkpoint for these later application slices, so do not treat a planned export as a
   present API.

The following rules are binding:

- No Supabase, migration, schema, RLS, seed, or data-model change is made by this plan or its Issue 7
  implementation commits. If the owner ratifies handled, the separate prerequisite is the exact
  `supabase/migrations/20260720000001_mos_notifications_handled.sql` plus
  `supabase/tests/100_mos_notifications_handled.sql`; it must land and pass before Issue 7 may
  implement Handled. That prerequisite may add only private `handled_at` state and its guarded
  update path; it must not be smuggled into an Inbox UI commit. If the existing notification
  contract cannot prove a required state or target, stop and record the contradiction; do not infer
  a producer, add a universal record table, or weaken a permission check.
- No new drawer, overlay provider, route-history implementation, RecordViewer, RecordCollection, or
  local Deputy host. Use the one landed Issue 4 `OverlayHostProvider`/`OverlayHostSlot` and its
  `RecordPanelHost`.
- Do not flip `SHOW_FOLLOWUPS`, bypass `RequireCapability`, expose a hidden command-only action, or
  display an action a member cannot execute. A disabled/unavailable target is explained honestly;
  it is not replaced with a fake link.
- Every behavior starts with a failing test, then the smallest production change, then a focused
  green run. Keep commits small and include
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- The merge gate remains ≥80% changed-code line coverage, zero TypeScript errors, zero ESLint
  warnings/errors, build success, focused browser proof, and the four-lens UI review. Owner
  approval is required at the Issue 7 boundary and before push/merge/deploy.

## Dependency preflight — stop conditions before the first RED test

Run these read-only checks from the repository root before entering `mos-app/`. The Issue 4 guard
surface is fixed by the final plan at `ab3160a` and the Director checkpoint `296d6bb`; the Issue 5
RecordViewer and Issue 6 RecordCollection contracts may still be pending, but their exact exports,
tests, and review-ledger completion must be present before the dependent RED set is written.

```sh
git status --short --branch
git show -s --format='%H %s' ab3160a 296d6bb
git show ab3160a:docs/plans/2026-07-20-v3-overlay-host.md | rg -n "OverlayLeaveIntent|OverlayLeaveGuard|pendingLeave|approval token|OverlayHostApi"
git show 296d6bb:docs/plans/2026-07-20-v3-overlay-host.md | rg -n "OverlayLeaveIntent|OverlayLeaveGuard|pendingLeave|approval token|OverlayHostApi"
rg -n "OverlayHostProvider|OverlayHostSlot|useOverlayHost|OverlayLeaveIntent|OverlayLeaveGuard|pendingLeave" mos-app/src/shell
rg -n "RecordViewer|RecordCollection|RecordRouteAdapter|pageTo|toPanel|toPage|readPanelId" mos-app/src docs
rg -n "Issue 4|Issue 5|Issue 6" docs/agent-context.md docs/reviews/v3-redesign.md docs/backlog.md
```

Expected result: the worktree is clean before Issue 7 work, `OverlayHostApi` has the async guard
surface below, `OverlayEntry.leaveGuard` is accepted by the host, and the exact Issue 5/6 viewer and
collection exports/test paths are visible in source. If either specified Issue 4 commit is absent,
the final API is narrowed, or the Issue 5/6 review entries do not show verified completion, stop
with no production edit; do not repair a dependency inside this issue. Rebase onto the verified
dependency checkpoint and repeat the preflight.

Consume this final Issue 4 contract exactly; do not add a local `beforeClose`, dirty boolean, second
host, or tenant-owned history implementation:

```ts
type OverlayLeaveIntent =
  | { kind: 'close'; via: 'explicit-close' | 'escape'; from: OverlayEntrySummary }
  | { kind: 'back'; via: 'internal-back'; from: OverlayEntrySummary; depth: number }
  | {
      kind: 'replace'
      via: 'push' | 'replace-root' | 'replace-current'
      from: OverlayEntrySummary
      to: OverlayEntrySummary
    }
  | { kind: 'open-page'; via: 'open-page'; from: OverlayEntrySummary; to: To }
  | {
      kind: 'browser-pop'
      direction: 'back' | 'forward'
      from: OverlayHistoryMarker
      to: OverlayHistoryMarker | null
      delta: number
    }

type OverlayLeaveGuard = (
  intent: OverlayLeaveIntent,
) => Promise<{ decision: 'allow' | 'deny' }>

type OverlayEntry = {
  key: string
  owner: OverlayOwner
  tenant: 'record' | 'deputy' | 'quick'
  label: string
  title?: React.ReactNode
  pageTo?: To
  content: React.ReactNode
  leaveGuard?: OverlayLeaveGuard
}

type OverlayHostApi = {
  session: OverlaySession | null
  pendingLeave: OverlayLeaveRequest | null
  openRoot(entry: OverlayEntry, mode: OverlaySession['mode']): Promise<OverlayTransitionResult>
  replaceRoot(entry: OverlayEntry): Promise<OverlayTransitionResult>
  push(entry: OverlayEntry): Promise<OverlayTransitionResult>
  replaceCurrent(entry: OverlayEntry): Promise<OverlayTransitionResult>
  back(): Promise<OverlayTransitionResult>
  close(via?: 'explicit-close' | 'escape'): Promise<OverlayTransitionResult>
  openPage(to: To): Promise<OverlayTransitionResult>
}

type RecordRouteAdapter = {
  toPanel(recordId: string, source: Location): To
  toPage(recordId: string, source: Location): To
  toCollection(source: Location): To
  readPanelId(location: Location): string | null
}
```

`close('explicit-close')`, `close('escape')`, internal `back`, root/current replacement, linked-record
`push`, page promotion, and browser Back/Forward all call the same guarded transition. A missing
guard commits immediately; a denied guard returns `{ status: 'denied' }` without unmounting content or
moving focus. The host coalesces repeated requests into one `pendingLeave`, treats a rejected guard
as deny, restores a browser POP URL/marker before awaiting the guard, and consumes its private
approval token exactly once after allow. The active tenant owns the confirmation and copy through
`ModalShell`; the generic host never reads Deputy draft state. `RecordRouteAdapter` is URL plumbing
only, never a Task/Signal row or viewer field map. `OverlayHostSlot` remains the only renderer of
`RecordPanelHost` and the only source of `data-overlay-host="true"`.

Inbox quick triage and Deputy use `owner: 'shell'`; this plan-era statement applies to the ephemeral
bell/Deputy doors only. The current `/inbox` page route uses the added page-owned `owner: 'inbox'`
slot so its record panel participates in the collection split geometry. A quick triage root remains
ephemeral and does not change the URL on desktop; `/inbox` remains the direct route door.

### Evidence-led data seam gate

| Seam | Exact current evidence | Current truth | Conflict | Reconcile without owner choice? | Issue 7 disposition |
|---|---|---|---|---|---|
| Inbox read vs handled | `supabase/migrations/20260706000002_mos_notifications.sql:1-10,13-26,58-88`; `mos-app/src/lib/db/notifications.ts:19-27,47-67`; `mos-app/src/hooks/useNotifications.ts:17-20,51-63` | `mos.notifications` has private `owner_id` and `read_at`; its trigger permits only `read_at`; the client has only mark-read and unread count | Current J06/OD law requires private, distinct read and handled; older P3 code has only read | Yes, but only after owner ratifies the provisional law and a separate reversible migration/RLS proof lands | Stop before Handled UI/claim unless ratified; never make read equal handled |
| Notification target identity | `mos-app/src/lib/db/notifications.ts:10-27,73-80`; `supabase/migrations/20260716000004_mos_fan_out_signal_mention.sql:43-46`; `supabase/migrations/20260717000002_mos_create_signal_with_mentions.sql:71-85`; `mos-app/src/lib/comments/postComment.ts:98-104` | Current envelope is open metadata with `{ type, id, route }`; producers write raw routes, and comment mentions include legacy kinds | Raw route is not canonical authority; some kinds have no Issue 5 viewer/RecordViewer door | Yes, with an allow-listed typed registry/resolver and producer envelope cleanup; no universal record model | Fail closed on unknown/denied/cross-org/malformed/feature-off; route is legacy input only |

The provisional, owner-gated semantics to encode in the prerequisite are:

- `read_at` means this person has seen/opened the notification.
- `handled_at` means this person explicitly triaged it out of their active Inbox queue.
- Opening marks read only. An explicit “Mark handled” action may also mark read.
- Read-but-unhandled is valid. Handled never means Task complete, Signal acknowledged, approved, or
  owned; Signal acknowledgement remains a separate Signal-domain state.
- Handled belongs only to the private notification row; no `handled_by` is added. The migration/RLS
  proof allows only `read_at`/`handled_at` updates, preserves `org_id`/`owner_id` scope, and leaves
  title/body/severity/metadata immutable.

The smallest production prerequisite, if ratified, is one owner-approved change at
`supabase/migrations/20260720000001_mos_notifications_handled.sql` with pgTAP coverage in
`supabase/tests/100_mos_notifications_handled.sql`: add nullable `handled_at`, preserve owner-only
RLS, pin the update trigger to those two columns, prove read-only/read-but-unhandled/handled and
cross-owner/content-update rejection, and prove a handled optimistic update can roll back. Do not
create or run that migration in this Issue 7 plan. If the owner does not ratify it, `All` and `Unread`
remain the only executable notification filters and no dead Handled affordance is rendered.

The target-envelope cleanup is the other preflight prerequisite, also not authored or executed in
this plan's one-file amendment. An owner-authorized data seam change, if required by the landed
Issue 5/6 adapters, has one exact migration path at
`supabase/migrations/20260720000002_mos_notification_target_envelope.sql` to replace the two live
Signal fan-out function bodies without producer `route` authority; its existing behavior is proved
by `supabase/tests/89_signal_fanout_comments.sql` and `supabase/tests/90_signal_create_rpc.sql`.
The client mention producer is `mos-app/src/lib/comments/postComment.ts` with
`mos-app/src/lib/comments/postComment.test.ts`. The change preserves `source`, emits typed `{type,id}`
identity for Task/Signal/Follow-up, leaves legacy `weekly_update`/`daily_log` non-openable, and
does not invent actor/reason/next-action facts. If the dependency checkpoint already contains this
cleanup, verify it; if not, stop before claiming complete J06 arrival facts rather than editing
Supabase from Issue 7.

## Current seam map and planned ownership

| Concern | Current source | Current proof | Issue 7 change | Must remain out of scope |
|---|---|---|---|---|
| Notification query/read/handled state | `mos-app/src/lib/db/notifications.ts`, `mos-app/src/hooks/useNotifications.ts` | `mos-app/src/lib/db/notifications.test.ts`, `mos-app/src/hooks/useNotifications.test.ts`; prerequisite pgTAP path above | Preserve bounded list, read-only open behavior, optimistic rollback, retry, and the owner-gated Handled action; All/Unread/Handled view state must come from the landed Issue 6 collection seam | Applying the handled migration/RLS in Issue 7, equating read with handled, or adding `handled_by` |
| Inbox page/list | `mos-app/src/pages/inbox-page.tsx`, `mos-app/src/components/inbox/InboxList.tsx` | `inbox-page.test.tsx`, `InboxList.test.tsx` | Make page and quick triage share content/state and open callback; keep collection/query ownership in landed Issue 6 | A second collection engine, a local drawer |
| Bell door | `mos-app/src/shell/top-bar.tsx` | `top-bar.test.tsx` | Open ephemeral quick triage through shell host on desktop/intermediate; navigate to `/inbox` on phone; return focus to bell | Bell-specific panel, command-only access |
| Deputy door | `mos-app/src/shell/app-shell.tsx`, `mos-app/src/components/assistant/AssistantPanel.tsx`, `mos-app/src/lib/agent/runtime/AgentRuntimeContext.tsx` | Assistant panel/runtime tests, command tests | Consume the Issue 4 shell host migration; verify Deputy replaces/stacks in the same host and respects capability/dirty-close contract | Rewriting host runtime, adding another fixed panel |
| Command launcher | `mos-app/src/components/command/command-menu.tsx`, `use-command-menu.ts` | `command-menu.test.tsx`, `use-command-menu.test.ts` | Keep centered command surface; filter `Ask Deputy` from the same effective capability/feature state as the top-bar door | Universal action bypass or fake disabled affordance |
| Canonical route/query | `mos-app/src/router.tsx`, `notificationRoute`, task/signal route seams | `router.test.tsx`, task/signal page-mode tests | Resolve safe target, preserve source query on panel close/back, promote direct URL to canonical page | A second notification route format |
| Producer notification envelopes | `supabase/migrations/20260716000004_mos_fan_out_signal_mention.sql`, `supabase/migrations/20260717000002_mos_create_signal_with_mentions.sql`, `mos-app/src/lib/comments/postComment.ts` | `supabase/tests/89_signal_fanout_comments.sql`, `supabase/tests/90_signal_create_rpc.sql`, `mos-app/src/lib/comments/postComment.test.ts` | Owner-gated prerequisite cleanup removes producer `route` authority, preserves existing `source` values, and emits only `{type,id}` typed target references; unsupported comment kinds stay honest/non-openable | No schema/table invention, no client-authored permission bypass, no invented actor/reason/next-action facts |
| Shared record surface | Landed Issue 4 `mos-app/src/shell/overlay-host.tsx`, `overlay-navigation.ts`, `record-panel-host.tsx`; landed Issue 5 viewer | Issue 4/5 ledgers and tests | Pass quick triage and typed target viewer entries into the existing host | Any Inbox/Deputy `RecordPanelHost` import or host slot |
| Follow-up domain | `mos-app/src/components/follow-ups/*`, `mos-app/src/pages/follow-ups-page.tsx`, `mos-app/src/lib/db/follow-ups.ts` | follow-up page/embed tests | Keep the money-shaped model; unavailable/flag-off targets are honest and read-only | Renaming to Notification/Task or enabling the flag |
| Regression guard | `mos-app/src/cohesion-chrome.regression.test.ts` and host tests | existing z-index/focus/static checks | Add a narrow Issue 7 no-legacy-host/no-double-panel guard | Broad brittle snapshots or app-wide source bans |

## Target and content contracts

Create only Issue 7-owned adapters under `mos-app/src/components/inbox/`; reuse the exact landed
Issue 5/6 modules after the dependency preflight. The target boundary is typed and fail-closed:

```ts
type NotificationTargetType = 'task' | 'signal' | 'follow_up'

type NotificationTargetRef = {
  type: NotificationTargetType
  id: string
}

type NotificationDeliveryEnvelope = {
  source: 'signal_mention' | 'mention'
  entity: NotificationTargetRef
  actor_id?: string
  reason_key?: string
  next_action_key?: string
}

type NotificationTargetResolution =
  | {
      status: 'available'
      key: string
      ref: NotificationTargetRef
      entry: Pick<OverlayEntry, 'key' | 'owner' | 'tenant' | 'label' | 'title' | 'pageTo' | 'content'>
    }
  | {
      status: 'unavailable'
      key: string
      reason:
        | 'malformed-target'
        | 'unknown-type'
        | 'unsafe-legacy-route'
        | 'missing-record'
        | 'permission-denied'
        | 'cross-org'
        | 'feature-off'
      messageKey: string
    }

type InboxTriageState = 'loading' | 'ready' | 'empty' | 'error'
type InboxFilter = 'all' | 'unread' | 'handled'

type InboxTriageProps = {
  mode: 'page' | 'quick'
  state: InboxTriageState
  rows: readonly NotificationRow[]
  filter: InboxFilter
  handledFilterAvailable: boolean
  onFilterChange(filter: InboxFilter): void
  onOpen(row: NotificationRow): void
  onMarkHandled?(row: NotificationRow): void
  onRetry(): void
}
```

`NotificationTargetRef` is the only openable identity. An allow-listed registry keyed by `type + id`
selects the typed Task, Signal, or Follow-up RecordViewer adapter and derives the canonical
`OverlayEntry.pageTo`/viewer content from that adapter. `NotificationTargetResolution` is an
Issue 7 routing/presentation result, not a domain model. The producer `entity.route` is legacy input
only: the resolver may validate it for diagnostics or ignore it, but it never uses it as route
authority. No resolver call may navigate an arbitrary metadata route.

Unknown, denied, cross-org, malformed, missing, or feature-off targets return the unavailable state
with honest copy and retry only where retry can change state. Follow-up stays disabled while
`SHOW_FOLLOWUPS` is false; a member never receives a hidden command-only door. A legacy comment
target such as `weekly_update` or `daily_log` is not cast to `follow_up`; it remains non-openable.

The two live Signal fan-out functions and `postComment` must converge on the same persisted envelope:
retain the existing `source` values, make `entity` contain only typed `{ type, id }` identity, and
remove `route` from producer authority. If a producer cannot author `actor_id`, `reason_key`, or
`next_action_key` from a trustworthy existing source, leave that fact absent and render no invented
label; the omission remains a data-contract checkpoint. This cleanup is a prerequisite task at the
exact producer paths in the seam table, not a universal record table or a client-side permission
decision.

`handledFilterAvailable` is `false` until the owner ratifies the provisional semantics and the
separate migration/pgTAP prerequisite passes. When false, omit Handled rather than render a dead tab.
When true, All/Unread/Handled are persisted views owned by the landed Issue 6 RecordCollection
contract, with semantics `all`, `read_at IS NULL`, and `handled_at IS NOT NULL`; never filter a local
copy or make opening a row mark it handled. A read-but-unhandled row must remain representable.

The triage content must be chrome-free: no fixed positioning, body scroll lock, focus trap, dialog
role, scrim, or close button. The host owns those concerns. Retain realistic Gordi row copy (`title`,
`body`, severity, time) and render only documented source/actor/reason/next-action facts. J06 requires
those facts for a complete arrival explanation; if existing producers do not provide them, show the
available facts and record the exact omission, never fabricated labels.

## TDD execution steps

Each step is a red-green-refactor checkpoint. Run the RED command before production code and retain
the failure in the task transcript. Do not use a snapshot as the behavioral oracle.

### 0. Re-run dependency and branch gates (read-only)

Run:

```sh
cd mos-app
npm test -- --run src/shell/overlay-navigation.test.ts src/shell/overlay-host.test.tsx src/shell/record-panel-host.test.tsx
npm test -- --run src/components/tasks/task-drawer.test.tsx src/pages/signals-archive-page.test.tsx
git diff --check
```

Expected: exit 0 for every landed dependency test and no whitespace errors. The first command must
also prove async `leaveGuard` intent coverage, pending-request coalescing, browser POP restoration,
and single approval-token consumption. If an expected Issue 4/5/6 file is absent, its API differs
from the contract, or its tests are not green, stop before the next step. Do not repair dependency
work inside this issue.

### 1. Write the regression oracles first

Add `mos-app/src/components/inbox/inbox-target.test.ts` and
`mos-app/src/components/inbox/inbox-triage.test.tsx`; extend the exact existing tests named in the
seam map only where their current behavior is intentionally changed. Add
`mos-app/src/shell/inbox-deputy-host.regression.test.ts` for deterministic source/DOM guards.

The first RED set must use descriptive behavior names and map only to the exact ownership table below:

- `AC-V3-006` / `AC-RPH-4`: bell opens quick triage, row selection pushes the typed record, Back
  returns to triage, Close returns to the underlying page/opener, and desktop quick open does not
  invent a URL.
- `AC-RPH-5` plus `FR-V3-012`: Inbox and Deputy share the shell-owned host tenant; no second host,
  scrim, or drawer is created.
- `FR-V3-003/004/006/012` plus AC-RPH-5/6: a record panel plus Deputy/another record stacks or
  replaces through the shared host and never renders two overlapping side panels; this is regression
  evidence for the Issue 9-owned master criterion, not an AC-V3-003 test label.
- `FR-V3-008` plus J06: an unauthorized or unavailable target keeps readable hierarchy and has no
  edit/lifecycle affordance; separate malformed/feature-off tests remain descriptive evidence for
  the Issue 5-owned permission criterion.
- `FR-V3-007/013` plus J06: persisted triage view state and consecutive opens retain queue context;
  read/handled semantics tests are descriptive evidence for the Issue 6 collection owner.

RED command:

```sh
npm test -- --run \
  src/components/inbox/inbox-target.test.ts \
  src/components/inbox/inbox-triage.test.tsx \
  src/shell/inbox-deputy-host.regression.test.ts
```

Expected RED: Vitest reports the new named tests failing because the target adapter, host entry
flow, and regression guard do not yet exist; the command exits non-zero. A test that passes before
the corresponding implementation is not a useful RED oracle and must be rewritten.

### 2. Resolve notification targets without changing data contracts

Implement the pure adapter in `mos-app/src/components/inbox/inbox-target.ts` and test it in
`mos-app/src/components/inbox/inbox-target.test.ts` with fixtures built from the existing
`NotificationRow` shape and the landed viewer/route interfaces:

- safe Task, Signal, and Follow-up target refs resolve through the allow-listed registry to their
  existing canonical `pageTo` and typed viewer content;
- a raw producer route that is external, `//`, stale, or inconsistent is ignored or rejected as
  legacy input; it can never override the typed adapter's canonical route;
- an unknown/malformed target, missing record, cross-org target, denied record, or feature-off
  Follow-up is unavailable;
- a target never loads a different domain model merely because `metadata` contains arbitrary keys;
- the source collection/query is preserved for return and the canonical URL is one stable door;
- a read-only viewer has no edit/lifecycle action unless the effective capability allows it;
- legacy `weekly_update`/`daily_log` comment targets remain honest and non-openable rather than being
  cast to Follow-up;
- Signal fan-out and comment producer fixtures use the same `{ source, entity: { type, id } }`
  envelope and contain no route authority.

GREEN command:

```sh
npm test -- --run src/components/inbox/inbox-target.test.ts
```

Expected GREEN: exit 0; every target-security, canonical-route, typed-adapter, producer-envelope,
and permission test passes. `notificationRoute` may remain as a legacy format validator for old
callers, but `inbox-target.ts` must not use it as canonical authority. Do not add handled fields in
this task; that remains behind the owner-gated prerequisite.

### 3. Make one chrome-free Inbox triage content surface

Refactor `mos-app/src/pages/inbox-page.tsx` and `mos-app/src/components/inbox/InboxList.tsx` only
through the Issue 7 triage adapter at `mos-app/src/components/inbox/inbox-triage.tsx`, with tests in
`mos-app/src/components/inbox/inbox-triage.test.tsx`,
`mos-app/src/components/inbox/read-handled-semantics.test.ts`,
`mos-app/src/pages/inbox-page.test.tsx`, and `mos-app/src/components/inbox/InboxList.test.tsx`.

The triage surface owns the Inbox collection's documented filter/query state through the landed
Issue 6 collection contract. It does not own overlay state or history. It must prove:

- loading, error with Retry, empty, ready, read-only, unavailable-target, and optimistic pending
  feedback states;
- `All` and `Unread` use `read_at` exactly as currently documented; opening marks read only;
- after owner ratification plus the separate migration/pgTAP prerequisite, `Handled` uses the
  persisted Issue 6 view seam and `handled_at IS NOT NULL`; explicit Mark handled may also mark read,
  while read-but-unhandled remains valid and visible in the correct views;
- row click invokes one `onOpen(row)` callback, marks read optimistically, rolls back on failure,
  disables the pending action with `aria-busy`, and exposes a concise `role="status"` message;
- explicit Mark handled has its own optimistic update and rollback proof; it never changes Task
  completion, Signal acknowledgement, approval, or ownership state;
- the list can be rendered as page content or quick content without changing row meaning;
- source/actor/reason/required-next-action are shown only when supplied by the documented metadata
  contract; realistic Gordi copy stays in the i18n message catalog, not scattered in JSX;
- filter/query/sort/group/saved-view state is delegated to the landed Issue 6 RecordCollection seam;
  no Inbox-local filter store is introduced;
- all row and filter controls have keyboard-visible focus, localized labels, and at least 44px phone
  hit areas; no hover-only action is required.

RED command (run before the refactor):

```sh
npm test -- --run \
  src/pages/inbox-page.test.tsx \
  src/components/inbox/InboxList.test.tsx \
  src/components/inbox/inbox-triage.test.tsx \
  src/hooks/useNotifications.test.ts
```

Expected RED: the new mode/filter/state/focus/rollback assertions fail; existing loading/error/
empty/row tests remain useful and identify regressions. GREEN after the implementation:

```sh
npm test -- --run \
  src/pages/inbox-page.test.tsx \
  src/components/inbox/InboxList.test.tsx \
  src/components/inbox/inbox-triage.test.tsx \
  src/hooks/useNotifications.test.ts
```

Expected GREEN: exit 0; all named tests pass, including the pre-existing optimistic rollback tests.
If the owner gate is not ratified, the command covers only All/Unread/read behavior and must not
include a Handled branch or Handled acceptance claim. After ratification, add the exact
`markNotificationHandled`/persisted-view tests and retain the prerequisite pgTAP result in the
checkpoint ledger.

### 4. Wire the Inbox two doors through the shared host

Modify only the Inbox/bell seams after the shared host is available:

- `mos-app/src/shell/top-bar.tsx` and `mos-app/src/shell/top-bar.test.tsx`: the bell is an honest
  door. On desktop/intermediate it awaits `useOverlayHost().openRoot()` with one shell-owned,
  quick-tenant entry. On phone it navigates to `/inbox`; it does not render a different drawer.
  Preserve the unread badge and locale labels.
- `mos-app/src/pages/inbox-page.tsx` and `mos-app/src/pages/inbox-page.test.tsx`: page-mode opening
  calls the same target resolver and host entry grammar; direct canonical routes remain page mode.
- `mos-app/src/components/inbox/inbox-triage.tsx` and its tests: a row from either door pushes one
  record entry with the landed viewer adapter and awaits the host transition result. A duplicate key
  must use the host's duplicate-stack behavior, not mount a second panel.

Required interaction tests:

1. Bell → quick triage leaves the desktop URL unchanged; Close restores focus to the bell.
2. Quick triage → notification marks it read and pushes the same canonical record identity;
   internal Back returns to the exact triage filter/scroll context; Close closes the root.
3. Browser Back follows the host history marker one frame at a time, then returns to the underlying
   page; Escape follows the shared host rule and returns focus.
4. `/inbox` refresh/bookmark/new tab is full page; a canonical Task/Signal/Follow-up URL is full
   page, with the same ordered identity/metadata/relations/content/activity/actions hierarchy as
   the panel. Closing the panel preserves the collection query.
5. If ratified, All/Unread/Handled restore the same persisted Issue 6 view state through page and
   quick doors; opening marks read only and explicit Mark handled is private notification state.
6. No Inbox source file imports or renders `RecordPanelHost`, `OverlayHostSlot`, a scrim, or a
   fixed drawer. It calls the host controller; the shell slot is the only renderer.

Focused GREEN command:

```sh
npm test -- --run \
  src/shell/top-bar.test.tsx \
  src/pages/inbox-page.test.tsx \
  src/components/inbox/inbox-target.test.ts \
  src/components/inbox/inbox-triage.test.tsx \
  src/shell/overlay-host.test.tsx
```

Expected GREEN: exit 0; the named bell, two-door, stack, URL, focus, and no-local-host tests pass.

### 5. Cut Deputy over to the same host without changing its domain

Consume the landed Issue 4 Deputy migration in
`mos-app/src/shell/app-shell.tsx`, `mos-app/src/components/assistant/AssistantPanel.tsx`, and
`mos-app/src/lib/agent/runtime/AgentRuntimeContext.tsx`; do not rework the host implementation.
Use the current Deputy runtime/transcript contracts and retain grounded/proposed effect behavior
from J05.

Add/extend tests beside the existing Assistant and command tests to prove:

- Deputy and Inbox entries share the one shell-owned physical host and never produce two visible
  panels or two scrims.
- opening Deputy from the top-bar door or the command palette is gated by the same
  `SHOW_ASSISTANT` and effective capability state; flag-off means no top-bar, route, or command
  action, not a hidden command-only access path;
- a member sees only allowed Deputy actions and can distinguish read-only, unavailable, loading,
  retry, and error states;
- opening Deputy while Inbox/record is present follows the host's declared replace/push rule and
  leaves no abandoned overlay in the DOM;
- a dirty Deputy draft cannot be dismissed by Close, Escape, browser Back, opening another root, or
  a phone gesture without the centered discard confirmation. Cancel preserves the draft and focus;
  Confirm discards it and returns to the correct opener/underlying page. This test is a mandatory
  dependency on the final Issue 4 `leaveGuard(intent)` seam described above. Exercise the exact
  `close`, `back`, `replace`, `open-page`, and `browser-pop` intents; duplicate leave requests must
  coalesce, guard denial must leave content/URL/focus in place, and allow must consume the host's
  private approval token once.

Do not add a local `beforeClose` or bypass to `OverlayHostApi` here. If `leaveGuard(intent)` is absent
from the landed Issue 4 API, stop and report the issue boundary contradiction rather than modifying
Issue 4 architecture in this plan.

RED/GREEN command:

```sh
npm test -- --run \
  src/shell/overlay-navigation.test.ts \
  src/components/assistant/AssistantPanel.test.tsx \
  src/lib/agent/runtime/AgentRuntimeProvider.test.tsx \
  src/components/command/command-menu.test.tsx \
  src/shell/top-bar-assistant.test.tsx \
  src/shell/inbox-deputy-host.regression.test.ts
```

Expected RED: the new same-host, flag/capability, no-double-panel, and dirty-veto tests fail before
the host adoption. Expected GREEN: exit 0 with those tests and all existing Assistant/runtime
behavior passing. The guard matrix must show one pending request, exact typed intent, deny/allow URL
restoration, focus preservation/return, and one approval-token consumption. If the dirty-veto test
cannot be expressed against the landed API, stop rather than weakening the assertion.

### 6. Complete direct-page, query, permission, and state coverage

Use the landed Issue 5 RecordViewer opening contract and Issue 6 collection contract in the existing
route seams. Do not create a parallel URL/query store. Exercise these exact current paths:

- `mos-app/src/router.tsx` and `mos-app/src/router.test.tsx` for `/inbox`, canonical Task/Signal
  routes, safe notification routes, and feature-off Follow-up behavior;
- `mos-app/src/pages/signals-archive-page.tsx` and
  `mos-app/src/components/signals/signal-record-host.tsx` only at the adapter/opening seam, with
  their existing tests proving Signal remains a Signal model;
- `mos-app/src/components/tasks/task-drawer.tsx`, `task-page-mode.ts`, and
  `mos-app/src/pages/tasks-layout.tsx` only to verify the shared opening contract remains intact;
- `mos-app/src/pages/follow-ups-page.tsx`, `mos-app/src/components/follow-ups/follow-up-queue-embed.tsx`,
  `mos-app/src/components/follow-ups/follow-up-queue-table.tsx`, and
  `mos-app/src/components/follow-ups/use-follow-up-queue.ts` only for honest unavailable/read-only
  behavior when `SHOW_FOLLOWUPS` is false or capability is absent.

Add tests for:

- deep-linking directly to an Inbox notification's canonical target opens full page, not the quick
  root or a nested panel;
- list query/filter/sort state survives record Back/Close and browser Back, while the direct page
  has exactly one `aria-current="page"`;
- loading, empty, error, retry, read-only, permission-denied, missing-record, and feature-off
  target states never show a misleading actionable control;
- when the handled prerequisite is ratified, All/Unread/Handled are URL-restored persisted views and
  a read-but-unhandled row proves that opening did not silently triage it;
- optimistic Deputy action feedback is pending/disabled, announces success or failure, and rolls
  back visible state on failure; consequential effects retain centered confirmation and reversal;
- raw producer routes, unknown target kinds, and cross-org/malformed target refs fail closed even when
  a legacy route looks app-relative;
- locale rendering uses message keys, has no clipped labels at 1280/1024/390, and preserves 44px
  phone targets.

Focused GREEN command:

```sh
npm test -- --run \
  src/router.test.tsx \
  src/pages/inbox-page.test.tsx \
  src/components/inbox/read-handled-semantics.test.ts \
  src/pages/signals-archive-page.test.tsx \
  src/components/signals/signal-record-host.test.tsx \
  src/components/tasks/task-drawer.test.tsx \
  src/components/tasks/task-page-mode.test.ts \
  src/pages/tasks-layout.test.tsx \
  src/pages/follow-ups-page.test.tsx \
  src/components/follow-ups/follow-up-queue-embed.test.tsx
```

Expected GREEN: exit 0; all route, direct-page, read-only, retry, query-restoration, target-security,
and domain-separation tests pass. No database test or cloud/staging endpoint is used by Issue 7;
the separately authorized handled prerequisite must have its pgTAP result recorded before this
command can include the Handled branch.

### 7. Add deterministic no-legacy-host and driven representative proof

Add `mos-app/src/shell/inbox-deputy-host.regression.test.ts` as a narrow deterministic guard. It
must read the exact source files and assert:

```ts
const host = read('mos-app/src/shell/overlay-host.tsx')
expect(host).toMatch(/data-overlay-host/)
expect(count(host, /RecordPanelHost/g)).toBe(1)

for (const file of [
  'mos-app/src/pages/inbox-page.tsx',
  'mos-app/src/components/inbox/inbox-triage.tsx',
  'mos-app/src/components/assistant/AssistantPanel.tsx',
]) {
  const source = read(file)
  expect(source).not.toMatch(/RecordPanelHost|drawer-modal-root|drawer-scrim/)
}
```

The actual test may use the repository's existing source-reading helper, but the guard must remain
narrow and deterministic: it rejects a second `RecordPanelHost`/scrim/legacy drawer in these seams,
requires the single host slot, checks there is no `SHOW_INBOX` fake flag or command-only Deputy
path, checks Inbox target resolution does not call raw `notificationRoute` as authority, and does
not ban legitimate content `aside` elements in Follow-up or record markup. Add a runtime assertion
that the rendered app has exactly one `[data-overlay-host]` and one active frame when Tasks, Signals,
Inbox, and Deputy are exercised; while a guard is pending, repeated Close/Escape/Back must not create
a second confirmation or frame.

Create `mos-app/e2e/v3-inbox-deputy.spec.ts`. It must use UI-generated data, not direct SQL or a
new seed. Reuse the existing Signal mention → notification journey in
`mos-app/e2e/AC-430-post-a-signal.spec.ts` (extract a test helper only if that file's existing
journey remains behaviorally identical). Do not gate these tests on a live agent model.

Drive the same journeys at the exact viewports:

| Viewport | Driven proof |
|---|---|
| 1280×900 | Bell → quick triage → record push → internal Back → Close/focus return; one host and right-panel width in the 40–45% token range; no URL mutation for ephemeral quick root |
| 1024×900 | The landed intermediate right-panel treatment uses the same host/stack and keyboard contract; browser Back and explicit Close restore the filter/query context |
| 390×844 | Bell navigates to `/inbox`; row opens full-screen shared sheet; targets are ≥44px, no horizontal overflow, Escape/Close returns focus, and direct canonical URL is page mode |
| 1280×900 | Deputy opens through the top-bar/command door only when enabled; Inbox/record ↔ Deputy never creates two panels; a dirty draft requires centered confirmation |

The spec must also cover a linked-record push/back sequence, a route-mismatched but typed target, an
unknown/cross-org/permission-denied target, a feature-off Follow-up, a retry after a transient
failure, and one optimistic action rollback. If the owner gate is ratified, drive All → Unread →
Handled with a read-but-unhandled row and verify opening marks read only; otherwise stop before
creating a Handled browser claim. Assert user goals and observable semantics, not implementation
details beyond the deterministic host guard.

Focused E2E command:

```sh
npx playwright test e2e/v3-inbox-deputy.spec.ts --project=chromium
```

Expected GREEN: exit 0, every viewport journey is executed (not skipped by live-model or missing
fixture gates), and Playwright reports the Inbox/Deputy scenarios passed. Run the existing
`e2e/AC-430-post-a-signal.spec.ts` focused suite as a regression because the notification producer
journey is shared.

### 8. Full verification, visual review, coverage, and checkpoint docs

Run inside `mos-app/`:

```sh
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npx playwright test e2e/v3-inbox-deputy.spec.ts --project=chromium
npx playwright test e2e/AC-430-post-a-signal.spec.ts --project=chromium
git diff --check
```

Expected output: every command exits 0; typecheck has zero errors; ESLint/stylelint has zero
warnings/errors; coverage is at least 80% on changed lines with behavioral tests as the evidence;
the build completes; both focused Playwright suites pass; and `git diff --check` is empty. Record
the actual command output, viewport evidence, and changed-line coverage in the review ledger.

Before calling the work complete, run the four-lens design review against `DESIGN.md`,
`docs/experience-contract.md`, `docs/interaction-contract.md`, and `docs/jtbd.md`:

- Visual: the shell surface, panel proportions, typography, states, and phone sheet are one E7
  grammar; no legacy top drawer or stale drawer styling remains.
- Interaction: one host/stack, Back/Escape/Close/focus/dirty-veto, anchored menus, centered
  confirmation, pending/rollback, and no competing modal.
- IA: Inbox quick triage, `/inbox`, canonical records, and Deputy are understandable two-door
  paths with one current page and preserved source context.
- Product/Intent JTBD: the manager can understand why the item arrived, what to do next, and what
  happened after the action; capability and read-only states are honest.

Only after all code and tests are green, make the final documentation commit changes to exactly:

- `docs/agent-context.md`: add `## V3 Issue 7 local checkpoint (2026-07-20)` with the verified
  dependency checkpoint, exact source/test files changed, AC/NFR evidence, viewport and keyboard
  results, coverage/typecheck/lint/build/E2E results, no-Supabase confirmation, owner gate status,
  final Issue 4 guard dependency (`ab3160a` / `296d6bb`), provisional handled-ratification result,
  typed-target/producer-envelope result, remaining dirty-veto/data contradictions, and the exact next
  issue (Issue 8). Do not rewrite the standing instructions or erase earlier checkpoints.
- `docs/backlog.md`: replace only the current V3 status pointer with the verified Issue 7 status,
  preserve the master sequence, state that Inbox/Deputy host adoption is complete only if its
  exact owned acceptance evidence is complete, state whether the handled prerequisite is ratified or
  deferred, and name any unresolved data/producer prerequisite explicitly. Keep Issues 8–12 in their
  existing order.
- `docs/reviews/v3-redesign.md`: append `## Issue 7 — Inbox triage + Deputy host adoption` with
  authority read, exact changed source/test paths, the ownership/deferred table's applicable rows,
  commands and exit codes, viewport/rendered evidence, the no-legacy/no-double-panel/guard result,
  E2E journeys, coverage, the `leaveGuard(intent)` proof, exclusions for Issues 8–12 and
  schema/RLS, owner checkpoint, and remaining contradictions. Use actual commit hashes and output;
  never write an unverified result.

No other canonical state file is changed by this plan. If a dependency contradiction blocks the
issue, update only the handoff/status evidence requested by the owner; do not mark Issue 7 complete.

## Master acceptance ownership and deferred table

The following table re-states the master spec's exact AC-V3-001..014 goals with the locked
one-owner map. Issue 7 may contribute regression evidence in the final column, but it is never a
co-owner and its granular tests use FR/NFR/JTBD/AC-RPH names unless the master ID is AC-V3-006.

| Master ID | Exact master Given/When/Then goal | One canonical owner | Issue 7 contribution note |
|---|---|---|---|
| AC-V3-001 | Given the representative routes at desktop and phone widths, when computed styles are compared across page heads, body type, controls, rows, panels, dialogs, and states, then each semantic role uses the same V3 values and the rendered result matches the E7 visual reference | Issue 9 | Consume approved tokens; local viewport checks map to NFR-V3-005/006 and do not tag this master AC |
| AC-V3-002 | Given Tasks, Signals, Inbox, and Café, when each collection opens a record, then the same panel side, width family, focus entry, Escape/Close/Back behavior, and page-escalation outcome occur | Issue 9 | Supply the Inbox host regression journey as descriptive FR/AC-RPH evidence; Tasks/Signals are dependencies and Café is Issue 8 |
| AC-V3-003 | Given a record panel already open, when Deputy or another record is opened, then the shared host stacks or replaces content according to the journey and never renders two overlapping side panels | Issue 9 | Exercise Inbox↔Deputy no-double-panel behavior with descriptive FR/AC-RPH tests; do not tag granular tests with this ID |
| AC-V3-004 | Given a Task in Work and the same Task in Café, when each is opened, then both resolve to the same record identity and RecordViewer while preserving the source collection on close | Issue 8 | Deferred; no Issue 7 AC label |
| AC-V3-005 | Given a Signal Feed saved view, when presentation changes to Table and the page is refreshed, then supported filters, sort, grouping, and saved-view identity persist | Issue 6 | Consume the persisted collection seam; do not own or tag this criterion |
| AC-V3-006 | Given Inbox on desktop, when the bell is invoked, then quick triage opens in the shared host; opening a notification pushes its canonical record; Back returns to triage; Close returns focus to the bell; given phone, the bell opens the full Inbox route | Issue 7 | Own the exact two-door unit/BDD journey in top-bar, triage, page, and `v3-inbox-deputy.spec.ts` tests |
| AC-V3-007 | Given a multi-Team viewer entering Café, when more than one valid Team exists, then the system requires an explicit context choice and never silently chooses the first Team | Issue 8 | Deferred; no Issue 7 AC label |
| AC-V3-008 | Given an authorized user editing a property, when they commit or cancel, then every RecordViewer consumer follows the same save/discard feedback contract | Issue 5 | Consume the viewer contract; Deputy optimistic effects use descriptive Interaction Contract I6 tests only |
| AC-V3-009 | Given an unauthorized viewer, when the same record opens, then its information hierarchy remains readable while edit and lifecycle actions are absent or honestly explained | Issue 5 | Supply fail-closed target/permission regression evidence mapped to FR-V3-008; do not tag granular tests with this ID |
| AC-V3-010 | Given authored JSONB content containing valid paragraph/list/link/content-checklist blocks, when saved and reopened in panel and page modes, then block identity, order, and content are preserved and rendered by the same components | Issue 10 | Deferred; no Issue 7 AC label |
| AC-V3-011 | Given a typed Task checklist or Standard measurement embed, when its state changes, then the normalized domain row changes and the JSONB document retains only the reference | Issue 10 through the real Task-checklist alternative | Deferred; no Issue 7 AC label |
| AC-V3-012 | Given a first-time floor member, when asked to find and complete today's Café work, then they start unaided, complete the goal without entering configuration, and encounter no internal system nouns | Issue 9 | Deferred; no Issue 7 AC label |
| AC-V3-013 | Given a manager triaging work, when filtering, grouping, switching presentations, and opening consecutive records, then the workflow remains keyboard-operable and retains collection context without repeated full-page navigation | Issue 6 | Supply the Inbox Triage Queue contribution through descriptive FR-V3-007/013/J06 tests; do not tag granular tests with this ID |
| AC-V3-014 | Given every live route at the end of migration, when the route/component inventory is checked, then no route uses an unapproved bespoke page shell or superseded component/style family | Issue 12 | Narrow no-legacy-host guard maps to NFR-V3-007 only; do not claim this master AC |

## Issue 7 acceptance and evidence matrix

| Requirement | Owning proof | Evidence to retain |
|---|---|---|
| FR-V3-003/004/006/012 + AC-RPH-5/6 (Inbox contribution) | `inbox-deputy-host.regression.test.ts` plus focused E2E | one `[data-overlay-host]`, same `RecordPanelHost`, 1280/1024/390 Inbox captures; master AC owned by Issue 9 |
| FR-V3-004/006 + AC-RPH-5 (Inbox/Deputy contribution) | host tests plus runtime regression | frame count, duplicate-key push behavior, no second scrim/panel; master AC owned by Issue 9 |
| FR-V3-005: canonical page promotion | `router.test.tsx`, target tests, E2E direct URL | canonical URL, same viewer hierarchy, one `aria-current` |
| FR-V3-006 + AC-V3-006 / AC-RPH-4/6: Inbox two doors | top-bar, triage, page tests plus E2E | desktop ephemeral bell flow, phone `/inbox`, canonical target, focus return |
| FR-V3-008 (permission integration only) | target and viewer adapter tests plus E2E | no forbidden action, readable honest unavailable/permission state; master AC owned by Issue 5 |
| Interaction Contract I6 + NFR-V3-003: action feedback | notification/Deputy tests | pending/disabled/`aria-busy`, success status, optimistic rollback/error |
| FR-V3-007/013 (Inbox contribution only) | landed collection tests plus descriptive triage/E2E tests | persisted filters, consecutive opens, Back to queue; master AC owned by Issue 6 |
| FR-V3-012 + NFR-V3-001/005/006: interaction/accessibility/responsive | triage/component tests plus E2E | 44px targets, keyboard paths, no overflow, localized labels, shared overlay grammar |
| NFR-V3-007: no legacy host/double panel | deterministic source + runtime guard | exact guard output, one host/active frame, no local scrim/drawer |
| NFR-V3-008: handled prerequisite only | separate owner-authorized migration + pgTAP, not Issue 7 execution | reversible private field, owner RLS, immutable content, read/handled rollback proof |
| NFR coverage/build/tooling | final verification commands | exit codes and changed-line report |

Each master AC is owned by one lowest-sufficient proof at its owning issue. Issue 7 may contribute a
slice named in the table but may not relabel a descriptive test as another issue's or another
behavior's AC. Integration/E2E is reserved for real route/host/cross-stack behavior.

## Commit checkpoints for the future implementation

Use a named Issue 7 branch/worktree based on the verified `v3-redesign` checkpoint. Commit after
each coherent red-green-refactor slice, with the required trailer:

The two owner-gated prerequisite changes named above are separate reviewable data work, not Issue 7
commits. Do not fold either migration, RLS change, or pgTAP run into an Inbox/Deputy commit. If they
land before Issue 7, record their exact hashes and test output in the dependency preflight.

1. `test: define Inbox target and shared-host regression oracles`
2. `feat: adapt notifications to typed canonical record doors`
3. `feat: render Inbox triage through the shared collection contract`
4. `feat: open Inbox quick triage and records in the shared host`
5. `feat: adopt the shared host for Deputy capability and dirty-state flows`
6. `test: drive Inbox and Deputy two-door journeys`
7. `docs: record V3 Issue 7 evidence and checkpoint`

Each commit must contain only its slice, pass its focused RED→GREEN command, and include:

```text
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

Do not push, open/update a PR, merge, or deploy until the owner gives the Issue 7 checkpoint
approval. Routine local commits are permitted; the review worktree remains available until the PR
is merged or the issue is explicitly abandoned.

## Plan self-review

- [x] Issue 7 only; Issues 8–12 and schema/RLS execution are excluded, with handled/envelope work
  named only as owner-gated prerequisites.
- [x] Issue 3 page families, Issue 4 host, Issue 5 viewer, and Issue 6 collection are consumed,
  not re-designed here.
- [x] Final Issue 4 `leaveGuard(intent)` is consumed as the domain-neutral async seam; no local
  close veto, dirty flag, nested modal, or second host is introduced.
- [x] Exact current Inbox, notification, bell, command, Deputy, route, Follow-up, host, and test
  seams are named.
- [x] Read/handled is explicitly distinct and provisional: opening marks read only, explicit handled
  is private notification state, rollback/RLS/pgTAP implications are gated, and read is never handled.
- [x] Target identity is an allow-listed typed `{type,id}` registry; raw producer routes are legacy
  input only; unknown/denied/cross-org/malformed/feature-off targets fail closed.
- [x] RED→GREEN commands, expected exit behavior, small commits, coverage, typecheck/lint/build,
  deterministic legacy-host guard, and driven viewport tests are specified.
- [x] Loading/empty/error/read-only/permission/retry, deep links/query restoration, 1280/1024/390,
  keyboard, 44px targets, i18n, optimistic rollback, and realistic Gordi copy are covered.
- [x] No hidden command-only access, fake affordance, duplicate record, top drawer, nested modal,
  or second panel is permitted.
- [x] Future `agent-context.md`, `backlog.md`, and review-ledger evidence is prescribed without
  changing canonical state during plan authoring.
- [x] Every `AC-V3-*` occurrence is checked against the master spec's AC-V3-001..014 definitions;
  the ownership/deferred table preserves each Given/When/Then goal and contains no out-of-range
  master ID or relabelled panel/handled behavior.

## Unresolved contradictions and stop conditions

1. **Final Issue 4 contract availability:** the authoritative plan now specifies async
   `leaveGuard(intent)` at `ab3160a` / `296d6bb`. If the landed source lacks the exact discriminated
   intents, coalesced `pendingLeave`, POP restoration, and one-use approval token, stop; do not add a
   local veto or alter the host boundary.
2. **Handled versus read:** current notifications expose `read_at` only, while J06 and owner law
   require distinct private state. The provisional rule is read = seen/opened and handled = explicit
   triage out of Inbox; read-but-unhandled is valid. Do not add `handled_at`, infer equivalence, or
   ship Handled until the single owner-ratification question below is answered and the separate
   migration/pgTAP prerequisite passes.
3. **Untyped notification targets and arrival facts:** current `{type,id,route}` plus open metadata
   is insufficient to prove a typed RecordViewer target, actor, reason, or required next action.
   Require the landed Issue 5/6 adapter contract and route-free typed producer envelope; otherwise
   fail closed and record missing facts rather than fabricate them. This is an engineering/data
   prerequisite, not a universal record-model decision.
4. **Follow-up feature/capability:** `SHOW_FOLLOWUPS` is currently false and the route redirects.
   Preserve that boundary; a notification must not manufacture Follow-up access for a member or
   create a command-only route.

### Single owner-ratification question

Will the owner ratify the provisional private semantics—`read_at` = seen/opened, `handled_at` =
explicitly triaged out of the active Inbox queue, opening marks read only, explicit Mark handled may
also mark read, and handled is never completion/acknowledgement/approval/ownership—and authorize the
separate reversible migration/RLS/pgTAP prerequisite, or explicitly defer Handled and the related
Issue 7 slice?

These are deliberate plan-level gates, not unfinished tasks. A blocked gate is reported
to the owner and recorded as unresolved; it is never made green by weakening the user-goal oracle.
