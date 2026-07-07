// WindowSelector — the window control (design-plan §2.6, FR-013/014, AC-013/014).
// Composes a 3-preset seg [7d/30d/60d] (30d default) + a "Custom" button that reveals
// a pair of bounded native date inputs (from/to). Custom range is bounded to the
// available snapshot window (FR-014 — dates outside [earliest, latest] are disabled).
// Selecting a preset emits {kind:'preset', days:N}; changing a date emits
// {kind:'custom', from, to}. Reuses the `seg` grammar (CutToggle's tablist shape).
import type { KeyboardEvent } from 'react'
import type { WindowSpec } from '@/lib/dashboard'
import './window-selector.css'

export interface WindowSelectorProps {
  value: WindowSpec
  onChange: (spec: WindowSpec) => void
  bounds: { earliest: string; latest: string } | null
  ariaLabel?: string
}

const PRESETS: Array<{ id: string; days: 7 | 30 | 60 }> = [
  { id: '7d', days: 7 },
  { id: '30d', days: 30 },
  { id: '60d', days: 60 },
]

export function WindowSelector({
  value,
  onChange,
  bounds,
  ariaLabel = 'Time window',
}: WindowSelectorProps) {
  const options = ['7d', '30d', '60d', 'Custom']
  const activeId = value.kind === 'preset' ? `${value.days}d` : 'Custom'

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
      selectOption(options[nextIndex])
    }
  }

  function selectOption(id: string) {
    if (id === 'Custom') {
      // Seed the custom range from the bounds (latest reporting day back ~30d by default,
      // clamped to the available window) so the picker opens on a valid range.
      const latest = bounds?.latest ?? isoDaysFromToday(-1)
      const earliest = bounds?.earliest ?? isoDaysFromToday(-60)
      const seededFrom = isoDaysBefore(latest, Math.min(29, daysBetween(earliest, latest)))
      onChange({ kind: 'custom', from: seededFrom, to: latest })
      return
    }
    const preset = PRESETS.find(p => p.id === id)
    if (preset) onChange({ kind: 'preset', days: preset.days })
  }

  const isCustom = value.kind === 'custom'
  const min = bounds?.earliest
  const max = bounds?.latest

  return (
    <div className="window-selector">
      <div role="tablist" aria-label={ariaLabel} className="window-selector-seg">
        {options.map((option, index) => {
          const isSelected = option === activeId
          return (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              data-touch-target="true"
              className="window-selector-tab"
              onClick={() => {
                if (!isSelected) selectOption(option)
              }}
              onKeyDown={e => handleKeyDown(e, index)}
            >
              {option}
            </button>
          )
        })}
      </div>

      {isCustom && (
        <div className="window-selector-range">
          <label className="window-selector-field">
            <span className="window-selector-field-label">From</span>
            <input
              type="date"
              value={value.kind === 'custom' ? value.from : ''}
              min={min}
              max={max}
              aria-label="From"
              onChange={e => {
                if (value.kind === 'custom') {
                  onChange({ kind: 'custom', from: e.target.value, to: value.to })
                }
              }}
            />
          </label>
          <label className="window-selector-field">
            <span className="window-selector-field-label">To</span>
            <input
              type="date"
              value={value.kind === 'custom' ? value.to : ''}
              min={min}
              max={max}
              aria-label="To"
              onChange={e => {
                if (value.kind === 'custom') {
                  onChange({ kind: 'custom', from: value.from, to: e.target.value })
                }
              }}
            />
          </label>
        </div>
      )}
    </div>
  )
}

// ── tiny ISO date helpers (no Date.now() for reporting math; bounds come from rows) ─
function isoDaysBefore(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function isoDaysFromToday(delta: number): string {
  // Only used as a fallback when bounds are null (no rows yet) — never for the
  // reporting-period anchor (that's bounds.latest from the rows, FR-005).
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function daysBetween(earliestIso: string, latestIso: string): number {
  const a = new Date(`${earliestIso}T00:00:00Z`).getTime()
  const b = new Date(`${latestIso}T00:00:00Z`).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}
