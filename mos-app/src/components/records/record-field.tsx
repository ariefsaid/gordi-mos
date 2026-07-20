// RecordField — the ONE editable/read-only field primitive for the RecordViewer
// grammar (V3 Issue 5, docs/plans/2026-07-20-v3-record-viewer.md Task 2).
//
// It renders a single RecordFieldSpec and owns ONLY the field-local draft/commit
// lifecycle:
//   • Text-like controls (text, textarea, date) hold a draft: Enter and blur commit,
//     Escape restores the saved baseline (never commits) and stops the Escape from
//     reaching any host leave-guard listener (NFR-V3-001 — the field draft is
//     cancelled first, in isolation).
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
import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
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
        <select
          id={controlId}
          className="record-field__control record-field__control--select"
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
        </select>
      ) : spec.control === 'textarea' ? (
        <textarea
          id={controlId}
          className="record-field__control record-field__control--textarea"
          value={draft}
          disabled={busy}
          aria-busy={busy || undefined}
          aria-required={spec.required || undefined}
          onChange={(e) => {
            setDraft(e.target.value)
            reportDirty(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              cancel()
            }
          }}
          onBlur={() => void commit(draft)}
        />
      ) : (
        <input
          id={controlId}
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
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              cancel()
            }
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
