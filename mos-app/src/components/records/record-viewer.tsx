// RecordViewer — the ONE shared presentation grammar for a record (V3 Issue 5).
//
// It renders any RecordViewerAdapter (real Task, real Signal) in ONE stable
// hierarchy — identity/type, metadata sections, relations, typed content slots,
// activity/history, allowed actions — so the two domains look similar without
// becoming identical. A Task stays a Task and a Signal stays a Signal: the viewer
// never branches on a database table; it only renders what the adapter projects.
//
// Ownership boundary (Issue 4 owns the host): the viewer receives callbacks and
// never calls history APIs, never creates an overlay/focus-trap/leave-guard, and
// never renders a confirmation dialog. Field commits route through onCommitField;
// dirty state forwards to onDirtyChange so the tenant can attach the Issue 4
// OverlayEntry.leaveGuard. Related links call onOpenRelated (or their href).
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { reportError } from '@/lib/telemetry'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { LoadingShell, EmptyState, ErrorState } from '@/components/ui/state-kit'
import { RecordField } from './record-field'
import type {
  RecordAction,
  RecordMetadataSection,
  RecordRelation,
  RecordValue,
  RecordViewerAdapter,
  RecordViewerMode,
} from './record-viewer.types'
import './record-viewer.css'

export interface RecordViewerProps {
  adapter: RecordViewerAdapter
  mode: RecordViewerMode
  headingLevel?: 1 | 2
  /**
   * Render the viewer's own identity header (eyebrow · type · title heading). Default true.
   * A tenant whose surrounding chrome already owns the record name — e.g. a host-level page
   * title — passes false so there is no duplicate heading. The section landmark stays
   * accessible: when suppressed it is named by the adapter title via aria-label instead of
   * aria-labelledby (ViewerIdentitySuppressionContract / no-duplicate-h1).
   */
  showIdentityHeader?: boolean
  /** Host-supplied loading gate (the adapter models ready/empty/error only). */
  loading?: boolean
  onClose?: () => void
  onBack?: () => void
  onOpenPage?: () => void
  onOpenRelated?: (relation: RecordRelation) => void
  onDirtyChange?: (dirty: boolean) => void
  /** Persist a field edit by its adapter key; the tenant maps it to the DAL. */
  onCommitField?: (key: string, value: RecordValue) => Promise<void>
  /** Host/adapter-supplied error retry (keeps the viewer free of data ownership). */
  onRetry?: () => void
  /**
   * True while the tenant's own leave-guard confirmation dialog is open (D1 fix — see
   * RecordField's `commitsFrozen` header note). Forwarded to every field so a stray blur
   * caused by the dialog's auto-focus never fires an unrequested commit.
   */
  fieldCommitsFrozen?: boolean
}

const ACTION_VARIANT: Record<RecordAction['intent'], ButtonVariant> = {
  primary: 'primary',
  secondary: 'outline',
  danger: 'destructive',
}

const noopCommit = async () => {}

/**
 * RecordFieldList — the ONE value-first field-section body (an `<h3>` + the RecordField rows).
 * Shared by the viewer's metadata region AND by a content-first field-section content slot
 * (OD-REDESIGN-90): a kind that leads with its content packs Ownership/Relations/… into ordered
 * content slots, and each such slot renders this exact body so the fields, the commit seam, the
 * dirty-guard, and the commits-frozen shield behave identically wherever the section is placed.
 * It renders no section wrapper — the caller owns the landmark `<section>` (metadata region or
 * `data-content-slot`), so the accessible name and region marker stay where they belong.
 */
export function RecordFieldList({
  section,
  onCommitField,
  onDirtyChange,
  fieldCommitsFrozen = false,
  excludeKeys = [],
}: {
  section: RecordMetadataSection
  onCommitField?: (key: string, value: RecordValue) => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
  fieldCommitsFrozen?: boolean
  excludeKeys?: readonly string[]
}): ReactNode {
  const commit = onCommitField ?? noopCommit
  return (
    <>
      <h3 className="record-viewer__section-title">{section.label}</h3>
      <div className="record-viewer__fields">
        {section.fields.filter((field) => !excludeKeys.includes(field.key)).map((field) => (
          <RecordField
            key={field.key}
            spec={field}
            onCommit={(value) => commit(field.key, value)}
            onDirtyChange={onDirtyChange}
            commitsFrozen={fieldCommitsFrozen}
          />
        ))}
      </div>
    </>
  )
}

