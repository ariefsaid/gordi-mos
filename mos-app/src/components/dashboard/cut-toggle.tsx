// CutToggle — general segmented control over an enum (design-plan §2.5).
// Reuses the existing `seg` grammar (secondary track, white on-pill + lift).
// role="tablist"/"tab"/aria-selected + roving tabindex (arrow-key navigable).
import type { KeyboardEvent } from 'react'
import './cut-toggle.css'

export interface CutToggleProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
}

export function CutToggle({ options, value, onChange, ariaLabel = 'View' }: CutToggleProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (index + 1) % options.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (index - 1 + options.length) % options.length
    } else if (e.key === 'Home') {
      nextIndex = 0
    } else if (e.key === 'End') {
      nextIndex = options.length - 1
    }
    if (nextIndex !== null) {
      e.preventDefault()
      onChange(options[nextIndex])
    }
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className="cut-toggle">
      {options.map((option, index) => {
        const isSelected = option === value
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            data-touch-target="true"
            className="cut-toggle-tab"
            onClick={() => {
              if (!isSelected) onChange(option)
            }}
            onKeyDown={e => handleKeyDown(e, index)}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
