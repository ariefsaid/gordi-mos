# V3 Redesign Issue 5 — RecordViewer, fields, and typed Task/Signal adapters

> **Execution gate:** Any worker executing this plan MUST use superpowers:executing-plans in a visible Codex task. Do not use subagents, multi-agent execution, or superpowers:subagent-driven-development for this issue.

## Goal

Ship Issue 5 as the shared RecordViewer grammar, field primitives, and real Task and Signal adapters. The viewer is a typed presentation boundary over existing domain models; it is not a database abstraction. A Task remains a Task, a Signal remains a Signal, and the UI is similar without becoming identical.

The implementation must consume the interfaces landed by Issue 3 and Issue 4:

- Issue 3 owns PageFamilyFrame, PageFrame family/state props, and the FocusedRecordPage family placement.
- Issue 4 owns OverlayHost, OverlayHostSlot, RecordRouteAdapter, route/ephemeral history, top-layer Back/Escape, focus restoration, and the physical RecordPanelHost.
- Issue 5 owns the viewer contract, field behavior, and Task/Signal adapters only.
- Issue 6 owns RecordCollection and Tasks/Signals collection adapters.
- Issue 7 owns Inbox drawer routing.
- Issue 10 owns authored structured JSONB content.

Do not recreate any Issue 3 or Issue 4 host, route, page-frame, or history interface inside this issue.

## Non-negotiable boundaries

- Do not add a universal record table, universal domain row, cross-model database view, migration, Supabase query, RLS policy, or schema change.
- Do not add a Standard/SOP database type, adapter, route, fixture, fake record kind, or developer-only record. No live Standard/SOP model exists in this checkout. Its absence is an explicit future dependency recorded in the self-review and the later checkpoint docs.
- Keep Task fields and permissions grounded in mos.tasks, TaskDetail, TaskFieldsPatch, task-permissions.ts, and the existing TaskSurface mutation callbacks. Issue 5 displays the current business_unit_id/lookup honestly as Business Unit, separately exposes PIC and Supervisor, and renders Team only as an optional field sourced from a real task.team_id once that field lands. With the current missing team_id, show Team not assigned yet/data migration; never use BU as a Team fallback. Full Team-backed Task acceptance is deferred to the Issue 8 Task BU→Team re-home/Café bridge. Translate legacy responsible_person_id/accountable_person_id storage columns to PIC/Supervisor at the DAL boundary; never expose Responsible, Accountable, RACI, Consulted, or Informed as Task vocabulary. Checklist content inherits the parent Task's PIC/Supervisor and has no independent ownership. Record the storage-name mismatch as implementation debt; do not change the schema in Issue 5.
- Keep Signal fields and permissions grounded in mos.signals, SignalDetail, SignalRow, revisions, acknowledgements, comments, mentions, and existing SignalRecordHost callbacks. Do not give Signal a PIC, Supervisor, due date, or Task status.
- Prove the shared grammar with real Task and Signal adapters. Prove read-only honesty with an archived or unauthorized real Task and a retracted real Signal. Never use a fake Standard/SOP object as proxy evidence.
- Metadata, relations, content slots, activity/history, actions, and permission state are supplied by the adapter. RecordViewer owns the order, landmarks, field feedback, mode, and interaction grammar.
- Define a typed content-slot boundary that renders a supplied domain-owned slot. Do not implement block authoring, block editing, JSONB serialization, markdown/frontmatter authoring, or fabricated blocks.
- The Issue 4/6/7/8 navigation contracts remain dependencies: contextual collection clicks are panel-first, direct URLs render the canonical hierarchy, and later collection/Café/Inbox work owns those journeys. Issue 5 consumes those seams and does not claim their acceptance criteria.
- Back closes or pops only the top layer. RecordField Escape cancels only the field draft first. Explicit Close, browser Back/Forward, root/current replacement, related-record push, and open-page promotion after a dirty record use the final Issue 4 async OverlayLeaveGuard and the tenant-owned ConfirmDialog; no RecordViewer-local modal or silent discard is allowed. Restore focus to the opener only after an allowed transition. Keep the Issue 4 one-host invariant.
- Desktop uses the Issue 4 side-panel regime; the phone uses a full-screen sheet/page-stack regime. Do not introduce a near-full desktop modal for record viewing. Interactive targets are at least 44px.
- Loading, empty, not-found, error/retry, saving, saved, validation failure, unauthorized/read-only, and responsive states are explicit. Read-only is honest: preserve hierarchy and values, remove or disable only actions the permission contract disallows, and explain why.
- Add new i18n keys to both locales in mos-app/src/i18n/messages.ts and keep the existing typed parity tests green.
- Do not run a dev server, touch Supabase, run database tests, push, merge, deploy, or change canonical backlog state while creating this plan.

## Contract consumed from Issues 3 and 4

Execution starts only after these contracts are present on the implementation base. If the dependency check is red, stop and land/rebase the prerequisite issue; do not recreate the missing interfaces in Issue 5.

Issue 3 contract:

~~~ts
// mos-app/src/shell/page-family-frame.tsx
export interface PageFamilyFrameProps {
  family: PageFamily
  title: string
  jobSentence: string
  count?: number | null
  meta?: ReactNode
  action?: ReactNode
  state?: PageFamilyState
  surfaceWash?: boolean
  children: ReactNode
}

export function PageFamilyFrame(props: PageFamilyFrameProps): JSX.Element
~~~

The focused Task page remains inside PageFamilyFrame. Its record content uses heading level 2 beneath the frame heading level 1. The frame owns the page-level title and job sentence; RecordViewer must not add a second page heading.

Issue 4 final contract, consumed without duplication. This is the amended committed interface from docs/plans/2026-07-20-v3-overlay-host.md at revision ab3160a4d913130c28c4574dc3ef4defeadc1547; do not execute Issue 5 against the older synchronous OverlayHostApi excerpt:

~~~ts
import type { ReactNode } from 'react'
import type { Location, To } from 'react-router-dom'

// mos-app/src/shell/overlay-navigation.ts
export const OVERLAY_HISTORY_KEY = '__mosOverlay'
export type OverlayHistoryMode = 'route' | 'ephemeral'
export type OverlayOwner = 'shell' | 'tasks' | 'signals'
export type OverlayHistoryMarker = {
  sessionId: string
  depth: number
  entryKey: string
  mode: OverlayHistoryMode
  historyIndex: number
}
export type OverlayEntrySummary = { key: string; owner: OverlayOwner }
export type OverlayLeaveIntent =
  | { kind: 'close'; via: 'explicit-close' | 'escape'; from: OverlayEntrySummary }
  | { kind: 'back'; via: 'internal-back'; from: OverlayEntrySummary; depth: number }
  | { kind: 'replace'; via: 'push' | 'replace-root' | 'replace-current'; from: OverlayEntrySummary; to: OverlayEntrySummary }
  | { kind: 'open-page'; via: 'open-page'; from: OverlayEntrySummary; to: To }
  | { kind: 'browser-pop'; direction: 'back' | 'forward'; from: OverlayHistoryMarker; to: OverlayHistoryMarker | null; delta: number }
export type OverlayLeaveDecision = { decision: 'allow' } | { decision: 'deny' }
export type OverlayLeaveGuard = (intent: OverlayLeaveIntent) => Promise<OverlayLeaveDecision>
export type OverlayLeaveRequest = { id: string; intent: OverlayLeaveIntent }
export type OverlayTransitionResult = { status: 'committed' | 'denied' }
export type RecordRouteAdapter = {
  toPanel: (recordId: string, source: Location) => To
  toPage: (recordId: string, source: Location) => To
  toCollection: (source: Location) => To
  readPanelId: (location: Location) => string | null
}
export function readOverlayMarker(state: unknown): OverlayHistoryMarker | null
export function withOverlayMarker(
  state: unknown,
  marker: OverlayHistoryMarker,
): Record<string, unknown>
export function preserveSearch(source: Location, target: To): To
export function historyDeltaForClose(depth: number): number

