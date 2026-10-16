// PlanQtyField — the ONE typed plan-qty control (DD-5): one right-aligned numeric box with the unit beside it, placed
// by the capture row's box and unit tracks (capture-row.css). `inputmode="decimal"`, `enterkeyhint="next"`, 16px type.
//
// On Plan the field IS the saved plan, so it shows `value` when > 0 and a greyed "0" otherwise: an unplanned dish reads
// as blank instead of a column of hard black zeros, and a committed figure is never greyed out as if unset.
//
// Inline edit (useInlineCommit): Enter/Tab/blur COMMIT, Escape DISCARDS and restores the saved qty, an unchanged blur is
// a no-op. Commit state (Saving… / ✓ Saved) is the page's `status`, shown under the unit so the row does not reflow.

import { useRef, useState, type ReactNode } from 'react'
import { QuantityField } from '@/components/ui/quantity-field'
import { useInlineCommit } from '@/components/ui/use-inline-commit'
import { useT } from '@/i18n/use-t'
import './plan-qty-field.css'

interface PlanQtyFieldProps {
  itemName: string
  /** current committed plan qty for (item, movement) */
  qty: number
  /** offline / no resolved stream */
  disabled: boolean
  /** commit (≥ 0) → upsertKitchenPlan at the page */
  onSave: (next: number) => void
  /** Commit state (Saving… / ✓ Saved) the page has to say; rendered under the unit. */
  status?: ReactNode
  /** The unit the plan quantity is in: the item's default ESB unit; omitted means porsi, null none. */
  unitName?: string | null
}

export function PlanQtyField({ itemName, qty, disabled, onSave, status, unitName }: PlanQtyFieldProps) {
  const t = useT()
  const { draft, setDraft, pending, onKeyDown, onBlur } = useInlineCommit<number>({
    value: qty,
    onCommit: onSave,
    disabled,
  })
  const invalidRef = useRef(false)
  const [resetKey, setResetKey] = useState(0)

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      invalidRef.current = false
      setResetKey(key => key + 1)
      onKeyDown(event)
      return
    }
    if (event.key === 'Enter' && invalidRef.current) {
      event.preventDefault()
      return
    }
    onKeyDown(event)
  }

  return (
    <div className="pqf">
      <QuantityField
        label={t('kitchen.qty.plannedAria', { item: itemName })}
        className="pqf-qty"
        value={draft}
        onChange={setDraft}
        onValidityChange={valid => { invalidRef.current = !valid }}
        onKeyDown={handleKeyDown}
        onBlur={valid => { if (valid) onBlur() }}
        resetKey={resetKey}
        integerOnly
        min={0}
        maxFractionDigits={0}
        placeholder="0"
        enterKeyHint="next"
        dataEscapeLayer="nested"
        disabled={disabled || pending}
        busy={pending}
        touchTarget
        suffix={unitName !== null || status ? <>{unitName !== null && <span className="pqf-unit">{unitName ?? t('kitchen.unit.porsi')}</span>}{status}</> : undefined}
        suffixPosition="inline"
      />
    </div>
  )
}
