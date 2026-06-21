// WipItemStepper — one stepper row per WIP item.
// IconButton − / + flanking a numeric input; plan·stok·tersedia context;
// inline variance-note field (FR-022) + transfer-availability cap cue (FR-023).
// Styling: co-located wip-item-stepper.css (DESIGN.md tokens; no inline style).
// Touch targets ≥44px (.kls-step / .kls-qty).

import type { KitchenActionType, KitchenLogLine } from '@/lib/db/kitchen-logs.types'
import { isStockConsuming } from '@/lib/kitchen-gates'
import './wip-item-stepper.css'

interface WipItemStepperProps {
  itemName: string
  line: KitchenLogLine
  /** current action_type — drives whether stok/tersedia meta is shown (transfers) */
  actionType: KitchenActionType
  onQtyChange: (qty: number) => void
  onNotesChange: (note: string) => void
  disabled?: boolean
}

export function WipItemStepper({
  itemName,
  line,
  actionType,
  onQtyChange,
  onNotesChange,
  disabled = false,
}: WipItemStepperProps) {
  const { qty_porsi, notes, plan_qty, stok, tersedia, error, capError, dirty } = line
  const showNote = error !== '' && dirty
  const invalid = (error !== '' || capError !== '') && dirty
  const transfer = isStockConsuming(actionType)

  function handleQtyInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    if (!Number.isNaN(val) && val >= 0) onQtyChange(val)
  }

  return (
    <div className={`kls-card${invalid ? ' kls-invalid' : ''}`}>
      {/* Row: name + stepper */}
      <div className="kls-row">
        <span className="kls-name">{itemName}</span>

        <button
          type="button"
          aria-label={`Decrease ${itemName} quantity`}
          className="kls-step kls-step-minus"
          data-touch-target="true"
          disabled={disabled || qty_porsi <= 0}
          onClick={() => onQtyChange(Math.max(0, qty_porsi - 1))}
        >
          −
        </button>

        <input
          type="number"
          role="spinbutton"
          aria-label={`Quantity for ${itemName}`}
          className="kls-qty"
          value={qty_porsi}
          min={0}
          step={1}
          disabled={disabled}
          onChange={handleQtyInput}
        />

        <button
          type="button"
          aria-label={`Increase ${itemName} quantity`}
          className="kls-step kls-step-plus"
          data-touch-target="true"
          disabled={disabled}
          onClick={() => onQtyChange(qty_porsi + 1)}
        >
          +
        </button>
      </div>

      {/* plan · stok · tersedia context (FR-022/023 basis) */}
      <div className="kls-meta">
        {plan_qty > 0 ? (
          <span>plan <strong>{plan_qty}</strong></span>
        ) : (
          <span>no plan</span>
        )}
        {transfer && (
          <>
            <span>stok <strong>{stok}</strong></span>
            <span>tersedia <strong>{tersedia}</strong></span>
          </>
        )}
      </div>

      {/* Transfer-availability cap cue (FR-023 / AC-022) */}
      {capError && <span role="alert" className="kls-cap">{capError}</span>}

      {/* Variance-note gate (FR-022 / AC-020/021) — revealed inline when qty != target */}
      {showNote && (
        <div className="kls-note-wrap">
          <span className="kls-note-cue">{error}</span>
          <textarea
            id={`note-${line.wip_item_id}`}
            aria-label={`Note for ${itemName}`}
            className="kls-note"
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            disabled={disabled}
            rows={2}
            placeholder="Catatan wajib — di luar rencana"
          />
        </div>
      )}
    </div>
  )
}
