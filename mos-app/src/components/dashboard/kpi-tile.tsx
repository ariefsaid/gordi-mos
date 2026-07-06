// KPITile — the general DESIGN.md "KPI Tile (signature)" primitive (design-plan §2.1).
// Consumes display-ready primitives only (strings + a tone enum) — never currency,
// math, or a read-model name. Delta vehicle = the existing Pill (no new chip).
import { Pill, type PillTone } from '@/components/ui/pill'
import './kpi-tile.css'

export interface KPITileDelta {
  text: string
  tone: 'success' | 'destructive' | 'neutral'
  dot?: boolean
}

export interface KPITileProps {
  label: string
  /** pre-formatted display string — the composition formats currency/%/counts */
  value: string
  delta?: KPITileDelta
  sub?: string
  state?: 'ready' | 'loading' | 'empty'
  /** optional "?" tooltip text */
  help?: string
}

const DELTA_TONE: Record<KPITileDelta['tone'], PillTone> = {
  success: 'success',
  destructive: 'destructive',
  neutral: 'neutral',
}

export function KPITile({ label, value, delta, sub, state = 'ready', help }: KPITileProps) {
  if (state === 'loading') {
    return (
      <div className="kpi-tile" role="group" aria-label={label} aria-busy="true">
        <span className="kpi-tile-label">{label}</span>
        <Pill tone="skeleton" dot={false} className="kpi-tile-skeleton-value" style={{ width: '72px', height: '23px' }}>
          &nbsp;
        </Pill>
      </div>
    )
  }

  return (
    <div className="kpi-tile" role="group" aria-label={label}>
      <span className="kpi-tile-label">
        {label}
        {help && (
          <span className="kpi-tile-help" aria-label={help} title={help}>
            ?
          </span>
        )}
      </span>
      <span className="kpi-tile-value kpi-tile-value--nowrap tabular">{value}</span>
      {delta && (
        <Pill tone={DELTA_TONE[delta.tone]} dot={delta.dot}>
          {delta.text}
        </Pill>
      )}
      {sub && <span className="kpi-tile-sub">{sub}</span>}
    </div>
  )
}
