import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { StatusPill } from './status-pill'
import { StatusTrigger } from './status-trigger'
import { formatAge, formatDate } from './task-formatters'
import { dueStatus } from '@/lib/due-status'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'

export type TaskDrawerHeaderProps = {
  task: TaskListRow
  buName: string
  people: PersonOption[]
  editable: boolean
  archiveable: boolean
  expanded: boolean
  now: Date
  onStatusChange: (s: TaskStatus) => void
  onMarkComplete?: () => void
  onOpenPage?: () => void
  onExpandToggle: () => void
  onClose: () => void
  onArchive: () => void
}

const ExpandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
)
const CollapseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M9 3H3v6M21 15v6h-6M3 3l7 7M21 21l-7-7" />
  </svg>
)
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

/**
 * The PINNED action header of the task drawer (Variant B, design-plan §1.2):
 * utility bar (expand + close), title + unit/due, inline Status trigger, and
 * Team/PIC/Supervisor summary — the decision drivers stay above the fold at any tab/scroll.
 * Presentational: all mutations are routed through the supplied callbacks.
 */
export function TaskDrawerHeader({
  task, buName, people, editable, archiveable, expanded, now,
  onStatusChange, onMarkComplete, onOpenPage, onExpandToggle, onClose, onArchive,
}: TaskDrawerHeaderProps) {
  const t = useT()
  const { locale } = useI18n()
  const nameOf = (id: string) => people.find(p => p.id === id)?.full_name ?? id
  const ds = dueStatus(task.due_date, now)
  const dueClass = ds === 'overdue' ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
  const dueText = task.due_date
    ? (ds === 'overdue'
      ? t('tasks.overdueDate', { date: formatDate(task.due_date, locale) })
      : formatDate(task.due_date, locale))
    : t('tasks.noDue')

  return (
    <header className={expanded ? 'dw-head dw-head-expanded' : 'dw-head'}>
      {/* Utility bar */}
      <div className="dw-bar">
        <span className="dw-crumb-mini">{expanded ? t('tasks.fullWidth') : t('tasks.label.task')}</span>
        <span className="dw-bar-spacer" />
        {onOpenPage && (
          <button type="button" className="dw-open-page" onClick={onOpenPage}>
            {t('tasks.openFullPage')}
          </button>
        )}
        <button
          type="button"
          className={expanded ? 'dw-iconbtn dw-iconbtn-on' : 'dw-iconbtn'}
          aria-pressed={expanded}
          aria-label={expanded ? t('tasks.collapse') : t('tasks.expand')}
          title={expanded ? t('tasks.collapse') : t('tasks.expand')}
          onClick={onExpandToggle}
        >
          {expanded ? <CollapseIcon /> : <ExpandIcon />}
        </button>
        <button
          type="button"
          className="dw-iconbtn"
          aria-label={t('tasks.close')}
          title={t('tasks.close')}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Pinned action block */}
      <div className="dw-pinned">
        <div className="dw-pinned-inner">
          <div className="dw-titlewrap">
            <h2 className="dw-title" title={task.title}>{task.title}</h2>
            <p className="dw-unit">
              {buName} · {t('tasks.due')} <span className={`${dueClass} tabular-nums`}>{dueText}</span>
            </p>
          </div>

          <div className="dw-statusrow">
            {editable
              ? <StatusTrigger status={task.status} onChange={onStatusChange} />
              : <StatusPill status={task.status} />
            }
            {editable && onMarkComplete && task.status !== 'Done' && !task.archived_at && (
              <button type="button" className="btn btn-primary task-mark-complete" onClick={onMarkComplete}>
                {t('tasks.markComplete')}
              </button>
            )}
            {expanded && archiveable && !task.archived_at && (
              <button type="button" className="btn-ghost-danger" aria-label={t('tasks.archive')} onClick={onArchive}>
                {t('tasks.archive')}
              </button>
            )}
            <span className="act tabular-nums dw-activity">{t('tasks.activity', { age: formatAge(task.last_activity_at, now) })}</span>
          </div>

          <div className="dw-ownership-summary" aria-label={t('tasks.ownershipSummary')}>
            <div className="dw-owner-summary-item">
              <span className="dw-owner-summary-label">{t('tasks.team')}</span>
              <span className="dw-owner-summary-value">{buName}</span>
            </div>
            <div className="dw-owner-summary-item">
              <span className="dw-owner-summary-label">{t('tasks.pic')}</span>
              <span className="dw-owner-summary-value">{nameOf(task.responsible_person_id)}</span>
            </div>
            <div className="dw-owner-summary-item">
              <span className="dw-owner-summary-label">{t('tasks.supervisor')}</span>
              <span className="dw-owner-summary-value">{nameOf(task.accountable_person_id)}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
