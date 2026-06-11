import RailNav from './RailNav'

interface RailProps {
  onNavigate?: () => void
}

export default function Rail({ onNavigate }: RailProps) {
  return (
    <aside
      className="bg-card border-r border-border flex flex-col"
      style={{ width: 'var(--rail-w)' }}
    >
      <RailNav onNavigate={onNavigate} />
    </aside>
  )
}