export function RecordViewer({
  adapter,
  mode,
  headingLevel = 2,
  showIdentityHeader = true,
  loading = false,
  onOpenPage,
  onOpenRelated,
  onDirtyChange,
  onCommitField,
  onRetry,
  fieldCommitsFrozen = false,
}: RecordViewerProps) {
  const t = useT()
  const titleId = useId()
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  const taskAnatomy = adapter.kind === 'task' && adapter.headerFields != null
  const [activeTab, setActiveTab] = useState<'details' | 'checklist' | 'activity'>('details')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const tabLabels = {
    details: t('tasks.record.tab.details'),
    checklist: t('tasks.checklistTitle'),
    activity: t('tasks.feed.activity'),
  }
  const selectTab = (tab: 'details' | 'checklist' | 'activity') => setActiveTab(tab)
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: 'details' | 'checklist' | 'activity') => {
    const tabs = ['details', 'checklist', 'activity'] as const
    const index = tabs.indexOf(tab)
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1
    if (nextIndex < 0) return
    event.preventDefault()
    const next = tabs[nextIndex]
    selectTab(next)
    tabRefs.current[nextIndex]?.focus()
  }

  const body = (() => {
    if (loading) {
      return <LoadingShell label={t('record.state.loading')} />
    }
    if (adapter.state === 'error') {
      return (
        <ErrorState
          message={adapter.errorMessage ?? t('record.field.saveError')}
          onRetry={onRetry}
          retryLabel={t('record.state.retry')}
        />
      )
    }
    if (adapter.state === 'empty') {
      return <EmptyState nested title={adapter.title} variant="blank" />
    }
    return (
      <RecordBody
        adapter={adapter}
        mode={mode}
        activeTab={taskAnatomy ? activeTab : undefined}
        onOpenRelated={onOpenRelated}
        onDirtyChange={onDirtyChange}
        onCommitField={onCommitField ?? (async () => noopCommit())}
        onOpenPage={onOpenPage}
        fieldCommitsFrozen={fieldCommitsFrozen}
      />
    )
  })()

  return (
    <section
      className={`record-viewer record-viewer--${mode}`}
      data-record-kind={adapter.kind}
      data-record-mode={mode}
      {...(showIdentityHeader && !taskAnatomy ? { 'aria-labelledby': titleId } : { 'aria-label': adapter.title })}
    >
      {taskAnatomy && adapter.headerFields && (
        <header className="record-viewer__pinned-header" data-record-header="pinned" data-viewer-region="identity">
          <div className="record-viewer__pinned-title">
            {adapter.headerFields.filter((field) => field.key === 'title').map((field) => (
              <RecordField
                key={field.key}
                spec={field}
                onCommit={(value) => (onCommitField ?? noopCommit)(field.key, value)}
                onDirtyChange={onDirtyChange}
                commitsFrozen={fieldCommitsFrozen}
                heading={field.key === 'title'}
              />
            ))}
          </div>
          <div className="record-viewer__pinned-status">
            {adapter.headerFields.filter((field) => field.key === 'status').map((field) => (
              <RecordField
                key={field.key}
                spec={field}
                onCommit={(value) => (onCommitField ?? noopCommit)(field.key, value)}
                onDirtyChange={onDirtyChange}
                commitsFrozen={fieldCommitsFrozen}
              />
            ))}
            <button type="button" className="record-viewer__activity-affordance" onClick={() => selectTab('activity')}>
              {tabLabels.activity}
            </button>
          </div>
        </header>
      )}
      {taskAnatomy && (
        <div className="record-viewer__tabs" role="tablist" aria-label={t('tasks.record.tabsAria')}>
          {(['details', 'checklist', 'activity'] as const).map((tab, index) => (
            <button key={tab} ref={(element) => { tabRefs.current[index] = element }} type="button" role="tab" id={`record-tab-${tab}`} aria-controls={`record-panel-${tab}`} aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1} className={activeTab === tab ? 'is-active' : ''} onClick={() => selectTab(tab)} onKeyDown={(event) => onTabKeyDown(event, tab)}>
              {tabLabels[tab]}
            </button>
          ))}
        </div>
      )}
      {showIdentityHeader && !taskAnatomy && (
        <header className="record-viewer__identity" data-viewer-region="identity">
          {adapter.eyebrow && <p className="record-viewer__eyebrow">{adapter.eyebrow}</p>}
          <p className="record-viewer__type">{adapter.typeLabel}</p>
          <Heading id={titleId} className="record-viewer__title">
            {adapter.title}
          </Heading>
        </header>
      )}
      {taskAnatomy ? (
        <div id={`record-panel-${activeTab}`} role="tabpanel" aria-labelledby={`record-tab-${activeTab}`} tabIndex={0}>
          {body}
        </div>
      ) : body}
    </section>
  )
}

