// PlanQtyStepper — the phone plan-qty stepper (OD-K-5 redesign §4.2 PE-4).
// 44px −/input/+, "Saving…" inline. Mirrors PlanQtyCell's contract, phone-laid-out
// (full-opacity 44px touch targets, not the desktop compact stepper). Lifted from the
// prior inline PlanRow. role="spinbutton" min=0 + aria-label; ± are real <button>s.
// Token-only (DESIGN.md); fresh .kps-* namespace. Spacing in px (sibling idiom).

import { useState, useEffect } from 'react'
import './plan-qty-stepper.css'

interface PlanQtyStepperProps {
  itemName: string
  /** current committed plan qty for (item, action) */
  qty: number
  /** per-cell save in flight */
  saving: boolean
  /** offline */
  disabled: boolean
  /** commit (clamped ≥ 0) → upsertKitchenPlan at the page */
  onSave: (next: number) => void
}

export function PlanQtyStepper({ itemName, qty, saving, disabled, onSave }: PlanQtyStepperProps) {
  const [draft, setDraft] = useState<number>(qty)
  useEffect(() => { setDraft(qty) }, [qty])

  function commit(next: number) {
    const clamped = Math.max(0, next)
    setDraft(clamped)
    onSave(clamped)
  }

  return (
    <div className="kps">
      <button
        type="button"
        aria-label={`Decrease ${itemName} planned quantity`}
        className="kps-step"
        data-touch-target="true"
        disabled={disabled || draft <= 0}
        onClick={() => commit(draft - 1)}
      >
        −
      </button>
      <input
        type="number"
        role="spinbutton"
        aria-label={`Planned quantity for ${itemName}`}
        className="kps-qty tabular"
        value={draft}
        min={0}
        step={1}
        disabled={disabled}
        onChange={e => {
          const v = parseInt(e.target.value, 10)
          setDraft(Number.isNaN(v) ? 0 : Math.max(0, v))
        }}
        onBlur={e => {
          const v = parseInt(e.target.value, 10)
          onSave(Number.isNaN(v) ? 0 : Math.max(0, v))
        }}
      />
      <button
        type="button"
        aria-label={`Increase ${itemName} planned quantity`}
        className="kps-step"
        data-touch-target="true"
        disabled={disabled}
        onClick={() => commit(draft + 1)}
      >
        +
      </button>
      {saving && <span className="kps-saving" role="status" aria-live="polite">Saving…</span>}
    </div>
  )
}
