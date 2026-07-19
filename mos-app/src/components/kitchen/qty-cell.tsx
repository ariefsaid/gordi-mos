// QtyCell — the desktop inline-editable "Made today" cell (plan §4.1 N5, §8.1).
// Flat number at rest (the input shows the qty); a compact −/+ stepper flanks it.
// The −/+ are ALWAYS in the DOM (keyboard-focusable; revealed visually on
// :hover / :focus-within via CSS). The input is the primary tab stop per row (§9).
// The transfer-cap cue (TRANSFER_SHORT_CUE) renders inline when capError is set.
// Token-only (DESIGN.md); One-Blue focus ring only.
//
// I5 inline-edit (OD-REDESIGN-22 / docs/interaction-contract.md): typing is a DRAFT —
// Enter / Tab / blur COMMIT via onQtyChange; Escape DISCARDS and restores the saved qty.
// Routed through the one primitive (useInlineCommit) — no bespoke draft here. + / − are
// explicit commits of the stepped draft (clamped ≥ 0; − disabled at 0).

import { useInlineCommit } from '@/components/ui/use-inline-commit'
import type { KitchenLogLine } from '@/lib/db/kitchen-logs.types'
import './qty-cell.css'

interface QtyCellProps {
  itemName: string
  line: KitchenLogLine
  onQtyChange: (qty: number) => void
  disabled?: boolean
}

export function QtyCell({ itemName, line, onQtyChange, disabled = false }: QtyCellProps) {
  const { qty_porsi: qty, capError } = line
  const { draft, setDraft, commit, onKeyDown, onBlur } = useInlineCommit<number>({
    value: qty,
    onCommit: onQtyChange,
    disabled,
  })

  return (
    <div className={`qcell${capError ? ' qcell-cap' : ''}`}>
      <div className="qcell-stepper">
        <button
          type="button"
          aria-label={`Decrease ${itemName} quantity`}
          className="qcell-btn"
          disabled={disabled || draft <= 0}
          onClick={() => commit(Math.max(0, draft - 1))}
        >
          −
        </button>
        <input
          type="number"
          role="spinbutton"
          aria-label={`Quantity for ${itemName}`}
          className="qcell-input"
          value={draft}
          min={0}
          step={1}
          disabled={disabled}
          onChange={e => {
            const val = parseInt(e.target.value, 10)
            setDraft(Number.isNaN(val) ? 0 : Math.max(0, val))
          }}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
        <button
          type="button"
          aria-label={`Increase ${itemName} quantity`}
          className="qcell-btn"
          disabled={disabled}
          onClick={() => commit(draft + 1)}
        >
          +
        </button>
      </div>
      {capError && <span role="alert" className="qcell-cap-cue">{capError}</span>}
    </div>
  )
}
