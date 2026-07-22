// RecordField — the ONE editable/read-only field primitive for the RecordViewer
// grammar (V3 Issue 5, docs/plans/2026-07-20-v3-record-viewer.md Task 2).
//
// It renders a single RecordFieldSpec and owns ONLY the field-local draft/commit
// lifecycle:
//   • Text-like controls (text, textarea, date) hold a draft: Enter and blur commit.
//     The FIRST Escape on a focused dirty field cancels ONLY that draft (restoring the
//     saved baseline, never committing) and is isolated from the host's close path via a
//     NATIVE capture-phase listener (OD-REDESIGN-83.1 / NFR-V3-001). A second Escape, once
//     the field draft is clean, propagates to the host as the panel-close intent — and if
//     the record still has other uncommitted dirty state, the host's retain/discard
//     leave-guard fires there.
//   • Option controls (select, status, person, team, relation) commit eagerly on
//     change — picking an option IS the commit intent (interaction-contract I5).
//   • While a commit is in flight the field is aria-busy and announces "Saving…";
//     on success it announces "Saved". On rejection it PRESERVES the draft, shows an
//     error, and exposes Retry (FieldErrorRetryContract — deliberately distinct from
//     useInlineCommit's rollback; see the plan's Task 2 contract + the RATIFY note).
//   • A read-only spec renders the value and the honest reason with no enabled editor.
//
// RecordField never owns an overlay, history, focus trap, or confirmation dialog —
// the containing tenant composes the Issue 4 host leave-guard from onDirtyChange.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
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
  const savedRef = useRef<RecordValue>(spec.value)
  savedRef.current = saved
  // Synchronous draft mirror read by the native Escape-isolation listener.
  const draftRef = useRef(draft)
  draftRef.current = draft

  // Track upstream commits: when the adapter re-supplies a new saved value, adopt it
  // as the baseline unless the user is mid-edit (draft differs from the old baseline).
  useEffect(() => {
    setSaved(spec.value)
    setDraft(toInputValue(spec.value))
    setStatus('idle')
  }, [spec.value])

  function reportDirty(nextDraft: string) {
    onDirtyChange?.(nextDraft !== toInputValue(savedRef.current))
  }

  async function commit(next: RecordValue) {
    if (next === saved) {
      setStatus('idle')
      return
    }
    setStatus('saving')
    try {
      await onCommit(next)
      setSaved(next)
      setStatus('saved')
      onDirtyChange?.(false)
    } catch {
      // Preserve the draft; the user retries the same edit (FieldErrorRetryContract).
      setStatus('error')
    }
  }

  function cancel() {
    setDraft(toInputValue(saved))
    setStatus('idle')
    onDirtyChange?.(false)
    onCancel?.()
  }

  // NATIVE capture-phase Escape isolation (OD-REDESIGN-83.1 / NFR-V3-001).
  // RecordPanelHost attaches its Escape listener via a NATIVE addEventListener on the
  // panel (≥1100px split regime) or document (<1100px modal regime). That native listener
  // fires in the BUBBLE phase BEFORE React's synthetic delegate reaches this field, so a
  // React-level `onKeyDown` + `e.stopPropagation()` cannot shield it — one keystroke used to
  // discard the field draft AND open the host's retain/discard dialog at once. To isolate
  // the field draft we attach a NATIVE CAPTURE listener to the field's own input: when
  // Escape lands on a focused field whose draft is still dirty, cancel ONLY that draft and
  // `stopImmediatePropagation` so the host's bubble listener never sees the keystroke (the
  // FIRST Escape isolates). When the draft is clean the listener yields, so the very next
  // Escape propagates to the host as the panel-close intent (SECOND Escape / clean record).
  // Deputy, when layered above a record on phone, attaches its own document CAPTURE listener
  // (escapeCapture) that fires even earlier in the capture chain, so one Escape still closes
  // Deputy first — this change neither swallows nor reorders that.
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel
  const escapeCleanupRef = useRef<(() => void) | null>(null)
  const attachFieldEscapeIsolation = useCallback(
    (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      escapeCleanupRef.current?.()
      escapeCleanupRef.current = null
      if (!el) return
      const onCaptureKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return
        // Clean draft → this Escape is the host's close intent; let it propagate.
        if (toInputValue(savedRef.current) === draftRef.current) return
        e.preventDefault()
        e.stopImmediatePropagation()
        cancelRef.current()
      }
      el.addEventListener('keydown', onCaptureKeyDown, true)
      escapeCleanupRef.current = () => el.removeEventListener('keydown', onCaptureKeyDown, true)
    },
    [],
  )

  const isOption = OPTION_CONTROLS.has(spec.control)

  if (!spec.editable) {
    const reason = spec.readOnlyReason ?? t('record.field.readOnlyReasonFallback')
    return (
      <div
        className="record-field record-field--readonly"
        data-field-key={spec.key}
        data-editable="false"
      >
        <span className="record-field__label" id={labelId}>
          {spec.label}
        </span>
        <p className="record-field__value" aria-labelledby={labelId}>
          {spec.displayValue}
        </p>
        <p className="record-field__reason">{reason}</p>
      </div>
    )
  }

  const busy = status === 'saving'

  return (
    <div className="record-field" data-field-key={spec.key} data-editable="true" data-status={status}>
      <label className="record-field__label" id={labelId} htmlFor={controlId}>
        {spec.label}
        {spec.required ? <span aria-hidden="true"> *</span> : null}
      </label>

      {isOption ? (
        <Select
          id={controlId}
          className="record-field__select"
          fullWidth
          value={draft}
          disabled={busy}
          aria-busy={busy || undefined}
          aria-required={spec.required || undefined}
          onChange={(e) => {
            const next = e.target.value
            setDraft(next)
            void commit(next)
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
          className="record-field__control record-field__control--textarea"
          value={draft}
          disabled={busy}
          aria-busy={busy || undefined}
          aria-required={spec.required || undefined}
          onChange={(e) => {
            setDraft(e.target.value)
            reportDirty(e.target.value)
          }}
          onBlur={() => void commit(draft)}
        />
      ) : (
        <input
          id={controlId}
          ref={attachFieldEscapeIsolation}
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
              void commit(draft)
            }
            // Escape isolation is owned by the native capture listener attached via
            // `attachFieldEscapeIsolation` above — React's synthetic onKeyDown fires too
            // late to shield the host's native listener, so Escape is intentionally NOT
            // handled here (first Escape cancels the draft in isolation; a second Escape
            // on the now-clean field propagates to the host close path).
          }}
          onBlur={() => void commit(draft)}
        />
      )}

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
            <Button
              variant="outline"
              className="record-field__retry"
              onClick={() => void commit(draft)}
            >
              {t('record.field.retry')}
            </Button>
          </span>
        )}
      </div>
    </div>
  )
}
