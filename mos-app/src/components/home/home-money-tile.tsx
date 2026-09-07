import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { canViewRevenue } from '@/lib/capabilities'
import { isShipGated } from '@/lib/ship-gate'
import { KPITile } from '@/components/dashboard/kpi-tile'
// KPITile already composes BasisChip through its `basis={...}` prop — that is the reuse the
// ticket asks for, so the chip is imported transitively rather than a second time here.
import { FreshnessLabel } from '@/components/dashboard/freshness-label'
// The band shell (`.stream-band` / `-head` / `-label` / `-link`) is the same texture Home's
// other aside entries render through — pulled in here because no arrangement imports it on this
// section's behalf.
import './home-stream.css'
import './home-money-tile.css'

/**
 * #809 — Home's Money tile. The one entry Home carries on behalf of Money for viewers with
 * Revenue VIEW, once Money is live (`/money` out of SHIP_GATED_PATHS).
 *
 * TWO GATES, deliberately answered by the SAME predicates every other Money door on this line
 * asks. Nobody re-typed a role list here; nobody grew a second ship-gate check:
 *   • `isShipGated('/money')` — while the base branch keeps '/money' in SHIP_GATED_PATHS, this
 *     tile is closed to EVERYONE, including revenue viewers. Removing that entry restores the
 *     tile with no edit here (`OD-WAY-98` (2) — the closed-when-gated posture on Home).
 *   • `canViewRevenue(accessRoles)` — the ONE role answer (`REVENUE_VIEW_ROLES` = finance,
 *     manager, supervisor; #797 / OD-WAY-98 dropped admin). RLS is the hard boundary
 *     (ADR-0020 D4 / NFR-004); this gate is affordance, and it must agree with the boundary.
 *
 * PRESENTATIONAL — no read, no fetch. The dashboard already owns the revenue read (same
 * reporting.sales_daily_revenue snapshot); its caller passes the pre-formatted figure, the
 * basis and the as-of timestamp so a still-loading Home never renders a bare `0` here (DIV-G5:
 * a figure the viewer cannot trace is worse than no figure).
 *
 * TILE ANATOMY — the ticket's contract:
 *   figure · basis chip · as-of · `Open Money →` → `/money`
 * Reuses `KPITile` for the figure (which already carries `basis` and its own `BasisChip`), then
 * a FreshnessLabel for the as-of stamp, then a drill link. The section carries its own display
 * heading ("Money") so the tile's identity is not repeated inside KPITile's label rung.
 */
export interface HomeMoneyTileProps {
  /** The viewer's access roles — the SAME set every Money door in the shell reads. */
  accessRoles: readonly string[]
  /** Pre-formatted revenue figure (`formatIDRCompact(...)` on the caller side). */
  revenue: string
  /** The basis qualifier — comes from `basisLabel(basis)` in `@/lib/dashboard`. */
  basisLabel: string
  /** The snapshot timestamp (`snapshot_as_of`) the figure was computed from. */
  asOf: string | Date
}

export function HomeMoneyTile({ accessRoles, revenue, basisLabel, asOf }: HomeMoneyTileProps) {
  const t = useT()
  const titleId = useId()

  if (isShipGated('/money')) return null
  if (!canViewRevenue(accessRoles)) return null

  return (
    <section className="stream-band home-money-tile" aria-labelledby={titleId}>
      <div className="stream-band-head">
        {/* h2 matching its peer sections in this column (HomeObjectivesDoor + List's stream
            bands): PageFamilyFrame owns Home's only h1 and there is no intermediate level, so an
            h3 would skip one (detector: skipped-heading). */}
        <h2 id={titleId} className="stream-band-label">{t('dest.money')}</h2>
        <Link to="/money" className="stream-band-link tap-floor">{t('home.money.open')}</Link>
      </div>
      <KPITile
        label={t('home.money.figure')}
        value={revenue}
        basis={{ label: basisLabel }}
      />
      <div className="home-money-tile-foot">
        <FreshnessLabel asOf={asOf} />
      </div>
    </section>
  )
}
