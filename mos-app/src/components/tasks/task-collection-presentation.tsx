import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { To } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { listPendingTasks } from '@/lib/db/processes'
import type { PendingTaskRow } from '@/lib/db/processes.types'
import type { TaskStatus, TaskListRow } from '@/lib/db/tasks.types'
import { SHOW_FOLLOWUPS } from '@/config/features'
import { FollowUpQueueEmbed } from '@/components/follow-ups/follow-up-queue-embed'
import { useT } from '@/i18n/use-t'
import { useTasksKeyboard } from './use-tasks-keyboard'
import { TasksTableBody } from './tasks-table-body'
import type { FlatRow } from './tasks-table-body'
import type { RenderGroup } from './tasks-grouping'
import type { WorkloadSummary } from './workload-caption'
import { TaskRow } from './task-row'
import { GroupHeaderRow } from './group-header-row'
import { OccurrenceAssignDialog } from './occurrence-assign-dialog'
import { DueRunsTrigger } from '@/components/processes/due-runs-trigger'
import type { UseDueRunsResult } from '@/components/processes/use-due-runs'
import type {
  CollectionPresentationProps,
  CollectionProjection,
} from '@/lib/record-collection/types'
import type {
  TaskCollectionContext,
  TaskCollectionQuery,
  TaskCollectionRecord,
  TaskRenderGroup,
} from './task-collection-adapter'

export interface TaskCollectionRuntime {
  selectedId: string | null
  drawerOpen: boolean
  expanded: boolean
  splitLayout: boolean
  isDesktop: boolean
  recordSearch: string
  statusOverrides: ReadonlyMap<string, TaskStatus>
  onOpenTask: (taskId: string) => void
  onCloseDrawer: () => void
  onNewTask: () => void
  onToggleExpand: () => void
  onAddTask: (prefillParam: string) => void
  onRetry: () => void
  onClearFilters: () => void
  onSort: (sort: TaskCollectionQuery['sort']) => void
  onOverdueFilter: () => void
  onClearOverdue: () => void
  createHref: To
  dueRuns: UseDueRunsResult
  followups: boolean
  followupsEnabled: boolean
  canResolvePending: boolean
}

const TaskCollectionRuntimeContext = createContext<TaskCollectionRuntime | null>(null)

export function TaskCollectionRuntimeProvider({
  value,
  children,
}: {
  value: TaskCollectionRuntime
  children: ReactNode
}) {
  return (
    <TaskCollectionRuntimeContext.Provider value={value}>
      {children}
    </TaskCollectionRuntimeContext.Provider>
  )
}

function useTaskCollectionRuntime(): TaskCollectionRuntime | null {
  return useContext(TaskCollectionRuntimeContext)
}

const EMPTY_DUE_RUNS: UseDueRunsResult = {
  capable: false,
  due: [],
  state: 'ready',
  expanded: false,
  startingKey: null,
  startError: false,
  toggleExpanded: () => {},
  handleStart: async () => {},
  load: () => {},
}

// Direct descriptor-render tests and Storybook-like probes do not mount the live workspace
// provider. They still get the same typed presentation, with only routing/host callbacks inert.
const DEFAULT_TASK_RUNTIME: TaskCollectionRuntime = {
  selectedId: null,
  drawerOpen: false,
  expanded: false,
  splitLayout: false,
  isDesktop: true,
  recordSearch: '',
  statusOverrides: new Map(),
  onOpenTask: () => {},
  onCloseDrawer: () => {},
  onNewTask: () => {},
  onToggleExpand: () => {},
  onAddTask: () => {},
  onRetry: () => {},
  onClearFilters: () => {},
  onSort: () => {},
  onOverdueFilter: () => {},
  onClearOverdue: () => {},
  createHref: '/work/tasks/new',
  dueRuns: EMPTY_DUE_RUNS,
  followups: false,
  followupsEnabled: false,
  canResolvePending: false,
}

type CollapseState = Partial<Record<TaskCollectionQuery['groupBy'], string[]>>
const COLLAPSE_KEY = 'mos.tasks.collapsedGroups'

