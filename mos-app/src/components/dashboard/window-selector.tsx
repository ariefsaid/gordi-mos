// WindowSelector — the window control (design-plan §2.6, FR-013/014, AC-013/014).
// Composes a 3-preset seg [7d/30d/60d] (30d default) + a "Range" button that reveals
// a pair of bounded native date inputs (from/to) — inline on desktop, or, when the
// composition passes `onRangeOpen`, deferred to a sheet the composition owns (#804).
// The range is bounded to the available snapshot window (FR-014 — dates outside [earliest, latest] are disabled).
// Selecting a preset emits {kind:'preset', days:N}; changing a date emits
// {kind:'custom', from, to}. Reuses the `seg` grammar (CutToggle's tablist shape).
import { useRef, type KeyboardEvent } from 'react'
import type { WindowSpec } from '@/lib/dashboard'
import { isoDaysBefore } from '@/lib/trailing-window'
import { useT } from '@/i18n/use-t'
import { Chevron } from '@/shell/icons'
import './window-selector.css'

export interface WindowSelectorProps {
  value: WindowSpec
  onChange: (spec: WindowSpec) => void
  bounds: { earliest: string; latest: string } | null
  ariaLabel?: string
  /**
   * When the composition renders the From/To pair somewhere of its own (#804: the phone's
   * Range sheet), the seg suppresses its inline pair and the parent renders
   * <WindowRangeFields> where it wants. Default false — desktop keeps the inline
   * seg+pair exactly as before.
   */
  hideRange?: boolean
  /**
   * #804: when present, picking Range does NOT commit a custom spec — it calls this instead,
   * so the composition can open its own From · To · Apply sheet and commit on Apply. The seg
   * shows Range selected only once a custom spec is actually the value.
   */
  onRangeOpen?: () => void
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
  ariaLabel,
  hideRange = false,
  onRangeOpen,
}: WindowSelectorProps) {
  const t = useT()
  // I18N-1: 'Range' stays the internal id; only its label localizes (presets 7d/30d/60d are
  // locale-neutral duration tokens).
  const resolvedAriaLabel = ariaLabel ?? t('money.toolbar.timeWindow')
  const optionLabel = (id: string) => (id === 'Range' ? t('money.window.range') : id)
  const options = ['7d', '30d', '60d', 'Range']
  const activeId = value.kind === 'preset' ? `${value.days}d` : 'Range'
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

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
      // r5 F-4: focus follows selection — "Range" must be genuinely arrow-reachable,
      // not just aria-selected while focus strands on a tabIndex=-1 button.
      tabRefs.current[nextIndex]?.focus()
    }
  }

  function selectOption(id: string) {
    if (id === 'Range') {
      if (onRangeOpen) {
        onRangeOpen()
        return
      }
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

  return (
    <div className="window-selector">
      <div role="tablist" aria-label={resolvedAriaLabel} className="window-selector-seg">
        {options.map((option, index) => {
          const isSelected = option === activeId
          return (
            <button
              key={option}
              ref={el => { tabRefs.current[index] = el }}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              data-touch-target="true"
              className="window-selector-tab"
              onClick={() => {
                // The deferred Range tab re-opens its sheet even while selected — otherwise an
                // active range is uneditable, since the only way back to the dates is this tab.
                if (!isSelected || (option === 'Range' && onRangeOpen)) selectOption(option)
              }}
              onKeyDown={e => handleKeyDown(e, index)}
            >
              {optionLabel(option)}
              {/* RI-IXD-1: the ONE shared disclosure chevron — a deferred Range opens a sheet,
                  and the glyph is how the seg says so. */}
              {option === 'Range' && onRangeOpen && <Chevron className="window-selector-caret" size={12} />}
            </button>
          )
        })}
      </div>

      {isCustom && !hideRange && (
        <WindowRangeFields value={value} onChange={onChange} bounds={bounds} />
      )}
    </div>
  )
}

/**
 * The From/To date pair — the one DOM for the pair wherever it renders: inline beside the
 * seg (desktop, via WindowSelector) or inside the phone Range sheet (#804, via
 * GlobalToolbar). Only meaningful while the window is `{kind:'custom'}` — callers gate on that.
 */
export function WindowRangeFields({
  value,
  onChange,
  bounds,
}: {
  value: WindowSpec
  onChange: (spec: WindowSpec) => void
  bounds: { earliest: string; latest: string } | null
}) {
  const t = useT()
  const min = bounds?.earliest
  const max = bounds?.latest
  return (
    <div className="window-selector-range">
      <label className="window-selector-field">
        <span className="window-selector-field-label">{t('money.window.from')}</span>
        <input
          type="date"
          value={value.kind === 'custom' ? value.from : ''}
          min={min}
          max={max}
          aria-label={t('money.window.from')}
          onChange={e => {
            if (value.kind === 'custom') {
              onChange({ kind: 'custom', from: e.target.value, to: value.to })
            }
          }}
        />
      </label>
      <label className="window-selector-field">
        <span className="window-selector-field-label">{t('money.window.to')}</span>
        <input
          type="date"
          value={value.kind === 'custom' ? value.to : ''}
          min={min}
          max={max}
          aria-label={t('money.window.to')}
          onChange={e => {
            if (value.kind === 'custom') {
              onChange({ kind: 'custom', from: value.from, to: e.target.value })
            }
          }}
        />
      </label>
    </div>
  )
}

// ── tiny ISO date helper (no Date.now() for reporting math; bounds come from rows) ─
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
