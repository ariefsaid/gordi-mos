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
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { reportError } from '@/lib/telemetry'
import { useMenuPopover } from '@/lib/use-menu-popover'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { LoadingShell, EmptyState, ErrorState } from '@/components/ui/state-kit'
import { RecordField } from './record-field'
import type {
  RecordAction,
  RecordFieldSpec,
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
  /** The record's canonical URL, copied by the pinned header ⋯ → "Copy link" (#751).
   *  Omitted (or clipboard unavailable) → the menu item does not render / the copy is a no-op. */
  canonicalHref?: string
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

/** The pinned header's ONE control row (#751 AC-031, tasks-redesign-B): status pill-dropdown ·
 *  the record's single primary lifecycle action · ⋯ overflow (Archive/Unarchive · Open full
 *  page · Copy link). It is the record's ONE actions register — the old footer action bar
 *  renders nothing. The ⋯ uses the shared useMenuPopover contract: focus enters the menu on
 *  open, Escape closes and returns focus to the trigger, menu keys navigate. */
function HeaderActions({
  adapter,
  statusField,
  onOpenPage,
  canonicalHref,
  onCommitField,
  onDirtyChange,
  fieldCommitsFrozen,
}: {
  adapter: RecordViewerAdapter
  statusField?: RecordFieldSpec
  onOpenPage?: () => void
  canonicalHref?: string
  onCommitField: (value: RecordValue) => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
  fieldCommitsFrozen: boolean
}): ReactNode {
  const t = useT()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const allowed = new Set(adapter.permission.allowedActionIds)
  const primaryActions = adapter.actions.filter((action) => action.intent === 'primary' && allowed.has(action.id))
  const overflowActions = adapter.actions.filter((action) => action.intent !== 'primary' && allowed.has(action.id))
  const hasMenu = overflowActions.length > 0 || Boolean(onOpenPage) || Boolean(canonicalHref)
  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])
  useMenuPopover(open, close, menuRef, triggerRef)
  // While the ⋯ menu is open it OWNS Escape: the first Escape closes the menu and nothing else.
  // The panel host closes the record from a bubble listener on the panel element, which sits
  // between the focused menuitem and document — so the claim has to be staked in the CAPTURE
  // phase at document, above every host listener, or one Escape closes menu and record together.
  useEffect(() => {
    if (!open) return
    const onCaptureKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    }
    document.addEventListener('keydown', onCaptureKeyDown, true)
    return () => document.removeEventListener('keydown', onCaptureKeyDown, true)
  }, [close, open])
  return (
    <div className="record-viewer__pinned-status record-viewer__actions">
      {statusField && (
        <RecordField
          spec={statusField}
          onCommit={onCommitField}
          onDirtyChange={onDirtyChange}
          commitsFrozen={fieldCommitsFrozen}
        />
      )}
      {primaryActions.map((primary) => (
        <Button
          key={primary.id}
          variant="primary"
          disabled={primary.disabled}
          title={primary.disabled ? primary.disabledReason : undefined}
          onClick={() => {
            void Promise.resolve(primary.run()).catch((error) =>
              reportError(error, { source: 'record-viewer.header-action', action: primary.id }),
            )
          }}
        >
          {primary.label}
        </Button>
      ))}
      {hasMenu && (
        <span className="record-viewer__overflow-wrap">
          <button
            ref={triggerRef}
            type="button"
            className="record-viewer__overflow"
            aria-label={t('record.moreActions')}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
          {open && (
            <div ref={menuRef} role="menu" aria-label={t('record.moreActions')} className="record-viewer__overflow-menu">
              {overflowActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className="record-viewer__overflow-item"
                  onClick={() => {
                    close()
                    void Promise.resolve(action.run()).catch((error) =>
                      reportError(error, { source: 'record-viewer.overflow-action', action: action.id }),
                    )
                  }}
                >
                  {action.label}
                </button>
              ))}
              {onOpenPage && (
                <button
                  type="button"
                  role="menuitem"
                  className="record-viewer__overflow-item"
                  onClick={() => { close(); onOpenPage() }}
                >
                  {t('record.openFullPage')}
                </button>
              )}
              {canonicalHref && (
                <button
                  type="button"
                  role="menuitem"
                  className="record-viewer__overflow-item"
                  onClick={() => {
                    close()
                    // Clipboard may be unavailable (permissions, non-secure context); the menu
                    // still closes — the copy is the affordance's one job, not a state to track.
                    void navigator.clipboard?.writeText(canonicalHref).catch(() => {})
                  }}
                >
                  {t('record.copyLink')}
                </button>
              )}
            </div>
          )}
        </span>
      )}
    </div>
  )
}

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
  canonicalHref,
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
  const counts = adapter.tabCounts
  const tabLabels = {
    // #751 AC-032: tabs carry counts — "Checklist 1/4" · "Activity 3" (mockup B). The count is
    // part of the accessible name, so a screen reader hears the tally, not a bare tab word.
    details: t('tasks.record.tab.details'),
    checklist: counts?.checklist
      ? `${t('tasks.checklistTitle')} ${counts.checklist.done}/${counts.checklist.total}`
      : t('tasks.checklistTitle'),
    activity: counts?.activity !== undefined
      ? `${t('tasks.feed.activity')} ${counts.activity}`
      : t('tasks.feed.activity'),
  }
  const selectTab = (tab: 'details' | 'checklist' | 'activity') => setActiveTab(tab)
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, tab: 'details' | 'checklist' | 'activity') => {
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
        taskAnatomy={taskAnatomy}
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
            {adapter.headerMeta && (
              // #751 AC-031 — the one-line meta: owning group · PIC · Supervisor · due · activity
              // age (adapter-built, locale-resolved).
              <p className="record-viewer__pinned-meta" data-record-meta="true">{adapter.headerMeta}</p>
            )}
          </div>
          <HeaderActions
            adapter={adapter}
            onOpenPage={onOpenPage}
            canonicalHref={canonicalHref}
            onCommitField={(value) => (onCommitField ?? noopCommit)('status', value)}
            onDirtyChange={onDirtyChange}
            fieldCommitsFrozen={fieldCommitsFrozen}
            statusField={adapter.headerFields.find((field) => field.key === 'status')}
          />
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
        <div id={`record-panel-${activeTab}`} role="tabpanel" aria-labelledby={`record-tab-${activeTab}`} tabIndex={0} className="record-viewer__body">
          {body}
        </div>
      ) : body}
    </section>
  )
}

function RecordBody({
  adapter,
  taskAnatomy,
  mode,
  activeTab,
  onOpenRelated,
  onDirtyChange,
  onCommitField,
  onOpenPage,
  fieldCommitsFrozen,
}: {
  adapter: RecordViewerAdapter
  taskAnatomy: boolean
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
  // #751 AC-031: a task record's actions register is the pinned header's control row, so the
  // old footer action bar renders NOTHING here (other kinds keep the footer register).
  const actionsInHeader = taskAnatomy
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
        {!actionsInHeader && (visibleActions.length > 0 || onOpenPage) && (
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
