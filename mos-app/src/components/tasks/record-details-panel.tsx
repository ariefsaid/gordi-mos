import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import type { ObjectiveRow } from '@/lib/db/objectives'
import type { WorkLineRow } from '@/lib/db/work-lines'
import { StatusPill } from './status-pill'
import { StatusTrigger } from './status-trigger'
import { TaskOwnershipCard } from './task-ownership-card'
import { formatDate, initials } from './task-formatters'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'

export type RecordDetailsPanelProps = {
  task: TaskListRow
  buName: string
  people: PersonOption[]
  editable: boolean
  viewerId: string
  // [done, total] checklist tally for the summary field
  checklistCount: [number, number]
  // compact = the drawer-width variant (stacked above the feed). The drawer's
  // pinned header already owns the identity row + Status trigger, so the compact
  // panel suppresses both to avoid duplicate controls.
  compact?: boolean
  // Heading level for the record-identity name. Defaults to 1 (the identity is the
  // page h1). When a shell frame (PageFamilyFrame) owns the h1 — the V3 focused-record
  // full page — the host passes 2 so the identity nests as an h2 under the shell title.
  identityHeadingLevel?: 1 | 2
  // D4: objective + work-line inline edit
  objectives?: ObjectiveRow[]
  workLines?: WorkLineRow[]
  onStatusChange: (s: TaskStatus) => void
  onPicChange: (personId: string) => void
  onMarkComplete?: () => void
  onWorkLineChange?: (id: string | null) => void
  onObjectiveChange?: (id: string | null) => void
}

