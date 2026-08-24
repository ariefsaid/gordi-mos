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
import { HelpTip } from '@/components/ui/help-tip'
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
  /** Composition-owned hook (grid placement, surface-local sizing). The tile never styles
   *  itself from this — GRID PLACEMENT IS THE PAGE'S CONCERN, not the tile's, so a page that
   *  needs one tile to span two tracks passes a class rather than the tile growing a `span` prop. */
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
  if (state === 'loading') {
    return (
      <div
        className={`kpi-tile${extraClassName ? ` ${extraClassName}` : ''}`}
        role="group"
        aria-label={label}
        aria-busy="true"
      >
        <span className="kpi-tile-label">{label}</span>
        <Pill tone="skeleton" dot={false} className="kpi-tile-skeleton-value" style={{ width: '72px', height: '23px' }}>
          &nbsp;
        </Pill>
      </div>
    )
  }

  const inner: ReactNode = (
    <>
      <span className="kpi-tile-label">
        {label}
        {/* #359: this was a second, hand-rolled copy of the "?" help control, carrying the
            native-`title` defect — it did nothing when tapped, on the primary (touch) device.
            Converged on the shared HelpTip primitive: tap-to-open, Escape-dismiss and viewport
            clamping for free, and one thing to fix next time. `.kpi-tile-help` survives in
            kpi-tile.css only as the tile-local positioning concern (stacking above the hit
            overlay); the glyph now comes from help-tip.css. */}
        {help && <HelpTip label={help} className="kpi-tile-help" />}
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

  const className =
    `kpi-tile${selected ? ' kpi-tile--selected' : ''}${onClick ? ' kpi-tile--interactive' : ''}${extraClassName ? ` ${extraClassName}` : ''}`

  // onClick present → filter-in-place (FR-016/AC-016). #359: the tile itself is no longer a
  // <button> WRAPPER — HelpTip is a <button>, and nesting interactive elements is invalid and
  // AT-hostile. A stretched transparent hit button overlays the tile; the help button stacks
  // above it (z-index), so both are independently reachable.
  if (onClick) {
    return (
      <div className={className}>
        <button
          type="button"
          className="kpi-tile-hit"
          aria-label={label}
          aria-current={selected ? 'true' : undefined}
          data-touch-target="true"
          onClick={onClick}
        />
        {inner}
      </div>
    )
  }

  return (
    <div className={className} role="group" aria-label={label}>
      {inner}
    </div>
  )
}