function readCollapseState(): CollapseState {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const result: CollapseState = {}
    for (const key of ['none', 'status', 'pic', 'bu', 'workline', 'occurrence'] as const) {
      const values = (parsed as Record<string, unknown>)[key]
      if (Array.isArray(values)) result[key] = values.filter((value): value is string => typeof value === 'string')
    }
    return result
  } catch {
    return {}
  }
}

function useTaskCollapsePreference(groupBy: TaskCollectionQuery['groupBy']) {
  const [collapsed, setCollapsed] = useState<CollapseState>(() => readCollapseState())

  const toggleCollapsed = useCallback((groupId: string) => {
    setCollapsed((previous) => {
      const current = previous[groupBy] ?? []
      const nextForGroup = current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
      const next = { ...previous, [groupBy]: nextForGroup }
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)) } catch { /* storage disabled */ }
      return next
    })
  }, [groupBy])

  const isCollapsed = useCallback(
    (groupId: string) => (collapsed[groupBy] ?? []).includes(groupId),
    [collapsed, groupBy],
  )

  return { isCollapsed, toggleCollapsed }
}

type TaskPresentationProps = CollectionPresentationProps<
  TaskCollectionRecord,
  TaskCollectionQuery,
  CollectionProjection<TaskCollectionRecord, TaskRenderGroup>,
  TaskCollectionContext,
  string
>

function rawTaskFor(
  record: TaskCollectionRecord,
  context: TaskCollectionContext,
  statusOverrides: ReadonlyMap<string, TaskStatus>,
): TaskListRow | null {
  const raw = context.rowsById.get(record.id)
  const override = statusOverrides.get(record.id)
  if (raw) return override ? { ...raw, status: override } : raw
  // Descriptor-level presentation probes may provide only the typed projection context. Keep that
  // contract renderable without inventing a second loader; the live adapter always supplies the
  // rowsById bridge above.
  return {
    id: record.id,
    org_id: '',
    title: record.title,
    business_unit_id: record.businessUnitId,
    status: override ?? record.status,
    responsible_person_id: record.picId,
    accountable_person_id: record.supervisorId,
    consulted_person_ids: [],
    informed_person_ids: [],
    description: null,
    due_date: record.dueDate,
    objective_id: record.objectiveId,
    work_line_id: record.workLineId,
    last_activity_at: record.lastActivityAt,
    archived_at: record.archivedAt,
    created_by: '',
    created_at: record.lastActivityAt,
    updated_at: record.lastActivityAt,
    process_run_id: record.processRunId,
    generated_from_task_def_id: record.generatedFromTaskDefinitionId,
  }
}

function localizedGroupLabel(
  group: TaskRenderGroup,
  query: TaskCollectionQuery,
  t: ReturnType<typeof useT>,
): string {
  if (group.key === '__no_workline__') return t('tasks.group.noWorkLine')
  if (group.key === '__no_occurrence__') return t('tasks.group.noOccurrence')
  if (query.groupBy === 'status') {
    const labels: Record<TaskStatus, string> = {
      Open: t('tasks.status.open'),
      'In Progress': t('tasks.status.inProgress'),
      Blocked: t('tasks.status.blocked'),
      Done: t('tasks.status.done'),
    }
    return labels[group.key as TaskStatus] ?? group.label
  }
  return group.label
}

function buildRenderGroups(
  projection: TaskPresentationProps['projection'],
  context: TaskCollectionContext,
  query: TaskCollectionQuery,
  statusOverrides: ReadonlyMap<string, TaskStatus>,
  t: ReturnType<typeof useT>,
): RenderGroup[] {
  return projection.groups.map((group) => ({
    key: group.key,
    label: localizedGroupLabel(group, query, t),
    rows: group.rows
      .map((record) => rawTaskFor(record, context, statusOverrides))
      .filter((row): row is TaskListRow => row !== null),
    overdue: group.overdue,
    prefillParam: group.prefillParam,
    workLineType: group.workLineType,
    occurrenceRollup: group.occurrenceRollup,
  }))
}

