import { useEffect, useRef, useState, type RefObject } from 'react'
import { Command } from 'cmdk'
import * as Popover from '@radix-ui/react-popover'
import type { PersonOption } from '@/lib/db/directory'
import { useT } from '@/i18n/use-t'
import { initials } from './task-formatters'

// ── Person picker (filterable listbox overlay) ───────────────────────────────
export type PersonPickerProps = {
  people: PersonOption[]
  onSelect: (id: string) => void
  onClose: () => void
  exclude?: string[]
  // The element the picker serves (e.g. the composer textarea); without one it anchors where it renders.
  anchorRef?: RefObject<HTMLElement | null>
  // Attached mode: the anchor element keeps DOM focus and its text drives the filter; ArrowUp/Down,
  // Home/End and Enter typed there move and pick. Without it the picker owns a search input.
  query?: string
}

export function PersonPicker({ people, onSelect, onClose, exclude = [], anchorRef, query }: PersonPickerProps) {
  const t = useT()
  const available = people.filter(person => !exclude.includes(person.id))
  // Captured during the first render, before the search input takes focus.
  const openerRef = useRef<Element | null>(null)
  if (openerRef.current === null && typeof document !== 'undefined') openerRef.current = document.activeElement
  const restoreFocus = () => {
    const opener = openerRef.current
    if (opener instanceof HTMLElement && opener !== document.body) opener.focus()
  }
  const attached = query !== undefined
  const [active, setActive] = useState('')
  const [typed, setTyped] = useState('')
  const needle = (attached ? query : typed).trim().toLocaleLowerCase()

  // Prefix matches rank first; hover never moves the highlight (disablePointerSelection).
  const visible = available
    .map(person => {
      const name = person.full_name.toLocaleLowerCase()
      return { person, score: !needle || name.startsWith(needle) ? 1 : name.includes(needle) ? 0.5 : 0 }
    })
    .filter(entry => entry.score > 0)
    .sort((x, y) => y.score - x.score)
    .map(entry => entry.person)
  const activeId = visible.some(person => person.id === active) ? active : visible[0]?.id ?? ''

  const closeWithFocus = () => { restoreFocus(); onClose() }

  const keyState = useRef({ visible, activeId })
  keyState.current = { visible, activeId }
  const pickRef = useRef((id: string) => { onSelect(id); closeWithFocus() })
  pickRef.current = (id: string) => { onSelect(id); closeWithFocus() }
  useEffect(() => {
    const anchor = attached ? anchorRef?.current : null
    if (!anchor) return
    const onKey = (event: KeyboardEvent) => {
      const { visible: list, activeId: current } = keyState.current
      if (list.length === 0) return
      const index = list.findIndex(person => person.id === current)
      let next = -1
      if (event.key === 'ArrowDown') next = (index + 1) % list.length
      else if (event.key === 'ArrowUp') next = (index - 1 + list.length) % list.length
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = list.length - 1
      else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault()
        pickRef.current(current)
        return
      } else return
      event.preventDefault()
      setActive(list[next].id)
    }
    anchor.addEventListener('keydown', onKey)
    return () => anchor.removeEventListener('keydown', onKey)
  }, [attached, anchorRef])

  return (
    <Popover.Root open onOpenChange={(next) => { if (!next) onClose() }}>
      {anchorRef ? <Popover.Anchor virtualRef={anchorRef} /> : <Popover.Anchor className="person-picker-anchor" />}
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          data-escape-layer="nested"
          className="person-picker"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <Command
            label={t('tasks.people.select')}
            className="person-picker__command"
            shouldFilter={false}
            value={activeId}
            onValueChange={setActive}
            disablePointerSelection
            loop
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.stopPropagation()
              closeWithFocus()
            }}
          >
            {!attached && (
              <Command.Input
                className="person-picker-search"
                autoFocus
                value={typed}
                onValueChange={setTyped}
                aria-label={t('tasks.people.select')}
              />
            )}
            <Command.List className="person-picker-list" label={t('tasks.people.select')}>
              <Command.Empty className="person-picker-empty">{t('tasks.people.none')}</Command.Empty>
              {visible.map(person => (
                <Command.Item
                  key={person.id}
                  value={person.id}
                  className="person-picker-option"
                  onSelect={() => { onSelect(person.id); closeWithFocus() }}
                >
                  <span className="person-av" aria-hidden="true">{initials(person.full_name)}</span>
                  <span className="person-picker-label">{person.full_name}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
