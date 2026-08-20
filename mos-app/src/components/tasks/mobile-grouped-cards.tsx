import { Link } from 'react-router-dom'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { PicCell } from './pic-cell'
import { StatusPill } from './status-pill'
import { Chevron } from '@/shell/icons'
import { Tag } from '@/components/ui/tag'
import { dueStatus, isOverdue } from '@/lib/due-status'
import { formatDate } from './task-formatters'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'

// ── Shared group-model type (aligned with TasksWorkspace.RenderGroup) ─────────
export type MobileRenderGroup = {
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
}

// ── Task card ─────────────────────────────────────────────────────────────────
type TaskCardProps = {
  task: TaskListRow
  now: Date
  buName: string
  rName: string
  supervisorName: string
  recordSearch?: string
  onOpenTask: (taskId: string) => void
  /** Design fix wave item 4 — the generated-ownership source ("via <role name>"), Rule 11 reuse of
   * OwnerCell's provenance rendering. */
  provenanceRoleName?: string
}

function TaskCard({ task, now, buName, rName, supervisorName, recordSearch = '', provenanceRoleName, onOpenTask }: TaskCardProps) {
  const t = useT()
  const { locale } = useI18n()
  const ds = dueStatus(task.due_date, now)
  const taskOverdue = isOverdue(task, now)
  const isArchived = task.archived_at != null
  // C1: only genuinely-overdue (non-Done, non-archived) gets red class / "Overdue · " prefix.
  const dueClass = taskOverdue ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
  const dueText = task.due_date
    ? (taskOverdue ? t('tasks.overdueDate', { date: formatDate(task.due_date, locale) }) : formatDate(task.due_date, locale))
    : '—'

  return (
    <article data-testid="task-card" className="task-card collection-grammar-card">
      <Link
        to={{ pathname: `/work/tasks/${task.id}`, search: recordSearch }}
        state={{ taskSurface: 'panel' }}
        className="task-card-link collection-grammar-card-body"
        onClick={(event) => {
          event.preventDefault()
          onOpenTask(task.id)
        }}
      >
        <div className="task-card-head">
          {isArchived && <span className="archived-tag">{t('tasks.archived')}</span>}
          <span className={isArchived ? 'task-name task-name-archived collection-grammar-title' : 'task-name collection-grammar-title'}>{task.title}</span>
          <StatusPill status={task.status} />
        </div>
        <span className="task-bu">{buName}</span>
        {/* v4 distill (layout.md/distill.md): PIC + Supervisor + Due are the decision-relevant
            fields for weekly triage (WHAT GOOD LOOKS LIKE) — the same set the desktop row already
            settled on (Wave 2c, OD-REDESIGN-61..64). Project/Process, Objective, Source, and the
            recency "Updated" line were restated metadata that rendered an empty "—" line for every
            task with no project/objective — noise wearing information's clothes (distill.md
            "remove redundancy"). Cuts a phone card from ~230px toward ~100px, more than doubling
            rows visible without scrolling. Full typed metadata still lives one tap away on the
            record (DESIGN.md "Progressive disclosure"). */}
        <dl className="task-card-meta collection-grammar-card-details">
          <span className="task-card-meta-pair">
            <dt>{t('tasks.pic')}</dt>
            <dd><PicCell fullName={rName} provenance={provenanceRoleName} /></dd>
          </span>
          <span className="task-card-meta-pair">
            <dt>{t('tasks.supervisor')}</dt>
            <dd>{supervisorName || '—'}</dd>
          </span>
          <span className="task-card-meta-pair">
            <dt>{t('tasks.dueLabel')}</dt>
            <dd className={`tabular-nums ${dueClass}`}>{dueText}</dd>
          </span>
        </dl>
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
  groups, recordSearch = '', now, buMap, personMap,
  isCollapsed, toggleCollapsed, openAddTask, setOverdueOnly,
  onAssignPending, provenanceByTaskDefId, onOpenTask,
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
              rName={personMap.get(task.responsible_person_id) ?? ''}
              supervisorName={personMap.get(task.accountable_person_id) ?? ''}
              recordSearch={recordSearch}
              onOpenTask={openTask}
              provenanceRoleName={provenanceFor(task)}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mgc" role="list" aria-label={t('tasks.title')}>
      {groups.map(group => (
        <div key={`mgc-${group.key}`} className="mgc-group">
          <div className="mgc-group-head collection-grammar-mobile-group">
            <button
              type="button"
              className="mgc-caret"
              aria-expanded={!isCollapsed(group.key)}
              aria-label={isCollapsed(group.key)
                ? t('tasks.group.expand', { label: group.label })
                : t('tasks.group.collapse', { label: group.label })}
              onClick={() => toggleCollapsed(group.key)}
            >
              {/* IXD-1: ONE shared Chevron, rotated −90° when collapsed (down = expanded). */}
              <Chevron className={`mgc-chev${isCollapsed(group.key) ? ' mgc-chev-collapsed' : ''}`} />
            </button>
            {/* The Objective sits ABOVE the Project/Process title, in its own column — inline it
                would take a third of a 390px header and break the title mid-word. */}
            <span className="mgc-group-headings">
              {group.objectiveHint && (
                <span className="mgc-objective-hint">
                  {group.objectiveHint.id
                    ? <Link to={`/work/objectives?q=${encodeURIComponent(group.objectiveHint.name)}`}>{group.objectiveHint.name}</Link>
                    : group.objectiveHint.name}
                </span>
              )}
              <span className="mgc-label">{group.label}</span>
            </span>
            {/* RI-1: work-line type tag — text always present, never color-only (WCAG 1.4.1) */}
            {group.workLineType != null && (
              <MobileWorkLineTypeTag type={group.workLineType} />
            )}
            {/* Design fix wave item 3 — occurrence groups supersede the plain count with the
                roll-up summary, mirroring desktop's GroupHeaderRow (Rule 9 parity). Design fix
                wave item 6 (MINOR — "1 to assign" stutter): the same drop-clause-when-a-button-
                also-renders / neutral-"unassigned"-otherwise logic as GroupHeaderRow. */}
            {group.occurrenceRollup ? (
              <span className="mgc-count tabular-nums">
                {t(
                  group.occurrenceRollup.pendingUnresolved === 0
                    ? 'processes.rollup.summary'
                    : onAssignPending
                      ? 'processes.rollup.summaryNoAssign'
                      : 'processes.rollup.summaryUnassigned',
                  {
                    done: group.occurrenceRollup.done, total: group.occurrenceRollup.total,
                    overdue: group.occurrenceRollup.overdue, pending: group.occurrenceRollup.pendingUnresolved,
                  },
                )}
              </span>
            ) : (
              <span className="mgc-count tabular-nums">{group.rows.length}</span>
            )}
            {group.occurrenceRollup && group.occurrenceRollup.pendingUnresolved > 0 && onAssignPending && (
              <button
                type="button"
                className="mgc-sub mgc-sub-pending"
                onClick={() => onAssignPending(group.key)}
              >
                {t('processes.pending.assignCount', { count: group.occurrenceRollup.pendingUnresolved })}
              </button>
            )}
            {!group.occurrenceRollup && group.overdue > 0 && (
              <button
                type="button"
                className="mgc-sub"
                aria-label={t('tasks.filter.overdueAria', { count: group.overdue })}
                onClick={() => setOverdueOnly(true)}
              >
                · {t('tasks.filter.overdueCount', { count: group.overdue })}
              </button>
            )}
            <button
              type="button"
              className="mgc-add"
              aria-label={t('tasks.group.add', { label: group.label })}
              onClick={() => openAddTask(group.prefillParam)}
            >
              {t('tasks.add')}
            </button>
          </div>
          {!isCollapsed(group.key) && group.rows.map(task => (
            <div key={task.id} role="listitem">
              <TaskCard
                task={task}
                now={now}
                buName={buMap.get(task.business_unit_id) ?? ''}
                rName={personMap.get(task.responsible_person_id) ?? ''}
                supervisorName={personMap.get(task.accountable_person_id) ?? ''}
                recordSearch={recordSearch}
                onOpenTask={openTask}
                provenanceRoleName={provenanceFor(task)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
