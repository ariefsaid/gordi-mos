import { Link } from 'react-router-dom'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { StatusPill } from './status-pill'
import { GroupHeader } from '@/components/ui/group-header'
import { Tag } from '@/components/ui/tag'
import { dueStatus, isOverdue } from '@/lib/due-status'
import { formatDate, overdueDays } from './task-formatters'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { ObjectiveHint } from './objective-hint'
import type { TaskTeamOption } from './task-row'
import { occurrenceRollupSummaryKey } from './occurrence-rollup-summary'

// ── Shared group-model type (aligned with TasksWorkspace.RenderGroup) ─────────
type MobileRenderGroup = {
  key: string
  label: string
  rows: TaskListRow[]
  overdue: number
  prefillParam: string
  /** Work-line type tag (only when groupBy==='workline'). */
  workLineType?: 'project' | 'process' | null
  objectiveHint?: { id: string | null; name: string }
  occurrenceRollup?: { total: number; done: number; overdue: number; pendingUnresolved: number }
}

function MobileWorkLineTypeTag({ type }: { type: 'project' | 'process' }) {
  const t = useT()
  if (type === 'project') {
    return <Tag color="blue" weight="medium" className="wl-type-tag">{t('tasks.type.project')}</Tag>
  }
  return <Tag color="gray" weight="medium" className="wl-type-tag">{t('tasks.type.daily')}</Tag>
}

export type MobileGroupedCardsProps = {
  groups: MobileRenderGroup[]
  recordSearch?: string
  onOpenTask?: (taskId: string) => void
  now: Date
  buMap: Map<string, string>
  teamMap: Map<string, string>
  personMap: Map<string, string>
  isCollapsed: (key: string) => boolean
  toggleCollapsed: (key: string) => void
  openAddTask: (prefillParam: string) => void
  setOverdueOnly: (value: boolean) => void
  workLineMap: Map<string, string>
  objectiveMap: Map<string, string>
  onAssignPending?: (runId: string) => void
  provenanceByTaskDefId?: Map<string, string>
  onEditTitle?: (taskId: string, title: string) => Promise<void>
  onEditPic?: (taskId: string, personId: string) => Promise<void>
  onEditTeam?: (taskId: string, teamId: string) => Promise<void>
  onEditSupervisor?: (taskId: string, personId: string) => Promise<void>
  personOptions?: readonly { id: string; full_name: string }[]
  supervisorOptions?: readonly { id: string; full_name: string }[]
  teamOptions?: readonly TaskTeamOption[]
  draftTaskId?: string | null
  onDiscardNewTask?: () => void
  viewerHasNoDownline?: boolean
}

type TaskCardProps = {
  task: TaskListRow
  now: Date
  buName: string
  teamName: string
  rName: string
  supervisorName: string
  recordSearch?: string
  onOpenTask: (taskId: string) => void
  onEditTitle?: (taskId: string, title: string) => Promise<void>
  onEditPic?: (taskId: string, personId: string) => Promise<void>
  onEditTeam?: (taskId: string, teamId: string) => Promise<void>
  onEditSupervisor?: (taskId: string, personId: string) => Promise<void>
  personOptions?: readonly { id: string; full_name: string }[]
  supervisorOptions?: readonly { id: string; full_name: string }[]
  teamOptions?: readonly TaskTeamOption[]
  isNew?: boolean
  onDiscardNewTask?: () => void
  provenanceRoleName?: string
  viewerHasNoDownline?: boolean
}

function TaskCard({
  task, now, rName, supervisorName, recordSearch = '', provenanceRoleName, onOpenTask,
}: TaskCardProps) {
  const t = useT()
  const { locale } = useI18n()
  const ds = dueStatus(task.due_date, now)
  const taskOverdue = isOverdue(task, now)
  const isArchived = task.archived_at != null
  const dueClass = taskOverdue ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
  const dueText = task.due_date
    ? (taskOverdue
      ? `${formatDate(task.due_date, locale)} · ${t(overdueDays(task.due_date, now) === 1 ? 'tasks.due.overdueDays.one' : 'tasks.due.overdueDays', { days: overdueDays(task.due_date, now) })}`
      : formatDate(task.due_date, locale))
    : '—'

  return (
    <article data-testid="task-card" className="task-card collection-grammar-card">
      <Link
        to={{ pathname: `/work/tasks/${task.id}`, search: recordSearch }}
        state={{ taskSurface: 'panel' }}
        className="task-card-link collection-grammar-card-body"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
          event.preventDefault()
          onOpenTask(task.id)
        }}
      >
        <span className="task-card-state-line">
          {isArchived && <span className="archived-tag">{t('tasks.archived')}</span>}
          <StatusPill status={task.status} openTreatment="neutral" />
          <span className={`task-card-due tabular-nums ${dueClass}`}>
            <span className="sr-only">{t('tasks.dueLabel')}: </span>{dueText}
          </span>
        </span>
        <span className={isArchived ? 'task-name task-name-archived collection-grammar-title' : 'task-name collection-grammar-title'}>{task.title}</span>
        <span className="task-card-meta-line">
          <span>{t('tasks.pic')}: {rName || '—'}{provenanceRoleName ? ` (${t('tasks.pic.via', { role: provenanceRoleName })})` : ''}</span>
          <span aria-hidden="true"> · </span>
          <span>{t('tasks.supervisor')}: {supervisorName || '—'}</span>
        </span>
      </Link>
    </article>
  )
}

