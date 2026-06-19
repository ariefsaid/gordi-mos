// ActionTypeSeg — segmented control for kitchen action_type selection.
// role="tablist" with role="tab" children; aria-selected for current selection.
// Three canonical values: Production · Transfer to Radiant · Transfer to Bungur.
// Tokens: --primary, --background, --border, --foreground, --muted-foreground,
//          --radius-sm, --shadow-rest. No raw hex/px.

import type { KitchenActionType } from '@/lib/db/kitchen-logs.types'

interface ActionTypeSegProps {
  value: KitchenActionType
  onChange: (value: KitchenActionType) => void
  disabled?: boolean
}

const OPTIONS: { value: KitchenActionType; label: string; shortLabel: string }[] = [
  { value: 'Production',          label: 'Production',        shortLabel: 'Production' },
  { value: 'Transfer to Radiant', label: 'Transfer to Radiant', shortLabel: '→ Radiant' },
  { value: 'Transfer to Bungur',  label: 'Transfer to Bungur',  shortLabel: '→ Bungur' },
]

export function ActionTypeSeg({ value, onChange, disabled = false }: ActionTypeSegProps) {
  return (
    <div
      role="tablist"
      aria-label="Action type"
      style={{
        display: 'flex',
        gap: '4px',
        background: 'var(--muted)',
        borderRadius: 'var(--radius-sm)',
        padding: '3px',
      }}
    >
      {OPTIONS.map(opt => {
        const isSelected = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={isSelected}
            disabled={disabled}
            onClick={() => {
              if (!isSelected) onChange(opt.value)
            }}
            style={{
              flex: 1,
              height: '32px',
              minHeight: '44px', // touch target on phone
              padding: '0 8px',
              borderRadius: 'calc(var(--radius-sm) - 2px)',
              border: 'none',
              cursor: disabled ? 'not-allowed' : isSelected ? 'default' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: isSelected ? 600 : 500,
              background: isSelected ? 'var(--background)' : 'transparent',
              color: isSelected ? 'var(--foreground)' : 'var(--muted-foreground)',
              boxShadow: isSelected ? 'var(--shadow-rest)' : 'none',
              transition: 'background 120ms ease, box-shadow 120ms ease',
              opacity: disabled ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            <span className="seg-full-label">{opt.label}</span>
            <span className="seg-short-label" aria-hidden="true">{opt.shortLabel}</span>
          </button>
        )
      })}

      <style>{`
        .seg-full-label { display: inline; }
        .seg-short-label { display: none; }
        @media (max-width: 400px) {
          .seg-full-label { display: none; }
          .seg-short-label { display: inline; }
        }
      `}</style>
    </div>
  )
}
