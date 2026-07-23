// PlanQtyStepper — the phone plan-qty stepper (OD-K-5 redesign §4.2 PE-4).
// 44px −/input/+, "Saving…" inline. Mirrors PlanQtyCell's contract, phone-laid-out
// (full-opacity 44px touch targets, not the desktop compact stepper). Lifted from the
// prior inline PlanRow. role="spinbutton" min=0 + aria-label; ± are real <button>s.
// Token-only (DESIGN.md); fresh .kps-* namespace. Spacing in px (sibling idiom).
//
// I5 inline-edit (OD-REDESIGN-22 / docs/interaction-contract.md, item 13): routed
// through the one primitive (useInlineCommit) — same as its desktop sibling PlanQtyCell —
// so phone gains Enter/Tab/blur COMMIT + Escape DISCARDS-and-restores, and an unchanged
// blur is a no-op (no needless upsert). Previously it hand-rolled useState/useEffect and
// fired onSave on every blur, with no Escape path — the one plan control off the contract.

import { useInlineCommit } from '@/components/ui/use-inline-commit'
import './plan-qty-stepper.css'

interface PlanQtyStepperProps {
  itemName: string
  /** current committed plan qty for (item, action) */
  qty: number
  /** per-cell save in flight */
  saving: boolean
  /** transient (≈1.5s) just-committed signal — shows a ✓ Saved tick at this cell */
  justSaved?: boolean
  /** offline */
  disabled: boolean
  /** commit (clamped ≥ 0) → upsertKitchenPlan at the page */
  onSave: (next: number) => void
}

export function PlanQtyStepper({ itemName, qty, saving, justSaved = false, disabled, onSave }: PlanQtyStepperProps) {
  const { draft, setDraft, commit, onKeyDown, onBlur } = useInlineCommit<number>({
    value: qty,
    onCommit: onSave,
    disabled,
  })

  return (
    <div className="kps">
      <button
        type="button"
        aria-label={`Decrease ${itemName} planned quantity`}
        className="kps-step"
        data-touch-target="true"
        disabled={disabled || draft <= 0}
        onClick={() => commit(Math.max(0, draft - 1))}
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
        onKeyDown={onKeyDown}
        onBlur={onBlur}
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
      {!saving && justSaved && (
        <span className="kps-saved" role="status" aria-live="polite">
          <span className="kps-saved-tick" aria-hidden="true">✓</span> Saved
        </span>
      )}
    </div>
  )
}
