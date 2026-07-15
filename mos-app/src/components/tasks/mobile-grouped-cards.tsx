import { Link } from 'react-router-dom'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { OwnerCellRaciMember } from './owner-cell'
import { OwnerCell } from './owner-cell'
import { StatusPill } from './status-pill'
import { Chevron } from '@/shell/icons'
import { Tag } from '@/components/ui/tag'
import { dueStatus, isOverdue } from '@/lib/due-status'
import { formatAge, formatDate, taskSourceLabel } from './task-formatters'
import { useT } from '@/i18n/use-t'

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
  now: Date
  buMap: Map<string, string>
  personMap: Map<string, string>
  isCollapsed: (key: string) => boolean
  toggleCollapsed: (key: string) => void
  openAddTask: (prefillParam: string) => void
  setOverdueOnly: (value: boolean) => void
  buildOthers: (task: TaskListRow) => OwnerCellRaciMember[]
  /** FR-234: resolved work-line names (id → name). */
  workLineMap: Map<string, string>
  /** FR-234: resolved objective names (id → name). */
  objectiveMap: Map<string, string>
}

// ── Task card ─────────────────────────────────────────────────────────────────
type TaskCardProps = {
  task: TaskListRow
  now: Date
  buName: string
  rName: string
  workLineName: string
  objectiveName: string
  supervisorName: string
  sourceName: string
  recordSearch?: string
}

function TaskCard({ task, now, buName, rName, workLineName, objectiveName, supervisorName, sourceName, recordSearch = '' }: TaskCardProps) {
  const t = useT()
  const ds = dueStatus(task.due_date, now)
  const taskOverdue = isOverdue(task, now)
  const age = formatAge(task.last_activity_at, now)
  const isArchived = task.archived_at != null
  // C1: only genuinely-overdue (non-Done, non-archived) gets red class / "Overdue · " prefix.
  const dueClass = taskOverdue ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
  const dueText = task.due_date
    ? (taskOverdue ? `Overdue · ${formatDate(task.due_date)}` : formatDate(task.due_date))
    : '—'

  return (
    <article data-testid="task-card" className="task-card">
      <Link
        to={{ pathname: `/work/tasks/${task.id}`, search: recordSearch }}
        state={{ taskSurface: 'panel' }}
        className="task-card-link"
      >
        <div className="task-card-head">
          {isArchived && <span className="archived-tag">{t('tasks.archived')}</span>}
          <span className={isArchived ? 'task-name task-name-archived' : 'task-name'}>{task.title}</span>
          <StatusPill status={task.status} />
        </div>
        <span className="task-bu">{buName}</span>
        {/* Fix-5: dt labels are visible (label:value) per mockup — not sr-only */}
        <dl className="task-card-meta">
          <span className="task-card-meta-pair">
            <dt>{t('tasks.pic')}</dt>
            <dd><OwnerCell fullName={rName} otherCount={0} variant="task" /></dd>
          </span>
          <span className="task-card-meta-pair">
            <dt>{t('tasks.supervisor')}</dt>
            <dd>{supervisorName || '—'}</dd>
          </span>
          {/* FR-234: Work-line + Objective in mobile card */}
          <span className="task-card-meta-pair">
            <dt>{t('tasks.filter.projectProcess')}</dt>
            <dd className="td-empty-inline">{workLineName || '—'}</dd>
          </span>
          <span className="task-card-meta-pair">
            <dt>{t('tasks.objective')}</dt>
            <dd className="td-empty-inline">{objectiveName || '—'}</dd>
          </span>
          <span className="task-card-meta-pair">
            <dt>{t('tasks.dueLabel')}</dt>
            <dd className={`tabular-nums ${dueClass}`}>{dueText}</dd>
          </span>
          <span className="task-card-meta-pair">
            <dt>{t('tasks.source')}</dt>
            <dd className="td-empty-inline">{sourceName}</dd>
          </span>
          <span className="task-card-meta-pair">
            <dt>{t('tasks.activityLabel')}</dt>
            <dd className="act tabular-nums">{age}</dd>
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
  workLineMap, objectiveMap,
}: MobileGroupedCardsProps) {
  // Flat default (mockup): the single implicit group renders as a plain card list
  // with NO group-header chrome (no caret / label / count / add).
  const isFlat = groups.length === 1 && groups[0].key === '__flat__'
  if (isFlat) {
    return (
      <div className="mgc" role="list" aria-label="Tasks">
        {groups[0].rows.map(task => (
          <div key={task.id} role="listitem">
            <TaskCard
              task={task}
              now={now}
              buName={buMap.get(task.business_unit_id) ?? ''}
              rName={personMap.get(task.responsible_person_id) ?? ''}
              workLineName={task.work_line_id ? (workLineMap.get(task.work_line_id) ?? '') : ''}
              objectiveName={task.objective_id ? (objectiveMap.get(task.objective_id) ?? '') : ''}
              supervisorName={personMap.get(task.accountable_person_id) ?? ''}
              sourceName={taskSourceLabel(
                task.work_line_id ? (workLineMap.get(task.work_line_id) ?? '') : '',
                task.objective_id ? (objectiveMap.get(task.objective_id) ?? '') : '',
              )}
              recordSearch={recordSearch}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mgc" role="list" aria-label="Tasks">
      {groups.map(group => (
        <div key={`mgc-${group.key}`} className="mgc-group">
          <div className="mgc-group-head">
            <button
              type="button"
              className="mgc-caret"
              aria-expanded={!isCollapsed(group.key)}
              aria-label={isCollapsed(group.key) ? `Expand ${group.label} group` : `Collapse ${group.label} group`}
              onClick={() => toggleCollapsed(group.key)}
            >
              {/* IXD-1: ONE shared Chevron, rotated −90° when collapsed (down = expanded). */}
              <Chevron className={`mgc-chev${isCollapsed(group.key) ? ' mgc-chev-collapsed' : ''}`} />
            </button>
            <span className="mgc-label">{group.label}</span>
            {/* RI-1: work-line type tag — text always present, never color-only (WCAG 1.4.1) */}
            {group.workLineType != null && (
              <MobileWorkLineTypeTag type={group.workLineType} />
            )}
            <span className="mgc-count tabular-nums">{group.rows.length}</span>
            {group.overdue > 0 && (
              <button
                type="button"
                className="mgc-sub"
                aria-label={`Filter to ${group.overdue} overdue tasks`}
                onClick={() => setOverdueOnly(true)}
              >
                · {group.overdue} overdue
              </button>
            )}
            <button
              type="button"
              className="mgc-add"
              aria-label={`Add task to ${group.label}`}
              onClick={() => openAddTask(group.prefillParam)}
            >
              + Add task
            </button>
          </div>
          {!isCollapsed(group.key) && group.rows.map(task => (
            <div key={task.id} role="listitem">
              <TaskCard
                task={task}
                now={now}
                buName={buMap.get(task.business_unit_id) ?? ''}
                rName={personMap.get(task.responsible_person_id) ?? ''}
                workLineName={task.work_line_id ? (workLineMap.get(task.work_line_id) ?? '') : ''}
                objectiveName={task.objective_id ? (objectiveMap.get(task.objective_id) ?? '') : ''}
                supervisorName={personMap.get(task.accountable_person_id) ?? ''}
                sourceName={taskSourceLabel(
                  task.work_line_id ? (workLineMap.get(task.work_line_id) ?? '') : '',
                  task.objective_id ? (objectiveMap.get(task.objective_id) ?? '') : '',
                )}
                recordSearch={recordSearch}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
