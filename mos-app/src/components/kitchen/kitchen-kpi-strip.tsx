// KitchenKpiStrip — the derived metric band.
//
// v4 (2026-07-27): was four hero-metric cards on desktop and a one-line summary on phone.
// Both are gone. It is now ONE dense summary rule at every width.
//
// Why: the craft floor refuses "same-size cards as the page structure" and the
// "hero-metric template: big number, small label, supporting stats, accent" — the old band was
// both, and it consumed the top half of the first viewport on Café · Log. The floor persona's
// job is to log a dish in under a minute; they were scrolling past a management summary to
// reach the one control they came for. The numbers still matter, so they stay — at reading
// size, on one line, above the rows instead of in front of them.
//
// Colours and type are unchanged: existing tokens only, on the documented ramp.
//
// distill pass: this used to also carry a `kpis` prop + a `buildLogKpiStripData()` fallback
// for Café · Log — built when the log page still rendered this strip. DD-1 replaced that with
// the inline "Planned total" summary rule in kitchen-log-page.tsx's meta line, so the log page
// has never called this component with `kpis` since; every real caller (Plan/Stock/Review)
// always passes `data`. That fallback path was dead code carrying its own dead fields
// (`deltaDot`, an always-neutral `delta` that `Metric` never shows for a neutral tone) — the
// exact "nothing renders these" finding. Removed rather than trimmed field-by-field: `data` is
// now the only input, matching what every caller already does.

import type { KitchenKpiStripData, KitchenKpiTileData } from '@/lib/kitchen-kpis'
import './kitchen-kpi-strip.css'

interface KitchenKpiStripProps {
  data: KitchenKpiStripData
  /** Retained for call-site compatibility; the band no longer branches on width. */
  isDesktop?: boolean
}

export function KitchenKpiStrip({ data }: KitchenKpiStripProps) {
  return (
    <div className="kks-wrap">
      <section className="kks" aria-label={data.ariaLabel}>
        {data.tiles.map(tile => <Metric key={tile.label} tile={tile} />)}
      </section>
      {data.statusLine && <p className="kks-status">{data.statusLine}</p>}
    </div>
  )
}

/**
 * One metric: label, value, and a delta ONLY when it carries a state worth acting on.
 * Neutral deltas and the old `sub` captions ("portions", "of plan", "of target") are dropped —
 * they restated the label or a number already on the row.
 */
function Metric({ tile }: { tile: KitchenKpiTileData }) {
  const tone = tile.deltaTone ?? 'neutral'
  const showDelta = tile.delta != null && (tone === 'destructive' || tone === 'success')
  return (
    <div className="kks-metric">
      <span className="kks-label">{tile.label}</span>
      <span className="kks-value tabular">{tile.value}</span>
      {showDelta && (
        <span className={`kks-delta kks-delta--${tone}`}>
          {typeof tile.delta === 'string' ? tile.delta : tile.delta}
        </span>
      )}
    </div>
  )
}
