import { RailNav } from './rail-nav'
import { useRailCounts } from './use-rail-counts'

interface RailProps {
  onNavigate?: () => void
  /**
   * OD-REDESIGN-84.2 (P1-1): the 920–1099.98px icon-only regime — app-shell computes this
   * from the existing narrow/split breakpoint family (`!isNarrow && !isSplit`) and passes it
   * down; Rail itself stays width-query-free (one hook owner per breakpoint).
   */
  compact?: boolean
}

export function Rail({ onNavigate, compact = false }: RailProps) {
  // The rail's single count-fetch seam (once per mount, no polling). Rail is the desktop-only
  // wrapper (app-shell renders it at ≥920px), so the aggregate is fetched exactly once.
  const counts = useRailCounts()
  return (
    <aside
      className="bg-secondary border-r border-border flex flex-col"
      data-rail-compact={compact ? 'true' : undefined}
      style={{
        width: compact ? 'var(--rail-w-compact)' : 'var(--rail-w)',
        gridArea: 'rail',
        minHeight: 0,
        // NAV-2: the CSS-only compact tooltip (rail-nav.css) escapes the 72px aside to the RIGHT
        // (`left:100%`). A scroll container clips it — and `overflow-y:auto` alone forces
        // `overflow-x` computed to `auto` too (the spec's "visible reverts to auto" rule), so the
        // label never paints in the 920–1099px band. The compact regime is icon-only (short list),
        // so it takes `overflow:visible` to let the tooltip disclose; the full labelled rail (no
        // tooltip, taller content) keeps its own scroll.
        ...(compact
          ? { overflow: 'visible' }
          : { overflowY: 'auto', overscrollBehavior: 'contain' }),
      }}
    >
      <RailNav onNavigate={onNavigate} counts={counts} compact={compact} />
    </aside>
  )
}
