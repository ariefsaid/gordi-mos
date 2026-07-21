import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import type { PersonOption, BusinessUnitOption } from '@/lib/db/directory'
import type { ObjectiveRow } from '@/lib/db/objectives'
import type { WorkLineRow } from '@/lib/db/work-lines'
import { StatusPill } from './status-pill'
import { StatusTrigger } from './status-trigger'
import { formatDate, initials } from './task-formatters'
import {
  createTaskPanelAdapter,
  createTaskFieldCommit,
  type TaskViewerFieldKey,
  type TaskTeamView,
} from './task-record-adapter'
import { RecordViewer } from '@/components/records/record-viewer'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'

export type RecordDetailsPanelProps = {
  task: TaskListRow
  buName: string
  people: PersonOption[]
  // Business Unit options for the ownership select (V3 Issue 5 — BU is a distinct editable field).
  businessUnits: BusinessUnitOption[]
  editable: boolean
  viewerId: string
  // [done, total] checklist tally for the summary field
  checklistCount: [number, number]
  // Only a real task.team_id lookup may populate this (Issue 8). Null → honest missing-Team state.
  team?: TaskTeamView | null
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
  // V3 Issue 5 DAL seam: a domain-facing field commit (pic/supervisor/businessUnit/dueDate/...)
  // — the tenant (TaskSurface) maps the viewer key to the legacy storage column.
  onUpdateField: (field: TaskViewerFieldKey, value: string | null) => Promise<void>
  // Bubbles RecordField dirty state up so the tenant can attach the overlay leave-guard.
  onDirtyChange?: (dirty: boolean) => void
  onMarkComplete?: () => void
  onWorkLineChange?: (id: string | null) => void
  onObjectiveChange?: (id: string | null) => void
}

// The left details panel of the two-column record surface (ADR-0013 D3), migrated onto the shared
// RecordViewer grammar (V3 Issue 5 tenant half). Its ownership (Business Unit · PIC · Supervisor ·
// Team) and Due fields render through RecordViewer/RecordField — proving the shared field grammar
// live, with Enter/blur commit, Escape-cancel, Saving/Saved and error/retry feedback. The panel
// keeps its own chrome around the viewer: the identity row (h1/h2), the Status section + Mark
// complete (full mode), and the catalog attribution selects (work-line / objective) + read-only
// summary (created · checklist), which the metadata-only panel adapter does not model. The
// RecordViewer identity header is suppressed so the panel's identity row is the only record-name
// heading (no duplicate h1).
export function RecordDetailsPanel({
  task, buName, people, businessUnits, editable, checklistCount, compact,
  team = null,
  identityHeadingLevel = 1,
  objectives = [], workLines = [],
  onStatusChange, onUpdateField, onDirtyChange, onMarkComplete,
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

  const readOnlyReason = task.archived_at
    ? t('tasks.field.readOnlyArchived')
    : t('tasks.field.readOnlyNoPermission')
  const adapter = createTaskPanelAdapter({
    task, editable, people, businessUnits, team, readOnlyReason,
    sectionLabel: t('tasks.ownership'),
    labels: {
      businessUnit: t('tasks.field.businessUnit'),
      pic: t('tasks.pic'),
      supervisor: t('tasks.supervisor'),
      team: t('tasks.team'),
      teamUnassigned: t('tasks.field.teamUnassigned'),
      teamFromRecord: t('tasks.field.teamFromRecord'),
      teamMigration: t('tasks.field.teamMigration'),
      dueDate: t('tasks.dueLabel'),
    },
  })
  const commitField = createTaskFieldCommit({
    onUpdateField,
    onUpdateStatus: async (s) => onStatusChange(s),
  })

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

      {/* Ownership + Due — the shared RecordViewer field grammar. Its identity header is
          suppressed so the panel's identity row above stays the only record-name heading. */}
      <RecordViewer
        adapter={adapter}
        mode="panel"
        showIdentityHeader={false}
        onCommitField={commitField}
        onDirtyChange={onDirtyChange}
      />

      {/* Catalog attribution + read-only summary — chrome the metadata-only adapter does not model. */}
      <div className="rd-section">
        <div className="rd-section-label">{t('tasks.detailsSection')}</div>
        <dl className="rd-fields">
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
