import type { PersonOption } from '@/lib/db/directory'
import { initials } from './task-formatters'

// ── Person picker (simple select overlay) ───────────────────────────────────
export type PersonPickerProps = {
  people: PersonOption[]
  onSelect: (id: string) => void
  onClose: () => void
  exclude?: string[]
}

export function PersonPicker({ people, onSelect, onClose, exclude = [] }: PersonPickerProps) {
  const available = people.filter(p => !exclude.includes(p.id))
  return (
    <div role="listbox" aria-label="Select person" className="person-picker">
      {available.map(p => (
        <div
          key={p.id}
          role="option"
          aria-selected={false}
          className="person-picker-option"
          tabIndex={0}
          onClick={() => { onSelect(p.id); onClose() }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { onSelect(p.id); onClose() } }}
        >
          <span className="person-av" aria-hidden="true">{initials(p.full_name)}</span>
          <span>{p.full_name}</span>
        </div>
      ))}
    </div>
  )
}
