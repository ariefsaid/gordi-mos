import { useEffect, useId, useRef, type RefObject } from 'react'
import { ModalShell } from '@/components/ui/modal-shell'
import { Button } from '@/components/ui/button'
import { CafeReceiptLineRow } from '@/components/kitchen/cafe-receipt-difference'
import { useT } from '@/i18n/use-t'
import './cafe-receipt.css'
import './cafe-receive-lock-confirm.css'

export type CafeReceiveLockLine = { unitId: string; name: string; quantity: string; unit: string; damagedWrong?: boolean }

type Props = {
  open: boolean
  lines: readonly CafeReceiveLockLine[]
  /** Stream and arrival date, both locked with the counts. */
  context: string
  busy: boolean
  offline: boolean
  /** Translated submit error; shown inside the step so it stays open for a retry. */
  error: string | null
  /** False when another Lock counts can only fail the same way; the step then offers only Back to edit. */
  canRetry: boolean
  /** Where focus returns on Back to edit when the opener did not hold focus. */
  returnFocusRef: RefObject<HTMLElement | null>
  onConfirm: () => void
  onCancel: () => void
}

/** The step between Lock counts and the irreversible Count submit: every line, then lock or go back. */
export function CafeReceiveLockConfirm({
  open, lines, context, busy, offline, error, canRetry, returnFocusRef, onConfirm, onCancel,
}: Props) {
  const t = useT()
  const titleId = useId()
  const descriptionId = useId()
  const backRef = useRef<HTMLButtonElement>(null)
  // Lock counts leaves the step when a retry cannot succeed; focus moves to the one way out.
  useEffect(() => { if (open && !canRetry) backRef.current?.focus() }, [open, canRetry])

  return (
    <ModalShell
      open={open}
      onClose={() => { if (!busy) onCancel() }}
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      closeOnEscape={!busy}
      phoneMode="fullscreen"
      initialFocusRef={backRef}
      returnFocusRef={returnFocusRef}
      className="cafe-lock-confirm__surface"
    >
      <div className="cafe-lock-confirm">
        <header className="cafe-lock-confirm__head">
          <h2 id={titleId} className="cafe-lock-confirm__title">
            {t(lines.length === 1 ? 'cafe.receive.confirm.title.one' : 'cafe.receive.confirm.title.other', { count: lines.length })}
          </h2>
          <p className="cafe-lock-confirm__context">{context}</p>
          <p id={descriptionId} className="cafe-lock-confirm__warning">{t('cafe.receive.confirm.copy')}</p>
        </header>
        <ul className="cafe-receipt-lines cafe-lock-confirm__lines" aria-label={t('cafe.receive.confirm.linesAria')} tabIndex={0}>
          {lines.map(line => (
            <CafeReceiptLineRow key={line.unitId} name={line.name} quantity={line.quantity} unit={line.unit} withDifference={false}>
              {line.damagedWrong && <span className="cafe-lock-confirm__condition">{t('cafe.receive.damageFlag')}</span>}
            </CafeReceiptLineRow>
          ))}
        </ul>
        <footer className="cafe-lock-confirm__foot">
          {offline && <p className="cafe-count__field-error" role="alert">{t('cafe.receive.offline')}</p>}
          {error && <p className="cafe-count__field-error" role="alert">{error}</p>}
          <div className="cafe-lock-confirm__actions">
            <Button ref={backRef} variant="outline" className="cafe-lock-confirm__action" disabled={busy} onClick={onCancel}>
              {t('cafe.receive.confirm.back')}
            </Button>
            {/* aria-disabled, not disabled, while locking: focus stays on the button for a retry. */}
            {canRetry && <Button
              variant="primary"
              className="cafe-lock-confirm__action"
              aria-disabled={busy || undefined}
              disabled={offline}
              onClick={() => { if (!busy) onConfirm() }}
            >
              {busy ? t('cafe.receive.confirm.locking') : t('cafe.receive.countSubmit')}
            </Button>}
          </div>
        </footer>
      </div>
    </ModalShell>
  )
}
