// RecordField — the ONE value-first field primitive for the RecordViewer document
// grammar (V3 record-document redesign, from the E7 record anatomy).
//
// A record READS AS A DOCUMENT, not a settings form. So an editable field renders its
// VALUE first — plain text, an entity chip (PIC/Supervisor/Team/relation), or a status
// pill — in a label-left / value-right row. The value is an activation target: click,
// Enter, or Space swaps IN the existing edit control (select / date / text) with a quiet
// edit affordance shown on hover / focus-visible. Commit or Escape returns to the value
// rendering. A read-only field renders value + provenance note with no affordance.
//
// The field owns ONLY the field-local draft/commit/activation lifecycle:
//   • Text-like controls (text, textarea, date) hold a draft: Enter and blur commit.
//     Escape on a focused editing field cancels the draft (restoring the saved baseline,
//     never committing) and RETURNS to the value rendering. It is isolated from the host's
//     close path via a NATIVE capture-phase listener (OD-REDESIGN-83.1 / NFR-V3-001): while
//     a field is in edit mode the FIRST Escape is consumed by the field (draft cancelled +
//     back to value view) and stopImmediatePropagation shields the host's native listener;
//     once the field is back in value mode there is no field listener, so the NEXT Escape
//     propagates to the host as the panel-close intent (and the host's retain/discard
//     leave-guard fires there if other uncommitted state remains).
//   • Option controls (select, status, person, team, relation) commit eagerly on change —
//     picking an option IS the commit intent (interaction-contract I5) — then return to the
//     value rendering.
//   • While a commit is in flight the field is aria-busy and announces "Saving…"; on success
//     it announces "Saved". On rejection it STAYS in edit mode, PRESERVES the draft, shows an
//     error, and exposes Retry (FieldErrorRetryContract) — the draft survives long enough to
//     retry or to be abandoned by a later panel-close.
//
// RecordField never owns an overlay, history, focus trap, or confirmation dialog —
// the containing tenant composes the Issue 4 host leave-guard from onDirtyChange.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import type { RecordFieldControl, RecordFieldSpec, RecordValue } from './record-viewer.types'
import './record-viewer.css'

