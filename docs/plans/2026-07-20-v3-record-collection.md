# V3 Issue 6 — RecordCollection/view engine and Tasks/Signals adapters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in an isolated,
> visible Codex task. Execute this plan inline, one task at a time, with red → implementation →
> green checkpoints. **Do not use subagents, superpowers:subagent-driven-development, pi, or
> parallel implementation for this issue.**

**Date:** 2026-07-20
**Status:** Plan only; implementation is not started
**Goal:** Implement V3 Issue 6 from docs/specs/v3-redesign.spec.md: one typed
RecordCollection/view engine with Tasks and Signals adapters, compatible presentation switching,
URL/deep-link state, selection and capability visibility, and drawer-first opening through the
already-owned Issue 4/5 seams.

This plan is the only file to be changed by the planning task. The future implementation may update
the three checkpoint files named in Task 17, but this planning task must not edit them. Do not touch
Supabase, migrations, environment files, production data, package manifests, a dev server, push,
merge, deploy, or any production application code while creating or reviewing this plan.

## Authority, dependencies, and scope

Read these in this order at the start of implementation: CLAUDE.md; AGENTS.md;
docs/requirements-evolution.md E8/V3; docs/agent-context.md; CONTEXT.md; DESIGN.md;
docs/specs/v3-redesign.spec.md sections 6.3–6.6 and 8–14;
docs/plans/2026-07-20-v3-page-families.md; docs/plans/2026-07-20-v3-overlay-host.md;
docs/experience-contract.md; docs/interaction-contract.md; docs/jtbd.md;
docs/decisions.md OD-REDESIGN-26 and OD-REDESIGN-72 through OD-REDESIGN-79;
docs/adr/0025-ia-modules-in-rail-redesign-direction.md D3f, D9, and D13;
docs/reference/twenty-ixd-patterns.md;
docs/reference/provenance/owner-directives-index.md;
docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md;
docs/reference/provenance/02-the-50plus-qna-grill-2026-07-10_12.md sections covering saved views,
typed objects, Feed/Table/Timeline, and record opening; and
docs/reference/provenance/03-frustration-and-buildout-2026-07-13_16.md sections covering
“merge surfaces aggressively, merge schemas conservatively,” the two-front manager/floor bar,
quicksand/OD-REDESIGN-65, and the three-layer domain → UI → destination rule.

Issue 6 starts only after the completed Issue 3, Issue 4, and Issue 5 checkpoints are present on the
rebased worktree. The current planning tip has the Issue 3 and Issue 4 plans but no Issue 5 plan or
implementation checkpoint, so the following dependency gate is mandatory and intentionally blocks
code if the handoff is absent:

~~~
git status --short
test -f mos-app/src/shell/page-families.ts
test -f mos-app/src/shell/page-family-frame.tsx
test -f mos-app/src/shell/overlay-navigation.ts
test -f mos-app/src/shell/overlay-host.tsx
rg -n "OverlayHostApi|OverlayHostSlot|RecordRouteAdapter|RecordViewer" \
  docs/reviews/v3-redesign.md docs/agent-context.md
test -f mos-app/src/components/record-viewer/record-viewer-contract.ts
test -f mos-app/src/components/record-viewer/record-viewer.tsx
rg -n "RecordViewerOpeningContract|RecordViewerOpenSource|buildPanelEntry|RecordViewer" \
  mos-app/src/components/record-viewer docs/reviews/v3-redesign.md docs/agent-context.md
npm test -- --run src/shell/page-family-migration.test.ts src/shell/overlay-host.test.tsx \
  src/components/record-viewer/record-viewer.test.tsx
npm run typecheck
npm run lint -- --max-warnings=0
~~~

Expected dependency result: the Issue 3/4/5 tests and gates pass on the completed upstream
checkpoints. If the Issue 5 files or public exports are absent, stop with no Issue 6 code change and
revalidate this plan after Issue 5. Do not invent a parallel viewer contract or add a compatibility
shim in Issue 6.

The Issue 5 handoff consumed by this plan is the narrow opening seam below. Issue 5 owns its
implementation and renderer; Issue 6 only imports it. If the completed Issue 5 checkpoint records a
different path, the Director must reconcile the plan before implementation rather than choosing
silently.

~~~
// Owned by Issue 5 at mos-app/src/components/record-viewer/record-viewer-contract.ts.
export interface RecordViewerOpenSource {
  collectionId: string
  presentation: string
  pathname: string
  search: string
}

export interface RecordViewerOpeningContract<TRecord> {
  readonly recordType: string
  buildPanelEntry(
    record: TRecord,
    source: RecordViewerOpenSource,
  ): import('@/shell/overlay-host').OverlayEntry
  toCanonicalPage(recordId: string, source: RecordViewerOpenSource): import('react-router-dom').To
}
~~~

Issue 6 does not add a universal RecordRow, records table, arbitrary JSON row, least-common-
denominator query, or second physical panel. Task, Signal, and Inbox retain separate database row
types, query schemas, actions, permissions, and loaders. The reusable boundary is the typed
collection engine plus typed adapter/descriptor contracts.

| Master issue | Issue 6 boundary |
|---:|---|
| 2 | Storybook proof is a prerequisite, not reimplemented. |
| 3 | Consume PageFamilyFrame and its route guard; do not recreate page-family shell code. |
| 4 | Consume OverlayHostApi, OverlayHostSlot, and RecordRouteAdapter; do not modify the host, focus stack, Escape, browser Back, or panel geometry. |
| 5 | Consume RecordViewerOpeningContract; do not create viewer fields, viewer pages, viewer content, or another opening contract. |
| 6 | Own the collection state engine, typed query/URL schemas, presentation compatibility, Tasks adapter, Signals adapter, and migration guard. |
| 7 | Real Inbox triage, notification read state, bell quick panel, and Deputy contextual wiring remain out of scope. Only a test-only Inbox-shaped conformance fixture is allowed. |
| 8 | Café integration and canonical-record re-homing remain out of scope. Current Tasks expose only Business Unit from `business_unit_id`; the real Task `team_id` contract and BU→Team re-home are an explicit Issue 8 dependency, not Issue 6 support. |
| 9 | The owner-rendered/driven representative gate and provisional IA ratification remain out of scope. |
| 10–12 | No JSONB/storage/RLS work outside the reversible `mos.user_views` collection-view extension owned by Issue 6, no broad route migration, and no final whole-app closure. |

## Product and interaction contract

The following are binding implementation outcomes, not optional polish:

- A Feed, Table, Triage Queue, Board, Calendar, Library, or Card renderer is a presentation over one
  collection controller. A renderer receives already-owned query/projection/selection/state props;
  it cannot fetch its own rows or own a second search/filter/sort/group/saved-view grammar.
- Every suitable live presentation exposes the collection capabilities that make sense for that
  domain: search, typed filters, sort, grouping, saved-view identity, selection, bulk-action slot,
  loading/error/empty/filtered-empty states, permission/read-only state, and record opening. An
  unsupported capability is absent, not a disabled “soon” control or decorative empty chrome.
- Switching presentation preserves all compatible query fields, selected IDs, saved-view identity,
  and the URL. An incompatible field returns a typed rejection and leaves query, selection, and URL
  unchanged. It is never dropped or reset invisibly.
- Built-in chips are seed views, not persistence. Tasks and Signals expose the same typed saved-view
  lifecycle through the collection controller: save current view, apply a named view, rename, and
  soft-archive. Applying or saving a persisted view validates its collection id/domain, presentation,
  visible fields, typed query/filters, sort, grouping, and relevant layout before changing the URL or
  calling the DAL. A pending, permission, validation, or server failure is visible and retryable.
- A collection click calls the Issue 5 opening contract and Issue 4 overlay host. Desktop keeps the
  collection context in the right panel; intermediate width uses the host sheet; phone uses the host
  full-screen surface. Direct URL, refresh, bookmark, new tab, and explicit full-page escalation use
  the canonical full page through the same viewer contract. Issue 6 does not reimplement those rules.
- Task presentation retains the E7 dense Table grammar and the existing meaningful phone/Card fields:
  Title, Status, PIC, Supervisor, Due, Business Unit, Project/Process, Objective, Source, and Activity.
  Existing occurrence grouping remains typed and captioned, including “Café Opening · 17 Jul 2026”
  style realistic data and the unassigned tail group.
- Task collection vocabulary is explicit: `pic`/`picId` means the person expected to perform and close
  the Task; `supervisor`/`supervisorId` means the person who monitors, unblocks, and verifies it. The
  collection query, presentation descriptors, visible fields, URL keys, saved-view specs, fixtures,
  and UI copy use those names. A role-free person key is not canonical. The existing raw DAL columns
  are adapted exactly once inside the Task adapter and are not exported through the Issue 6 UI contract.
  The current renderer has one legacy person-grouping slot, so it is mapped explicitly to `pic`; Task
  `supervisor` grouping is an explicit unsupported capability until a typed renderer is added. It is
  rejected on parse/save rather than mapped or dropped. Task sorting and filtering may support both
  `pic` and `supervisor` because the underlying row has both distinct relationships.
- A Task never fabricates a Team from `business_unit_id`. Issue 6 renders the current Business Unit
  honestly and has no Task `team`, `teamId`, Team filter, Team grouping, or Team visible field. The
  Task validator rejects those fields before a view can be saved. After Issue 8 supplies a real
  `mos.tasks.team_id` contract and its BU-derivation migration, the same typed descriptor may add
  Team support without creating a second collection engine.
- Signal presentation retains the factual Feed card grammar and archive/retraction semantics. Signal
  has no PIC, Supervisor, or Task Status fields; the adapter must not invent them to fit a Task table.
  The archive Table uses Signal fields such as body, author, Team, occurred-at, attention, category,
  and the explicit retracted tombstone.
- Inbox is a future typed Triage Queue example only in this issue: unread-first ordering, severity,
  notification title/body, and route-to-source-record are its distinct fields. The fixture must prove
  the engine can support it without changing InboxPage, InboxList, notification hooks, or the bell.
- The floor-member default shows work before configuration. Manager controls remain discoverable,
  keyboard-operable, and efficient without dominating the default. Search and filters are not hidden
  behind a command-only path.
- Use E7 tokens and existing components. Borrow Twenty’s one-renderer/one-view/one-panel interaction
  grammar only; do not copy Twenty’s metadata-driven database model, table markup, or custom-object
  assumptions. Use the existing DataTable for a suitable typed Signal table and the existing E7
  Tasks table/Card renderers where their behavior is canonical.
- Preserve aria-current/selected-record semantics, focus-visible styling, keyboard open/selection,
  44×44px phone targets, no horizontal overflow at 390px, and honest read-only/capability states.

## Existing source map and migration target

The implementation must re-home the current behavior instead of creating a parallel mini-app.

