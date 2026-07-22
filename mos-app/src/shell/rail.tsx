import { RailNav } from './rail-nav'
import { useRailCounts } from './use-rail-counts'

interface RailProps {
  onNavigate?: () => void
}

export function Rail({ onNavigate }: RailProps) {
  // The rail's single count-fetch seam (once per mount, no polling). Rail is the desktop-only
  // wrapper (app-shell renders it at ≥920px), so the aggregate is fetched exactly once.
  const counts = useRailCounts()
  return (
    <aside
      className="bg-secondary border-r border-border flex flex-col"
      style={{
        width: 'var(--rail-w)',
        gridArea: 'rail',
        minHeight: 0,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
      }}
    >
      <RailNav onNavigate={onNavigate} counts={counts} />
    </aside>
  )
}
