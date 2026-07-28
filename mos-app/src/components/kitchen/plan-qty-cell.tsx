// PlanQtyCell — the desktop inline-editable PLAN qty cell (OD-K-5 redesign §4.3).
//
// SUPERSEDED (v4, DD-5 desktop-qty port, 2026-07-28): kitchen-plan-page.tsx no longer wires
// this component to the desktop "Plan" cell — it renders PlanQtyField(dense) directly,
// the same typed field as the phone card, not this −/+ stepper (the owner killed
// increment-to-plan; see plan-qty-field.tsx's own header). Left in place, UNMODIFIED,
// because its test suite (plan-qty-cell.test.tsx) is out of scope for this pass (the
// owner has deferred test work) — deleting the component without touching its test would
// break the import, which is worse than an accurate, intact, unused file. Do not wire
// this back up without also retiring plan-qty-cell.test.tsx's −/+ assertions.
//
// Mirrors QtyCell minus the Log-capture gates (no capError, no actionType — the page
// knows the action; the cell is qty-only). −/input/+; commits on Enter/Tab/blur/± → onSave(≥0).
// input role="spinbutton" min=0 + aria-label="Planned quantity for {dish}"; ± are real
// <button>s; "Saving…" inline (role=status). One-Blue focus ring only.
// Token-only (DESIGN.md); fresh .pqcell-* namespace (mirrors .qcell's look; qty-cell.css
// owns .qcell — C1 guard). Spacing in px (sibling kitchen idiom).
//
// I5 inline-edit (OD-REDESIGN-22 / docs/interaction-contract.md): routed through the one
// primitive (useInlineCommit) — Enter/Tab/blur COMMIT the draft; Escape DISCARDS and
// restores the saved qty. The `saving` prop drives the visible in-flight state (parent-
// owned optimistic save); `disabled` is offline. + / − commit the stepped draft (≥ 0).

import { useInlineCommit } from '@/components/ui/use-inline-commit'
import { useT } from '@/i18n/use-t'
import './plan-qty-cell.css'

interface PlanQtyCellProps {
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

export function PlanQtyCell({ itemName, qty, saving, justSaved = false, disabled, onSave }: PlanQtyCellProps) {
  const t = useT()
  const { draft, setDraft, commit, onKeyDown, onBlur } = useInlineCommit<number>({
    value: qty,
    onCommit: onSave,
    disabled,
  })

  return (
    <div className="pqcell">
      <div className="pqcell-stepper">
        <button
          type="button"
          aria-label={`Decrease ${itemName} planned quantity`}
          className="pqcell-btn"
          disabled={disabled || draft <= 0}
          onClick={() => commit(Math.max(0, draft - 1))}
        >
          −
        </button>
        <input
          type="number"
          role="spinbutton"
          aria-label={t('kitchen.qty.plannedAria', { dish: itemName })}
          className="pqcell-input"
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
          className="pqcell-btn"
          disabled={disabled}
          onClick={() => commit(draft + 1)}
        >
          +
        </button>
      </div>
      {saving && <span className="pqcell-saving" role="status" aria-live="polite">{t('kitchen.plan.saving')}</span>}
      {!saving && justSaved && (
        <span className="pqcell-saved" role="status" aria-live="polite">
          <span className="pqcell-saved-tick" aria-hidden="true">✓</span> {t('kitchen.plan.saved')}
        </span>
      )}
    </div>
  )
}