function RecordBody({
  adapter,
  mode,
  activeTab,
  onOpenRelated,
  onDirtyChange,
  onCommitField,
  onOpenPage,
  fieldCommitsFrozen,
}: {
  adapter: RecordViewerAdapter
  mode: RecordViewerMode
  activeTab?: 'details' | 'checklist' | 'activity'
  onOpenRelated?: (relation: RecordRelation) => void
  onDirtyChange?: (dirty: boolean) => void
  onCommitField: (key: string, value: RecordValue) => Promise<void>
  onOpenPage?: () => void
  fieldCommitsFrozen?: boolean
}): ReactNode {
  const t = useT()
  const readOnly = adapter.permission.readOnly
  const allowed = new Set(adapter.permission.allowedActionIds)
  const visibleActions = adapter.actions.filter((a) => allowed.has(a.id))
  // SR-6: the "select a value to edit" hint is only honest when at least one field CAN be edited.
  // A Signal's Facts are all read-only even on a non-retracted (permission.readOnly=false) record,
  // so gating on !readOnly alone showed the hint on a record with nothing to edit. Gate on the
  // presence of a genuinely editable field — Task (editable fields) still shows it, Signal never does.
  const hasEditableField = adapter.metadata.some((section) => section.fields.some((f) => f.editable))
  const visibleSlots = activeTab === undefined
    ? adapter.contentSlots
    : activeTab === 'details'
      ? adapter.contentSlots.filter((slot) => slot.id !== 'checklist' && slot.id !== 'activity')
      : adapter.contentSlots.filter((slot) => slot.id === activeTab)

  return (
    <>
      {(activeTab === undefined || activeTab === 'details') && adapter.metadata.map((section) => (
        <section key={section.id} className="record-viewer__section" data-viewer-region="metadata" aria-label={section.label}>
          <RecordFieldList
            section={section}
            onCommitField={onCommitField}
            onDirtyChange={onDirtyChange}
            fieldCommitsFrozen={fieldCommitsFrozen}
          />
        </section>
      ))}

      {(activeTab === undefined || activeTab === 'details') && adapter.relations.length > 0 && (
        <section className="record-viewer__section" data-viewer-region="relations" aria-label="Related records">
          <ul className="record-viewer__relations">
            {adapter.relations.map((rel) => (
              <li key={rel.id}>
                {rel.href ? (
                  <a className="record-viewer__relation" href={rel.href}>
                    {rel.label}
                  </a>
                ) : (
                  <button type="button" className="record-viewer__relation" onClick={() => (rel.onOpen ?? (() => onOpenRelated?.(rel)))()}>
                    {rel.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {visibleSlots.map((slot) => (
        <section
          key={slot.id}
          className="record-viewer__section"
          data-viewer-region="content"
          data-content-slot={slot.id}
          aria-label={slot.label}
        >
          {slot.render({ mode, readOnly, onCommitField, onDirtyChange, fieldCommitsFrozen })}
        </section>
      ))}

      {activeTab === undefined && adapter.activity.length > 0 && (
        <section className="record-viewer__section" data-viewer-region="activity" aria-label="Activity">
          <ul className="record-viewer__activity">
            {adapter.activity.map((item) => (
              <li key={item.id} className="record-viewer__activity-item">
                <span>{item.label}</span>
                {item.detail && <span className="record-viewer__activity-detail"> — {item.detail}</span>}
                <time dateTime={item.occurredAt} className="record-viewer__activity-time">
                  {item.occurredAt}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeTab !== undefined && activeTab !== 'details' ? null : <footer className="record-viewer__section" data-viewer-region="actions">
        {readOnly && adapter.permission.reason && (
          <p className="record-viewer__permission-note" role="note">
            {adapter.permission.reason}
          </p>
        )}
        {(visibleActions.length > 0 || onOpenPage) && (
          <div className="record-viewer__actions">
            {visibleActions.map((action) => (
              <Button
                key={action.id}
                variant={ACTION_VARIANT[action.intent]}
                disabled={action.disabled}
                title={action.disabled ? action.disabledReason : undefined}
                onClick={() => {
                  // Central net: an adapter action whose run() rejects must never become an
                  // unhandled rejection — adapters own the visible error UX; this only reports.
                  void Promise.resolve(action.run()).catch((error) =>
                    reportError(error, { source: 'record-viewer.action', action: action.id }),
                  )
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
        {/* Quiet inline-edit hint (E7 table-footnote parity) — only when the record is editable,
            adapted to our fields' value-first grammar (activate the value, Enter saves, Esc discards). */}
        {!readOnly && hasEditableField && (
          <p className="record-viewer__edit-hint">{t('record.editHint')}</p>
        )}
      </footer>}
    </>
  )
}
