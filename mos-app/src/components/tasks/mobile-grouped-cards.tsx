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
  /**
   * Work-line type tag (only when groupBy==='workline').
   * 'project' → "Project"; 'process' → "Daily / ongoing".
   * null = "No work-line" group; undefined = not a workline grouping.
   * Text label is always present (never color-only) — WCAG 1.4.1.
   */
  workLineType?: 'project' | 'process' | null
  objectiveHint?: { id: string | null; name: string }
  /**
   * Design fix wave item 3 (Rule 9 occurrence group parity) — mirrors RenderGroup's
   * occurrenceRollup (tasks-grouping.ts). Present only for an occurrence group; supersedes the
   * plain count/overdue grammar with the roll-up summary, same as desktop's GroupHeaderRow.
   */
  occurrenceRollup?: { total: number; done: number; overdue: number; pendingUnresolved: number }
}

// ── Work-line type label tag (mirrors desktop WorkLineTypeTag in group-header-row) ──
function MobileWorkLineTypeTag({ type }: { type: 'project' | 'process' }) {
  const t = useT()
  if (type === 'project') {
    return (
      <Tag color="blue" weight="medium" className="wl-type-tag">
        {t('tasks.type.project')}
      </Tag>
    )
  }
  return (
    <Tag color="gray" weight="medium" className="wl-type-tag">
      {t('tasks.type.daily')}
    </Tag>
  )
}

export type MobileGroupedCardsProps = {
  groups: MobileRenderGroup[]
  /** Active location.search to preserve the saved view on every record-open path. */
  recordSearch?: string
  /** Opens the same shared RecordViewer used by the desktop collection. */
  onOpenTask?: (taskId: string) => void
  now: Date
  buMap: Map<string, string>
  /** #760 AC-048: the canonical owning Team, id → name — the card shows Team, not the retired
   *  Business unit line (BU stays display-only per OD-WAY-94 (9)). */
  teamMap: Map<string, string>
  personMap: Map<string, string>
  isCollapsed: (key: string) => boolean
  toggleCollapsed: (key: string) => void
  openAddTask: (prefillParam: string) => void
  setOverdueOnly: (value: boolean) => void
  /** FR-234: resolved work-line names (id → name). */
  workLineMap: Map<string, string>
  /** FR-234: resolved objective names (id → name). */
  objectiveMap: Map<string, string>
  /**
   * Design fix wave item 3 — opens the pending-PIC resolution surface for an occurrence group,
   * keyed by the group's run id. Same handler contract as desktop's GroupHeaderRow
   * onAssignPending. Omitted (undefined) when the viewer cannot resolve pending items — the
   * affordance never renders without it (mirrors the desktop gating).
   */
  onAssignPending?: (runId: string) => void
  /** Design fix wave item 4 — task_def_id → pic_role NAME (from useOccurrenceGroups), backing each
   * card's "via <role name>" generated-ownership line. Undefined outside occurrence grouping. */
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
  /** #742 AC-060 (W-M persona step 3): true when the viewer has nobody reporting to them, so the
   * draft card's PIC is fixed to self — surfaced only on the isNew card, via picLockMessage. */
  viewerHasNoDownline?: boolean
}