export interface RecordFieldProps {
  spec: RecordFieldSpec
  onCommit: (value: RecordValue) => Promise<void>
  onCancel?: () => void
  onDirtyChange?: (dirty: boolean) => void
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const OPTION_CONTROLS: ReadonlySet<RecordFieldControl> = new Set([
  'select',
  'status',
  'person',
  'team',
  'relation',
])

// Controls whose VALUE reads as an entity chip in the document (a person, a team, a
// linked record). Status renders as its own interactive pill; everything else is prose.
const CHIP_CONTROLS: ReadonlySet<RecordFieldControl> = new Set(['person', 'team', 'relation'])

function toInputValue(value: RecordValue): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function RecordField({ spec, onCommit, onCancel, onDirtyChange }: RecordFieldProps) {
  const t = useT()
  const labelId = useId()
  const controlId = useId()
  const [saved, setSaved] = useState<RecordValue>(spec.value)
  const [draft, setDraft] = useState<string>(toInputValue(spec.value))
  const [status, setStatus] = useState<SaveStatus>('idle')
  // Value-first: a field starts in VALUE mode and swaps to EDIT mode on activation.
  const [editing, setEditing] = useState(false)
  const savedRef = useRef<RecordValue>(spec.value)
  savedRef.current = saved
  // Synchronous draft mirror read by the native Escape-isolation listener.
  const draftRef = useRef(draft)
  draftRef.current = draft

  const editButtonRef = useRef<HTMLButtonElement | null>(null)
  // When an edit session ends via the keyboard (Enter/Escape), focus returns to the value
  // activation control so keyboard users keep their place (focus-return contract).
  const returnFocusRef = useRef(false)
  // Synchronous mirrors so the upstream-sync effect can read the CURRENT edit state without
  // adding them to its dependency list (it must run on spec.value changes only).
  const editingRef = useRef(editing)
  editingRef.current = editing
  const statusRef = useRef(status)
  statusRef.current = status

  // Adopt an upstream value ONLY when the field is at rest. During an active edit, an in-flight
  // save, or a preserved-after-error draft, the field owns its own draft and must NOT be
  // clobbered — the live TaskSurface churns spec.value optimistically on every write (and rolls
  // it back on a rejected one), which would otherwise reset the draft and drop the error/Retry.
  useEffect(() => {
    if (editingRef.current || statusRef.current === 'saving' || statusRef.current === 'error') return
    setSaved(spec.value)
    setDraft(toInputValue(spec.value))
    setStatus('idle')
  }, [spec.value])

  // Return focus to the value activation control after a keyboard-driven exit from edit mode.
  useEffect(() => {
    if (!editing && returnFocusRef.current) {
      returnFocusRef.current = false
      editButtonRef.current?.focus()
    }
  }, [editing])

  function reportDirty(nextDraft: string) {
    onDirtyChange?.(nextDraft !== toInputValue(savedRef.current))
  }

  function beginEdit() {
    setStatus('idle')
    setEditing(true)
  }

  async function commit(next: RecordValue, viaKeyboard = false) {
    if (next === saved) {
      setStatus('idle')
      returnFocusRef.current = viaKeyboard
      setEditing(false)
      return
    }
    setStatus('saving')
    try {
      await onCommit(next)
      setSaved(next)
      setStatus('saved')
      onDirtyChange?.(false)
      // Success returns to the value rendering (the document view).
      returnFocusRef.current = viaKeyboard
      setEditing(false)
    } catch {
      // STAY in edit mode and surface the error. For a text-like control the draft is PRESERVED
      // so the user retries the same edit (FieldErrorRetryContract). For an option control
      // re-picking IS the retry, so revert the visible selection to the saved baseline (matching
      // the tenant's optimistic rollback) rather than leaving the failed choice selected.
      if (OPTION_CONTROLS.has(spec.control)) setDraft(toInputValue(saved))
      setStatus('error')
    }
  }

  function cancel() {
    setDraft(toInputValue(saved))
    setStatus('idle')
    onDirtyChange?.(false)
    // Escape returns to the value rendering; focus goes back to the value control.
    returnFocusRef.current = true
    setEditing(false)
    onCancel?.()
  }

  // NATIVE capture-phase Escape isolation (OD-REDESIGN-83.1 / NFR-V3-001).
  // RecordPanelHost attaches its Escape listener via a NATIVE addEventListener on the panel
  // (≥1100px split regime) or document (<1100px modal regime). That native listener fires in
  // the BUBBLE phase BEFORE React's synthetic delegate reaches this field, so a React-level
  // `onKeyDown` + `e.stopPropagation()` cannot shield it. To isolate the field's edit session
  // we attach a NATIVE CAPTURE listener to the field's own input while it is in edit mode:
  // Escape cancels the draft, returns to the value rendering, and `stopImmediatePropagation`
  // so the host's bubble listener never sees the keystroke (the field consumes the FIRST
  // Escape). Once the field is back in value mode this listener is gone, so the NEXT Escape
  // propagates to the host as the panel-close intent. Deputy, when layered above a record on
  // phone, attaches its own document CAPTURE listener (escapeCapture) that fires even earlier,
  // so one Escape still closes Deputy first — this change neither swallows nor reorders that.
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel
  const escapeCleanupRef = useRef<(() => void) | null>(null)
  const attachFieldEscapeIsolation = useCallback(
    (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      escapeCleanupRef.current?.()
      escapeCleanupRef.current = null
      if (!el) return
      // Widen to HTMLElement so TS resolves the typed 'keydown' overload (the input/textarea
      // union otherwise falls back to the untyped EventListener signature).
      const target: HTMLElement = el
      const onCaptureKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopImmediatePropagation()
        cancelRef.current()
      }
      target.addEventListener('keydown', onCaptureKeyDown, true)
      escapeCleanupRef.current = () => target.removeEventListener('keydown', onCaptureKeyDown, true)
    },
    [],
  )

  const isOption = OPTION_CONTROLS.has(spec.control)

  // ── Read-only: value + provenance note, no affordance ──────────────────────────────────
  if (!spec.editable) {
    const reason = spec.readOnlyReason ?? t('record.field.readOnlyReasonFallback')
    return (
      <div
        className="record-field record-field--readonly"
        data-field-key={spec.key}
        data-editable="false"
        data-mode="view"
      >
        <span className="record-field__label" id={labelId}>
          {spec.label}
        </span>
        <div className="record-field__value-cell">
          <div className="record-field__value" aria-labelledby={labelId}>
            {renderValueNode(spec)}
          </div>
          {reason && <p className="record-field__reason">{reason}</p>}
        </div>
      </div>
    )
  }

  const busy = status === 'saving'
  const feedback = renderFeedback(status, t, () => void commit(draft, false))

