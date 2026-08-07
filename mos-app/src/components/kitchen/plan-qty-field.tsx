// PlanQtyField — the ONE typed plan-qty control (DESIGN.md "Compact capture row"),
// ported from the v4 line (DD-5).
//
// WHY THIS EXISTS: DD-5. The owner killed the −/+ stepper on Café · Log — *"the production
// is not logged incrementally. it should be typed in the amount being produced. mostly are
// 10-20+. incremental is just too tedious."* Log was fixed and Plan was never ported, so the
// very next screen in the same module still asked a planner to tap `+` twenty-five times to
// plan twenty-five portions. Same job, same thumb, same numbers — one control.
//
// It is the SAME field as Café · Log's (wip-item-stepper.tsx `.kls-qty`), not a third
// variant: one right-aligned numeric input at the thumb, `inputmode="decimal"` so the phone
// opens a number pad, `enterkeyhint="next"` so the keyboard walks the list, 44px tall, and
// `--font-size-touch-input` (16px) because anything smaller makes mobile Safari zoom the
// viewport on focus — unacceptable on a field tapped once per dish down a 30-dish list.
//
// ONE DELIBERATE DIFFERENCE from Log, and it is a data-honesty one. On Log the field captures
// a NEW number and the *plan* is a different number, so the plan is echoed as a greyed
// placeholder anchor. On Plan the field IS the saved plan: there is no second number to
// anchor against, and greying out a committed value would render saved data as if it were
// unset. So it follows Log's rule literally — `value` when > 0, blank when 0 with a greyed
// "0" — which means an unplanned dish reads as genuinely blank instead of a column of hard
// black zeros, and a planned dish shows its real, black, committed figure.
//
// I5 inline-edit (OD-REDESIGN-22 / docs/interaction-contract.md, item 13): routed through
// the one primitive (useInlineCommit) — Enter/Tab/blur COMMIT, Escape DISCARDS and restores
// the saved qty, an unchanged blur is a no-op (no needless upsert). Commit state
// (Saving… / ✓ Saved) is NOT rendered here: it belongs beside/beneath the field at the page
// (kp-cell-status), which renders only when it has something to say — inline it would
// reflow the row's one control mid-entry.
// Token-only (DESIGN.md); .pqf-* namespace (C1 guard).

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
  /**
   * v4 (DD-5 desktop port): sizes to DESIGN.md's 32px control height / --font-size-control
   * instead of the 44px touch floor — the desktop DataTable "Plan" cell is a pointer
   * surface, not a touch target, mirroring WipItemStepper's own dense variant
   * (wip-item-stepper.css, ".kls-dense .kls-qty"). Same field, same behavior, only sizing
   * changes — this is the ONE typed-qty control, not a second one wearing a costume.
   */
  dense?: boolean
}

export function PlanQtyField({ itemName, qty, disabled, onSave, dense = false }: PlanQtyFieldProps) {
  const t = useT()
  const { draft, setDraft, onKeyDown, onBlur } = useInlineCommit<number>({
    value: qty,
    onCommit: onSave,
    disabled,
  })

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    // Empty clears the plan rather than coercing mid-keystroke — a blank field means
    // "nothing planned", which is a real state here, and must stay typeable through.
    if (raw === '') { setDraft(0); return }
    const val = parseInt(raw, 10)
    if (!Number.isNaN(val) && val >= 0) setDraft(val)
  }

  return (
    <div className={`pqf${dense ? ' pqf-dense' : ''}`}>
      <input
        type="number"
        inputMode="decimal"
        aria-label={`Planned quantity for ${itemName}`}
        className="pqf-qty"
        value={draft > 0 ? draft : ''}
        placeholder="0"
        min={0}
        step={1}
        enterKeyHint="next"
        disabled={disabled}
        data-touch-target="true"
        onChange={handleInput}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      <span className="pqf-unit">{t('kitchen.unit.porsi')}</span>
    </div>
  )
}
