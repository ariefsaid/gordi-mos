import { RailNav } from './rail-nav'

interface RailProps {
  onNavigate?: () => void
}

export function Rail({ onNavigate }: RailProps) {
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
      <RailNav onNavigate={onNavigate} />
    </aside>
  )
}