function buildFlatRows(
  groups: readonly RenderGroup[],
  groupBy: TaskCollectionQuery['groupBy'],
  isCollapsed: (groupId: string) => boolean,
) {
  const flatRows: FlatRow[] = []
  const leafTasks: TaskListRow[] = []
  for (const group of groups) {
    if (groupBy !== 'none') {
      flatRows.push({ kind: 'header', group })
      if (isCollapsed(group.key)) continue
    }
    for (const task of group.rows) {
      flatRows.push({ kind: 'leaf', task, leafIndex: leafTasks.length })
      leafTasks.push(task)
    }
  }
  return { flatRows, leafTasks }
}

function buildWorkloadSummary(
  query: TaskCollectionQuery,
  leafTasks: readonly TaskListRow[],
  context: TaskCollectionContext,
): WorkloadSummary | null {
  if (query.groupBy !== 'workline' || !query.personId) return null
  const person = context.people.find((candidate) => candidate.id === query.personId)
  if (!person) return null
  const projectIds = new Set<string>()
  const dailyIds = new Set<string>()
  let unassignedCount = 0
  for (const task of leafTasks) {
    if (task.status === 'Done' || task.archived_at !== null) continue
    if (!task.work_line_id) {
      unassignedCount += 1
      continue
    }
    const type = context.workLineTypeById.get(task.work_line_id)
    if (type === 'project') projectIds.add(task.work_line_id)
    if (type === 'process') dailyIds.add(task.work_line_id)
  }
  return {
    isSelf: query.personId === context.viewerId,
    firstName: person.full_name.split(' ')[0] ?? person.full_name,
    projectCount: projectIds.size,
    dailyCount: dailyIds.size,
    unassignedCount,
  }
}

