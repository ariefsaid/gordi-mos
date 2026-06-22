// PlanQtyCell — the desktop inline-editable PLAN qty cell (OD-K-5 redesign §4.3).
// Mirrors QtyCell minus the Log-capture gates (no capError, no actionType — the page
// knows the action; the cell is qty-only). −/input/+; commits on blur/± → onSave(≥0).
// input role="spinbutton" min=0 + aria-label="Planned quantity for {dish}"; ± are real
// <button>s; "Saving…" inline (role=status). One-Blue focus ring only.
// Token-only (DESIGN.md); fresh .pqcell-* namespace (mirrors .qcell's look; qty-cell.css
// owns .qcell — C1 guard). Spacing in px (sibling kitchen idiom).

import { useState, useEffect } from 'react'
import './plan-qty-cell.css'

interface PlanQtyCellProps {
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

export function PlanQtyCell({ itemName, qty, saving, disabled, onSave }: PlanQtyCellProps) {
  const [draft, setDraft] = useState<number>(qty)
  // Keep the draft in sync when the committed qty changes (e.g. after a confirmed save
  // or when the action_type changes the visible qty).
  useEffect(() => { setDraft(qty) }, [qty])

  function commit(next: number) {
    const clamped = Math.max(0, next)
    setDraft(clamped)
    onSave(clamped)
  }

  return (
    <div className="pqcell">
      <div className="pqcell-stepper">
        <button
          type="button"
          aria-label={`Decrease ${itemName} planned quantity`}
          className="pqcell-btn"
          disabled={disabled || draft <= 0}
          onClick={() => commit(draft - 1)}
        >
          −
        </button>
        <input
          type="number"
          role="spinbutton"
          aria-label={`Planned quantity for ${itemName}`}
          className="pqcell-input"
          value={draft}
          min={0}
          step={1}
          disabled={disabled}
          onChange={e => {
            const v = parseInt(e.target.value, 10)
            setDraft(Number.isNaN(v) ? 0 : Math.max(0, v))
          }}
          onBlur={e => {
            // Read e.target.value directly so the save uses the current DOM value,
            // not a stale draft closure (mirrors the prior PlanRow onBlur rationale).
            const v = parseInt(e.target.value, 10)
            onSave(Number.isNaN(v) ? 0 : Math.max(0, v))
          }}
        />
        <button
          type="button"
          aria-label={`Increase ${itemName} planned quantity`}
          className="pqcell-btn"
          disabled={disabled}
          onClick={() => commit(draft + 1)}
        >
          +
        </button>
      </div>
      {saving && <span className="pqcell-saving" role="status" aria-live="polite">Saving…</span>}
    </div>
  )
}
