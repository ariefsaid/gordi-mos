// KitchenKpiStrip — the derived KPI band (plan §8, N3).
// Desktop: 4 DESIGN.md KPI tiles. Phone: a one-line summary.
// Branches on isDesktop (one branch in the DOM — P-4).

import type { KitchenKpis, KitchenKpiStripData, KitchenKpiTileData } from '@/lib/kitchen-kpis'
import { Pill } from '@/components/ui/pill'
import './kitchen-kpi-strip.css'

interface KitchenKpiStripProps {
  kpis?: KitchenKpis
  data?: KitchenKpiStripData
  isDesktop: boolean
}

export function KitchenKpiStrip({ kpis, data, isDesktop }: KitchenKpiStripProps) {
  const resolved = data ?? buildLogKpiStripData(kpis!)
  if (isDesktop) return <DesktopStrip data={resolved} />
  return <PhoneSummary data={resolved} />
}

function buildLogKpiStripData(kpis: KitchenKpis): KitchenKpiStripData {
  const {
    plannedTotal, madeOfPlan, madeSoFar, madeOffPlan, pctComplete,
    itemsRemaining, unitsShort, plannedDishCount,
  } = kpis
  const hasPlan = plannedTotal > 0
  const behind = plannedTotal - madeOfPlan

  return {
    ariaLabel: 'Plan vs actual summary',
    phoneLabel: 'Today',
    phoneValue: `${plannedDishCount} planned`,
    phoneMeta: hasPlan ? `${pctComplete}%` : '—%',
    tiles: [
      {
        label: 'Planned total',
        value: hasPlan ? String(plannedTotal) : '0',
        delta: `${plannedDishCount} dishes`,
        deltaTone: 'neutral',
        deltaDot: false,
        sub: 'portions',
      },
      {
        label: 'Made so far',
        value: String(madeSoFar),
        delta: hasPlan
          ? behind > 0
            ? `−${behind} vs plan`
            : 'on plan'
          : 'no plan set',
        deltaTone: hasPlan ? (behind > 0 ? 'destructive' : 'success') : 'neutral',
        deltaDot: hasPlan ? undefined : false,
        sub: madeOffPlan > 0 ? `+${madeOffPlan} off-plan` : undefined,
      },
      {
        label: '% complete',
        value: hasPlan ? `${pctComplete}%` : '—%',
        delta: hasPlan ? `${madeOfPlan} of ${plannedTotal}` : 'no plan set',
        deltaTone: 'neutral',
        deltaDot: false,
        sub: 'of plan',
      },
      {
        // census FLAG-C: the value counts DISHES but the delta counts PORTIONS — the label
        // said "Items" and the delta said "units", a silent unit switch. Name both units.
        label: 'Dishes remaining',
        value: String(itemsRemaining),
        delta: hasPlan
          ? itemsRemaining > 0
            ? `−${unitsShort} portions short`
            : 'all on plan'
          : 'no plan set',
        deltaTone: hasPlan ? (itemsRemaining > 0 ? 'destructive' : 'success') : 'neutral',
        deltaDot: hasPlan ? undefined : false,
        sub: 'of target',
      },
    ],
  }
}

function DesktopStrip({ data }: { data: KitchenKpiStripData }) {
  return (
    <div className="kks-wrap">
      {/* Grid sizes to the tile count — 4 for Log/Stock/Review, 2 for the Plan editor
          (census DEFECT-1), so two tiles don't strand two empty columns. data-tiles
          drives the column rule in CSS so the tablet responsive collapse still applies. */}
      <section className="kks" data-tiles={data.tiles.length} aria-label={data.ariaLabel}>
        {data.tiles.map(tile => <KpiTile key={tile.label} tile={tile} />)}
      </section>
      {data.statusLine && <p className="kks-status">{data.statusLine}</p>}
    </div>
  )
}

function KpiTile({ tile }: { tile: KitchenKpiTileData }) {
  return (
    <div className="kks-tile">
      <span className="kks-label">{tile.label}</span>
      <span className="kks-value tabular">{tile.value}</span>
      {tile.delta != null && (
        typeof tile.delta === 'string'
          ? <Pill tone={tile.deltaTone ?? 'neutral'} dot={tile.deltaDot}>{tile.delta}</Pill>
          : tile.delta
      )}
      {tile.sub && <span className="kks-sub">{tile.sub}</span>}
    </div>
  )
}

function PhoneSummary({ data }: { data: KitchenKpiStripData }) {
  return (
    <div className="kks-phone" aria-label={data.ariaLabel}>
      <span className="kks-phone-label">{data.phoneLabel}</span>
      <span className="tabular">{data.phoneValue}</span>
      <span className="tabular">{data.phoneMeta}</span>
    </div>
  )
}
