// WipItemStepper — one stepper row per WIP item.
// IconButton − / + flanking a numeric TextInput; plan context below; inline note field on error.
// Touch targets ≥44px via data-touch-target + min-height.
// Tokens: --foreground, --muted-foreground, --border, --background, --destructive,
//         --status-lost-text, --radius-sm, --radius-md. No raw hex/px.

import type { KitchenLogLine } from '@/lib/db/kitchen-logs.types'

interface WipItemStepperProps {
  itemName: string
  line: KitchenLogLine
  onQtyChange: (qty: number) => void
  onNotesChange: (note: string) => void
  disabled?: boolean
}

export function WipItemStepper({
  itemName,
  line,
  onQtyChange,
  onNotesChange,
  disabled = false,
}: WipItemStepperProps) {
  const { qty_porsi, notes, plan_qty, error } = line
  const showNote = error !== '' && line.dirty

  function handleQtyInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    if (!Number.isNaN(val) && val >= 0) onQtyChange(val)
  }

  return (
    <div
      style={{
        background: 'var(--card)',
        border: `1px solid ${error && line.dirty ? 'var(--destructive)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Row: name + stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Item name */}
        <span
          style={{
            flex: 1,
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--foreground)',
          }}
        >
          {itemName}
        </span>

        {/* − button */}
        <button
          type="button"
          aria-label={`Decrease ${itemName} quantity`}
          data-touch-target="true"
          disabled={disabled || qty_porsi <= 0}
          onClick={() => onQtyChange(Math.max(0, qty_porsi - 1))}
          style={{
            width: '44px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--background)',
            color: 'var(--foreground)',
            fontSize: '18px',
            cursor: disabled || qty_porsi <= 0 ? 'not-allowed' : 'pointer',
            opacity: disabled || qty_porsi <= 0 ? 0.4 : 1,
            fontFamily: 'inherit',
          }}
        >
          −
        </button>

        {/* Qty input */}
        <input
          type="number"
          role="spinbutton"
          aria-label={`Quantity for ${itemName}`}
          value={qty_porsi}
          min={0}
          step={1}
          disabled={disabled}
          onChange={handleQtyInput}
          style={{
            width: '56px',
            height: '44px',
            textAlign: 'center',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--background)',
            color: 'var(--foreground)',
            fontSize: '16px',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'inherit',
            padding: '0 4px',
          }}
        />

        {/* + button */}
        <button
          type="button"
          aria-label={`Increase ${itemName} quantity`}
          data-touch-target="true"
          disabled={disabled}
          onClick={() => onQtyChange(qty_porsi + 1)}
          style={{
            width: '44px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            fontSize: '18px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            fontFamily: 'inherit',
          }}
        >
          +
        </button>
      </div>

      {/* Plan context */}
      <div
        style={{
          fontSize: '12px',
          color: 'var(--muted-foreground)',
          fontVariantNumeric: 'tabular-nums',
          display: 'flex',
          gap: '6px',
        }}
      >
        {plan_qty > 0 ? (
          <span>plan <strong style={{ color: 'var(--foreground)' }}>{plan_qty}</strong></span>
        ) : (
          <span style={{ color: 'var(--muted-foreground)' }}>no plan</span>
        )}
      </div>

      {/* Error cue + note field — AC-020/021 */}
      {showNote && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span
            style={{
              fontSize: '12px',
              color: 'var(--status-lost-text)',
            }}
          >
            {error}
          </span>
          <textarea
            id={`note-${line.wip_item_id}`}
            aria-label={`Note for ${itemName}`}
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            disabled={disabled}
            rows={2}
            placeholder="Catatan wajib — di luar rencana"
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid var(--destructive)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '13px',
              fontFamily: 'inherit',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}
    </div>
  )
}
