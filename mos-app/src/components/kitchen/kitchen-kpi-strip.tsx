// KitchenKpiStrip — the derived KPI band (plan §8, N3).
// Desktop (isDesktop): 4 DESIGN.md signature tiles (Planned total · Made so far ·
//   % complete · Items remaining) with delta <Pill> chips. aria-label="Plan vs actual
//   summary". NOT a live region (updates are user-driven; announcing is noise — §8.1).
// Phone: the one-line "Today · N planned · NN%" summary strip (the strip's phone form).
// One branch in the DOM (P-4) — branches on isDesktop.
// Token-only (DESIGN.md). Tinted-Status deltas; Soft-Elevation: tiles get --shadow-rest.

import type { KitchenKpis } from '@/lib/kitchen-kpis'
import { Pill } from '@/components/ui/pill'
import './kitchen-kpi-strip.css'

interface KitchenKpiStripProps {
  kpis: KitchenKpis
  isDesktop: boolean
}

export function KitchenKpiStrip({ kpis, isDesktop }: KitchenKpiStripProps) {
  if (isDesktop) return <DesktopStrip kpis={kpis} />
  return <PhoneSummary kpis={kpis} />
}

// ── Desktop: 4 tiles ──────────────────────────────────────────────────────────
function DesktopStrip({ kpis }: { kpis: KitchenKpis }) {
  const {
    plannedTotal, madeOfPlan, madeSoFar, madeOffPlan, pctComplete,
    itemsRemaining, unitsShort, plannedDishCount,
  } = kpis
  const hasPlan = plannedTotal > 0
  const behind = plannedTotal - madeOfPlan

  return (
    <section className="kks" aria-label="Plan vs actual summary">
      <KpiTile
        label="Planned total"
        value={hasPlan ? String(plannedTotal) : '0'}
        delta={<Pill tone="neutral" dot={false}>{plannedDishCount} dishes</Pill>}
        sub="portions"
      />
      <KpiTile
        label="Made so far"
        value={String(madeSoFar)}
        delta={
          hasPlan
            ? behind > 0
              ? <Pill tone="destructive">−{behind} vs plan</Pill>
              : <Pill tone="success">on plan</Pill>
            : <Pill tone="neutral" dot={false}>no plan set</Pill>
        }
        sub={madeOffPlan > 0 ? `+${madeOffPlan} off-plan` : undefined}
      />
      <KpiTile
        label="% complete"
        value={hasPlan ? `${pctComplete}%` : '—%'}
        delta={
          hasPlan
            ? <Pill tone="neutral" dot={false}>{madeOfPlan} of {plannedTotal}</Pill>
            : <Pill tone="neutral" dot={false}>no plan set</Pill>
        }
        sub="of plan"
      />
      <KpiTile
        label="Items remaining"
        value={String(itemsRemaining)}
        delta={
          hasPlan
            ? itemsRemaining > 0
              ? <Pill tone="destructive">−{unitsShort} units short</Pill>
              : <Pill tone="success">all on plan</Pill>
            : <Pill tone="neutral" dot={false}>no plan set</Pill>
        }
        sub="of target"
      />
    </section>
  )
}

function KpiTile({
  label, value, delta, sub,
}: {
  label: string
  value: string
  delta: React.ReactNode
  sub?: string
}) {
  return (
    <div className="kks-tile">
      <span className="kks-label">{label}</span>
      <span className="kks-value tabular-nums">{value}</span>
      {delta}
      {sub && <span className="kks-sub">{sub}</span>}
    </div>
  )
}

// ── Phone: one-line summary ───────────────────────────────────────────────────
function PhoneSummary({ kpis }: { kpis: KitchenKpis }) {
  const hasPlan = kpis.plannedTotal > 0
  return (
    <div className="kks-phone" aria-label="Plan vs actual summary">
      <span className="kks-phone-label">Today</span>
      <span className="tabular-nums">
        {kpis.plannedDishCount} planned
      </span>
      <span className="tabular-nums">
        {hasPlan ? `${kpis.pctComplete}%` : '—%'}
      </span>
    </div>
  )
}
