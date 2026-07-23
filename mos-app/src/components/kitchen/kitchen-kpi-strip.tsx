// KitchenKpiStrip — the derived KPI band (plan §8, N3).
// Desktop: 4 DESIGN.md KPI tiles. Phone: a one-line summary.
// Branches on isDesktop (one branch in the DOM — P-4).

import type { KitchenKpis, KitchenKpiStripData, KitchenKpiTileData } from '@/lib/kitchen-kpis'
import { Pill } from '@/components/ui/pill'
import { useT, type Translate } from '@/i18n/use-t'
import './kitchen-kpi-strip.css'

interface KitchenKpiStripProps {
  kpis?: KitchenKpis
  data?: KitchenKpiStripData
  isDesktop: boolean
}

export function KitchenKpiStrip({ kpis, data, isDesktop }: KitchenKpiStripProps) {
  const t = useT()
  const resolved = data ?? buildLogKpiStripData(kpis!, t)
  if (isDesktop) return <DesktopStrip data={resolved} />
  return <PhoneSummary data={resolved} />
}

// I18N-1: the Log KPI strip labels/deltas/subs route through the catalog. Numbers stay numeric;
// only the words localize. (Other Kitchen surfaces pass their own pre-built `data`.)
function buildLogKpiStripData(kpis: KitchenKpis, t: Translate): KitchenKpiStripData {
  const {
    plannedTotal, madeOfPlan, madeSoFar, madeOffPlan, pctComplete,
    itemsRemaining, unitsShort, plannedDishCount,
  } = kpis
  const hasPlan = plannedTotal > 0
  const behind = plannedTotal - madeOfPlan

  return {
    ariaLabel: t('kitchen.kpi.ariaLabel'),
    phoneLabel: t('kitchen.kpi.phone.today'),
    phoneValue: t('kitchen.kpi.phone.planned', { count: plannedDishCount }),
    phoneMeta: hasPlan ? `${pctComplete}%` : '—%',
    tiles: [
      {
        label: t('kitchen.kpi.plannedTotal'),
        value: hasPlan ? String(plannedTotal) : '0',
        delta: t('kitchen.kpi.plannedTotal.delta', { count: plannedDishCount }),
        deltaTone: 'neutral',
        deltaDot: false,
        sub: t('kitchen.kpi.plannedTotal.sub'),
      },
      {
        label: t('kitchen.kpi.madeSoFar'),
        value: String(madeSoFar),
        delta: hasPlan
          ? behind > 0
            ? t('kitchen.kpi.madeSoFar.behind', { count: behind })
            : t('kitchen.kpi.madeSoFar.onPlan')
          : t('kitchen.kpi.noPlanSet'),
        deltaTone: hasPlan ? (behind > 0 ? 'destructive' : 'success') : 'neutral',
        deltaDot: hasPlan ? undefined : false,
        sub: madeOffPlan > 0 ? t('kitchen.kpi.madeSoFar.offPlan', { count: madeOffPlan }) : undefined,
      },
      {
        label: t('kitchen.kpi.pctComplete'),
        value: hasPlan ? `${pctComplete}%` : '—%',
        delta: hasPlan ? t('kitchen.kpi.pctComplete.delta', { made: madeOfPlan, total: plannedTotal }) : t('kitchen.kpi.noPlanSet'),
        deltaTone: 'neutral',
        deltaDot: false,
        sub: t('kitchen.kpi.pctComplete.sub'),
      },
      {
        // census FLAG-C: the value counts DISHES but the delta counts PORTIONS — the label
        // said "Items" and the delta said "units", a silent unit switch. Name both units.
        label: t('kitchen.kpi.dishesRemaining'),
        value: String(itemsRemaining),
        delta: hasPlan
          ? itemsRemaining > 0
            ? t('kitchen.kpi.dishesRemaining.short', { count: unitsShort })
            : t('kitchen.kpi.dishesRemaining.allOnPlan')
          : t('kitchen.kpi.noPlanSet'),
        deltaTone: hasPlan ? (itemsRemaining > 0 ? 'destructive' : 'success') : 'neutral',
        deltaDot: hasPlan ? undefined : false,
        sub: t('kitchen.kpi.dishesRemaining.sub'),
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