// ── Task card ─────────────────────────────────────────────────────────────────
type TaskCardProps = {
  task: TaskListRow
  now: Date
  /** Draft-only: TaskCreateForm still shows the derived Business unit while Team is being chosen. */
  buName: string
  /** #760 AC-048: resolved Team name for the read card; '—' when the task carries no team_id
   *  (an honest legacy/repair state, never a fabricated Team). The draft form asks for Team via
   *  its own picker — this prop only feeds the persisted card's display line. */
  teamName: string
  rName: string
  /** The accountable person, also shown beside the PIC on the scan row. */
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
  /** Design fix wave item 4 — the generated-ownership source ("via <role name>"), Rule 11 reuse of
   * OwnerCell's provenance rendering. */
  provenanceRoleName?: string
  /** #742 AC-060: only meaningful when isNew — see MobileGroupedCardsProps.viewerHasNoDownline. */
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
  // C1: only genuinely-overdue (non-Done, non-archived) gets red class / "Overdue · " prefix.
  const dueClass = taskOverdue ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
  const dueText = task.due_date
    ? (taskOverdue
      ? `${formatDate(task.due_date, locale)} · ${t(overdueDays(task.due_date, now) === 1 ? 'tasks.due.overdueDays.one' : 'tasks.due.overdueDays', { days: overdueDays(task.due_date, now) })}`
      : formatDate(task.due_date, locale))
    : '—'

  const cardContent = (
    <>
        <div className="task-card-head">
          {isArchived && <span className="archived-tag">{t('tasks.archived')}</span>}
          <span className={isArchived ? 'task-name task-name-archived collection-grammar-title' : 'task-name collection-grammar-title'}>{task.title}</span>
          <StatusPill status={task.status} openTreatment="neutral" />
        </div>
        <p className="task-card-meta-line">
          {t('tasks.pic')}: {rName || '—'}{provenanceRoleName ? ` (${t('tasks.pic.via', { role: provenanceRoleName })})` : ''} · {t('tasks.supervisor')}: {supervisorName || '—'}
        </p>
        <p className={`task-card-due tabular-nums ${dueClass}`}>
          <span className="sr-only">{t('tasks.dueLabel')}: </span>{dueText}
        </p>
    </>
  )

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
        {cardContent}
      </Link>
    </article>
  )
}

/**
 * Mobile grouped card list (AC-129, FR-127).
 *
 * Extracted from the inline mobile block in TasksWorkspace (PR-3 fix-up).
 * The group-header chrome (caret / label / count / overdue-gating / add+toggle)
 * mirrors the semantics of desktop GroupHeaderRow — same aria-expanded, same
 * aria-label patterns, same callback contracts — so there is one conceptual
 * source for group-header behavior across desktop and mobile.
 *
 * CSS: uses the existing .mgc-* classes from TasksWorkspace.css.
 */
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
    task.generated_from_task_def_id
      ? provenanceByTaskDefId?.get(task.generated_from_task_def_id)
      : undefined
  // Flat default (mockup): the single implicit group renders as a plain card list
  // with NO group-header chrome (no caret / label / count / add).
  const isFlat = groups.length === 1 && groups[0].key === '__flat__'
  if (isFlat) {
    return (
      <div className="mgc mgc-flat" role="list" aria-label={t('tasks.title')}>
        {groups[0].rows.map(task => (
          <div key={task.id} role="listitem">
            <TaskCard
              task={task}
              now={now}
              buName={buMap.get(task.business_unit_id) ?? ''}
              teamName={teamMap.get(task.team_id ?? '') ?? ''}
              rName={personMap.get(task.responsible_person_id) ?? ''}
              supervisorName={personMap.get(task.accountable_person_id) ?? ''}
              recordSearch={recordSearch}
              onOpenTask={openTask}
              provenanceRoleName={provenanceFor(task)}
              onEditTitle={onEditTitle}
              onEditPic={onEditPic}
              onEditTeam={onEditTeam}
              onEditSupervisor={onEditSupervisor}
              personOptions={personOptions}
              supervisorOptions={supervisorOptions}
              teamOptions={teamOptions}
              isNew={task.id === draftTaskId}
              onDiscardNewTask={onDiscardNewTask}
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
                {/* The Objective sits ABOVE the Project/Process title, in its own line. */}
                {group.objectiveHint && <ObjectiveHint hint={group.objectiveHint} className="mgc-objective-hint" />}
                <span className="mgc-label">{group.label}</span>
                {/* RI-1: work-line type tag — text always present, never color-only (WCAG 1.4.1) */}
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
                  task={task}
                  now={now}
                  buName={buMap.get(task.business_unit_id) ?? ''}
                  teamName={teamMap.get(task.team_id ?? '') ?? ''}
                  rName={personMap.get(task.responsible_person_id) ?? ''}
                  supervisorName={personMap.get(task.accountable_person_id) ?? ''}
                  recordSearch={recordSearch}
                  onOpenTask={openTask}
                  provenanceRoleName={provenanceFor(task)}
                  onEditTitle={onEditTitle}
                  onEditPic={onEditPic}
                  onEditTeam={onEditTeam}
                  onEditSupervisor={onEditSupervisor}
                  personOptions={personOptions}
                  supervisorOptions={supervisorOptions}
                  teamOptions={teamOptions}
                  isNew={task.id === draftTaskId}
                  onDiscardNewTask={onDiscardNewTask}
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
