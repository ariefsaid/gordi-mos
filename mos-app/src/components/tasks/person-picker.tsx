import { useRef, useState } from 'react'
import { Command } from 'cmdk'
import type { PersonOption } from '@/lib/db/directory'
import { useT } from '@/i18n/use-t'
import { initials } from './task-formatters'

// ── Person picker (filterable listbox overlay) ───────────────────────────────
export type PersonPickerProps = {
  people: PersonOption[]
  onSelect: (id: string) => void
  onClose: () => void
  exclude?: string[]
}

export function PersonPicker({ people, onSelect, onClose, exclude = [] }: PersonPickerProps) {
  const t = useT()
  const available = people.filter(person => !exclude.includes(person.id))
  // Captured during the first render, before the search input takes focus.
  const openerRef = useRef<Element | null>(null)
  if (openerRef.current === null && typeof document !== 'undefined') openerRef.current = document.activeElement
  const restoreFocus = () => {
    const opener = openerRef.current
    if (opener instanceof HTMLElement && opener !== document.body) opener.focus()
  }
  const [active, setActive] = useState(available[0]?.id ?? '')

  // Typed text ranks prefix matches first; hover never moves the highlight (disablePointerSelection).
  const filter = (id: string, query: string) => {
    const name = available.find(person => person.id === id)?.full_name.toLocaleLowerCase() ?? ''
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
        restoreFocus()
        onClose()
      }}
    >
      <Command.Input className="person-picker-search" autoFocus aria-label={t('tasks.people.select')} />
      <Command.List label={t('tasks.people.select')}>
        <Command.Empty className="person-picker-empty">{t('tasks.people.none')}</Command.Empty>
        {available.map(person => (
          <Command.Item
            key={person.id}
            value={person.id}
            className="person-picker-option"
            onSelect={() => { onSelect(person.id); restoreFocus(); onClose() }}
          >
            <span className="person-av" aria-hidden="true">{initials(person.full_name)}</span>
            <span className="person-picker-label">{person.full_name}</span>
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  )
}