  // ── Value mode: the document view — value + quiet edit affordance ───────────────────────
  if (!editing) {
    return (
      <div
        className="record-field"
        data-field-key={spec.key}
        data-editable="true"
        data-mode="view"
        data-status={status}
      >
        <span className="record-field__label" id={labelId}>
          {spec.label}
          {spec.required ? <span aria-hidden="true"> *</span> : null}
        </span>
        <div className="record-field__value-cell">
          <button
            type="button"
            ref={editButtonRef}
            className={`record-field__edit record-field__edit--${spec.control}`}
            data-field-edit={spec.key}
            aria-label={t('record.field.edit', { label: spec.label })}
            aria-describedby={labelId}
            onClick={beginEdit}
          >
            <span className="record-field__value">{renderValueNode(spec)}</span>
            <span className="record-field__edit-affordance" aria-hidden="true">
              {PENCIL}
            </span>
          </button>
          {feedback}
        </div>
      </div>
    )
  }

  // ── Edit mode: the existing control, focused; commit/Escape return to the value view ─────
  return (
    <div className="record-field" data-field-key={spec.key} data-editable="true" data-mode="edit" data-status={status}>
      <label className="record-field__label" id={labelId} htmlFor={controlId}>
        {spec.label}
        {spec.required ? <span aria-hidden="true"> *</span> : null}
      </label>

      <div className="record-field__value-cell">
        {isOption ? (
          <Select
            id={controlId}
            className="record-field__select"
            fullWidth
            autoFocus
            value={draft}
            disabled={busy}
            aria-busy={busy || undefined}
            aria-required={spec.required || undefined}
            onChange={(e) => {
              const next = e.target.value
              setDraft(next)
              void commit(next, false)
            }}
            onBlur={() => {
              // Dismissing the picker without a change returns to the value rendering.
              if (draftRef.current === toInputValue(savedRef.current)) setEditing(false)
            }}
          >
            {(spec.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        ) : spec.control === 'textarea' ? (
          <textarea
            id={controlId}
            ref={attachFieldEscapeIsolation}
            autoFocus
            className="record-field__control record-field__control--textarea"
            value={draft}
            disabled={busy}
            aria-busy={busy || undefined}
            aria-required={spec.required || undefined}
            onChange={(e) => {
              setDraft(e.target.value)
              reportDirty(e.target.value)
            }}
            onBlur={() => void commit(draft, false)}
          />
        ) : (
          <input
            id={controlId}
            ref={attachFieldEscapeIsolation}
            autoFocus
            type={spec.control === 'date' ? 'date' : 'text'}
            className="record-field__control record-field__control--text"
            value={draft}
            disabled={busy}
            aria-busy={busy || undefined}
            aria-required={spec.required || undefined}
            onChange={(e) => {
              setDraft(e.target.value)
              reportDirty(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void commit(draft, true)
              }
              // Escape isolation is owned by the native capture listener attached via
              // `attachFieldEscapeIsolation` above — React's synthetic onKeyDown fires too late
              // to shield the host's native listener, so Escape is intentionally NOT handled here.
            }}
            onBlur={() => void commit(draft, false)}
          />
        )}

        {feedback}
      </div>
    </div>
  )
}

// The quiet edit affordance — a pencil glyph revealed on hover / focus-visible (token-styled).
const PENCIL: ReactNode = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

/** Render a field's value as the document view: status pill · entity chip · prose. */
function renderValueNode(spec: RecordFieldSpec): ReactNode {
  const empty = spec.value === null || spec.value === undefined || spec.displayValue === ''
  if (spec.control === 'status') {
    // A token-themed pill (records/ stays decoupled from the Task-typed StatusPill); the
    // data-status attribute drives the semantic hue in record-viewer.css.
    return (
      <span className="record-field__pill" data-status={spec.displayValue}>
        <span className="record-field__pill-dot" aria-hidden="true" />
        {spec.displayValue}
      </span>
    )
  }
  if (CHIP_CONTROLS.has(spec.control) && !empty) {
    return <span className="record-field__chip">{spec.displayValue}</span>
  }
  return <>{spec.displayValue}</>
}

function renderFeedback(
  status: SaveStatus,
  t: ReturnType<typeof useT>,
  onRetry: () => void,
): ReactNode {
  return (
    <div className="record-field__feedback">
      {status === 'saving' && (
        <span className="record-field__status" role="status">
          {t('record.field.saving')}
        </span>
      )}
      {status === 'saved' && (
        <span className="record-field__status record-field__status--ok" role="status">
          {t('record.field.saved')}
        </span>
      )}
      {status === 'error' && (
        <span className="record-field__error" role="alert">
          {t('record.field.saveError')}
          <Button variant="outline" className="record-field__retry" onClick={onRetry}>
            {t('record.field.retry')}
          </Button>
        </span>
      )}
    </div>
  )
}