// The left details panel of the two-column record surface (ADR-0013 D3): an
// identity row (task name + "Team · code" sub-line) above field sections —
// Status (inline StatusTrigger for editors) · Team/PIC/Supervisor · Details.
// Status + ownership sit above the fold. A `compact` variant renders the same
// anatomy for the drawer width.
export function RecordDetailsPanel({
  task, buName, people, editable, checklistCount, compact,
  identityHeadingLevel = 1,
  objectives = [], workLines = [],
  onStatusChange, onPicChange, onMarkComplete,
  onWorkLineChange, onObjectiveChange,
}: RecordDetailsPanelProps) {
  const t = useT()
  const { locale } = useI18n()
  const [done, total] = checklistCount
  // Short reference code derived from the task id — no new field (the mockup's
  // "TASK-1042" stands in for a stable per-task ref; we surface the id suffix).
  const code = task.id.slice(0, 8).toUpperCase()

  // Resolve id → name for read-only display
  const workLineName = workLines.find(w => w.id === task.work_line_id)?.name ?? null
  const objectiveName = objectives.find(o => o.id === task.objective_id)?.name ?? null

  return (
    <section
      className={`record-details${compact ? ' record-details-compact' : ''}`}
      aria-label={t('tasks.detailsTitle')}
      data-testid="record-details"
    >
      {/* Identity row — suppressed in compact (the drawer header owns it). The
          heading level is h1 by default, h2 when a shell frame owns the page h1. */}
      {!compact && (
        <div className="rd-identity">
          <span className="rd-id-av" aria-hidden="true">{initials(task.title) || '·'}</span>
          <div className="rd-id-text">
            {identityHeadingLevel === 2
              ? <h2 className="rd-id-name" title={task.title}>{task.title}</h2>
              : <h1 className="rd-id-name" title={task.title}>{task.title}</h1>}
            <p className="rd-id-sub" title={`${buName} · ${code}`}>{buName} · {code}</p>
          </div>
        </div>
      )}

      {/* Status — above the fold; suppressed in compact (the drawer header owns it) */}
      {!compact && (
        <div className="rd-section">
          <div className="rd-section-label">{t('tasks.status.label')}</div>
          {editable
            ? <StatusTrigger status={task.status} onChange={onStatusChange} />
            : <StatusPill status={task.status} />
          }
        </div>
      )}

      {/* Typed Task ownership — Team, PIC, and Supervisor. */}
      <div className="rd-section">
        <div className="rd-section-label">{t('tasks.ownership')}</div>
        <TaskOwnershipCard
          task={task}
          teamName={buName}
          people={people}
          canEdit={editable}
          onPicChange={onPicChange}
        />
      </div>

      {/* Dates + checklist count + work-line + objective */}
      <div className="rd-section">
        <div className="rd-section-label">{t('tasks.detailsSection')}</div>
        <dl className="rd-fields">
          <div className="rd-field">
            <dt className="rd-field-label">{t('tasks.dueLabel')}</dt>
            <dd className="rd-field-val tabular-nums">
              {task.due_date ? formatDate(task.due_date, locale) : '—'}
            </dd>
          </div>
          <div className="rd-field">
            <dt className="rd-field-label">{t('tasks.team')}</dt>
            <dd className="rd-field-val">{buName}</dd>
          </div>
          <div className="rd-field">
            <dt className="rd-field-label">{t('tasks.created')}</dt>
            <dd className="rd-field-val tabular-nums">
              {formatDate(task.created_at.slice(0, 10), locale)}
            </dd>
          </div>
          <div className="rd-field">
            <dt className="rd-field-label">{t('tasks.checklistTitle')}</dt>
            <dd className="rd-field-val tabular-nums">
              {total > 0 ? t('tasks.checklist.done', { done, total }) : t('tasks.checklist.none')}
            </dd>
          </div>
          {/* Source/provenance — the parent work-line or objective, or honest Ad hoc. */}
          <div className="rd-field">
            <dt className="rd-field-label">{t('tasks.source')}</dt>
            <dd className="rd-field-val rd-source-value">
              {workLineName ?? objectiveName ?? t('tasks.adHoc')}
            </dd>
          </div>
          {/* D4: Work-line — editable inline select when lookups available, else read-only */}
          <div className="rd-field">
            <dt className="rd-field-label">{t('tasks.filter.projectProcess')}</dt>
            <dd className="rd-field-val rd-field-val-select">
              {editable && workLines.length > 0 && onWorkLineChange ? (
                <select
                  className="rd-inline-select"
                  value={task.work_line_id ?? ''}
                  onChange={e => onWorkLineChange(e.target.value || null)}
                  aria-label={t('tasks.filter.projectProcess')}
                >
                  <option value="">{t('tasks.create.none')}</option>
                  {/* Fix-6: (project) / (daily) cue so attribution intent is visible at selection */}
                  {workLines.map(wl => (
                    <option key={wl.id} value={wl.id}>
                      {wl.name} ({wl.type === 'project' ? t('tasks.type.project') : t('tasks.type.daily')})
                    </option>
                  ))}
                </select>
              ) : (
                workLineName ?? t('tasks.noDue')
              )}
            </dd>
          </div>
          {/* D4: Objective — editable inline select when lookups available, else read-only */}
          <div className="rd-field">
            <dt className="rd-field-label">{t('tasks.objective')}</dt>
            <dd className="rd-field-val rd-field-val-select">
              {editable && objectives.length > 0 && onObjectiveChange ? (
                <select
                  className="rd-inline-select"
                  value={task.objective_id ?? ''}
                  onChange={e => onObjectiveChange(e.target.value || null)}
                  aria-label={t('tasks.objective')}
                >
                  <option value="">{t('tasks.create.none')}</option>
                  {objectives.map(obj => (
                    <option key={obj.id} value={obj.id}>{obj.name}</option>
                  ))}
                </select>
              ) : (
                objectiveName ?? t('tasks.noDue')
              )}
            </dd>
          </div>
        </dl>
        {!compact && editable && task.status !== 'Done' && (
          <button
            type="button"
            className="btn btn-primary task-mark-complete"
            onClick={onMarkComplete ?? (() => {})}
          >
            {t('tasks.markComplete')}
          </button>
        )}
      </div>
    </section>
  )
}
