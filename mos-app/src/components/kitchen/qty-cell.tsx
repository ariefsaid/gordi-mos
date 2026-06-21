// QtyCell — the desktop inline-editable "Made today" cell (plan §4.1 N5, §8.1).
// Flat number at rest (the input shows the qty); a compact −/+ stepper flanks it.
// The −/+ are ALWAYS in the DOM (keyboard-focusable; revealed visually on
// :hover / :focus-within via CSS). The input is the primary tab stop per row (§9).
// + → onQtyChange(qty+1); − → onQtyChange(qty−1), disabled at 0. Direct numeric input
// works. The transfer-cap cue (TRANSFER_SHORT_CUE) renders inline when capError is set.
// Token-only (DESIGN.md); One-Blue focus ring only.

import type { KitchenActionType, KitchenLogLine } from '@/lib/db/kitchen-logs.types'
import './qty-cell.css'

interface QtyCellProps {
  itemName: string
  line: KitchenLogLine
  actionType: KitchenActionType
  onQtyChange: (qty: number) => void
  disabled?: boolean
}

export function QtyCell({ itemName, line, onQtyChange, disabled = false }: QtyCellProps) {
  const { qty_porsi: qty, capError } = line

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    if (!Number.isNaN(val) && val >= 0) onQtyChange(val)
  }

  return (
    <div className={`qcell${capError ? ' qcell-cap' : ''}`}>
      <div className="qcell-stepper">
        <button
          type="button"
          aria-label={`Decrease ${itemName} quantity`}
          className="qcell-btn"
          disabled={disabled || qty <= 0}
          onClick={() => onQtyChange(Math.max(0, qty - 1))}
        >
          −
        </button>
        <input
          type="number"
          role="spinbutton"
          aria-label={`Quantity for ${itemName}`}
          className="qcell-input"
          value={qty}
          min={0}
          step={1}
          disabled={disabled}
          onChange={handleInput}
        />
        <button
          type="button"
          aria-label={`Increase ${itemName} quantity`}
          className="qcell-btn"
          disabled={disabled}
          onClick={() => onQtyChange(qty + 1)}
        >
          +
        </button>
      </div>
      {capError && <span role="alert" className="qcell-cap-cue">{capError}</span>}
    </div>
  )
}
