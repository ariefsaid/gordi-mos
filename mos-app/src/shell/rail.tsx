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
        overflowY: 'auto',
        overscrollBehavior: 'contain',
      }}
    >
      <RailNav onNavigate={onNavigate} counts={counts} compact={compact} />
    </aside>
  )
}
