// SegmentedControl — the one switch between 2–5 exclusive FILTERS of the same list (period, age,
// read state, scope). Not tabs: a tab set switches views of one job and owns a panel; this changes
// what the list shows. Buttons carry aria-pressed. A visible label sits above, like every field.
import type { ReactNode } from 'react'
import './SegmentedControl.css'

interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  /** Small count after the label. */
  count?: number | string
  disabled?: boolean
  ariaLabel?: string
}

export interface SegmentedControlProps<T extends string> {
  /** Visible label above the control. Omit only when a nearby heading already names it. */
  label?: string
  /** Accessible name for the group (defaults to `label`). */
  ariaLabel?: string
  options: readonly SegmentedOption<T>[]
  value: T | null
  onChange: (value: T) => void
  className?: string
  disabled?: boolean
}

export function SegmentedControl<T extends string>({ label, ariaLabel, options, value, onChange, className, disabled }: SegmentedControlProps<T>) {
  return (
    <div className={`segmented${className ? ` ${className}` : ''}`}>
      {label ? <span className="segmented__label">{label}</span> : null}
      <div className="segmented__track" role="group" aria-label={ariaLabel ?? label} data-options={options.length}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="segmented__option"
            aria-pressed={option.value === value}
            aria-label={option.ariaLabel}
            disabled={disabled || option.disabled}
            onClick={() => { if (option.value !== value) onChange(option.value) }}
          >
            {option.label}
            {option.count != null ? <span className="segmented__count tabular-nums">{option.count}</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}