// mos-app/src/shell/overlay-host.tsx
export type OverlayTenant = 'record' | 'deputy' | 'quick'
export type OverlayHistoryDriver = {
  index: () => number | null
  go: (delta: number) => void
}
export type OverlayEntry = {
  key: string
  owner: OverlayOwner
  tenant: OverlayTenant
  label: string
  title?: ReactNode
  pageTo?: To
  content: ReactNode
  leaveGuard?: OverlayLeaveGuard
}
export type OverlayFrame = {
  entry: OverlayEntry
  returnFocus: HTMLElement | null
}
export type OverlaySession = {
  id: string
  mode: 'route' | 'ephemeral'
  frames: readonly OverlayFrame[]
}
export type OverlayHostApi = {
  session: OverlaySession | null
  pendingLeave: OverlayLeaveRequest | null
  openRoot: (entry: OverlayEntry, mode: OverlaySession['mode']) => Promise<OverlayTransitionResult>
  replaceRoot: (entry: OverlayEntry) => Promise<OverlayTransitionResult>
  push: (entry: OverlayEntry) => Promise<OverlayTransitionResult>
  replaceCurrent: (entry: OverlayEntry) => Promise<OverlayTransitionResult>
  back: () => Promise<OverlayTransitionResult>
  close: (via?: 'explicit-close' | 'escape') => Promise<OverlayTransitionResult>
  openPage: (to: To) => Promise<OverlayTransitionResult>
}
export function OverlayHostProvider(props: { children: ReactNode; historyDriver?: OverlayHistoryDriver }): JSX.Element
export function useOverlayHost(): OverlayHostApi
export function OverlayHostSlot(props: { owner: OverlayOwner }): JSX.Element | null

export type RecordPanelHostProps = {
  label: string
  onClose: (via?: 'explicit-close' | 'escape') => void
  children: ReactNode
  expanded?: boolean
  focusKey?: string
  title?: ReactNode
  onOpenPage?: () => void
  onBack?: () => void
  canGoBack?: boolean
  rootClassName?: string
  owner?: OverlayOwner
  entryKey?: string
  transitionPending?: boolean
}
~~~

The final rules are binding: every leave-like transition uses the active entry's optional async leaveGuard. Close('explicit-close') and Close('escape') use kind close; internal Back uses kind back; root/current replacement and related-record push use kind replace; openPage uses kind open-page; browser POP uses kind browser-pop. A missing guard commits immediately. A denied guard leaves content, URL, marker, and focus in place. The host coalesces repeated actions through one pendingLeave request, treats guard rejection as deny, and uses a private approval token exactly once for confirmed cleanup/POP synchronization. Browser POP restores the prior URL/marker before awaiting the guard, then reapplies an allowed target once. The active tenant owns dirty state and composes the shared ConfirmDialog/ModalShell to resolve allow or deny; the generic host never reads a dirty boolean or supplies confirmation copy. RecordViewer receives callbacks and never calls history APIs directly.

## Acceptance and ownership map

| Requirement | Issue 5 proof | Owning layer |
| --- | --- | --- |
| FR-V3-003, TaskSignalGrammarContract | Task and Signal adapters render through one RecordViewer grammar while retaining distinct fields in panel/page presentation modes; Inbox, Café, and the final cross-surface criterion remain outside Issue 5 | Vitest component test |
| FR-V3-004, PanelContributionContract | The supplied Task/Signal adapter renders in the existing contextual panel seam without taking ownership of collection behavior | Host-seam regression test |
| FR-V3-005, CanonicalPageContributionContract | The same adapter hierarchy renders in the canonical page seam; saved-view persistence remains Issue 6 | Vitest plus route-seam test |
| FR-V3-006, RelatedRecordStackContributionContract | A supplied related-record callback requests one Issue 4 stack transition; the real Deputy/another-record journey remains a later cross-issue proof | Overlay-host integration test |
| FR-V3-012, OverlayTenantGuardContract | The viewer consumes the domain-neutral async leave guard and tenant-owned confirmation without creating a local host or modal | Host-seam integration test |
| FR-V3-008, AC-V3-009 | Archived/unauthorized Task and retracted Signal states preserve hierarchy and tell the truth about actions | Adapter/component tests |
| FR-V3-009, AC-V3-008 | Text/select/date field commit, cancellation, pending, validation, retry, and read-only behavior | Field unit/component tests |
| NFR-V3-001, NFR-V3-005, NFR-V3-006, LocaleParityContract | Keyboard order, focus trap/restore delegated to host, responsive review widths, 44px controls, no phone overflow, and i18n parity | Component tests plus Playwright |
| Task ownership and Team boundary | Task adapter renders Business Unit separately from PIC/Supervisor, shows an honest missing-Team state until a real task.team_id exists, and never relabels BU as Team or exposes Task RACI | Task adapter, ownership, permission, and focused-surface tests |
| FR-V3-010, FR-V3-011 | Explicitly deferred; Issue 5 only consumes typed content slots and exposes no authoring controls | Plan boundary and review ledger |
| Standard/SOP distinction | No adapter or fake kind; absence of a live model is listed as a future dependency/contradiction | Self-review and future checkpoint docs |

Issue 5 owns only AC-V3-008 and AC-V3-009 end to end. Task/Signal viewer, panel/page, related-stack, and async-host tests are contribution proofs named with FR IDs or descriptive contract names; they do not own either cross-surface master criterion. The complete non-owned master-AC ownership/dependency table appears in the self-review. Every Issue 5 acceptance test title below uses AC-V3-008, AC-V3-009, an FR/NFR, or a descriptive contract name.

## Execution sequence

Each task below is a separate red-green-refactor checkpoint. Run commands from mos-app unless the command is explicitly rooted at the repository. Commit after the named green checkpoint with the exact message and the required trailer:

~~~text
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
~~~

### Task 0 — Verify the prerequisite seams before writing app code

Files inspected only:

- mos-app/src/shell/page-family-frame.tsx
- mos-app/src/shell/overlay-navigation.ts
- mos-app/src/shell/overlay-host.tsx
- mos-app/src/components/ui/modal-shell.tsx
- mos-app/src/shell/record-panel-host.tsx
- mos-app/src/components/tasks/task-drawer.tsx
- mos-app/src/pages/tasks-layout.tsx
- mos-app/src/components/signals/signal-record-host.tsx
- mos-app/src/pages/signals-archive-page.tsx

Red dependency check:

~~~sh
test -f src/shell/page-family-frame.tsx &&
test -f src/shell/overlay-navigation.ts &&
test -f src/shell/overlay-host.tsx &&
test -f src/components/ui/modal-shell.tsx
~~~

Expected red on the current v3-redesign checkout: the Issue 3/4 implementation files are not yet present. The expected green state is the implementation base after those issues land. Do not satisfy this red result by creating substitute files in Issue 5. Confirm that Issue 3 and Issue 4 tests are green before proceeding.

Green command after the prerequisite base is available:

~~~sh
npm test -- --run src/shell/page-family-frame.test.tsx src/shell/overlay-navigation.test.ts src/shell/overlay-host.test.tsx src/components/ui/modal-shell.test.tsx
~~~

Expected pass: the existing prerequisite tests pass, and the imports above resolve. Commit no Issue 5 change for this task; record the prerequisite commit hashes in the execution task log.

