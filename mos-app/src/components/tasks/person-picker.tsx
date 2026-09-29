import { useState } from 'react'
import { Command } from 'cmdk'
import type { PersonOption } from '@/lib/db/directory'
import { initials } from './task-formatters'
import { useT } from '@/i18n/use-t'

// ── Person picker (filterable listbox overlay) ───────────────────────────────
export type PersonPickerProps = {
  people: PersonOption[]
  onSelect: (id: string) => void
  onClose: () => void
  exclude?: string[]
}

export function PersonPicker({ people, onSelect, onClose, exclude = [] }: PersonPickerProps) {
  const t = useT()
  const available = people.filter(p => !exclude.includes(p.id))
  const [active, setActive] = useState(available[0]?.id ?? '')

  // Typed text ranks prefix matches first; hover never moves the highlight (disablePointerSelection).
  const filter = (id: string, query: string) => {
    const name = available.find(p => p.id === id)?.full_name.toLocaleLowerCase() ?? ''
    const needle = query.trim().toLocaleLowerCase()
    if (!needle || name.startsWith(needle)) return 1
    return name.includes(needle) ? 0.5 : 0
  }

  return (
    <Command
      label={t('tasks.people.select')}
      className="person-picker"
      filter={filter}
      value={active}
      onValueChange={setActive}
      disablePointerSelection
      loop
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
    >
      <Command.Input className="person-picker-search" autoFocus aria-label={t('tasks.people.select')} />
      <Command.List label={t('tasks.people.select')}>
        <Command.Empty className="person-picker-empty">{t('tasks.people.none')}</Command.Empty>
        {available.map(p => (
          <Command.Item
            key={p.id}
            value={p.id}
            className="person-picker-option"
            onSelect={() => { onSelect(p.id); onClose() }}
          >
            <span className="person-av" aria-hidden="true">{initials(p.full_name)}</span>
            <span>{p.full_name}</span>
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  )
}
