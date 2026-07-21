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
import { useId, type ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { LoadingShell, EmptyState, ErrorState } from '@/components/ui/state-kit'
import { RecordField } from './record-field'
import type {
  RecordAction,
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
   * A tenant whose surrounding chrome already owns the record name — e.g. the Task panel's
   * TaskDrawerHeader / identity row — passes false so there is no duplicate heading. The section
   * landmark stays accessible: when suppressed it is named by the adapter title via aria-label
   * instead of aria-labelledby (ViewerIdentitySuppressionContract / no-duplicate-h1).
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
}

const ACTION_VARIANT: Record<RecordAction['intent'], ButtonVariant> = {
  primary: 'primary',
  secondary: 'outline',
  danger: 'destructive',
}

const noopCommit = async () => {}

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
}: RecordViewerProps) {
  const t = useT()
  const titleId = useId()
  const Heading = headingLevel === 1 ? 'h1' : 'h2'

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
    return <RecordBody adapter={adapter} mode={mode} onOpenRelated={onOpenRelated} onDirtyChange={onDirtyChange} onCommitField={onCommitField ?? (async () => noopCommit())} onOpenPage={onOpenPage} />
  })()

  return (
    <section
      className={`record-viewer record-viewer--${mode}`}
      data-record-kind={adapter.kind}
      data-record-mode={mode}
      {...(showIdentityHeader ? { 'aria-labelledby': titleId } : { 'aria-label': adapter.title })}
    >
      {showIdentityHeader && (
        <header className="record-viewer__identity" data-viewer-region="identity">
          {adapter.eyebrow && <p className="record-viewer__eyebrow">{adapter.eyebrow}</p>}
          <p className="record-viewer__type">{adapter.typeLabel}</p>
          <Heading id={titleId} className="record-viewer__title">
            {adapter.title}
          </Heading>
        </header>
      )}
      {body}
    </section>
  )
}

function RecordBody({
  adapter,
  mode,
  onOpenRelated,
  onDirtyChange,
  onCommitField,
  onOpenPage,
}: {
  adapter: RecordViewerAdapter
  mode: RecordViewerMode
  onOpenRelated?: (relation: RecordRelation) => void
  onDirtyChange?: (dirty: boolean) => void
  onCommitField: (key: string, value: RecordValue) => Promise<void>
  onOpenPage?: () => void
}): ReactNode {
  const readOnly = adapter.permission.readOnly
  const allowed = new Set(adapter.permission.allowedActionIds)
  const visibleActions = adapter.actions.filter((a) => allowed.has(a.id))

  return (
    <>
      {adapter.metadata.map((section) => (
        <section key={section.id} className="record-viewer__section" data-viewer-region="metadata" aria-label={section.label}>
          <h3 className="record-viewer__section-title">{section.label}</h3>
          <div className="record-viewer__fields">
            {section.fields.map((field) => (
              <RecordField
                key={field.key}
                spec={field}
                onCommit={(value) => onCommitField(field.key, value)}
                onDirtyChange={onDirtyChange}
              />
            ))}
          </div>
        </section>
      ))}

      {adapter.relations.length > 0 && (
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

      {adapter.contentSlots.map((slot) => (
        <section key={slot.id} className="record-viewer__section" data-viewer-region="content" aria-label={slot.label}>
          {slot.render({ mode, readOnly })}
        </section>
      ))}

      {adapter.activity.length > 0 && (
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

      <footer className="record-viewer__section" data-viewer-region="actions">
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
                onClick={() => void action.run()}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </footer>
    </>
  )
}