### Task 1 — Add the typed RecordViewer boundary

Create:

- mos-app/src/components/records/record-viewer.types.ts
- mos-app/src/components/records/record-viewer.types.test.ts

Define the following exported types. Keep them presentation-only and free of Supabase imports:

~~~ts
export type RecordKind = 'task' | 'signal'
export type RecordViewerMode = 'panel' | 'page'
export type RecordFieldControl = 'text' | 'textarea' | 'select' | 'date' | 'person' | 'team' | 'status' | 'relation'
export type RecordValue = string | number | boolean | null

export interface RecordFieldOption {
  value: string
  label: string
}

export interface RecordFieldSpec {
  key: string
  label: string
  control: RecordFieldControl
  value: RecordValue
  displayValue: string
  options?: readonly RecordFieldOption[]
  editable: boolean
  readOnlyReason?: string
  required?: boolean
}

export interface RecordMetadataSection {
  id: string
  label: string
  fields: readonly RecordFieldSpec[]
}

export interface RecordRelation {
  id: string
  kind: RecordKind
  label: string
  href?: string
  onOpen?: () => void
}

export interface RecordContentSlot {
  id: string
  label: string
  render: (context: { mode: RecordViewerMode; readOnly: boolean }) => ReactNode
}

export interface RecordActivityItem {
  id: string
  label: string
  detail?: string
  occurredAt: string
}

export interface RecordPermission {
  readOnly: boolean
  reason?: string
  allowedActionIds: readonly string[]
}

export interface RecordAction {
  id: string
  label: string
  intent: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  disabledReason?: string
  run: () => Promise<void> | void
}

export interface RecordViewerAdapter {
  kind: RecordKind
  id: string
  title: string
  typeLabel: string
  eyebrow?: string
  metadata: readonly RecordMetadataSection[]
  relations: readonly RecordRelation[]
  contentSlots: readonly RecordContentSlot[]
  activity: readonly RecordActivityItem[]
  actions: readonly RecordAction[]
  permission: RecordPermission
  state: 'ready' | 'empty' | 'error'
  errorMessage?: string
}
~~~

The adapter may add object-specific data through its render closures, but the viewer must not infer domain fields from a database row. Do not add standard, sop, inbox, or universal-record variants to RecordKind in this issue. A future live Standard/SOP model may extend the contract in its own issue.

Red:

~~~sh
npm test -- --run src/components/records/record-viewer.types.test.ts
~~~

Expected red: the new module and its type-level assertions do not exist.

Green:

~~~sh
npm test -- --run src/components/records/record-viewer.types.test.ts
npm run typecheck
~~~

Expected pass: Task and Signal fixtures satisfy the contract, a content slot accepts a typed renderer without exposing a block-authoring API, and a type-level assertion confirms that this Issue 5 union has no Standard/SOP member without declaring a Standard/SOP fixture. Test the real distinctions: Task includes Business Unit, PIC, Supervisor, status, due, and an explicit missing-Team state; no fixture equates Business Unit with Team. Signal does not expose any of those Task fields.

Commit:

~~~sh
git add src/components/records/record-viewer.types.ts src/components/records/record-viewer.types.test.ts
git commit -m "feat: define typed record viewer contract" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~

### Task 2 — Build field primitives with honest dirty-state behavior

Create or modify:

- mos-app/src/components/records/record-field.tsx
- mos-app/src/components/records/record-field.test.tsx
- mos-app/src/components/records/record-viewer.css
- mos-app/src/i18n/messages.ts
- mos-app/src/i18n/messages.test.ts

Implement RecordField from RecordFieldSpec and a narrow persistence API:

~~~ts
export interface RecordFieldProps {
  spec: RecordFieldSpec
  onCommit: (value: RecordValue) => Promise<void>
  onCancel?: () => void
  onDirtyChange?: (dirty: boolean) => void
}
~~~

Use the existing Button, Select, labels, focus styles, and design tokens. Text-like controls commit on Enter and on click-outside; Tab follows the interaction contract; Escape restores the last saved value, reports dirty=false, and does not call onCommit or the host leave guard. Native selects retain the existing eager-commit behavior. Keep a saved baseline separate from the draft. On save, expose Saving then Saved; on rejection, retain the draft, show validation or error feedback, and expose retry. For a read-only spec, render the value and the reason; do not render a misleading enabled editor. Use the existing shell/host focus behavior for focus restoration; the field must not add a second overlay or ConfirmDialog. The containing Task/Signal tenant may use onDirtyChange to provide the Issue 4 OverlayEntry.leaveGuard; RecordField never owns that guard.

Add both English and Indonesian keys for loading, retry, saving, saved, save error, cancel, read-only, read-only reason, close, back, and open full page. Preserve messages.ts type parity.

Red tests, with exact names:

~~~sh
npm test -- --run src/components/records/record-field.test.tsx
~~~

Expected red tests:

- AC-V3-008: pressing Enter commits a text field and reports Saving then Saved
- AC-V3-008: Escape restores the saved value and does not call save
- NFR-V3-001: Escape cancels only the field draft before any host leave transition is considered
- FieldErrorRetryContract: a rejected save preserves the draft and exposes retry plus an error message
- AC-V3-009: a read-only field exposes its value and reason without an enabled control
- NFR-V3-006: every field action has a keyboard-accessible target of at least 44px

Green:

~~~sh
npm test -- --run src/components/records/record-field.test.tsx src/i18n/messages.test.ts
npm run typecheck
npm run lint
~~~

Expected pass: the field tests observe the required transitions and no i18n parity failure. Verify CSS selectors rather than weakening the 44px assertion.

Commit:

~~~sh
git add src/components/records/record-field.tsx src/components/records/record-field.test.tsx src/components/records/record-viewer.css src/i18n/messages.ts src/i18n/messages.test.ts
git commit -m "feat: add record field primitives" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~

### Task 3 — Compose the shared RecordViewer grammar

Create:

- mos-app/src/components/records/record-viewer.tsx
- mos-app/src/components/records/record-viewer.test.tsx

Implement:

~~~ts
export interface RecordViewerProps {
  adapter: RecordViewerAdapter
  mode: RecordViewerMode
  headingLevel?: 1 | 2
  onClose?: () => void
  onBack?: () => void
  onOpenPage?: () => void
  onOpenRelated?: (relation: RecordRelation) => void
  onDirtyChange?: (dirty: boolean) => void
}
~~~

Render one stable hierarchy in this order: identity/type, metadata sections, relations, typed content slots, activity/history, and allowed actions. Use RecordField for field feedback and forward its dirty state to onDirtyChange. Mark the root with data-record-kind and data-record-mode. The page uses heading level 2 when PageFamilyFrame already owns h1; the viewer must not render a second page-level h1. Preserve object-specific content by rendering adapter slots; do not branch on database tables inside RecordViewer.

Use LoadingShell, EmptyState, and ErrorState for adapter state. Empty means a valid loaded view with no optional content; error exposes the adapter message and a retry supplied by the host/adapter boundary. Keep action visibility determined by allowedActionIds and disabled reasons. Related links call onOpenRelated or their supplied href; they do not push history from inside the viewer. Do not create RecordPanelHost, OverlayHost, route markers, focus traps, leave guards, ConfirmDialog, or modal shells here; the tenant composition supplies the shared host contract.

Exact red tests:

~~~sh
npm test -- --run src/components/records/record-viewer.test.tsx
~~~