| Current path | Current seam | Issue 6 action |
|---|---|---|
| mos-app/src/components/tasks/tasks-workspace.tsx | Owns local search, filters, sort, group, selection, load/error/empty branches, grouping projection, keyboard opening, and table/card composition. | Make it a thin Tasks collection consumer. Read all state from useRecordCollection(taskCollectionDescriptor) and pass typed projection/actions to existing renderers. |
| mos-app/src/components/tasks/tasks-toolbar.tsx | Receives separate setters and renders Task chips plus disabled Board/Calendar tabs. | Receive typed query/controller callbacks; expose PIC and Supervisor as distinct filters; remove unsupported decorative tabs; keep Task-specific filters and saved-view operations. |
| mos-app/src/components/tasks/tasks-table-body.tsx | Owns loading/error/empty/filtered-empty branches and desktop/mobile choice. | Move state branches to RecordCollectionSurface; keep row/table/card rendering as typed presentation consumers. |
| mos-app/src/components/tasks/mobile-grouped-cards.tsx and task-row.tsx | Canonical E7 Card and Table row content; links preserve location.search. | Preserve the content and target grammar; call the controller’s typed openRecord callback. |
| mos-app/src/components/tasks/tasks-grouping.ts | Typed Task grouping helpers and occurrence rollups. | Reuse from TaskCollectionAdapter.project; do not rewrite grouping as generic string-key rows. |
| mos-app/src/components/tasks/owner-cell.tsx | Existing PIC visual cell with a legacy component name. | Rename the internal primitive to `PicCell` in the Issue 6 diff; no `OwnerCell`, `ownerName`, or owner label crosses the Task UI contract. |
| mos-app/src/components/tasks/group-header-row.tsx | Group header/add-task prefill callbacks and legacy person-group copy. | Use explicit PIC group labels and the canonical `pic` query key; Supervisor grouping remains rejected until a typed renderer exists. |
| mos-app/src/components/tasks/use-tasks-saved-view.ts | URL view parser/setter for Task chips. | Delete after its behavior is covered by TaskCollectionQuerySchema; no second saved-view owner. |
| mos-app/src/components/tasks/use-tasks-view-pref.ts | Local-storage group/view/collapse state. | Delete after query/group state moves to the collection controller; group collapse belongs to controller presentation state. |
| mos-app/src/pages/tasks-layout.tsx | Page shell and Task route/direct-page split. | Preserve the PageFamily/Issue 4/5 route seams and render only the Tasks collection plus the existing host slot. |
| mos-app/src/lib/db/tasks.ts and tasks.types.ts | Typed TaskListFilters, listTasks, TaskListRow, TaskStatus. | Keep the DAL/model unchanged; Task adapter translates its typed query to TaskListFilters. |
| mos-app/src/pages/signals-archive-page.tsx | Owns URL search/retracted filters, load, filter projection, archive links, and record host. | Make it a Signal collection consumer using the Signals adapter and existing Issue 4/5 host/page seams. |
| mos-app/src/components/signals/signal-feed-section.tsx | Owns a second Signal loader for Home ambient Feed. | Use the same Signals descriptor with a fixed embedded query and no URL-writing controls; do not create a second loader. |
| mos-app/src/components/signals/signal-feed.tsx and signal-card.tsx | Presentational Home Feed/card grammar and composer/open callbacks. | Keep as the typed Feed renderer; adapt only props needed by the shared controller. |
| mos-app/src/lib/db/signals.ts and signals.types.ts | Typed listReadableSignals, SignalRow, Signal mutations. | Keep the DAL/model unchanged; Signal adapter owns query translation and display context. |
| mos-app/src/components/dashboard/data-table.tsx | Existing generic sortable/reflowing table primitive. | Reuse it for the typed Signal archive Table; do not introduce a Twenty table clone. |
| mos-app/src/pages/inbox-page.tsx, components/inbox/InboxList.tsx, hooks/useNotifications.ts, shell/top-bar.tsx | Existing full-page Inbox and bell behavior. | Do not modify. Use a test-only NotificationRow descriptor to prove Issue 7 can consume the engine later. |
| mos-app/src/lib/viewspec/* and mos-app/src/lib/db/user-views.ts | Dashboard/Home CompositionSpec DSL and existing `mos.user_views` DAL. | Keep CompositionSpec and old Home/dashboard rows working; extend the typed DAL with a discriminated CollectionViewSpec union and Work collection-view CRUD. The migration below adds nullable legacy-compatible `kind`/`context`/`lifecycle` metadata for new collection rows without rewriting old rows. |
| supabase/migrations/20260720000001_mos_user_views_collection_views.sql | No current Issue 6 migration. | Add the reversible normalized metadata constraints/indexes for `kind=collection`, `context=work`, and `lifecycle`; preserve existing fail-closed RLS policies and old CompositionSpec rows. Do not add a Task Team column or infer one. |
| supabase/tests/63_mos_user_views_collection_views.sql | No current collection-view pgTAP suite. | Prove metadata/spec constraints, owner isolation, shared visibility, cross-org denial, update pinning, and legacy-row compatibility against the one local Supabase. |
| Issue 4 mos-app/src/shell/overlay-host.tsx | One physical host, session stack, history markers, focus, and OverlayEntry. | Import OverlayHostApi/OverlayHostSlot; pass viewer-owned entries from the Issue 5 opening contract. |
| Issue 5 mos-app/src/components/record-viewer/* | Shared viewer grammar and typed record opening. | Import only RecordViewerOpeningContract; do not reimplement viewer content. |

## Production interfaces

Create the following exact new paths. Names are deliberately collection-specific and generic over
records; there is no UniversalRecord type.

### mos-app/src/lib/record-collection/types.ts

~~~
import type { ReactNode } from 'react'
import type { RecordViewerOpenSource, RecordViewerOpeningContract } from
  '@/components/record-viewer/record-viewer-contract'
import type {
  CollectionViewSpec,
  CollectionViewValidationResult,
  PersistedCollectionView,
} from './collection-view-spec'

export type CollectionStatus =
  | 'loading' | 'ready' | 'empty' | 'filtered-empty' | 'error'
  | 'permission' | 'read-only'

export type QueryKey<TQuery extends object> = Extract<keyof TQuery, string>

export interface CollectionQueryIssue {
  key: string
  code: 'invalid-value' | 'unsupported-by-presentation' | 'missing-required'
  value?: string
}

export type CollectionQueryParse<TQuery extends object> =
  | { ok: true; query: TQuery }
  | { ok: false; query: TQuery | null; issues: readonly CollectionQueryIssue[] }

export interface CollectionQuerySchema<TQuery extends object> {
  readonly keys: readonly QueryKey<TQuery>[]
  parse(params: URLSearchParams, presentation: string): CollectionQueryParse<TQuery>
  serialize(query: TQuery): URLSearchParams
  normalize(query: TQuery): TQuery
}

export interface CollectionCapabilities<TQuery extends object, TAction extends string> {
  search: boolean
  filterKeys: readonly QueryKey<TQuery>[]
  sortKeys: readonly QueryKey<TQuery>[]
  groupKeys: readonly QueryKey<TQuery>[]
  savedViews: boolean
  selection: boolean
  recordOpening: boolean
  bulkActions: readonly TAction[]
}

export type SavedViewOperation = 'save' | 'apply' | 'rename' | 'archive'

export interface CollectionViewStore {
  list(collectionId: CollectionViewSpec['collectionId']): Promise<readonly PersistedCollectionView[]>
  get(id: string): Promise<PersistedCollectionView | null>
  create(input: { name: string; scope: 'private' | 'shared_team'; spec: CollectionViewSpec }): Promise<PersistedCollectionView>
  rename(id: string, name: string): Promise<void>
  archive(id: string): Promise<void>
}

export type CollectionViewOperationStatus =
  | 'idle' | 'loading' | 'saving' | 'renaming' | 'archiving' | 'error'

export interface CollectionViewState {
  readonly items: readonly PersistedCollectionView[]
  readonly operation: CollectionViewOperationStatus
  readonly error: string | null
}

export interface CollectionAccess<TAction extends string> {
  mode: 'full' | 'read-only' | 'forbidden'
  visibleActions: readonly TAction[]
}

export interface CollectionData<TRecord, TContext> {
  records: readonly TRecord[]
  context: TContext
}

export interface CollectionProjection<TRecord, TGroup> {
  visibleRecords: readonly TRecord[]
  groups: readonly TGroup[]
  totalRecords: number
  visibleRecordsAreFiltered: boolean
}

export interface CollectionPresentationProps<
  TRecord,
  TQuery extends object,
  TProjection,
  TContext,
  TId extends string,
> {
  query: TQuery
  projection: TProjection
  context: TContext
  selectedIds: ReadonlySet<TId>
  onToggleSelected: (id: TId) => void
  onOpenRecord: (record: TRecord) => void
  onToggleGroup: (groupId: string) => void
  isGroupCollapsed: (groupId: string) => boolean
}

export interface CollectionPresentationDescriptor<
  TRecord,
  TId extends string,
  TQuery extends object,
  TProjection,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
> {
  readonly id: TPresentation
  readonly label: string
  readonly compatibleQueryKeys: readonly QueryKey<TQuery>[]
  readonly capabilities: CollectionCapabilities<TQuery, TAction>
  render(props: CollectionPresentationProps<TRecord, TQuery, TProjection, TContext, TId>): ReactNode
}

export interface CollectionSavedViewDescriptor<
  TQuery extends object,
  TPresentation extends string,
> {
  readonly enabled: true
  readonly store: CollectionViewStore
  readonly operations: readonly SavedViewOperation[]
  buildSpec(args: { query: TQuery; presentation: TPresentation }): CollectionViewSpec
  parseAndValidate(input: unknown): CollectionViewValidationResult
  applySpec(spec: CollectionViewSpec): { query: TQuery; presentation: TPresentation }
}

export interface CollectionOpenSource<TQuery extends object, TPresentation extends string>
  extends RecordViewerOpenSource {
  query: TQuery
  presentation: TPresentation
}

export interface RecordCollectionDescriptor<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
> {
  readonly id: string
  readonly defaultPresentation: TPresentation
  readonly query: CollectionQuerySchema<TQuery>
  readonly savedViews: CollectionSavedViewDescriptor<TQuery, TPresentation>
  readonly presentations: Readonly<Record<
    TPresentation,
    CollectionPresentationDescriptor<
      TRecord,
      TId,
      TQuery,
      CollectionProjection<TRecord, TGroup>,
      TContext,
      TGroup,
      TAction,
      TPresentation
    >
  >>
  load(args: { query: TQuery; viewerId: string | null }): Promise<CollectionData<TRecord, TContext>>
  project(
    data: CollectionData<TRecord, TContext>,
    query: TQuery,
    presentation: TPresentation,
  ): CollectionProjection<TRecord, TGroup>
  getId(record: TRecord): TId
  getAccess(args: { viewerId: string | null; accessRoles: readonly string[] }): CollectionAccess<TAction>
  viewer: RecordViewerOpeningContract<TRecord>
  runBulkAction?: (args: { action: TAction; ids: readonly TId[]; viewerId: string }) => Promise<void>
}

export interface RecordCollectionState<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
> {
  status: CollectionStatus
  query: TQuery
  presentation: TPresentation
  data: CollectionData<TRecord, TContext> | null
  projection: CollectionProjection<TRecord, TGroup> | null
  selectedIds: ReadonlySet<TId>
  collapsedGroupIds: ReadonlySet<string>
  queryIssues: readonly CollectionQueryIssue[]
  error: string | null
  access: CollectionAccess<TAction>
  savedViews: CollectionViewState
}

export type PresentationSwitchResult<TQuery extends object, TPresentation extends string> =
  | { ok: true; query: TQuery; presentation: TPresentation }
  | { ok: false; query: TQuery; presentation: TPresentation; issues: readonly CollectionQueryIssue[] }
~~~

The descriptor’s project method is the typed domain seam: Tasks can project occurrence rollups and
empty groups, Signals can project chronological Feed rows and archive tombstones, and a future Inbox
can project unread/severity triage rows. The engine owns when projection occurs, the state it feeds,
selection, URL, and capability visibility; it never reads a domain field by string.

### mos-app/src/lib/record-collection/collection-view-spec.ts

Define the persisted Work-view contract as a discriminated, schema-versioned union. It is a view
definition only: it stores no result rows, SQL, executable code, HTML, arbitrary record shape, or
universal record. The Task and Signal adapters own the validators and typed query projections used by
this union.

~~~
import type {
  TaskCollectionGroup,
  TaskCollectionPresentation,
  TaskCollectionQuery,
  TaskCollectionSort,
} from '@/components/tasks/task-collection-adapter'
import type {
  SignalCollectionGroup,
  SignalCollectionPresentation,
  SignalCollectionQuery,
  SignalCollectionSort,
} from '@/components/signals/signal-collection-adapter'

export const COLLECTION_VIEW_SPEC_VERSION = 1 as const
export type CollectionViewCollection = 'tasks' | 'signals'
export type CollectionViewScope = 'private' | 'shared_team'
export type CollectionViewLayout = { density: 'compact' | 'comfortable' }

export type TaskCollectionVisibleField =
  | 'title' | 'status' | 'pic' | 'supervisor' | 'due' | 'businessUnit'
  | 'workline' | 'objective' | 'source' | 'activity'
export type SignalCollectionVisibleField =
  | 'message' | 'author' | 'team' | 'occurredAt' | 'attention' | 'category' | 'retracted'

export type TaskCollectionSavedQuery = Pick<
  TaskCollectionQuery,
  'view' | 'q' | 'businessUnitId' | 'status' | 'picId' | 'supervisorId'
  | 'includeArchived' | 'overdueOnly' | 'occurrenceId'
>
export type SignalCollectionSavedQuery = Pick<
  SignalCollectionQuery,
  'view' | 'q' | 'attention' | 'category' | 'teamId' | 'showRetracted'
>

export type CollectionViewSpec =
  | {
      kind: 'collection'
      version: typeof COLLECTION_VIEW_SPEC_VERSION
      collectionId: 'tasks'
      domain: 'tasks'
      presentation: TaskCollectionPresentation
      visibleFields: readonly TaskCollectionVisibleField[]
      query: TaskCollectionSavedQuery
      sort: { field: TaskCollectionSort; direction: 'ascending' | 'descending' }
      grouping: { field: TaskCollectionGroup } | null
      layout: CollectionViewLayout
    }
  | {
      kind: 'collection'
      version: typeof COLLECTION_VIEW_SPEC_VERSION
      collectionId: 'signals'
      domain: 'signals'
      presentation: SignalCollectionPresentation
      visibleFields: readonly SignalCollectionVisibleField[]
      query: SignalCollectionSavedQuery
      sort: { field: SignalCollectionSort; direction: 'ascending' | 'descending' }
      grouping: { field: SignalCollectionGroup } | null
      layout: CollectionViewLayout
    }

export interface PersistedCollectionView {
  id: string
  name: string
  scope: CollectionViewScope
  kind: 'collection'
  context: 'work'
  lifecycle: 'active' | 'archived'
  spec: CollectionViewSpec
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface CollectionViewValidationIssue {
  path: string
  code:
    | 'invalid-shape' | 'unsupported-version' | 'invalid-kind' | 'unknown-collection'
    | 'domain-mismatch' | 'invalid-presentation' | 'invalid-visible-field'
    | 'unsupported-domain-field'
    | 'invalid-query' | 'invalid-sort' | 'invalid-grouping' | 'unsupported-grouping'
    | 'invalid-layout'
  detail: string
}

export type CollectionViewValidationResult =
  | { ok: true; spec: CollectionViewSpec }
  | { ok: false; issues: readonly CollectionViewValidationIssue[] }

export function parseCollectionViewSpec(input: unknown): CollectionViewValidationResult
export function serializeCollectionViewSpec(spec: CollectionViewSpec): string
~~~

The Task validator accepts `pic` and `supervisor` as distinct fields and filters, accepts PIC sort,
and explicitly rejects `grouping.field === 'supervisor'` while the current one-person group renderer
remains the only supported grouping slot. It never aliases that request to PIC. It also rejects a
Task `team`/`teamId` visible field or query key with `unsupported-domain-field`; Business Unit is the
only current Task organization field. The Signal validator rejects Feed-incompatible attention sort
or Team grouping. Both validators reject any mismatched `collectionId`/`domain`, wrong version,
unknown visible field, malformed typed query, invalid sort or layout, and any attempted extra
result/code fields. `serializeCollectionViewSpec` emits a stable key order so URL/DB conformance tests
do not depend on object insertion order.

### mos-app/src/lib/record-collection/query-state.ts

Export pure, tested functions:

~~~
export function readCollectionQuery<TQuery extends object>(
  schema: CollectionQuerySchema<TQuery>,
  params: URLSearchParams,
  presentation: string,
): CollectionQueryParse<TQuery>

export function writeCollectionQuery<TQuery extends object>(
  schema: CollectionQuerySchema<TQuery>,
  query: TQuery,
  source: URLSearchParams,
): URLSearchParams

export function checkPresentationCompatibility<
  TQuery extends object,
  TPresentation extends string,
>(args: {
  query: TQuery
  schema: CollectionQuerySchema<TQuery>
  from: TPresentation
  to: TPresentation
  compatibleQueryKeys: Readonly<Record<TPresentation, readonly QueryKey<TQuery>[]>>
}): PresentationSwitchResult<TQuery, TPresentation>
~~~

writeCollectionQuery replaces only keys owned by the schema and preserves unrelated route query
state. Schemas use stable URL keys: layout, view, saved, q, group, sort, and dir are shared grammar
keys; bu, status, pic, supervisor, archived, overdue, and occurrence belong only to Tasks; attention,
category, team, and retracted belong only to Signals; unread, severity, and kind belong only to the
future Inbox fixture. There is no canonical role-free `person` or `owner` key. A legacy create-route
`r` key is translated only at the existing create boundary and never enters collection state or a
saved spec. Values are parsed into domain unions, not left as an untyped string record.
Values are parsed into domain unions, not left as an untyped string record. The serializer is stable
so the conformance artifact is deterministic.

checkPresentationCompatibility computes populated query keys and rejects any key absent from the
target presentation’s compatibleQueryKeys. It returns the original query and presentation on failure.
It never removes a field merely because a renderer does not know it.

### mos-app/src/lib/record-collection/engine.ts

Implement the React-free controller state machine:

~~~
export interface RecordCollectionController<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
> {
  readonly state: RecordCollectionState<TRecord, TId, TQuery, TContext, TGroup, TAction, TPresentation>
  setQuery(next: TQuery): void
  switchPresentation(next: TPresentation): PresentationSwitchResult<TQuery, TPresentation>
  toggleSelected(id: TId): void
  selectVisible(ids: readonly TId[]): void
  clearSelection(): void
  toggleGroup(groupId: string): void
  openRecord(record: TRecord, source: CollectionOpenSource<TQuery, TPresentation>): void
  runBulkAction(action: TAction): Promise<void>
  retry(): void
  loadSavedViews(): Promise<void>
  saveCurrentView(name: string, scope: 'private' | 'shared_team'): Promise<PersistedCollectionView | null>
  applySavedView(id: string): Promise<PresentationSwitchResult<TQuery, TPresentation>>
  renameSavedView(id: string, name: string): Promise<void>
  archiveSavedView(id: string): Promise<void>
}

export function createRecordCollectionController<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
>(
  descriptor: RecordCollectionDescriptor<
    TRecord,
    TId,
    TQuery,
    TContext,
    TGroup,
    TAction,
    TPresentation
  >,
  initial: {
    query: TQuery
    presentation: TPresentation
    viewerId: string | null
    accessRoles: readonly string[]
  },
): RecordCollectionController<
  TRecord,
  TId,
  TQuery,
  TContext,
  TGroup,
  TAction,
  TPresentation
>
~~~

Use a reducer or equivalent pure transition functions, with tests asserting:

- query changes keep selected IDs unless the user clears them;
- selectVisible changes only visible IDs and never hides off-screen selected IDs;
- loading → ready, empty, filtered-empty, error, permission, and read-only states are distinct;
- retry reuses the same typed query;
- a forbidden collection has no data/action controls, a read-only collection remains readable without
  disabled fake edit inputs, and an allowed collection exposes only its permitted typed actions;
- openRecord calls the adapter’s Issue 5 viewer contract and then the Issue 4 overlay API, preserving
  the source collection query and presentation for Close/Back;
- a compatible presentation switch preserves query, selected IDs, saved-view identity, and URL;
- an incompatible switch returns unsupported-by-presentation, does not call the loader, and leaves
  state unchanged.
- loadSavedViews, saveCurrentView, applySavedView, renameSavedView, and archiveSavedView use the
  descriptor's typed `mos.user_views` store. Save builds and validates a CollectionViewSpec before
  INSERT; apply validates again before changing query/presentation/URL; rename/archive preserve the
  collection id/domain and surface pending, permission, validation, and retryable server states.

### mos-app/src/lib/record-collection/use-record-collection.ts

Wire the pure controller to React Router and async loading:

~~~
export interface UseRecordCollectionOptions<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
> {
  descriptor: RecordCollectionDescriptor<
    TRecord,
    TId,
    TQuery,
    TContext,
    TGroup,
    TAction,
    TPresentation
  >
  urlMode: 'synced' | 'fixed'
  fixedQuery?: TQuery
  viewerId: string | null
  accessRoles: readonly string[]
}

export function useRecordCollection<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
>(
  options: UseRecordCollectionOptions<
    TRecord,
    TId,
    TQuery,
    TContext,
    TGroup,
    TAction,
    TPresentation
  >,
): RecordCollectionController<
  TRecord,
  TId,
  TQuery,
  TContext,
  TGroup,
  TAction,
  TPresentation
>
~~~

urlMode synced reads/writes the canonical collection query through useSearchParams; Task search/filter
changes use replace semantics, while saved-view and presentation changes create a shareable history
entry. urlMode fixed is only for the Home embedded Signal Feed: it uses the same descriptor with a
fixed query and never steals the Home route’s URL. All collection routes use synced, and record
opening delegates query preservation to Issue 4’s RecordRouteAdapter.

### mos-app/src/components/record-collection/record-collection.tsx

Create one state/presentation host:

~~~
export interface RecordCollectionSurfaceProps<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
> {
  controller: RecordCollectionController<
    TRecord,
    TId,
    TQuery,
    TContext,
    TGroup,
    TAction,
    TPresentation
  >
  controls?: ReactNode
  selectionBar?: ReactNode
  empty: { title: string; copy?: string; create?: ReactNode }
  filteredEmpty: { title: string; copy?: string; clear: () => void; create?: ReactNode }
  error: { message: string; retry: () => void }
  loadingLabel: string
}

export function RecordCollectionSurface<
  TRecord,
  TId extends string,
  TQuery extends object,
  TContext,
  TGroup,
  TAction extends string,
  TPresentation extends string,
>(
  props: RecordCollectionSurfaceProps<
    TRecord,
    TId,
    TQuery,
    TContext,
    TGroup,
    TAction,
    TPresentation
  >,
): JSX.Element
~~~

The surface renders LoadingShell/SkeletonRows, ErrorState, EmptyState, filtered-empty, or the typed
presentation exactly once. It renders a typed selection bar only when the descriptor permits
selection; bulk controls are rendered only for visibleActions. It never displays a disabled
Board/Calendar/Feed/Table placeholder merely because a future presentation exists.

Add mos-app/src/components/record-collection/record-collection.css only for the E7 tokenized
selection/status chrome. Do not create a new table/card visual system.

## Domain contracts

### Tasks — mos-app/src/components/tasks/task-collection-adapter.tsx

Export these exact typed names:

~~~
export type TaskCollectionPresentation = 'table' | 'card'
export type TaskCollectionGroup = 'none' | 'status' | 'pic' | 'bu' | 'workline' | 'occurrence'
export type TaskCollectionUnsupportedGroup = 'supervisor'
export type TaskCollectionSort = 'task' | 'status' | 'pic' | 'supervisor' | 'due' | 'activity'
export type TaskCollectionAction = never

export interface TaskCollectionRecord {
  id: string
  title: string
  status: TaskStatus
  picId: string
  supervisorId: string
  businessUnitId: string
  dueDate: string | null
  workLineId: string | null
  objectiveId: string | null
  lastActivityAt: string
  archivedAt: string | null
  processRunId: string | null
  generatedFromTaskDefinitionId: string | null
}

export interface TaskCollectionQuery {
  layout: TaskCollectionPresentation
  view: 'all' | 'my-work' | 'my-pic' | 'my-supervisor' | 'overdue' | 'followups'
  q: string
  businessUnitId: string | null
  status: TaskStatus | null
  picId: string | null
  supervisorId: string | null
  groupBy: TaskCollectionGroup
  sort: TaskCollectionSort
  direction: 'ascending' | 'descending'
  includeArchived: boolean
  overdueOnly: boolean
  occurrenceId: string | null
  savedViewId: string | null
}

export interface TaskCollectionContext {
  businessUnits: readonly BusinessUnitOption[]
  people: readonly PersonOption[]
  workLinesById: ReadonlyMap<string, string>
  objectivesById: ReadonlyMap<string, string>
  viewerId: string | null
  statusOverrides: ReadonlyMap<string, TaskStatus>
  refresh: () => void
}

export interface TaskRenderGroup {
  key: string
  label: string
  rows: readonly TaskCollectionRecord[]
  overdue: number
  prefillParam: string
  workLineType?: 'project' | 'process' | null
  occurrenceRollup?: { total: number; done: number; overdue: number; pendingUnresolved: number }
}

export const taskCollectionQuery: CollectionQuerySchema<TaskCollectionQuery>
export const taskCollectionSavedViews: CollectionSavedViewDescriptor<
  TaskCollectionQuery,
  TaskCollectionPresentation
>
export const taskCollectionDescriptor: RecordCollectionDescriptor<
  TaskCollectionRecord,
  string,
  TaskCollectionQuery,
  TaskCollectionContext,
  TaskRenderGroup,
  TaskCollectionAction,
  TaskCollectionPresentation
>
~~~

TaskCollectionAction = never is deliberate for this issue: current production Task bulk mutation
authorization is not a collection-level capability, so Issue 6 must not invent a bulk archive/status
mutation. Selection remains live and its action slot is absent. Existing row menus and RecordViewer
actions remain in their existing typed surfaces. If the owner later wants bulk mutation, it needs a
separate capability decision and tests rather than an unguarded collection button.

The schema maps the current supported Task saved-view chips into explicit `view` values, preserves q,
status, bu, `pic`, `supervisor`, and `saved`, maps the current occurrence seed to group=occurrence plus
occurrenceId, and serializes layout=table|card, sort, dir, archived=1, and overdue=1. The canonical
Task URL never emits `person`, `owner`, `responsible`, `accountable`, or `raci`; `mine` is read only
as a legacy alias for the explicitly named `my-work` union and is rewritten canonically. Legacy create
prefill key `r` is translated only when crossing into the existing create route; it is not collection
state and never appears in a saved spec. The `team`/`teamId` key is rejected until Issue 8's real
Task `team_id` contract lands. The legacy Team-work chip is removed from the Issue 6 Task descriptor
and is not represented as a Business Unit filter or saved-view identity.

TaskCollectionContext contains typed BusinessUnitOption[], PersonOption[], work-line/objective maps,
viewerId, and the existing statusOverrides/refresh callback seam. The adapter maps raw
`responsible_person_id` to `picId` and raw `accountable_person_id` to `supervisorId` in one
`toTaskCollectionRecord` function; those storage names never leave the adapter boundary. TaskRenderGroup
is a typed collection projection, not the old raw-row group shape. project reuses STATUS_ORDER,
isOverdue, groupTasksByOccurrence, and the current empty-group rules. `groupBy=pic` is the explicit
mapping of the current one-person renderer; `groupBy=supervisor` is rejected as unsupported. load
calls listTasks(TaskListFilters), getBusinessUnits, and getPeople; it does not change the DAL, invent
team_id, or add a server query grammar.

The table descriptor renders the existing TasksTableBody/TaskRow path with the E7 seven-column
priority set and keyboard cursor. The card descriptor renders the existing
MobileGroupedCards/TaskCard path at any viewport when layout=card; the normal responsive default may
still choose the phone card branch at 390px. Both declare the same compatible query keys, including
group, sort, saved view, PIC, Supervisor, and selection. The field list renders Business Unit from
businessUnitId; it does not render a fabricated Team. There is no disabled Board/Calendar tab. The
savedViews descriptor uses the Task validator and `mos.user_views` Work context.

### Signals — mos-app/src/components/signals/signal-collection-adapter.tsx

Export these exact typed names:

~~~
export type SignalCollectionPresentation = 'feed' | 'table'
export type SignalCollectionGroup = 'none' | 'team' | 'attention' | 'category'
export type SignalCollectionSort = 'occurredAt' | 'attention'
export type SignalCollectionAction = never

export interface SignalCollectionQuery {
  layout: SignalCollectionPresentation
  view: 'all' | 'needs-attention' | 'retracted'
  q: string
  attention: Attention | null
  category: SignalCategory | null
  teamId: string | null
  groupBy: SignalCollectionGroup
  sort: SignalCollectionSort
  direction: 'ascending' | 'descending'
  showRetracted: boolean
  savedViewId: string | null
}

export interface SignalCollectionContext {
  authorNamesById: ReadonlyMap<string, string>
  teamNamesById: ReadonlyMap<string, string>
  siteNamesByTeamId: ReadonlyMap<string, string>
  viewerId: string | null
  onShareClick?: () => void
  onCategorize?: (signalId: string, category: SignalCategory) => void
  onCreateTask?: (signalId: string) => void
  onOpen?: (signalId: string) => void
}

export interface SignalRenderGroup {
  key: string
  label: string | null
  rows: readonly SignalRow[]
}

export const signalCollectionQuery: CollectionQuerySchema<SignalCollectionQuery>
export const signalCollectionSavedViews: CollectionSavedViewDescriptor<
  SignalCollectionQuery,
  SignalCollectionPresentation
>
export const signalCollectionDescriptor: RecordCollectionDescriptor<
  SignalRow,
  string,
  SignalCollectionQuery,
  SignalCollectionContext,
  SignalRenderGroup,
  SignalCollectionAction,
  SignalCollectionPresentation
>
~~~

The Signal schema preserves existing q and retracted=1 URL behavior and adds typed layout, view,
saved, attention, category, team, group, sort, and dir. feed supports the chronological occurred-at sort,
no grouping, and all meaningful Signal filters. table supports all Signal query keys. Therefore
Feed → Table preserves a compatible persisted or built-in saved view, search, attention, category, Team, sort, grouping
when grouping is none, and URL state. A Feed switch request with sort=attention or group=team is
rejected by the compatibility guard; it does not silently reset to chronological/flat.

SignalCollectionContext contains author/team/site display maps, viewerId, and the existing
composer/categorize/open callbacks. load calls listReadableSignals({ includeRetracted: true }),
getPeople, and listAllTeams; the adapter filters tombstones according to typed query. project reuses
orderSignalsForFeed for Feed and preserves explicit retracted tombstones for Table. It does not
create Task-shaped columns.

Create mos-app/src/components/signals/signal-table-presentation.tsx as a typed Signal renderer,
using the existing DataTable<SignalRow> primitive. Its columns are Signal-specific: message, author,
Team, occurred-at, attention, category, and retracted state. The existing SignalFeed and SignalCard
remain the Feed renderer and keep the composer entry row, category action, and record-opening callback.

## TDD implementation sequence

Each task is intentionally small enough for one inline execution checkpoint. Every code task starts
with the named red test and commits a coherent checkpoint with the required trailer. The current
planning task does not execute these implementation commands.

### Task 1 — Revalidate upstream contracts and freeze the source boundary

Read the dependency gate above and inspect the completed Issue 3/4/5 checkpoints. Record the actual
public exports in the implementation branch before importing them. Verify that TasksWorkspace and
SignalsArchivePage are the only Issue 6 production collection consumers and that Inbox remains
untouched.

~~~
git status --short
git diff --name-only -- mos-app/src/shell/page-families.ts mos-app/src/shell/page-family-frame.tsx \
  mos-app/src/shell/overlay-host.tsx mos-app/src/components/record-viewer
rg -n "useTasksSavedView|useTasksViewPref|useSearchParams|useState|listTasks|listReadableSignals" \
  mos-app/src/components/tasks/tasks-workspace.tsx mos-app/src/pages/signals-archive-page.tsx \
  mos-app/src/components/signals/signal-feed-section.tsx
~~~

Expected red/baseline: current source still shows duplicate local collection state. Do not change it
until Task 2 tests capture the intended user outcomes.

### Task 2 — RED: pure query schema and compatibility tests

Create mos-app/src/lib/record-collection/query-state.test.ts with these exact test names:

- FR-V3-007: Signal Feed saved-view query preserves compatible filters, sort, grouping, and URL state
- FR-V3-007: Task Table to Card preserves view, status, group, sort, and selected-record semantics
- FR-V3-007: Task URL keys keep PIC and Supervisor filters distinct through round-trip
- FR-V3-007: Task Team filter/group/visible-field input is rejected before the Issue 8 team_id contract
- FR-V3-007: incompatible Signal attention-sort or Team-group is rejected without dropping fields
- FR-V3-007: query serializer round-trips domain fields and preserves unrelated route query keys
- NFR-V3-001: malformed domain values produce a visible typed query issue instead of a permissive string record

Use real query examples:

~~~
const signalParams = new URLSearchParams(
  'layout=feed&view=needs-attention&q=freezer&attention=Needs%20attention&sort=occurredAt&dir=descending',
)
const taskParams = new URLSearchParams(
  'layout=table&view=my-work&status=open&bu=bu-cafe&pic=p-raka&supervisor=p-sari&group=occurrence&sort=due&dir=ascending',
)
~~~

Add an explicit incompatible assertion with layout=feed&sort=attention&group=team: the result is
ok=false, contains both offending keys, returns the original query, and leaves the URL untouched.
Add a Task assertion with `group=supervisor` and a separate input containing `team=team-cafe`; each
returns a visible typed issue, leaves the original query untouched, and never aliases Team to
Business Unit or Supervisor grouping to PIC.

~~~
npm test -- --run src/lib/record-collection/query-state.test.ts
~~~

Expected result: FAIL because src/lib/record-collection/query-state.ts and the two domain schemas
do not exist. Do not weaken the assertions to match the legacy local state.

### Task 3 — GREEN: implement typed query/URL state

Create query-state.ts, types.ts, and index.ts, plus the pure typed query-contract portions of
task-collection-adapter.tsx and signal-collection-adapter.tsx. Implement the stable key maps and the
two domain schemas without importing Supabase or React into the pure query code. Use explicit domain
parsers for TaskStatus, Attention, SignalCategory, sort, group, and boolean values. Include the
PIC/Supervisor/Business Unit Task contract and the pre-Issue-8 rejection for Task Team state; do not
coerce arbitrary strings. The full descriptors/loaders/renderers are deliberately deferred to Tasks
10–13, but the contract modules must already typecheck so CollectionViewSpec has one source of truth.

~~~
npm test -- --run src/lib/record-collection/query-state.test.ts
npm run typecheck
~~~

Expected result: PASS for all query tests and zero TypeScript errors; the pure contract modules exist
but their descriptor/load/render seams are not yet wired. Commit:
feat: add typed V3 collection query contracts.

### Task 4 — RED: controller state, selection, states, and opening tests

Create mos-app/src/lib/record-collection/engine.test.ts with these exact test names:

- FR-V3-007: manager selection survives a compatible presentation switch and keeps the collection context
- FR-V3-007: selected IDs remain explicit when a filter hides one selected record
- NFR-V3-001: loading, empty, filtered-empty, error, permission, and read-only states are distinct
- FR-V3-003/004/006 seam: opening a Task delegates to the Issue 5 viewer contract and one Issue 4 host entry
- FR-V3-003/004/006 seam: opening consecutive records calls push/replace through the shared host, never a second host
- FR-V3-007: incompatible presentation switch does not reload, clear selection, or rewrite URL state
- FR-V3-014: default collection projection is work-first and controls are separately disclosed
- FR-V3-007: applying a named saved view validates the typed spec before changing presentation or URL
- FR-V3-007: invalid saved Task Team state and unsupported Supervisor grouping are rejected without mutation

Use a small typed fake TaskCollectionRecord descriptor and a typed fake SignalRow descriptor in the
test; do not use Record<string, unknown> as a substitute or fabricate a Task `teamId`. Assert the loader call count and exact
PresentationSwitchResult for compatible and incompatible transitions.

~~~
npm test -- --run src/lib/record-collection/engine.test.ts
~~~

Expected result: FAIL because engine.ts, the controller, selection transitions, and state model do
not exist.

### Task 5 — GREEN: implement the React-free collection engine

Create mos-app/src/lib/record-collection/engine.ts. Keep all transitions pure except the descriptor
loader/action/open callbacks. The controller must:

1. initialize from a typed parsed query and default presentation;
2. load once per normalized query/presentation, with cancellation/stale-result protection in the hook;
3. derive empty versus filtered-empty from projection totals, never from a renderer;
4. retain selected IDs through query and presentation changes, with an explicit off-screen count;
5. preserve/collapse typed group IDs through presentation changes where the target supports grouping;
6. call viewer.buildPanelEntry and the Issue 4 OverlayHostApi through the adapter opening seam;
7. expose only capability-visible actions and return a visible read-only state when edits are absent;
8. reject unsupported query keys without data reload or URL mutation.

~~~
npm test -- --run src/lib/record-collection/engine.test.ts
npm run typecheck
~~~

Expected result: PASS. Commit:
feat: add the shared V3 RecordCollection engine.

### Task 6 — RED: state surface, URL hook, and selection-control tests

Create mos-app/src/lib/record-collection/use-record-collection.test.tsx and
mos-app/src/components/record-collection/record-collection.test.tsx with these exact test names:

- AC-V3-005: Signal Feed saved view changes to Table and refresh preserve supported state and URL identity
- FR-V3-007: search/filter changes replace only owned query keys and keep unrelated route state
- NFR-V3-006: collection surface has no horizontal overflow marker and selection controls expose 44px targets
- NFR-V3-001: error retry and filtered-empty clear action are reachable by keyboard
- NFR-V3-009: read-only collection shows rows and hides edit/bulk action affordances honestly
- FR-V3-014: work rows render before manager configuration controls in the default surface
- FR-V3-007: save current, apply named, rename, and archive controls expose pending/error/retry states
- FR-V3-007: applying an incompatible saved view keeps the current query and URL intact

~~~
npm test -- --run src/lib/record-collection/use-record-collection.test.tsx \
  src/components/record-collection/record-collection.test.tsx
~~~

Expected result: FAIL because the URL hook, generic surface, selection bar, and state rendering do
not exist.

### Task 7 — GREEN: wire URL state and the shared surface

Create mos-app/src/lib/record-collection/use-record-collection.ts,
mos-app/src/components/record-collection/record-collection.tsx, and
mos-app/src/components/record-collection/record-collection.css. Use useSearchParams only in the
hook. Use PageFamilyFrame from Issue 3 in the page consumers; the generic surface itself must not
render a second PageFrame/PageHead.

Use existing EmptyState, ErrorState, SkeletonRows, and LoadingShell semantics. Controls are passed
as typed domain UI; the generic surface owns order, state, selection, and presentation rendering.
Ensure aria-current, aria-pressed, aria-busy, role="alert", and focus-visible behavior remain
explicit.

~~~
npm test -- --run src/lib/record-collection/use-record-collection.test.tsx \
  src/components/record-collection/record-collection.test.tsx
npm run typecheck
npm run lint -- --max-warnings=0
~~~

Expected result: PASS. Commit:
feat: add the URL-aware collection surface.

### Task 8 — RED: persisted Work collection-view contract and RLS tests

Create the pure validator, typed DAL, saved-view surface, and pgTAP tests before writing the
migration or production persistence code:

- mos-app/src/lib/record-collection/collection-view-spec.test.ts
- mos-app/src/lib/db/user-views-collection.test.ts
- mos-app/src/components/record-collection/saved-views.test.tsx
- supabase/tests/63_mos_user_views_collection_views.sql

Exact TypeScript/RTL test names:

- FR-V3-007: Task saved view serializes presentation, Business Unit, PIC, Supervisor, sort, grouping, visible fields, and layout
- FR-V3-007: Task saved view rejects Team field/query before the Issue 8 team_id contract
- FR-V3-007: Task saved view rejects Supervisor grouping without aliasing it to PIC
- FR-V3-007: Signal Feed saved view applies to Table only when compatibility accepts its typed state
- FR-V3-007: malformed persisted spec is rejected without changing current URL
- NFR-V3-001: save/apply/rename/archive pending and error states remain honest and retryable
- FR-V3-013: CollectionViewSpec contains typed query only and no result rows, SQL, or executable code

The fixture used here must use Business Unit values such as Café Operations and B2B Sales, plus
distinct `picId` and `supervisorId` values. It must not add a Task `teamId`/Team property to a
TaskCollectionRecord or raw TaskListRow. The Task validator must prove that `visibleFields: ['team']`
and a `teamId` query member fail before any DAL call. The URL round-trip must use `pic` and
`supervisor`, and the saved spec must carry the same two distinct roles.

Exact pgTAP assertion names in `supabase/tests/63_mos_user_views_collection_views.sql`:

- NFR-V3-008: collection metadata columns and live indexes exist without rewriting legacy rows
- NFR-V3-008: collection kind/context/lifecycle/spec checks reject invalid rows
- NFR-V3-008: collection-view owner sees a private row and a same-org non-owner sees zero rows
- NFR-V3-008: shared collection view is visible to the managed report only
- NFR-V3-008: cross-org collection view is denied even when scope is shared_team
- NFR-V3-008: collection update keeps org, owner, kind, and context pinned
- NFR-V3-008: legacy CompositionSpec row remains readable with null collection metadata

Run the red tests from `mos-app/` and the repository root, respectively:

~~~
npm test -- --run src/lib/record-collection/collection-view-spec.test.ts \
  src/lib/db/user-views-collection.test.ts src/components/record-collection/saved-views.test.tsx
supabase test db
~~~

Expected red result: the pure validator, collection DAL/store, saved-view controller surface, new
metadata migration, and new pgTAP assertions do not exist. Do not weaken the assertions to accept
built-in chips as persistence, infer Business Unit as Team, or silently discard an incompatible field.
This planning task does not run either command and does not touch the local Supabase.

### Task 9 — GREEN: add the reversible persisted collection-view slice

Create `supabase/migrations/20260720000001_mos_user_views_collection_views.sql` with this exact
backwards-compatible shape:

1. `ALTER TABLE mos.user_views ADD COLUMN kind text, ADD COLUMN context text, ADD COLUMN lifecycle text`;
   do not backfill or update existing rows. Existing CompositionSpec rows retain their current `spec`,
   `scope`, timestamps, archive state, and null normalized metadata.
2. Add named checks `mos_user_views_kind_ck`, `mos_user_views_context_ck`, and
   `mos_user_views_lifecycle_ck` for `kind in ('composition','collection')`, `context in ('home','work')`,
   and `lifecycle in ('active','archived')`, allowing the all-null legacy tuple.
3. Add `mos_user_views_metadata_ck`: a non-null `kind` requires non-null `context` and `lifecycle`;
   a collection row requires `kind='collection'`, `context='work'`, `lifecycle` consistent with
   `archived_at`, `spec.kind='collection'`, `spec.version=1`, and `spec.collectionId in ('tasks','signals')`;
   a composition row may use `context in ('home','work')` and the same lifecycle consistency.
4. Add partial indexes
   `mos_user_views_collection_live_idx` on `(org_id, context, updated_at desc)` where
   `kind='collection' and context='work' and lifecycle='active' and archived_at is null`, and
   `mos_user_views_collection_owner_idx` on `(owner_id, context, updated_at desc)` with the same
   predicate. Do not add a universal-record or result-row index.
5. Do not replace or loosen the existing `user_views_select`, `user_views_insert`, or
   `user_views_update` policies. RLS remains enabled and forced; every new collection INSERT/UPDATE
   still omits `org_id` and `owner_id`, and existing org-gate, private-owner, managed-report shared
   visibility, and post-image ownership checks remain fail-closed.

Extend `mos-app/src/lib/record-collection/collection-view-spec.ts` with the validators and stable
serializer described above. Extend `mos-app/src/lib/db/user-views.ts` without breaking the existing
CompositionSpec functions:

~~~
export type UserViewRecord = CompositionUserViewRecord | PersistedCollectionView

export interface CollectionViewInput {
  name: string
  scope: 'private' | 'shared_team'
  spec: CollectionViewSpec
}

export async function listCollectionViews(
  collectionId: 'tasks' | 'signals',
): Promise<readonly PersistedCollectionView[]>
export async function getCollectionView(id: string): Promise<PersistedCollectionView | null>
export async function createCollectionView(input: CollectionViewInput): Promise<PersistedCollectionView>
export async function renameCollectionView(id: string, name: string): Promise<void>
export async function archiveCollectionView(id: string): Promise<void>
~~~

The collection DAL selects and filters `kind='collection'`, `context='work'`, active lifecycle, and
the requested collection id; maps snake_case metadata to the typed persisted row; validates the
CollectionViewSpec before INSERT or apply; sends no org/person identity; and updates only name/spec
or archive lifecycle fields through the existing RLS-pinned row. Existing `listUserViews`,
`getUserView`, `createUserView`, and CompositionSpec tests continue to exercise old Home/dashboard
rows and never require collection metadata. Add/update `mos-app/src/lib/db/user-views.test.ts` and
`mos-app/src/lib/db/user-views-collection.test.ts` for the discriminated union, validation-before-
DAL-call, old-row compatibility, and context/collection filters.

Add `mos-app/src/components/record-collection/saved-views.tsx` as a generic presentational control
surface. It receives typed controller callbacks and renders:

- Save current view with a name and private/shared-team scope; the controller builds the typed spec,
  rejects unsupported Team or Supervisor grouping before INSERT, then sets `saved=<id>` only after
  success.
- Apply a named view; revalidate the stored spec, reject incompatible presentation/query state without
  changing the current query, selected IDs, presentation, or URL, and otherwise write `layout`,
  `view`, `saved`, filters, sort, grouping, and direction as one canonical URL transition.
- Rename and soft-archive with explicit pending, success, permission, validation, and retryable
  server-error states. Archive clears only the saved identity and preserves the compatible current
  collection state. No disabled fake action or hidden command-only route is used.

Wire the store and operations into `RecordCollectionController`, `useRecordCollection`, and the
generic `RecordCollectionSurface`; the Task and Signal descriptors each declare `savedViews.enabled`
and use their own validator/adapter. Built-in view chips remain available alongside named persisted
views but cannot stand in for the `mos.user_views` contract. The saved-view component does not render
rows or SQL and does not alter CompositionSpec/Home behavior.

~~~
npm test -- --run src/lib/record-collection/collection-view-spec.test.ts \
  src/lib/db/user-views.test.ts src/lib/db/user-views-collection.test.ts \
  src/components/record-collection/saved-views.test.tsx \
  src/lib/record-collection/engine.test.ts \
  src/lib/record-collection/use-record-collection.test.tsx \
  src/components/record-collection/record-collection.test.tsx
npm run typecheck
npm run lint -- --max-warnings=0
supabase test db
~~~

Expected green result: old CompositionSpec/Home view tests and new collection-view tests pass;
validator failures prevent DAL calls; named views round-trip through URL; pgTAP proves owner
isolation, managed-report visibility, cross-org denial, update pinning, kind/context/spec checks, and
legacy-row compatibility; typecheck and lint are clean. Commit:
`feat: persist typed V3 collection views with the existing user_views substrate.`

### Task 10 — RED: Task adapter and Table/Card migration tests

Create mos-app/src/components/tasks/task-collection-adapter.test.tsx and update the existing Task
tests listed below. Use mos-app/src/test/fixtures/v3-record-collection.ts for realistic fixtures
such as “Fix the coffee machine,” “Finalise Q3 roastery output forecast,” “SOP stock opname
mingguan,” distinct PIC/Supervisor names, Café Operations and B2B Sales Business Units, and a
“Café Opening · 17 Jul 2026” occurrence. Do not replace them with generic “Task 1” rows in the new
acceptance tests or fabricate a Team field on either TaskCollectionRecord or TaskListRow.

Exact new test names:

- FR-V3-007: Task Table exposes typed group, sort, saved-view, selection, and keyboard-open state
- FR-V3-007: Task Card retains Title, Status, PIC, Supervisor, Due, Business Unit, Project/Process, Objective, Source, and Activity
- FR-V3-007: Task PIC and Supervisor filters and sort keys remain distinct in Table and Card
- FR-V3-007: Task Team filter/group/visible field is absent and rejected until Issue 8 supplies team_id
- FR-V3-007: unsupported Supervisor grouping is rejected rather than mapped to PIC
- FR-V3-007: legacy storage columns map to PIC/Supervisor only inside the adapter
- FR-V3-007: Task Table to Card preserves compatible query and selected record without a second loader
- FR-V3-013: TasksWorkspace consumes taskCollectionDescriptor instead of local query state
- NFR-V3-001: Task action slot is absent when no typed bulk capability is granted
- FR-V3-003/004/006 seam: Task row opening preserves query and calls the Issue 5 Task viewer contract

Update behavior tests in:

- mos-app/src/components/tasks/tasks-workspace.test.tsx
- mos-app/src/components/tasks/cascade-d1.test.tsx
- mos-app/src/components/tasks/cascade-fixes.test.tsx
- mos-app/src/components/tasks/tasks-workspace-followups-door.test.tsx
- mos-app/src/components/tasks/mobile-grouped-cards.test.tsx
- mos-app/src/components/tasks/task-row.test.tsx
- mos-app/src/components/tasks/owner-cell.test.tsx → mos-app/src/components/tasks/pic-cell.test.tsx
- mos-app/src/components/tasks/group-header-row.test.tsx
- mos-app/src/pages/tasks-page.test.tsx
- mos-app/src/pages/tasks-layout.test.tsx

~~~
npm test -- --run src/components/tasks/task-collection-adapter.test.tsx \
  src/components/tasks/tasks-workspace.test.tsx src/components/tasks/cascade-d1.test.tsx \
  src/components/tasks/cascade-fixes.test.tsx src/components/tasks/tasks-workspace-followups-door.test.tsx \
  src/components/tasks/mobile-grouped-cards.test.tsx src/components/tasks/task-row.test.tsx \
  src/components/tasks/pic-cell.test.tsx src/components/tasks/group-header-row.test.tsx \
  src/pages/tasks-page.test.tsx src/pages/tasks-layout.test.tsx
~~~

Expected result: FAIL because the full descriptor/projection, migrated Task consumer, and typed
Table/Card seams do not exist, Board/Calendar placeholder behavior is still present, the current Task
query state still owns the outcomes, and the PIC/Supervisor/Business Unit vocabulary guard has not
been implemented.

### Task 11 — GREEN: implement and migrate the typed Task collection

Complete mos-app/src/components/tasks/task-collection-adapter.tsx from the pure query contract added
in Task 3. Move the current Task filtering,
sorting, grouping, occurrence rollup, empty-group injection, and saved-view derivation into the
typed descriptor/projector. Keep TaskListRow, TaskStatus, TaskListFilters, directory loaders, the
Task keyboard hook, row component, group headers, and Card renderer inside their existing seams, but
make the Issue 6 collection UI contract use TaskCollectionRecord. `toTaskCollectionRecord` is the
only raw-column mapping: `responsible_person_id → picId` and `accountable_person_id → supervisorId`.
Render Business Unit from `business_unit_id`; do not fabricate Task `team_id`. Remove the duplicate
use-tasks-saved-view.ts and use-tasks-view-pref.ts state paths after their tests move to the
schema/controller.

Modify exactly these production consumers:

- mos-app/src/components/tasks/tasks-workspace.tsx
- mos-app/src/components/tasks/tasks-toolbar.tsx
- mos-app/src/components/tasks/tasks-table-body.tsx
- mos-app/src/components/tasks/task-row.tsx
- mos-app/src/components/tasks/owner-cell.tsx → mos-app/src/components/tasks/pic-cell.tsx
- mos-app/src/components/tasks/group-header-row.tsx
- mos-app/src/components/tasks/tasks-grouping.ts
- mos-app/src/components/tasks/mobile-grouped-cards.tsx only where a typed controller callback or forced Card presentation requires it
- mos-app/src/pages/tasks-layout.tsx

The Task route uses the Issue 4 OverlayHostSlot slot=tasks; it must not import or render a second
RecordPanelHost. The Task adapter calls the Issue 5 viewer contract to create the OverlayEntry and
passes the existing taskSurface/canonical route metadata through the already-owned route adapter.

~~~
npm test -- --run src/components/tasks/task-collection-adapter.test.tsx \
  src/components/tasks/tasks-workspace.test.tsx src/components/tasks/cascade-d1.test.tsx \
  src/components/tasks/cascade-fixes.test.tsx src/components/tasks/tasks-workspace-followups-door.test.tsx \
  src/components/tasks/mobile-grouped-cards.test.tsx src/components/tasks/task-row.test.tsx \
  src/pages/tasks-page.test.tsx src/pages/tasks-layout.test.tsx
npm run typecheck
npm run lint -- --max-warnings=0
~~~

Expected result: PASS with no useTasksSavedView/useTasksViewPref production consumer, no disabled
Board/Calendar controls, one Task collection loader, explicit PIC/Supervisor columns and filters,
Business Unit rendered honestly, no Task Team capability before Issue 8, and the existing Task record
behavior intact.
Commit:
feat: migrate Tasks onto the V3 RecordCollection engine.

### Task 12 — RED: Signal adapter, Feed/Table, archive, and embedded-feed tests

Create mos-app/src/components/signals/signal-collection-adapter.test.tsx and
mos-app/src/components/signals/signal-table-presentation.test.tsx. Update:

- mos-app/src/pages/signals-archive-page.test.tsx
- mos-app/src/components/signals/signal-feed.test.tsx
- mos-app/src/components/signals/signal-feed-section.test.tsx
- mos-app/src/components/signals/signal-card.test.tsx only if the typed presentation props require a seam change

Exact new test names:

- AC-V3-005: Signal Feed saved view to Table preserves q, attention, sort, compatible grouping, and view identity after refresh
- FR-V3-007: Signal Feed rejects attention sort and Team grouping instead of silently dropping them
- FR-V3-013: Signals archive and Home ambient Feed use the same signalCollectionDescriptor
- FR-V3-003/006 seam: Signal Table retains selection and consecutive record opening with archive context
- FR-V3-002: Signal presentation never renders Task PIC, Supervisor, or Status columns
- NFR-V3-001: retracted Signal remains an explicit tombstone in Table and is hidden only by typed query
- FR-V3-003/004/006 seam: Signal opening uses the shared Issue 4 host entry and Issue 5 viewer contract
- FR-V3-014: Home embedded Feed renders work before optional configuration and hides archive controls

~~~
npm test -- --run src/components/signals/signal-collection-adapter.test.tsx \
  src/components/signals/signal-table-presentation.test.tsx \
  src/pages/signals-archive-page.test.tsx src/components/signals/signal-feed.test.tsx \
  src/components/signals/signal-feed-section.test.tsx src/components/signals/signal-card.test.tsx
~~~

Expected result: FAIL because the full Signal descriptor, typed archive Table, and shared loader
consumer do not exist; the archive page and Home section still own separate query/load state.

### Task 13 — GREEN: implement and migrate Signals

Complete the pure signal-collection-adapter.tsx query contract from Task 3 with the full typed
descriptor and create mos-app/src/components/signals/signal-table-presentation.tsx. Modify:

- mos-app/src/pages/signals-archive-page.tsx
- mos-app/src/components/signals/signal-feed-section.tsx
- mos-app/src/components/signals/signal-feed.tsx only for the controller/typed projection seam
- mos-app/src/pages/signals-archive-page.test.tsx and the Signal tests named in Task 12

The archive becomes a PageFamilyFrame family=workspace consumer with synced query state. It renders
Feed/Table through the one descriptor and mounts the existing Issue 4 Signal host slot. The Home
section uses the same descriptor with urlMode=fixed, a fixed showRetracted=false query and
savedViewId=null, and
controls=undefined; it still opens the canonical Signal record and refreshes after the existing
composer post-count callback. The collection engine, not Home, owns loading/error/empty state; Home
may retain its existing quiet degradation policy.

Do not change mos-app/src/components/signals/signal-record-host.tsx, signal-record.tsx, or any
Signal database model/mutation. Those belong to Issue 5/4 seams and existing typed DAL behavior.

~~~
npm test -- --run src/components/signals/signal-collection-adapter.test.tsx \
  src/components/signals/signal-table-presentation.test.tsx \
  src/pages/signals-archive-page.test.tsx src/components/signals/signal-feed.test.tsx \
  src/components/signals/signal-feed-section.test.tsx src/components/signals/signal-card.test.tsx
npm run typecheck
npm run lint -- --max-warnings=0
~~~

Expected result: PASS. Commit:
feat: migrate Signals onto the V3 RecordCollection engine.

### Task 14 — RED → GREEN: Inbox-shaped conformance fixture, migration guard, and typed boundary

Create the test-only fixture mos-app/src/test/fixtures/v3-record-collection.ts and
mos-app/src/lib/record-collection/record-collection-conformance.test.ts. Define a local typed
InboxTriageQuery, NotificationRow descriptor, and triage projection inside the test fixture; do not
export it from production or wire it to the Inbox page.

Exact test names:

- FR-V3-013: Inbox-shaped Triage Queue keeps unread-first, severity, route-to-source-record, selection, and read-only semantics
- FR-V3-007: a NotificationRow query is rejected by the Task descriptor at compile time
- FR-V3-007: a Signal category query is rejected by the Task presentation compatibility guard
- NFR-V3-007: no universal record row or arbitrary JSON query crosses the adapter boundary
- NFR-V3-009: Issue 6 does not modify Inbox production paths or mount a second host

Use ts-expect-error for the intentional Task/Signal query mismatch and make the compiler prove that
an Inbox NotificationRow is not assignable to TaskCollectionRecord. The runtime fixture must assert
unread rows first, severity sort, route-to-source-record callback, explicit selection, and no fake
edit/bulk action for the future read-only Inbox contract. It must not fabricate a Task Team property
or use the Task PIC/Supervisor vocabulary for the NotificationRow.

Create scripts/v3-record-collection-conformance.mjs and
scripts/v3-record-collection-conformance.test.mjs. The deterministic guard reads stable sorted
source paths and asserts:

- exactly one RecordCollectionDescriptor engine export and one React hook path;
- TasksWorkspace, SignalsArchivePage, and SignalFeedSection import the shared engine/descriptor;
- Task and Signal adapters declare typed query schemas, capabilities, presentations, and the Issue 5
  opening contract;
- `task-collection-adapter.tsx`, Task toolbar/table/card consumers, Task collection tests, the shared
  Task fixture, and CollectionViewSpec use `pic`/`supervisor` and `businessUnit` only. The guard
  rejects role-free Task URL/spec keys and rejects the legacy storage spellings everywhere except the
  two explicit raw-column reads inside `toTaskCollectionRecord`; it also asserts those raw names do
  not occur in Task test titles, fixtures, visible copy, or exported UI types;
- successful Task query/spec declarations and fixtures contain no `teamId`, `team_id`, or Team
  visible field. One negative validator test may contain a rejected `teamId`/Team input, and the guard
  requires that input to remain confined to that rejection case. Issue 8 is the only later path named
  as the source of a real Task Team contract;
- no Task production consumer imports useTasksSavedView or useTasksViewPref after migration;
- Task live presentations are exactly table and card, Signal live presentations are exactly feed and
  table, and no disabled soon presentation tab remains;
- InboxPage, InboxList, useNotifications, top-bar, signal-record-host, and the Issue 4 host are not
  changed by the Issue 6 implementation diff except for allowed import/slot seams recorded by the
  upstream checkpoints;
- no file under src/lib/record-collection declares UniversalRecord, RecordRow, an arbitrary
  Record<string, unknown> query, or any at the adapter boundary;
- `collection-view-spec.ts` and the collection DAL retain the old CompositionSpec path while adding
  exactly one typed `CollectionViewSpec` persistence path, and the migration/pgTAP manifest includes
  kind/context/lifecycle checks, partial live indexes, old-row compatibility, owner/shared/cross-org
  RLS proof, and update pinning;
- the guard manifest is stable and contains no timestamps, random IDs, filesystem-order dependence,
  or generated cloud/database evidence.

Run the red guard before creating the script, then green after implementation:

~~~
node --test scripts/v3-record-collection-conformance.test.mjs
~~~

Expected red result: ERR_MODULE_NOT_FOUND or the named migration assertions fail before the guard
exists. After implementation:

~~~
node --check scripts/v3-record-collection-conformance.mjs
node --test scripts/v3-record-collection-conformance.test.mjs
node scripts/v3-record-collection-conformance.mjs --check
npm test -- --run src/lib/record-collection/record-collection-conformance.test.ts
~~~

Expected green result: all conformance/migration tests pass, the deterministic --check exits 0,
and Inbox production files are byte-for-byte untouched. Commit:
test: add the V3 RecordCollection conformance guard.

### Task 15 — RED → GREEN: curated browser journeys and responsive proof

Create mos-app/e2e/v3-record-collection.spec.ts using the existing login fixtures and realistic
seed IDs. Do not add a new browser dependency or reset/seed cloud data. The suite owns these exact
journey names:

- AC-V3-005: Given a Signal Feed saved view, when presentation changes to Table and the page refreshes, supported filters, sort, grouping, and saved-view identity persist
- FR-V3-007: manager saves and applies a named Task view with distinct PIC/Supervisor and Business Unit state
- FR-V3-007: Task Team filter/group is visibly rejected before Issue 8's team_id contract
- AC-V3-013: Given a manager triaging work, when filtering, grouping, switching presentations, and opening consecutive records, then the workflow remains keyboard-operable and retains collection context
- FR-V3-003/004/006 seam: Task and Signal collection opens use one right-side host and the same focus/close grammar
- FR-V3-007: incompatible Signal presentation state is visible and never silently discarded
- NFR-V3-005: Task Table at 1280, Signal sheet at 1024, and full-screen collection/record at 390
- NFR-V3-006: phone collection has no horizontal overflow and required targets are at least 44px
- FR-V3-014: floor-member default shows work before controls while manager controls remain discoverable

Run red before the new routes/consumers exist:

~~~
npx playwright test e2e/v3-record-collection.spec.ts --project=chromium
~~~

Expected red result: the new collection test IDs, presentation URLs, persisted view state, and shared
engine state do not exist. Implement only the app behavior required by the tests, then run green at
1280×900, 1024×900, and 390×844. Assert URL query strings use `pic`/`supervisor` and `saved`, the
Task surface renders Business Unit without a Team column/filter, selected/aria-current row, one
data-overlay-host=true, no nested host, focus return, no page overflow, and visible target geometry.
Keep direct canonical Task/Signal page checks in the Issue 4/5 suites; Issue 6 proves the
collection-to-opening seam, not a second record-page implementation.

~~~
npx playwright test e2e/v3-record-collection.spec.ts \
  e2e/tasks-split-view.spec.ts e2e/tasks-canonical-page.spec.ts \
  e2e/AC-430-post-a-signal.spec.ts e2e/shell-url-state.spec.ts --project=chromium
~~~

Expected green result: the curated Issue 6 journeys pass at all three widths. Commit:
test: verify V3 collection presentations and responsive journeys.

### Task 16 — Full Issue 6 verification and changed-code coverage

Run from mos-app/:

~~~
npm test -- --run
npm run test:coverage
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
npx playwright test e2e/v3-record-collection.spec.ts \
  e2e/tasks-split-view.spec.ts e2e/tasks-canonical-page.spec.ts \
  e2e/AC-430-post-a-signal.spec.ts e2e/shell-url-state.spec.ts --project=chromium
~~~

Run from the repository root:

~~~
node --test scripts/v3-record-collection-conformance.test.mjs
node scripts/v3-record-collection-conformance.mjs --check
supabase test db
git diff --check
git diff --name-only -- mos-app/src/lib/record-collection mos-app/src/components/record-collection \
  mos-app/src/lib/db/user-views.ts mos-app/src/lib/db/user-views.test.ts \
  mos-app/src/components/tasks mos-app/src/components/signals mos-app/src/pages/tasks-layout.tsx \
  mos-app/src/pages/signals-archive-page.tsx mos-app/e2e scripts \
  supabase/migrations/20260720000001_mos_user_views_collection_views.sql \
  supabase/tests/63_mos_user_views_collection_views.sql
~~~

Expected green result: typecheck, ESLint/stylelint, build, all unit tests, curated browser tests,
local pgTAP, and the deterministic guard exit 0. Inspect the coverage report for every changed
TypeScript/TSX/script file; changed lines must be at least 80% covered by behavior tests. Add a
focused test when a changed line is below the threshold. Do not alter assertions or exclude the
engine/adapter/validator/DAL files to make the number pass.

Confirm that no package file, Supabase/environment file, unrelated migration, unrelated pgTAP file,
InboxPage, InboxList, useNotifications, top-bar, Café file, JSONB CompositionSpec file, or Issue 4/5
implementation file appears in the Issue 6 diff. The only database files permitted are the exact
`mos.user_views` extension migration and its pgTAP suite; no Task Team migration is permitted. Do not
run scripts/pre-merge-check.sh until the review ledger is written and the owner/Director
issue-boundary approval is available; never push, merge, or deploy from this plan.

### Task 17 — Future completion checkpoint (docs only, not part of this planning task)

After Tasks 1–16 pass on the implementation branch, update only these three files:

- docs/agent-context.md: append ## V3 Issue 6 local checkpoint (2026-07-20) with Verified (one
  engine, typed Task/Signal descriptors, persisted typed `mos.user_views` collection views with pgTAP,
  URL/query compatibility guard, Task Table/Card, Business Unit-only Task organization field,
  distinct PIC/Supervisor semantics, Signal Feed/Table, selection, states, Issue 4/5 opening seam,
  and green deterministic guard), Not done (real Task Team migration, Inbox/Deputy integration, Café,
  owner-rendered Issue 9 gate, unrelated JSONB/broad route migration, Issues 10–12, push/merge/deploy),
  and Next action exactly
  Issue 7 — implement Inbox triage plus Deputy host integration. State that the checkpoint does not
  claim owner-rendered acceptance or Inbox integration.
- docs/backlog.md: replace only the current V3 status banner with a pointer to
  docs/plans/2026-07-20-v3-record-collection.md and docs/reviews/v3-redesign.md, retain the master
  Issue 7–12 sequence, state the verified Task/Signal collection scope, and state that the owner
  approval gate remains before push/merge/deploy.
- docs/reviews/v3-redesign.md: append ## Issue 6 — RecordCollection/view engine and Tasks/Signals
  adapters containing authority read, exact changed/new source/test paths, AC/NFR ownership, red/
  green command exits, 1280/1024/390 results, changed-code coverage, deterministic guard evidence,
  explicit Inbox/Café/Issue 9–12 exclusions, and the exact next Issue 7 action.

The implementation checkpoint must make the distinction between verified locally and owner
accepted/rendered explicit. This planning task does not edit or stage any of these files.

~~~
git diff --name-only -- docs/agent-context.md docs/backlog.md docs/reviews/v3-redesign.md
git diff --check -- docs/agent-context.md docs/backlog.md docs/reviews/v3-redesign.md
~~~

Expected completion result for the future implementation: only the three checkpoint files are
changed by Task 17, after the implementation/test commits. Commit:
docs: record V3 Issue 6 checkpoint with the required trailer. Pause for owner approval before any
push, merge, or deploy.

## Acceptance and ownership map

| Requirement | Owning proof in this issue | Not claimed here |
|---|---|---|
| FR-V3-007 | query-state/CollectionViewSpec validators, engine tests, Task/Signal adapter tests, persisted-view DAL/pgTAP tests, browser URL/save/apply journeys, and the vocabulary guard | Viewer page behavior and final cross-route migration |
| FR-V3-013 | conformance guard plus Task/Signal consumer tests proving one descriptor/engine | Inbox, Café, or remaining route consumers |
| FR-V3-014 | default surface order test and floor/manager browser journey | Final owner usability gate |
| NFR-V3-001 | typed query mismatch, keyboard state/action tests, focus/ARIA browser assertions | A whole-app WCAG audit |
| NFR-V3-003 | changed-file coverage inspection and full coverage command | Coverage for later issues |
| NFR-V3-004 | typecheck/lint/build commands | Later issue gates |
| NFR-V3-005/006 | 1280×900, 1024×900, 390×844 browser journeys and target/overflow assertions | Issue 9 rendered owner gate |
| NFR-V3-007 | one engine/adapter guard, no duplicate Task/Signal query owners, PIC/Supervisor vocabulary guard, and no pre-Issue-8 Task Team field | Remaining app-wide stale component closure |
| NFR-V3-008 | reversible `mos.user_views` collection metadata migration, typed spec validation, fail-closed RLS, and pgTAP owner/shared/cross-org/update-pinning proof | Unrelated schema/RLS additions |
| NFR-V3-009 | no Supabase/cloud/dev-server use in this planning task; implementation tests use local fixtures/stack only | Production/staging deployment |

## Master AC ownership and deferment

These rows preserve the master spec’s exact acceptance goals and the locked one-owner map. The
canonical-owner column contains exactly one issue for every master AC. Issue 6 contributions are
listed separately as prerequisite or regression evidence; they are not co-ownership and must use the
FR/NFR labels above unless Issue 6 is the canonical owner.

| Master AC | Exact Given/When/Then goal | Canonical owner | Issue 6 contribution (not acceptance ownership) |
|---|---|---|---|
| AC-V3-001 | Given the representative routes at desktop and phone widths, when computed styles are compared across page heads, body type, controls, rows, panels, dialogs, and states, then each semantic role uses the same V3 values and the rendered result matches the E7 visual reference. | Issue 9 | Reuse E7 tokens and check collection geometry under NFR-V3-005/006; no Issue 6 test is tagged AC-V3-001. |
| AC-V3-002 | Given Tasks, Signals, Inbox, and Café, when each collection opens a record, then the same panel side, width family, focus entry, Escape/Close/Back behavior, and page-escalation outcome occur. | Issue 9 | Prove only the Task/Signal opening seam under FR-V3-003/004/006; the test-only Inbox boundary is not AC-V3-002 evidence. |
| AC-V3-003 | Given a record panel already open, when Deputy or another record is opened, then the shared host stacks or replaces content according to the journey and never renders two overlapping side panels. | Issue 9 | Preserve consecutive-record/one-host behavior under FR-V3-003/004/006; do not tag this lower-level proof AC-V3-003. |
| AC-V3-004 | Given a Task in Work and the same Task in Café, when each is opened, then both resolve to the same record identity and RecordViewer while preserving the source collection on close. | Issue 8 | No Café path or cross-surface identity claim is made; Task opening carries source metadata only through the Issue 5 contract. |
| AC-V3-005 | Given a Signal Feed saved view, when presentation changes to Table and the page is refreshed, then supported filters, sort, grouping, and saved-view identity persist. | Issue 6 | Owned here: query/compatibility tests, Signal Feed/Table component test, persisted-view test, and curated browser journey. |
| AC-V3-006 | Given Inbox on desktop, when the bell is invoked, then quick triage opens in the shared host; opening a notification pushes its canonical record; Back returns to triage; Close returns focus to the bell. Given phone, the bell opens the full Inbox route. | Issue 7 | Use only a test-only Inbox-shaped descriptor to prove the generic boundary; no Inbox UI or AC-V3-006 test is claimed. |
| AC-V3-007 | Given a multi-Team viewer entering Café, when more than one valid Team exists, then the system requires an explicit context choice and never silently chooses the first Team. | Issue 8 | Reject Task Team state before the real `team_id` contract and record the Issue 8 extension point; no AC-V3-007 test is added. |
| AC-V3-008 | Given an authorized user editing a property, when they commit or cancel, then every RecordViewer consumer follows the same save/discard feedback contract. | Issue 5 | Collection view save/rename/archive states are a separate FR-V3-007 persistence contract; no RecordViewer AC-V3-008 claim is made. |
| AC-V3-009 | Given an unauthorized viewer, when the same record opens, then its information hierarchy remains readable while edit and lifecycle actions are absent or honestly explained. | Issue 5 | Prove collection read-only state under NFR-V3-001/NFR-V3-009; viewer authorization remains Issue 5’s master acceptance. |
| AC-V3-010 | Given authored JSONB content containing valid paragraph/list/link/content-checklist blocks, when saved and reopened in panel and page modes, then block identity, order, and content are preserved and rendered by the same components. | Issue 10 | CollectionViewSpec is typed view metadata only; Issue 6 does not create authored-content or JSONB block tests. |
| AC-V3-011 | Given a typed Task checklist or Standard measurement embed, when its state changes, then the normalized domain row changes and the JSONB document retains only the reference. | Issue 10 | Issue 6 does not change checklist/measurement persistence; Issue 10 must use the real Task-checklist alternative named by the master spec. |
| AC-V3-012 | Given a first-time floor member, when asked to find and complete today’s Café work, then they start unaided, complete the goal without entering configuration, and encounter no internal system nouns. The journey records steps, hesitation/misclicks, outcome, and duration. | Issue 9 | Prove only the work-first FR-V3-014 ordering and disclosure; no Café usability journey or AC-V3-012 tag is added. |
| AC-V3-013 | Given a manager triaging work, when filtering, grouping, switching presentations, and opening consecutive records, then the workflow remains keyboard-operable and retains collection context without repeated full-page navigation. | Issue 6 | Owned here: Task Table/Card unit/component/browser journeys and shared engine state tests. |
| AC-V3-014 | Given every live route at the end of migration, when the route/component inventory is checked, then no route uses an unapproved bespoke page shell or superseded component/style family. | Issue 12 | The deterministic guard covers only Issue 6’s Task/Signal consumers under NFR-V3-007; no whole-app AC-V3-014 claim is made. |

## Plan self-review against the master spec

- FR-V3-007 / AC-V3-005: explicit typed query schemas, URL serializer, compatible-switch tests,
  Signal Feed/Table refresh proof, persisted CollectionViewSpec save/apply/rename/archive proof,
  pgTAP RLS/constraint proof, and rejection of incompatible sort/group/Team fields satisfy the
  required preserve-or-reject rule.
- FR-V3-013: TasksWorkspace, SignalsArchivePage, and SignalFeedSection are explicitly migrated to
  one generic engine and typed descriptors. The Inbox-shaped proof is test-only and cannot imply that
  Issue 7 is complete.
- FR-V3-014: floor defaults use fixed/simple queries and work-first render order; manager controls
  are visible and keyboard-reachable rather than command-only.
- OD-74: TaskListRow, SignalRow, and NotificationRow remain separate; only generic type parameters
  cross the engine boundary. TaskCollectionRecord uses Business Unit plus distinct PIC/Supervisor
  fields and does not fabricate Team before Issue 8. No universal DB table, JSON row, or object model
  is introduced.
- OD-79: the engine owns search/filter/sort/group/saved identity/selection/loading/error/empty/
  filtered-empty/URL/opening state; `mos.user_views` owns validated collection-view persistence;
  presentations declare their meaningful capabilities and do not render unsupported controls.
- OD-78 / interaction contract I1–I2: collection adapters call the Issue 5 viewer opening contract
  and Issue 4 host/route seam; this plan does not duplicate panel geometry, stack, Escape, focus,
  browser Back, or direct-page code.
- E7/SALVAGE: existing Task Table/Card and Signal Feed/card visual grammar is reused; the Signal
  Table reuses the existing typed DataTable primitive; no new brand, font, gradient, mockup, or
  Twenty table clone is introduced.
- Quicksand / OD-REDESIGN-65: no new mockup round is opened. The plan iterates once inside the app
  through typed tests and rendered browser checks, with the manager-efficiency and floor-capture
  fronts both represented.
- Issues 7–12: the explicit exclusion table, source guard, test-only Inbox fixture, and future
  checkpoint language keep those issues out of the implementation claim.

### Unresolved contradictions that must remain visible

1. Issue 5 public path/export: the current tip contains no completed Issue 5 plan or implementation.
   This plan records the required opening handoff but does not silently assume an unverified import.
   If Issue 5 chooses a different public path or shape, reconcile this plan before coding.
2. Signal Home vs Work IA: provenance and OD-REDESIGN-76 leave the ambient Home Signal Feed versus
   Work archive relationship provisional. This plan uses the current spec’s Home Feed and Work
   Feed/Table presentations without ratifying a new top-level destination.
3. Task Team data seam: the current `mos.tasks` row has `business_unit_id` but no `team_id`. Issue 6
   therefore renders Business Unit, rejects Task Team filter/group/visible-field state, and records
   Issue 8's real Task Team migration and BU derivation as the extension point. It must not silently relabel Business Unit
   as Team or invent a Team value.
4. Unbuilt Task presentations: current code exposes Board/Calendar placeholders, while the Issue 6
   representative requirement is Task Table/Card and Signal Feed/Table. This plan makes only those
   four presentations live and removes decorative unsupported tabs. If Board/Calendar must ship in
   Issue 6, the owner must expand the signed scope and add typed renderers/tests before implementation.
5. Bulk action capability: current Task/Signal capability maps do not define safe collection bulk
   mutations. The engine preserves selection and an honest typed bulk-action slot, but Task/Signal
   descriptors declare no bulk action in this issue. Adding bulk archive/retract/status behavior
   requires a separate capability and mutation decision, not a silent UI shortcut.

## Plan validation and handoff

Run from the repository root before committing this plan:

~~~
test -f docs/plans/2026-07-20-v3-record-collection.md
for inspectedPath in CLAUDE.md AGENTS.md docs/requirements-evolution.md docs/agent-context.md CONTEXT.md DESIGN.md \
  docs/specs/v3-redesign.spec.md docs/plans/2026-07-20-v3-page-families.md \
  docs/plans/2026-07-20-v3-overlay-host.md docs/experience-contract.md \
  docs/interaction-contract.md docs/jtbd.md docs/decisions.md \
  docs/adr/0025-ia-modules-in-rail-redesign-direction.md \
  docs/reference/twenty-ixd-patterns.md \
  docs/reference/provenance/owner-directives-index.md \
  docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md \
  docs/reference/provenance/02-the-50plus-qna-grill-2026-07-10_12.md \
  docs/reference/provenance/03-frustration-and-buildout-2026-07-13_16.md \
  docs/reviews/v3-redesign.md docs/backlog.md; do
  test -e "$inspectedPath" || { echo "missing inspected path: $inspectedPath"; exit 1; }
done
git diff --check -- docs/plans/2026-07-20-v3-record-collection.md
rg -n "superpowers:executing-plans|Do not use subagents|Issue 6|RecordCollection|TaskCollectionQuery|SignalCollectionQuery|Inbox|AC-V3-005|AC-V3-013|1280|1024|390|44|coverage|Next action|Unresolved contradictions|Co-Authored-By" \
  docs/plans/2026-07-20-v3-record-collection.md
rg -n "AC-V3-[0-9]{3}" docs/plans/2026-07-20-v3-record-collection.md
dot="."
triple="$dot$dot$dot"
bad1="NEEDS""_REVIEW"
bad2="T""ODO"
bad3="T""BD"
bad4="PLACE""HOLDER"
if rg -n "$bad1|$bad2|$bad3|$bad4" docs/plans/2026-07-20-v3-record-collection.md; then
  exit 1
fi
if rg -n -F "$triple" docs/plans/2026-07-20-v3-record-collection.md; then
  exit 1
fi
git status --short
~~~

Expected result: the plan exists, has no placeholder markers, passes whitespace validation, and the
worktree has no change except this plan. The planning task may stage and commit only this file:

~~~
git add docs/plans/2026-07-20-v3-record-collection.md
git commit -m "docs: plan V3 Issue 6 RecordCollection" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
~~~

Do not stage or edit docs/agent-context.md, docs/backlog.md, or docs/reviews/v3-redesign.md in this
planning task. The future implementation checkpoint in Task 17 is the only planned state-file edit.
No push, merge, deploy, or canonical owner decision is made by this plan.
