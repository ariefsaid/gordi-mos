import { RailNav } from './rail-nav'

interface RailProps {
  onNavigate?: () => void
}

export function Rail({ onNavigate }: RailProps) {
  return (
    <aside
      className="bg-secondary border-r border-border flex flex-col"
      style={{ width: 'var(--rail-w)', gridArea: 'rail' }}
    >
      <RailNav onNavigate={onNavigate} />
    </aside>
  )
}