- FR-V3-003 / TaskSignalGrammarContract: Task and Signal adapters render the shared identity, metadata, content, activity, and action grammar
- FR-V3-004 / PanelModeContract: panel and page modes preserve section order and change only the supplied chrome semantics
- FR-V3-005 / CanonicalPageContract: the canonical page uses the same viewer hierarchy without moving route ownership into RecordViewer
- FR-V3-006 / RelatedRecordCallbackContract: a related record calls the supplied open callback and does not create a second overlay host
- FR-V3-012 / OverlayBoundaryContract: the viewer consumes host callbacks and owns no history, focus, or confirmation primitive
- AC-V3-009: unauthorized actions are absent or visibly disabled with a reason
- NFR-V3-001: loading, empty, and error states retain the viewer landmark and retry affordance
- ViewerHeadingLandmarkContract: the viewer has one meaningful heading at the requested level
- TypedContentSlotContract: supplied content slots render as typed domain-owned slots without block authoring controls

Expected red: the component, section selectors, and accessible names do not exist.

Green:

~~~sh
npm test -- --run src/components/records/record-viewer.test.tsx src/components/records/record-field.test.tsx
npm run typecheck
npm run lint
~~~

Expected pass: both real-kind fixtures render through the same component without a fake third kind, and mode changes do not alter the section order.

Commit:

~~~sh
git add src/components/records/record-viewer.tsx src/components/records/record-viewer.test.tsx
git commit -m "feat: compose shared record viewer" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~

### Task 4 — Adapt the existing Task model without collapsing its semantics

Create or modify:

- mos-app/src/components/tasks/task-record-adapter.tsx
- mos-app/src/components/tasks/task-record-adapter.test.tsx
- mos-app/src/components/tasks/task-surface.tsx
- mos-app/src/components/tasks/task-surface.test.tsx
- mos-app/src/components/tasks/record-details-panel.tsx
- mos-app/src/components/tasks/record-details-panel.test.tsx
- mos-app/src/components/tasks/task-ownership-card.tsx
- mos-app/src/components/tasks/task-ownership-card.test.tsx
- mos-app/src/components/tasks/task-permissions.ts
- mos-app/src/components/tasks/task-permissions.test.tsx
- mos-app/src/components/tasks/task-drawer-header.tsx
- mos-app/src/components/tasks/task-drawer-header.test.tsx

Define the exact domain-facing adapter input. Do not expose TaskFieldsPatch or the legacy column names from this interface:

~~~ts
export type TaskViewerFieldKey =
  | 'title'
  | 'description'
  | 'dueDate'
  | 'businessUnit'
  | 'pic'
  | 'supervisor'
  | 'projectProcess'
  | 'objective'

export interface TaskTeamView {
  id: string
  label: string
}

export interface TaskRecordAdapterInput {
  detail: TaskDetail
  viewerId: string
  isManager: boolean
  people: readonly PersonOption[]
  businessUnits: readonly BusinessUnitOption[]
  /**
   * Only a real task.team_id lookup may populate this value.
   * Omit or pass null while the current mos.tasks row has no team_id.
   */
  team?: TaskTeamView | null
  onUpdateField: (field: TaskViewerFieldKey, value: string | null) => Promise<void>
  onUpdateStatus: (next: TaskStatus) => Promise<void>
  onArchive: () => Promise<void>
  onUnarchive: () => Promise<void>
  onOpenRelated?: (relation: RecordRelation) => void
}

export function createTaskRecordAdapter(input: TaskRecordAdapterInput): RecordViewerAdapter
~~~

Use the existing TaskDetail, TaskFieldsPatch, TaskStatus, directory options, canEdit, and canArchive helpers. Map the current row as follows: resolved business_unit_id/lookup data is displayed as Business Unit; input.team is displayed as Team only when it came from a real task.team_id, otherwise the Team field displays Team not assigned yet/data migration; responsible_person_id is displayed as Person in charge (PIC); accountable_person_id is displayed as Supervisor. Never substitute Business Unit for Team. The current TaskListRow has no team_id, so Issue 5 must not add one or fabricate a Team fixture; the real field and BU→Team re-home belong to Issue 8. Those legacy person storage names may appear only in the TaskSurface-to-DAL mapping and must be recorded as implementation debt, never as labels, field keys, test names, or adapter properties. Map status, due date, title, description, project/process link, objective, and task events into ordered metadata, relations, content slots, activity, and actions. Keep checklist as Task content that inherits the parent Task's PIC/Supervisor; it has no independent ownership, status, Team, or due-date controls. Preserve the current mark-complete, archive, unarchive, and field mutation callbacks, but translate the viewer key at the persistence edge:

~~~ts
function saveTaskViewerField(
  field: TaskViewerFieldKey,
  value: string | null,
): Promise<void> {
  switch (field) {
    case 'pic':
      return updateTaskFields(taskId, { responsible_person_id: value ?? '' }, viewerId)
    case 'supervisor':
      return updateTaskFields(taskId, { accountable_person_id: value ?? '' }, viewerId)
    case 'dueDate':
      return updateTaskFields(taskId, { due_date: value }, viewerId)
    case 'businessUnit':
      return updateTaskFields(taskId, { business_unit_id: value ?? '' }, viewerId)
    case 'title':
      return updateTaskFields(taskId, { title: value ?? '' }, viewerId)
    case 'description':
      return updateTaskFields(taskId, { description: value }, viewerId)
    case 'projectProcess':
      return updateTaskFields(taskId, { work_line_id: value }, viewerId)
    case 'objective':
      return updateTaskFields(taskId, { objective_id: value }, viewerId)
  }
}
~~~

The switch is the only place where the legacy person storage mismatch is translated. There is deliberately no Team case in this switch: Issue 5 has no task.team_id write path. The Task adapter and RecordViewer must never render or export Responsible, Accountable, RACI, Consulted, or Informed. Keep Business Unit and Team as distinct fields, keep missing Team honest, and keep authorization derived from the real task row and existing permission helpers, interpreting the current person storage columns as PIC/Supervisor permissions.

When a field becomes dirty, the containing Task tenant reports it through RecordViewer.onDirtyChange. The tenant supplies OverlayEntry.leaveGuard only while a dirty draft exists. Its guard receives the domain-neutral OverlayLeaveIntent, opens the shared ConfirmDialog/ModalShell owned by the Task tenant, and resolves OverlayLeaveDecision allow/deny. A clean Task entry supplies no leaveGuard. RecordViewer does not render this confirmation and the host does not inspect a dirty boolean.

Wire TaskSurface so loading/error/not-found remain visible and ready content is the adapter plus RecordViewer. Keep the existing full/page and drawer/panel modes, identityHeadingLevel, close, expand, and page callbacks. Build the OverlayEntry with the final async host API, including leaveGuard only for a dirty Task, and await the Promise result for Close, Back, replacement, and page promotion. RecordDetailsPanel, TaskOwnershipCard, and TaskDrawerHeader may become object-specific slot/chrome helpers, but no duplicate viewer anatomy may remain. Do not make TaskSurface fetch a Signal or a generic record.

Correct the existing Task chrome/tests at the same seam: every current buName/business_unit_id display must say Business Unit; add a separate Team field that uses the optional real TaskTeamView or the Team not assigned yet/data migration state. Existing tests that currently pass a BU string through a tasks.team label are not valid Issue 5 proof and must be changed to assert distinct Business Unit and Team states. No Team label may be satisfied by the Business Unit value.

Exact red tests:

~~~sh
npm test -- --run src/components/tasks/task-record-adapter.test.tsx src/components/tasks/task-surface.test.tsx src/components/tasks/record-details-panel.test.tsx src/components/tasks/task-ownership-card.test.tsx src/components/tasks/task-permissions.test.tsx src/components/tasks/task-drawer-header.test.tsx
~~~