/** Mobile grouped card list; group semantics mirror the desktop presentation. */
export function MobileGroupedCards({
  groups, recordSearch = '', now, buMap, teamMap, personMap,
  isCollapsed, toggleCollapsed, openAddTask, setOverdueOnly,
  onAssignPending, provenanceByTaskDefId, onOpenTask, onEditTitle, draftTaskId, onDiscardNewTask,
  onEditPic, onEditTeam, onEditSupervisor, personOptions, supervisorOptions,
  teamOptions, viewerHasNoDownline = false,
}: MobileGroupedCardsProps) {
  const t = useT()
  const openTask = onOpenTask ?? (() => {})
  const provenanceFor = (task: TaskListRow): string | undefined =>
    task.generated_from_task_def_id ? provenanceByTaskDefId?.get(task.generated_from_task_def_id) : undefined
  const isFlat = groups.length === 1 && groups[0].key === '__flat__'
  if (isFlat) {
    return (
      <div className="mgc mgc-flat" role="list" aria-label={t('tasks.title')}>
        {groups[0].rows.map(task => (
          <div key={task.id} role="listitem">
            <TaskCard
              task={task} now={now} buName={buMap.get(task.business_unit_id) ?? ''}
              teamName={teamMap.get(task.team_id ?? '') ?? ''}
              rName={personMap.get(task.responsible_person_id) ?? ''}
              supervisorName={personMap.get(task.accountable_person_id) ?? ''}
              recordSearch={recordSearch} onOpenTask={openTask} provenanceRoleName={provenanceFor(task)}
              onEditTitle={onEditTitle} onEditPic={onEditPic} onEditTeam={onEditTeam}
              onEditSupervisor={onEditSupervisor} personOptions={personOptions}
              supervisorOptions={supervisorOptions} teamOptions={teamOptions}
              isNew={task.id === draftTaskId} onDiscardNewTask={onDiscardNewTask}
              viewerHasNoDownline={viewerHasNoDownline}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mgc" role="list" aria-label={t('tasks.title')}>
      {groups.map((group) => {
        const pendingUnresolved = group.occurrenceRollup?.pendingUnresolved ?? 0
        const hasPendingAssignment = pendingUnresolved > 0 && Boolean(onAssignPending)
        return (
          <div key={`mgc-${group.key}`} className="mgc-group">
            <GroupHeader
              className="mgc-group-head"
              label={<span className="mgc-group-headings">
                {group.objectiveHint && <ObjectiveHint hint={group.objectiveHint} className="mgc-objective-hint" />}
                <span className="mgc-label">{group.label}</span>
                {group.workLineType != null && <MobileWorkLineTypeTag type={group.workLineType} />}
              </span>}
              count={group.occurrenceRollup
                ? t(
                  occurrenceRollupSummaryKey(pendingUnresolved, hasPendingAssignment),
                  {
                    done: group.occurrenceRollup.done, total: group.occurrenceRollup.total,
                    overdue: group.occurrenceRollup.overdue, pending: pendingUnresolved,
                  },
                )
                : group.rows.length}
              open={!isCollapsed(group.key)}
              onToggle={() => toggleCollapsed(group.key)}
              trailing={<>
                {group.occurrenceRollup && hasPendingAssignment && onAssignPending && (
                  <button type="button" className="mgc-sub mgc-sub-pending" onClick={() => onAssignPending(group.key)}>
                    {t('processes.pending.assignCount', { count: pendingUnresolved })}
                  </button>
                )}
                {!group.occurrenceRollup && group.overdue > 0 && (
                  <button type="button" className="mgc-sub" aria-label={t('tasks.filter.overdueAria', { count: group.overdue })} onClick={() => setOverdueOnly(true)}>
                    {t('tasks.filter.overdueCount', { count: group.overdue })}
                  </button>
                )}
                <button type="button" className="mgc-add" aria-label={t('tasks.group.add', { label: group.label })} onClick={() => openAddTask(group.prefillParam)}>
                  {t('tasks.add')}
                </button>
              </>}
            />
            {!isCollapsed(group.key) && group.rows.map(task => (
              <div key={task.id} role="listitem">
                <TaskCard
                  task={task} now={now} buName={buMap.get(task.business_unit_id) ?? ''}
                  teamName={teamMap.get(task.team_id ?? '') ?? ''}
                  rName={personMap.get(task.responsible_person_id) ?? ''}
                  supervisorName={personMap.get(task.accountable_person_id) ?? ''}
                  recordSearch={recordSearch} onOpenTask={openTask} provenanceRoleName={provenanceFor(task)}
                  onEditTitle={onEditTitle} onEditPic={onEditPic} onEditTeam={onEditTeam}
                  onEditSupervisor={onEditSupervisor} personOptions={personOptions}
                  supervisorOptions={supervisorOptions} teamOptions={teamOptions}
                  isNew={task.id === draftTaskId} onDiscardNewTask={onDiscardNewTask}
                  viewerHasNoDownline={viewerHasNoDownline}
                />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