function useOccurrenceAssignment(runtime: TaskCollectionRuntime) {
  const [runId, setRunId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingTaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const open = useCallback((nextRunId: string) => {
    setRunId(nextRunId)
    setLoading(true)
    setError(false)
    listPendingTasks(nextRunId)
      .then((rows) => { setPending(rows); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  const retry = useCallback(() => {
    if (runId) open(runId)
  }, [open, runId])

  const resolved = useCallback((pendingId: string) => {
    setPending((current) => {
      const next = current.filter((item) => item.id !== pendingId)
      if (next.length === 0) setRunId(null)
      return next
    })
    runtime.onRetry()
  }, [runtime])

  return { runId, pending, loading, error, open, retry, resolved, close: () => setRunId(null) }
}

export function TaskTablePresentation(props: TaskPresentationProps & { cardLayout?: boolean }) {
  const providedRuntime = useTaskCollectionRuntime()
  const runtime = providedRuntime ?? DEFAULT_TASK_RUNTIME
  const t = useT()
  const { query, projection, context, selectedIds, onToggleSelected, onToggleGroup, cardLayout = false } = props
  const { isCollapsed: isCollapsedPreference, toggleCollapsed } = useTaskCollapsePreference(query.groupBy)
  const groups = useMemo(
    () => buildRenderGroups(projection, context, query, runtime.statusOverrides, t),
    [context, projection, query, runtime.statusOverrides, t],
  )
  const { flatRows, leafTasks } = useMemo(
    () => buildFlatRows(groups, query.groupBy, isCollapsedPreference),
    [groups, isCollapsedPreference, query.groupBy],
  )
  const [cursor, setCursor] = useState(-1)
  const cursorRowRef = useRef<HTMLTableRowElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const desktopLayout = runtime.isDesktop && !cardLayout
  const virtualize = desktopLayout && leafTasks.length >= 50
  const rowVirtualizer = useVirtualizer({
    count: virtualize ? flatRows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 50,
    overscan: 8,
    initialRect: { width: 0, height: 600 },
  })
  const cursorFlatIndex = flatRows.findIndex((row) => row.kind === 'leaf' && row.leafIndex === cursor)

  const openTask = useCallback((taskId: string) => {
    if (providedRuntime) {
      providedRuntime.onOpenTask(taskId)
      return
    }
    const record = projection.visibleRecords.find((candidate) => candidate.id === taskId)
    if (record) props.onOpenRecord(record)
  }, [projection.visibleRecords, props, providedRuntime])
  const keyboard = useTasksKeyboard({
    rowCount: leafTasks.length,
    enabled: desktopLayout,
    onOpen: (index) => { const task = leafTasks[index]; if (task) openTask(task.id) },
    onClose: runtime.onCloseDrawer,
    onNew: runtime.onNewTask,
    onExpand: runtime.onToggleExpand,
  })

  useEffect(() => { setCursor(keyboard.cursor) }, [keyboard.cursor])
  useEffect(() => {
    if (runtime.selectedId === null) return
    const index = leafTasks.findIndex((task) => task.id === runtime.selectedId)
    if (index >= 0 && index !== keyboard.cursor) keyboard.setCursor(index)
  }, [keyboard, leafTasks, runtime.selectedId])
  useEffect(() => { cursorRowRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [cursor])
  useEffect(() => {
    if (virtualize && cursorFlatIndex >= 0) rowVirtualizer.scrollToIndex(cursorFlatIndex, { align: 'auto' })
  }, [cursorFlatIndex, rowVirtualizer, virtualize])

  const allChecked = leafTasks.length > 0 && leafTasks.every((task) => selectedIds.has(task.id))
  const someChecked = leafTasks.some((task) => selectedIds.has(task.id))
  const toggleSelectAll = useCallback(() => {
    if (allChecked) {
      for (const task of leafTasks) if (selectedIds.has(task.id)) onToggleSelected(task.id)
      return
    }
    for (const task of leafTasks) if (!selectedIds.has(task.id)) onToggleSelected(task.id)
  }, [allChecked, leafTasks, onToggleSelected, selectedIds])

  const occurrence = useOccurrenceAssignment(runtime)
  const personMap = useMemo(() => new Map(context.personNamesById), [context.personNamesById])
  const buMap = useMemo(() => new Map(context.businessUnitNamesById), [context.businessUnitNamesById])
  const workLineMap = useMemo(() => new Map(context.workLinesById), [context.workLinesById])
  const objectiveMap = useMemo(() => new Map(context.objectivesById), [context.objectivesById])
  const workloadSummary = useMemo(
    () => buildWorkloadSummary(query, leafTasks, context),
    [context, leafTasks, query],
  )
  const sortCol = query.sort === 'pic' ? 'owner' : query.sort === 'supervisor' ? 'task' : query.sort
  const sortDirection = query.direction
  const sortIndicator = (column: 'task' | 'status' | 'owner' | 'due' | 'activity'): ReactNode =>
    sortCol === column ? <span aria-hidden="true">{sortDirection === 'ascending' ? '↑' : '↓'}</span> : null
  const onSort = (column: 'task' | 'status' | 'owner' | 'due' | 'activity') => {
    const nextSort = column === 'owner' ? 'pic' : column
    runtime.onSort(nextSort)
  }
  const renderRow = (task: TaskListRow, leafIndex: number) => {
    return (
      <TaskRow
        key={task.id}
        task={task}
        now={context.now}
        condensed={runtime.drawerOpen && !runtime.expanded && runtime.splitLayout}
        isSelected={runtime.selectedId === task.id}
        isCursor={keyboard.cursor === leafIndex}
        leafIndex={leafIndex}
        cursorRowRef={keyboard.cursor === leafIndex ? cursorRowRef : undefined}
        ownerName={personMap.get(task.responsible_person_id) ?? ''}
        onOpen={openTask}
        checked={selectedIds.has(task.id)}
        onCheck={() => onToggleSelected(task.id)}
        supervisorName={personMap.get(task.accountable_person_id) ?? ''}
        recordSearch={runtime.recordSearch}
        provenanceRoleName={task.generated_from_task_def_id
          ? context.provenanceByTaskDefId.get(task.generated_from_task_def_id)
          : undefined}
      />
    )
  }
  const renderGroupHeader = (group: RenderGroup) => (
    <GroupHeaderRow
      key={`grp-${group.key}`}
      label={group.label}
      count={group.rows.length}
      overdue={group.overdue}
      collapsed={isCollapsedPreference(group.key)}
      colSpan={7}
      prefill={group.prefillParam}
      controlsId={`grp-rows-${group.key}`}
      workLineType={group.workLineType}
      occurrenceRollup={group.occurrenceRollup}
      onAssignPending={group.occurrenceRollup && runtime.canResolvePending
        ? () => occurrence.open(group.key)
        : undefined}
      onToggle={() => { toggleCollapsed(group.key); onToggleGroup(group.key) }}
      onAddTask={() => runtime.onAddTask(group.prefillParam)}
      onOverdueFilter={runtime.onOverdueFilter}
    />
  )

  if (runtime.followups) {
    return runtime.followupsEnabled && SHOW_FOLLOWUPS ? (
      <div className="follow-ups-embed" role="region" aria-label={t('tasks.saved.followups')}>
        <FollowUpQueueEmbed />
      </div>
    ) : (
      <div className="empty-state empty-state--quiet" role="region" aria-label={t('tasks.saved.followups')}>
        <div className="empty-state-frame">
          <div className="empty-state-body">
            <h3 className="empty-title">{t('tasks.followups.title')}</h3>
            <p className="empty-copy">{t('tasks.followups.copy')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <TasksTableBody
        loading={false}
        error={null}
        leafTasks={leafTasks}
        hasActiveFilter={projection.visibleRecordsAreFiltered}
        isDesktop={desktopLayout}
        onRetry={runtime.onRetry}
        onClearFilters={runtime.onClearFilters}
        emptyTitle={t('tasks.empty.noTasksTitle')}
        emptyCopy={t('tasks.empty.noTasksCopy')}
        sortCol={sortCol === 'owner' ? 'owner' : sortCol as 'task' | 'status' | 'due' | 'activity'}
        onSort={onSort}
        ariaSort={(column) => sortCol === column ? sortDirection : 'none'}
        sortIndicator={sortIndicator}
        allChecked={allChecked}
        someChecked={someChecked}
        onToggleSelectAll={toggleSelectAll}
        flatRows={flatRows}
        virtualize={virtualize}
        scrollRef={scrollRef}
        rowVirtualizer={rowVirtualizer}
        renderRow={renderRow}
        renderGroupHeader={renderGroupHeader}
        groups={groups}
        recordSearch={runtime.recordSearch}
        now={context.now}
        buMap={buMap}
        personMap={personMap}
        isCollapsed={isCollapsedPreference}
        toggleCollapsed={(groupId) => { toggleCollapsed(groupId); onToggleGroup(groupId) }}
        openAddTask={runtime.onAddTask}
        setOverdueOnly={(next) => next ? runtime.onOverdueFilter() : runtime.onClearOverdue()}
        workLineMap={workLineMap}
        objectiveMap={objectiveMap}
        workloadSummary={workloadSummary}
        createHref={runtime.createHref}
        onAssignPending={runtime.canResolvePending ? occurrence.open : undefined}
        provenanceByTaskDefId={new Map(context.provenanceByTaskDefId)}
      />
      {occurrence.runId && (
        <OccurrenceAssignDialog
          pending={occurrence.pending}
          people={[...context.people]}
          loading={occurrence.loading}
          error={occurrence.error}
          onRetry={occurrence.retry}
          onResolved={(_taskId, pendingId) => occurrence.resolved(pendingId)}
          onClose={occurrence.close}
        />
      )}
    </>
  )
}

export function TaskCardPresentation(props: TaskPresentationProps) {
  return <TaskTablePresentation {...props} cardLayout />
}

export function TaskCollectionChrome({ dueRuns }: { dueRuns: UseDueRunsResult }) {
  return <DueRunsTrigger due={dueRuns.due} expanded={dueRuns.expanded} onToggle={dueRuns.toggleExpanded} />
}