- FR-V3-003 / TaskAdapterContract: a real Task adapter renders Task identity, Business Unit, PIC/Supervisor/status/due metadata, checklist content, events, and Task actions without claiming a Team-backed row
- AC-V3-008: Task field saves use domain-facing PIC/Supervisor/Business Unit field keys and preserve the current mutation feedback through the legacy DAL patch mapping
- AC-V3-009: an archived or unauthorized Task renders honest read-only fields and only allowed lifecycle actions
- TaskVocabularyContract: Task adapter labels the legacy person columns as PIC and Supervisor, renders Business Unit separately from Team not assigned yet/data migration, exposes no Task RACI vocabulary, and gives checklist content inherited parent PIC/Supervisor with no independent ownership controls

Expected red: the adapter module is absent and the current TaskSurface still owns bespoke field composition.

Green:

~~~sh
npm test -- --run src/components/tasks/task-record-adapter.test.tsx src/components/tasks/task-surface.test.tsx src/components/tasks/record-details-panel.test.tsx src/components/tasks/task-ownership-card.test.tsx src/components/tasks/task-permissions.test.tsx src/components/tasks/task-drawer-header.test.tsx
npm run typecheck
npm run lint
~~~

Expected pass:

- An authorized open Task keeps its existing editable fields and lifecycle actions.
- A Task with archived_at set, or a Task for which canEdit and canArchive return false, keeps identity, metadata, checklist, and activity while showing read-only explanations and no unauthorized enabled action.
- Task identity assertions find Business Unit, PIC, and Supervisor, find Team not assigned yet/data migration when the current row has no team_id, and find no RACI, Responsible, Accountable, Consulted, or Informed label; they must not pass by asserting that Business Unit text is Team text. Checklist assertions show inherited parent ownership rather than a second owner.
- The only occurrences of responsible_person_id/accountable_person_id are in the explicit TaskSurface-to-DAL mapping and storage-debt test fixture; they never appear in RecordViewer field keys or visible copy.
- No Issue 5 fixture adds a synthetic team_id; a real Team-backed proof is an Issue 8 dependency.
- No test uses a Standard/SOP fixture or a fabricated generic row.

Commit:

~~~sh
git add src/components/tasks/task-record-adapter.tsx src/components/tasks/task-record-adapter.test.tsx src/components/tasks/task-surface.tsx src/components/tasks/task-surface.test.tsx src/components/tasks/record-details-panel.tsx src/components/tasks/record-details-panel.test.tsx src/components/tasks/task-ownership-card.tsx src/components/tasks/task-ownership-card.test.tsx src/components/tasks/task-permissions.ts src/components/tasks/task-permissions.test.tsx src/components/tasks/task-drawer-header.tsx src/components/tasks/task-drawer-header.test.tsx
git commit -m "feat: adapt tasks to record viewer" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~

### Task 5 — Adapt the existing Signal model and its real retracted state

Create or modify:

- mos-app/src/components/signals/signal-record-adapter.tsx
- mos-app/src/components/signals/signal-record-adapter.test.tsx
- mos-app/src/components/signals/signal-record-host.tsx
- mos-app/src/components/signals/signal-record-host.test.tsx
- mos-app/src/components/signals/signal-record.tsx
- mos-app/src/components/signals/signal-record.test.tsx

Define the exact adapter input from the existing host data:

~~~ts
export interface SignalRecordAdapterInput {
  detail: SignalDetail
  revisions: readonly SignalRevisionRow[]
  teams: readonly TeamOption[]
  businessUnits: readonly BusinessUnitOption[]
  people: readonly PersonOption[]
  tasks: readonly TaskListRow[]
  comments: readonly CommentRow[]
  rosters: MentionRosters
  siteName: string | null
  canAcknowledge: boolean
  canCorrect: boolean
  canComment: boolean
  onAcknowledge: () => Promise<void>
  onCorrect: (correction: SignalCorrection) => Promise<void>
  onComment: (body: string) => Promise<void>
  onLinkTask: (taskId: string) => Promise<void>
  onCreateFollowUp: (title: string) => Promise<void>
  onOpenTask: (taskId: string) => void
}

export function createSignalRecordAdapter(input: SignalRecordAdapterInput): RecordViewerAdapter
~~~

Map author, owning team, occurred time, body, attention, category, mentions, revisions, acknowledgements, linked Tasks, comments, and the existing retraction tombstone into Signal-owned sections and slots. Keep the current SignalRecord presentation logic where it is object-specific, or wrap it as a Signal content slot; do not force it into Task fields. Do not expose PIC, Supervisor, due date, status, checklist ownership, or Standard/SOP fields. A retracted Signal is a real SignalRow state: retain its identity and tombstone/retract reason, remove unauthorized correction/acknowledge/comment/link actions, and do not invent a third record kind.

Keep SignalRecordHost as the data/mutation owner and make the adapter the boundary consumed by RecordViewer. Collection work remains Issue 6. The host must not create a second overlay, route, or focus owner.

Exact red tests:

~~~sh
npm test -- --run src/components/signals/signal-record-adapter.test.tsx src/components/signals/signal-record-host.test.tsx src/components/signals/signal-record.test.tsx
~~~

- FR-V3-003 / SignalAdapterContract: a real Signal adapter renders Signal identity, metadata, content, activity, linked work, and Signal actions
- AC-V3-009: a retracted Signal renders its tombstone and removes unauthorized actions
- SignalVocabularyContract: Signal adapter never exposes PIC, Supervisor, due date, or Task status fields
- SignalActionErrorContract: a failed Signal action preserves the record and exposes retry/error feedback

Expected red: the adapter module is absent and the host has no RecordViewer model.

Green:

~~~sh
npm test -- --run src/components/signals/signal-record-adapter.test.tsx src/components/signals/signal-record-host.test.tsx src/components/signals/signal-record.test.tsx
npm run typecheck
npm run lint
~~~

Expected pass: active and retracted real SignalRow fixtures retain Signal-specific content and permission honesty, and no Task-only field appears.

Commit:

~~~sh
git add src/components/signals/signal-record-adapter.tsx src/components/signals/signal-record-adapter.test.tsx src/components/signals/signal-record-host.tsx src/components/signals/signal-record-host.test.tsx src/components/signals/signal-record.tsx src/components/signals/signal-record.test.tsx
git commit -m "feat: adapt signals to record viewer" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~

### Task 6 — Wire panel, promotion, direct page, and the existing overlay host

Modify only the existing route/shell seams:

- mos-app/src/components/tasks/task-drawer.tsx
- mos-app/src/components/tasks/task-drawer.test.tsx
- mos-app/src/components/tasks/tasks-workspace.tsx
- mos-app/src/components/tasks/tasks-workspace.test.tsx
- mos-app/src/pages/tasks-layout.tsx
- mos-app/src/pages/tasks-layout.test.tsx
- mos-app/src/pages/task-detail.test.tsx
- mos-app/src/components/tasks/task-page-mode.ts
- mos-app/src/components/tasks/task-page-mode.test.ts
- mos-app/src/pages/signals-archive-page.tsx
- mos-app/src/pages/signals-archive-page.test.tsx
- mos-app/src/components/signals/signal-page-mode.ts
- mos-app/src/components/signals/signal-page-mode.test.ts
- mos-app/src/components/signals/signal-record-host.tsx

