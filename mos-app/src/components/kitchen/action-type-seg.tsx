// ActionTypeSeg — segmented control for kitchen action_type selection.
// role="tablist" with role="tab" children; aria-selected for current selection.
// Three canonical values: Production · Transfer to Radiant · Transfer to Bungur.
// Styling: co-located action-type-seg.css (DESIGN.md tokens; no inline style).

import type { KitchenActionType } from '@/lib/db/kitchen-logs.types'
import './action-type-seg.css'

interface ActionTypeSegProps {
  value: KitchenActionType
  onChange: (value: KitchenActionType) => void
  disabled?: boolean
}

const OPTIONS: { value: KitchenActionType; label: string; shortLabel: string }[] = [
  { value: 'Production',          label: 'Production',          shortLabel: 'Production' },
  { value: 'Transfer to Radiant', label: 'Transfer to Radiant', shortLabel: '→ Radiant' },
  { value: 'Transfer to Bungur',  label: 'Transfer to Bungur',  shortLabel: '→ Bungur' },
]

export function ActionTypeSeg({ value, onChange, disabled = false }: ActionTypeSegProps) {
  return (
    <div role="tablist" aria-label="Action type" className="kseg">
      {OPTIONS.map(opt => {
        const isSelected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            disabled={disabled}
            className="kseg-tab"
            onClick={() => {
              if (!isSelected) onChange(opt.value)
            }}
          >
            <span className="kseg-full">{opt.label}</span>
            <span className="kseg-short" aria-hidden="true">{opt.shortLabel}</span>
          </button>
        )
      })}
    </div>
  )
}
