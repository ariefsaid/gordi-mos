// KPITile — the general DESIGN.md "KPI Tile (signature)" primitive (design-plan §2.1).
// Consumes display-ready primitives only (strings + a tone enum) — never currency,
// math, or a read-model name. Delta vehicle = the existing Pill (no new chip).
//
// EXTENSIONS (Track C1, OD-DASH-5): onClick → the tile becomes a <button> for
// filter-in-place (FR-016/AC-016); selected → the primary-ring state;
// basis → a <BasisChip> qualifier on GM/COGS tiles (FR-008/AC-008);
// dq → a <DQBadge> from bom_coverage_pct on GM/COGS tiles (FR-024/AC-024).
// Back-compat: Home v1 + revenue tiles omit all four and render unchanged.
import type { ReactNode } from 'react'
import { Pill, type PillTone } from '@/components/ui/pill'
import { LoadingShell } from '@/components/ui/state-kit'
import { BasisChip } from './basis-chip'
import { DQBadge, type DqState } from './dq-badge'
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
  /** FR-016: filter-in-place. Omitted → non-interactive tile (GM/stubs/revenue). */
  onClick?: () => void
  /** FR-016: the tile driving the current filter gets a primary ring + aria-current. */
  selected?: boolean
  /** FR-008: a basis qualifier (label rendered via BasisChip) on GM/COGS tiles. */
  basis?: { label: string }
  /** FR-008/024: a DQ badge from bom_coverage_pct on GM/COGS tiles. */
  dq?: DqState
  /**
   * Extra class(es) on the tile's grid-child element — the composition's hook for
   * grid placement (e.g. the Money channel-mix tile spans 2 tracks on narrow grids,
   * census r3). Layout stays the parent grid's concern, never the tile's.
   */
  className?: string
}

const DELTA_TONE: Record<KPITileDelta['tone'], PillTone> = {
  success: 'success',
  destructive: 'destructive',
  neutral: 'neutral',
}

export function KPITile({
  label,
  value,
  delta,
  sub,
  state = 'ready',
  help,
  onClick,
  selected = false,
  basis,
  dq,
  className: extraClassName,
}: KPITileProps) {
  const withExtra = (base: string) => (extraClassName ? `${base} ${extraClassName}` : base)

  if (state === 'loading') {
    // Cohesion-debt 2026-07-19, item #3: one loading grammar — the shared
    // LoadingShell (role=status + SkeletonRows), not a role=group Pill-skeleton.
    // The KPI label stays visible AND names the busy status.
    return (
      <div className={withExtra('kpi-tile')}>
        <span className="kpi-tile-label">{label}</span>
        <LoadingShell count={1} label={label} />
      </div>
    )
  }

  const inner: ReactNode = (
    <>
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
      {(basis || dq) && (
        <span className="kpi-tile-foot">
          {basis && <BasisChip label={basis.label} />}
          {dq && <DQBadge dq={dq} />}
        </span>
      )}
    </>
  )

  const className = withExtra(`kpi-tile${selected ? ' kpi-tile--selected' : ''}`)

  // onClick present → a real <button> for filter-in-place (FR-016/AC-016).
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-current={selected ? 'true' : undefined}
        data-touch-target="true"
        onClick={onClick}
      >
        {inner}
      </button>
    )
  }

  return (
    <div className={className} role="group" aria-label={label}>
      {inner}
    </div>
  )
}