Use the final OverlayHostApi.openRoot for a collection-origin record, OverlayHostApi.openPage for promotion, and OverlayHostApi.push for a related record. Each returns a Promise<OverlayTransitionResult>; await it and keep denied transitions mounted. Pass RecordViewer mode and callbacks through the host. Use RecordRouteAdapter.toPanel, toPage, and readPanelId for URL decisions; do not map rows to URL state in the viewer. Mount one OverlayHostSlot with owner tasks or signals as prescribed by Issue 4. For a dirty Task, put the tenant-owned OverlayLeaveGuard on OverlayEntry; explicit Close, browser Back/Forward, root/current replacement, related push, and page promotion must use that guard and the Task-owned ConfirmDialog/ModalShell. RecordViewer must not render a local confirmation or silently discard. For the direct Task page, render RecordViewer inside PageFamilyFrame with the existing Task focused-page job sentence and h2 record heading. Apply the same page hierarchy to direct Signal rendering when its Issue 4 route seam is ready.

RecordPanelHost passes Close via as explicit-close or escape to OverlayHostApi.close(via); Back, Open full page, root/current replacement, and related push call the corresponding async host method. Do not add a domain-local history call, a synchronous close bypass, or a second confirmation surface.

Keep Inbox out of this issue; its drawer is Issue 7. Do not change RecordCollection, Tasks collection rendering, Signal collection rendering, or Standard/SOP routing.

Exact red tests:

~~~sh
npm test -- --run src/components/tasks/task-drawer.test.tsx src/components/tasks/tasks-workspace.test.tsx src/pages/tasks-layout.test.tsx src/pages/task-detail.test.tsx src/pages/signals-archive-page.test.tsx src/components/signals/signal-page-mode.test.ts
~~~

- FR-V3-004 / PanelContributionContract: an existing Task or Signal host entry renders the supplied adapter in the contextual panel seam without changing collection ownership
- FR-V3-005 / CanonicalPageContributionContract: the Open full page callback targets the canonical route and the page renders the same viewer hierarchy; saved-view persistence remains Issue 6
- FR-V3-006 / RelatedRecordStackContributionContract: related record navigation requests one top-layer host transition and Back returns to the previous viewer; the real Deputy/another-record acceptance remains later
- FR-V3-012 / DirtyLeaveGuardContract: a dirty Task Close/browser Back/root replacement/open-page request invokes the shared async guard; deny preserves the draft, URL, marker, content, and focus, while allow completes the original transition once
- SingleViewerHostContract: panel and page use the Issue 4 route/overlay callbacks and never create a second viewer or host

Expected red: route-to-panel/page assertions fail until the new adapter is wired into the existing host seams.

Green:

~~~sh
npm test -- --run src/components/tasks/task-drawer.test.tsx src/components/tasks/tasks-workspace.test.tsx src/pages/tasks-layout.test.tsx src/pages/task-detail.test.tsx src/pages/signals-archive-page.test.tsx src/components/signals/signal-page-mode.test.ts
npm run typecheck
npm run lint
~~~

Expected pass: the Task/Signal host seams render panel and canonical-page modes with matching hierarchy, related callbacks use one top-layer stack, dirty Task leave attempts use the final async host guard with tenant-owned confirmation, and no collection or domain route owns a second overlay host. Collection saved views, Inbox quick triage, Café context, and the full Deputy/another-record journey remain later-issue acceptance work.

Commit:

~~~sh
git add src/components/tasks/task-drawer.tsx src/components/tasks/task-drawer.test.tsx src/components/tasks/tasks-workspace.tsx src/components/tasks/tasks-workspace.test.tsx src/pages/tasks-layout.tsx src/pages/tasks-layout.test.tsx src/pages/task-detail.test.tsx src/components/tasks/task-page-mode.ts src/components/tasks/task-page-mode.test.ts src/pages/signals-archive-page.tsx src/pages/signals-archive-page.test.tsx src/components/signals/signal-page-mode.ts src/components/signals/signal-page-mode.test.ts src/components/signals/signal-record-host.tsx
git commit -m "feat: wire record viewers through overlay routes" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~

### Task 7 — Verify top-layer keyboard, focus, dirty-state, and permission behavior

Create or modify:

- mos-app/src/components/records/record-viewer.behavior.test.tsx
- mos-app/src/components/records/record-viewer.test.tsx
- mos-app/src/components/tasks/task-surface.test.tsx
- mos-app/src/components/tasks/task-drawer.test.tsx
- mos-app/src/components/signals/signal-record-host.test.tsx

Use real Task and Signal adapter fixtures only. Cover these exact tests:

- FR-V3-006 / RelatedRecordStackContract: Back closes only the top related-record layer and leaves the underlying record open
- FieldEscapeContract: RecordField Escape cancels only the field draft and does not invoke OverlayLeaveGuard
- FR-V3-012 / DirtyLeaveGuardContract: explicit Close on a dirty Task delegates to the shared OverlayLeaveGuard and Task-owned ConfirmDialog; deny preserves the draft, content, URL/marker, and focus
- FR-V3-012 / DirtyLeaveGuardCoverage: dirty Task browser Back, root/current replacement, related push, and open-page use the same guard; allow completes the original transition once
- FocusRestoreContract: closing a clean panel restores focus to the collection opener
- NFR-V3-006: panel, sheet, Close, Back, and action targets are at least 44px and keyboard reachable without horizontal overflow
- AC-V3-009: permission-restricted Task and retracted Signal preserve information hierarchy while hiding or explaining disallowed actions
- ViewerHeadingLandmarkContract: page and panel contain no duplicate visible h1 and have an accessible viewer landmark

Red:

~~~sh
npm test -- --run src/components/records/record-viewer.behavior.test.tsx src/components/records/record-viewer.test.tsx src/components/tasks/task-surface.test.tsx src/components/tasks/task-drawer.test.tsx src/components/signals/signal-record-host.test.tsx
~~~

Expected red: the tenant integration assertions expose any direct history calls, wrong field-Escape precedence, local RecordViewer confirmation, missing focus return, denied-leave data loss, duplicate host, or undersized target.

Green:

~~~sh
npm test -- --run src/components/records/record-viewer.behavior.test.tsx src/components/records/record-viewer.test.tsx src/components/tasks/task-surface.test.tsx src/components/tasks/task-drawer.test.tsx src/components/signals/signal-record-host.test.tsx
npm run typecheck
npm run lint
~~~

Expected pass: field Escape restores the saved baseline without invoking the host; dirty explicit Close/browser Back/replacement/open-page uses the final host guard and Task-owned confirmation; denial leaves draft/content/URL/marker/focus in place; approval completes once; clean transitions restore focus; permission state is honest; and the viewer never owns overlay history or confirmation copy.

Commit:

~~~sh
git add src/components/records/record-viewer.behavior.test.tsx src/components/records/record-viewer.test.tsx src/components/tasks/task-surface.test.tsx src/components/tasks/task-drawer.test.tsx src/components/signals/signal-record-host.test.tsx
git commit -m "test: prove record viewer interaction contract" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~

### Task 8 — Add the curated cross-stack responsive journeys

Create:

- mos-app/e2e/v3-record-viewer.spec.ts

Use the existing login and task helpers, existing fixtures, and a seeded readable Signal. Do not add a fake Standard/SOP record. These are Issue 5 contribution journeys, not end-to-end proof of the later cross-surface master criteria. Keep the journey set to the Issue 5 boundary:

