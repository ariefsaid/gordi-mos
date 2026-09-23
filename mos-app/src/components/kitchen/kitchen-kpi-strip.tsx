// KitchenKpiStrip — the derived KPI band (plan §8, N3).
// Desktop: 4 DESIGN.md KPI tiles. Phone: a one-line summary.
// Branches on isDesktop (one branch in the DOM — P-4).

import type { KitchenKpis, KitchenKpiStripData, KitchenKpiTileData } from '@/lib/kitchen-kpis'
import { useT, type Translate } from '@/i18n/use-t'
import { Pill } from '@/components/ui/pill'
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

function buildLogKpiStripData(kpis: KitchenKpis, t: Translate): KitchenKpiStripData {
  const {
    plannedTotal, madeOfPlan, madeSoFar, madeOffPlan, pctComplete,
    itemsRemaining, unitsShort, plannedDishCount,
  } = kpis
  const hasPlan = plannedTotal > 0
  const behind = plannedTotal - madeOfPlan

  return {
    ariaLabel: 'Plan vs actual summary',
    phoneLabel: t('kitchen.kpi.today'),
    phoneValue: `${plannedDishCount} ${t('kitchen.kpi.planned')}`,
    phoneMeta: hasPlan ? `${pctComplete}%` : '—%',
    tiles: [
      {
        label: t('kitchen.kpi.plannedTotal'),
        value: hasPlan ? String(plannedTotal) : '0',
        delta: `${plannedDishCount} ${t('kitchen.kpi.items')}`,
        deltaTone: 'neutral',
        deltaDot: false,
        sub: t('kitchen.kpi.portions'),
      },
      {
        label: t('kitchen.kpi.made'),
        value: String(madeSoFar),
        delta: hasPlan
          ? behind > 0
            ? `−${behind} ${t('kitchen.kpi.vsPlan')}`
            : t('kitchen.kpi.onPlan')
          : t('kitchen.kpi.noPlan'),
        deltaTone: hasPlan ? (behind > 0 ? 'destructive' : 'success') : 'neutral',
        deltaDot: hasPlan ? undefined : false,
        sub: madeOffPlan > 0 ? `+${madeOffPlan} ${t('kitchen.kpi.offPlan')}` : undefined,
      },
      {
        label: t('kitchen.kpi.complete'),
        value: hasPlan ? `${pctComplete}%` : '—%',
        delta: hasPlan ? `${madeOfPlan} ${t('kitchen.kpi.of')} ${plannedTotal}` : t('kitchen.kpi.noPlan'),
        deltaTone: 'neutral',
        deltaDot: false,
        sub: t('kitchen.kpi.ofPlan'),
      },
      {
        label: t('kitchen.kpi.remaining'),
        value: String(itemsRemaining),
        delta: hasPlan
          ? itemsRemaining > 0
            ? `−${unitsShort} ${t('kitchen.kpi.unitsShort')}`
            : t('kitchen.kpi.onPlan')
          : t('kitchen.kpi.noPlan'),
        deltaTone: hasPlan ? (itemsRemaining > 0 ? 'destructive' : 'success') : 'neutral',
        deltaDot: hasPlan ? undefined : false,
        sub: t('kitchen.kpi.target'),
      },
    ],
  }
}

function DesktopStrip({ data }: { data: KitchenKpiStripData }) {
  return (
    <section className="kks" aria-label={data.ariaLabel}>
      {data.tiles.map(tile => <KpiTile key={tile.label} tile={tile} />)}
    </section>
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