1. At 1280px, invoke the existing Task host entry with collection context, verify panel-first identity/metadata/content/action order with Business Unit distinct from the missing-Team state, invoke the canonical-page callback, and use browser Back to return.
2. At 1024px, invoke the existing Signal host entry, verify the sheet regime, open a linked Task through the supplied related-record callback, press Back once, and verify the Signal remains.
3. At 390px, open a Task page directly, verify the same hierarchy is full screen, use keyboard focus to reach a 44px action, and verify no content is clipped.
4. Load an unauthorized or archived Task and a retracted Signal; verify values and tombstone/reason remain visible while forbidden actions are absent or disabled honestly.
5. Make a Task field dirty, press Escape, verify only the field draft is restored and the viewer remains open; make it dirty again, trigger explicit Close, verify the tenant-owned ConfirmDialog, verify Stay preserves draft/content/URL/focus, then verify Leave completes the original close; repeat a clean close and verify opener focus restoration.

Tag each journey with its Issue 5 FR/NFR or descriptive contract in the test title. Do not use a later master AC as an Issue 5 owning tag:

- FR-V3-004 / PanelContributionContract: existing host entry opens the Task panel first
- FR-V3-005 / CanonicalPageContributionContract: Task promotion and direct page preserve the same hierarchy
- FR-V3-006 / RelatedRecordStackContributionContract: related Task navigation is a one-step overlay stack
- FR-V3-012 / DirtyLeaveGuardContract: field Escape and guarded Close preserve the correct layer and draft
- NFR-V3-001 / ViewerInteractionContract: loading/error/retry, field Escape, guarded Close, and Back behavior are usable
- NFR-V3-006: 390px controls meet the 44px target and the page has no horizontal overflow
- AC-V3-009: real permission and retraction states are honest

Red:

~~~sh
npm run e2e -- e2e/v3-record-viewer.spec.ts
~~~

Expected red on the first implementation pass: at least one journey fails until routes, overlay integration, responsive CSS, and test data are wired. This command is for the future implementation session; do not run it while creating this plan and do not start the dev server in the planning task.

Green:

~~~sh
npm run e2e -- e2e/v3-record-viewer.spec.ts
~~~

Expected pass: all five Issue 5 contribution journeys run against the local test environment, with no cloud or staging database. Keep this suite curated; do not turn it into a collection snapshot, Inbox, Café, or saved-view suite owned by later issues.

Commit:

~~~sh
git add e2e/v3-record-viewer.spec.ts
git commit -m "test: cover record viewer journeys" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~

### Task 9 — Run the Issue 5 quality and review gates

No implementation change is authorized in this task unless a failing assertion identifies a real Issue 5 defect. Run from mos-app:

~~~sh
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run e2e -- e2e/v3-record-viewer.spec.ts
~~~

Expected pass:

- TypeScript has zero errors.
- ESLint and Stylelint have zero warnings/errors.
- All Vitest tests pass.
- The production build completes.
- The curated E2E journeys pass against the local environment.

Run the repository gate from the root:

~~~sh
bash scripts/pre-merge-check.sh
~~~

Expected pass: the repository gate reports no type, lint, test, build, or prohibited-scope failure. Do not run Supabase or database tests as part of this Issue 5 plan; no schema changed.

Before the checkpoint, perform the required four-lens review against DESIGN.md, docs/experience-contract.md, docs/interaction-contract.md, docs/jtbd.md, the E7 mockup README, SALVAGE-INVENTORY.md, and CONVERGENCE-AUDIT.md:

- Visual: E7 tokens, hierarchy, widths, phone sheet, loading/error/read-only states, 44px targets.
- Interaction: panel-first, promotion, field Escape cancellation, async guarded Close/browser Back/replacement/open-page, tenant-owned confirmation, focus trap/restore, and direct URL behavior.
- IA: Task/Signal remain separate; Task uses PIC/Supervisor, shows Business Unit separately, and shows an honest missing-Team state rather than relabeling BU; the page-family frame owns page identity; no duplicate record collection or host.
- Product/Intent: Task completion through PIC/Supervisor semantics, Signal attention/capture, high-school-graduate copy, explicit legacy person-storage debt, explicit Issue 8 BU→Team re-home dependency, and no accidental Standard/SOP or JSONB scope.

Record any finding as a code or test change before the checkpoint. A review that discovers the missing Standard/SOP model is not permission to invent one.

Commit:

~~~sh
git commit -m "test: complete V3 Issue 5 verification" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~

Only create this checkpoint commit if the verification task changed a tracked test/config file. Otherwise retain the prior green commits and record the command output in the review ledger.

### Task 10 — Update checkpoint documentation after implementation, not during planning

This is a future implementation checkpoint. The planning task must not edit these files. After Tasks 0–9 are green and the owner approves the issue checkpoint, update exactly:

- docs/agent-context.md
- docs/backlog.md
- docs/reviews/v3-redesign.md

The updates must be mutually consistent:

- docs/agent-context.md: mark Issue 5 complete with the implementation/test commit hashes; state that Issue 3/4 interfaces were consumed; state that Task and Signal are the only shipped Issue 5 adapters; state that Task UI uses PIC/Supervisor, displays Business Unit separately, shows Team not assigned yet/data migration until a real team_id path exists, does not claim full Team-backed acceptance, and records the legacy person-storage mismatch plus the Issue 8 BU→Team re-home dependency; state that Standard/SOP has no live model and remains a future dependency; state the next issue is Issue 6; preserve the current operator rules and open risks.
- docs/backlog.md: move the V3 redesign checkpoint to Issue 6 without deleting the historical Issue 5 entry or rewriting owner decisions; record the shipped viewer/field/Task/Signal scope, PIC/Supervisor and honest Business Unit/missing-Team vocabulary, guarded leave behavior, and the deferred Issue 8 BU→Team re-home, Standard/SOP, and Issue 10 work.
- docs/reviews/v3-redesign.md: append an Issue 5 ledger entry with spec acceptance mapping, exact verification commands and results, changed paths, four-lens evidence, proof of PIC/Supervisor labels with no Task RACI vocabulary, proof that Business Unit is not relabeled as Team, proof of real archived/unauthorized Task and retracted Signal states, proof of async guarded dirty leave, and unresolved dependencies.

Red documentation consistency check:

~~~sh
rg -n "Issue 5|Issue 6|Standard|SOP|RecordViewer|retracted|permission|80%" docs/agent-context.md docs/backlog.md docs/reviews/v3-redesign.md
git diff --check
~~~

Expected red: before the checkpoint, the three documents still describe the prior issue or omit the new evidence. Green: all three documents describe the same checkpoint, and no document claims Standard/SOP support or JSONB authoring.

Future documentation commit:

~~~sh
git add docs/agent-context.md docs/backlog.md docs/reviews/v3-redesign.md
git commit -m "docs: record V3 Issue 5 checkpoint" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~

Do not make this commit in the planning task.

## Plan-only validation and commit

The current task may create and commit only this plan file:

- docs/plans/2026-07-20-v3-record-viewer.md

Run from the repository root:

~~~sh
test -f docs/plans/2026-07-20-v3-record-viewer.md
wc -l docs/plans/2026-07-20-v3-record-viewer.md
git diff --check
rg -n "superpowers:executing-plans|Do not use subagents|AC-V3-008|AC-V3-009|archived|unauthorized|retracted|Standard/SOP|Issue 10|Issue 6|docs/agent-context.md|docs/backlog.md|docs/reviews/v3-redesign.md" docs/plans/2026-07-20-v3-record-viewer.md
marker_one=TO
marker_one=$marker_one"DO"
marker_two=TB
marker_two=$marker_two"D"
marker_three=NEEDS_
marker_three=$marker_three"REVIEW"
if rg -n "$marker_one|$marker_two|$marker_three" docs/plans/2026-07-20-v3-record-viewer.md; then exit 1; fi
# Guard the immutable master-AC boundary: non-owned IDs may appear only in the
# explanatory ownership table at the end of this plan.
non_owned_master='AC-V3-00[1-7]|AC-V3-01[0-4]'
if awk '
  /^## Complete deferred master AC ownership \(not Issue 5 proof\)$/ { in_deferred=1 }
  !in_deferred { print }
' docs/plans/2026-07-20-v3-record-viewer.md | rg -n "$non_owned_master"; then
  echo "non-owned master AC used outside deferred ownership table" >&2
  exit 1
fi
test "$(rg -n "$non_owned_master" docs/plans/2026-07-20-v3-record-viewer.md | wc -l | tr -d ' ')" -eq 12
expected_master_ids=$(for id_suffix in 001 002 003 004 005 006 007 010 011 012 013 014; do printf 'AC-V3-%s\n' "$id_suffix"; done)
actual_master_ids=$(awk '/^## Complete deferred master AC ownership \(not Issue 5 proof\)$/ { in_deferred=1 } in_deferred { print }' docs/plans/2026-07-20-v3-record-viewer.md | rg -o "$non_owned_master" | sort -u)
test "$actual_master_ids" = "$expected_master_ids"
git status --short
~~~

Expected pass: the plan exists, has no whitespace errors or unresolved planning markers, the filtered AC audit emits no non-owned IDs, the unfiltered targeted rg finds exactly twelve rows, the extracted ownership set exactly matches the twelve locked non-owned IDs, the corrected real-state proof is present, the future documentation checkpoint is named without modifying it, and git status shows only the plan.

Commit only the plan:

~~~sh
git add docs/plans/2026-07-20-v3-record-viewer.md
git commit -m "docs: plan V3 Issue 5 RecordViewer" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~

After committing, verify:

~~~sh
git status --short
git show --stat --oneline HEAD
git log -1 --format='%H%n%s%n%(trailers:key=Co-Authored-By,valueonly)'
~~~

Expected pass: the commit contains only docs/plans/2026-07-20-v3-record-viewer.md, the worktree is clean, and the trailer is exactly Claude Fable 5 <noreply@anthropic.com>.

## Self-review against the master spec

- FR-V3-002/003: the shared primitives and typed Task/Signal adapters contribute to the master grammar without converting database models or adding a universal record table.
- FR-V3-004/005/006/012: Issue 5 verifies the Task/Signal panel, canonical-page, related-stack, and async-host contribution seams while consuming Issue 4 ownership; collection, Inbox, Café, and real Deputy/another-record completion remain later cross-surface work.
- FR-V3-008/009: satisfied by real archived/unauthorized Task and retracted Signal tests, honest action permissions, dirty/save/error feedback, and read-only hierarchy; all non-field leave transitions use the final async host guard and tenant-owned confirmation.
- FR-V3-010/011: intentionally not implemented; typed content slots are a future-compatible boundary only. No structured JSONB authoring or fake blocks.
- AC-V3-008/009: these are the only master acceptance criteria Issue 5 claims complete; their owning field, adapter, permission, and retraction proofs are listed above.
- Non-owned master acceptance criteria are explicitly listed in the deferred ownership table below; none is an Issue 5 owning test or end-to-end claim.
- NFR-V3-001/003/004/005/006/007: accessibility/keyboard, changed-code coverage, type/lint, responsive review widths, 44px/no-overflow, and one canonical component are covered above; state/error/i18n and typed content boundaries use descriptive contracts.
- Issue 6, Issue 7, and the Standard/SOP model remain outside the Issue 5 implementation boundary.

Task vocabulary, Team boundary, and leave-guard review:

- Task UI and adapter terms are Person in charge (PIC) and Supervisor, with Business Unit shown separately. Team is an optional/missing-prerequisite field only: Issue 5 shows Team not assigned yet/data migration when the current row lacks team_id and never relabels Business Unit as Team. No Task section, field key, test oracle, i18n label, or review claim uses Responsible, Accountable, RACI, Consulted, or Informed as Task ownership vocabulary.
- The current responsible_person_id/accountable_person_id storage/type names remain only in the TaskSurface-to-DAL translation and explicitly named debt evidence. They are not renamed in the schema during Issue 5.
- Checklist content inherits the parent Task's PIC/Supervisor and has no independent ownership.
- Full Team-backed Task acceptance is not claimed in Issue 5. The current mos.tasks model has no team_id; the exact dependency is Issue 8's Task BU→Team re-home/Café bridge, which must land the real field/lookup before a Team-backed adapter test can be added.
- RecordField Escape cancels the field draft first. Explicit Close, browser Back/Forward, root/current replacement, related push, and open-page promotion after a dirty record use OverlayLeaveGuard; the active tenant owns ConfirmDialog/ModalShell copy and resolution, while the generic host owns only the domain-neutral async transaction.

Unresolved contradictions to carry forward explicitly:

1. The current v3-redesign tip has the Issue 3 and Issue 4 plans but not their implementation files. This plan cannot execute until those interfaces are landed or the implementation base is rebased to their landed commits.
2. The current app has no live Standard/SOP model or route. The master UI contract names Standard/SOP as a distinct domain, but Issue 5 cannot prove it without inventing a domain contract. Future Standard/SOP work must begin from a real model and adapter issue; this plan deliberately supplies no proxy fixture.
3. The domain target requires every concrete execution record to have an executing Team, but current mos.tasks has no team_id. ADR-0025 D39 and the 2026-07-16 occurrence plan explicitly defer Task BU→Team re-home to the Café bridge/Issue 8. Issue 5 therefore cannot claim full Team-backed Task acceptance and must keep Business Unit distinct from the missing-Team state.
4. Issue 4 scoped domain adapters out while defining the overlay host, while the Issue 5 correction requires real Task and Signal adapter proof. This plan resolves that sequencing by consuming the final domain-neutral leave-guard seam, keeping the Signal collection adapter in Issue 6, and allowing the Issue 5 Signal record adapter at the existing SignalRecordHost seam.
5. JSONB authored content remains deferred to Issue 10 even though the master spec lists its eventual acceptance criteria. The typed RecordContentSlot render boundary is intentionally not an authoring implementation.

No contradiction is hidden by adding a fake record kind, changing the database model, or editing canonical checkpoint state during this planning task.

## Complete deferred master AC ownership (not Issue 5 proof)

| Master AC | Owning issue / dependency | Explicit Issue 5 boundary |
| --- | --- | --- |
| AC-V3-001 | Issue 9 | Visual/token acceptance is not proven here |
| AC-V3-002 | Issue 9 | Issue 5 contributes Task/Signal; the all-surfaces Tasks/Signals/Inbox/Café journey is not claimed here |
| AC-V3-003 | Issue 9 | Issue 5 contributes only the generic related-record callback/stack contract; the real Deputy/another-record journey is not claimed here |
| AC-V3-004 | Issue 8 | Same Task identity/viewer in Work and Café is not proven here |
| AC-V3-005 | Issue 6 | Signal collection saved-view presentation persistence is not proven here |
| AC-V3-006 | Issue 7 | Inbox bell quick triage in the shared panel is not proven here |
| AC-V3-007 | Issue 8 | Multi-Team Café explicit choice is not proven here |
| AC-V3-010 | Issue 10 | Structured JSONB content save/reopen is not implemented here |
| AC-V3-011 | Issue 10 | Normalized-state references from authored content are not implemented here |
| AC-V3-012 | Issue 9 | First-time floor-member Café completion is not proven here |
| AC-V3-013 | Issue 6 | Manager filtering, grouping, presentation switching, and consecutive-record context retention are not proven here |
| AC-V3-014 | Issue 12 | All-route removal of bespoke shells and superseded component/style families is not proven here |
