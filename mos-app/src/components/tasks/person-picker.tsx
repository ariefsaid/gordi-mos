import type { PersonOption } from '@/lib/db/directory'
import { initials } from './task-formatters'
import { useT } from '@/i18n/use-t'
import { useListboxPopover } from '@/components/ui/use-listbox-popover'

// ── Person picker (listbox overlay) ──────────────────────────────────────────
export type PersonPickerProps = {
  people: PersonOption[]
  onSelect: (id: string) => void
  onClose: () => void
  exclude?: string[]
}

export function PersonPicker({ people, onSelect, onClose, exclude = [] }: PersonPickerProps) {
  const t = useT()
  const available = people.filter(p => !exclude.includes(p.id))
  // GAP-8 (OD-91 #13): the shared listbox keyboard contract — arrows/Home/End move the virtual
  // cursor (aria-activedescendant), Enter/Space picks it, Escape dismisses locally + returns focus.
  const { listboxProps, getOptionProps, activeIndex } = useListboxPopover({
    itemCount: available.length,
    onSelect: (index) => { const p = available[index]; if (p) { onSelect(p.id); onClose() } },
    onClose,
  })

  return (
    <div
      {...listboxProps}
      aria-label={t('tasks.people.select')}
      className="person-picker"
    >
      {available.map((p, index) => (
        <div
          key={p.id}
          {...getOptionProps(index)}
          aria-selected={index === activeIndex}
          className={`person-picker-option${index === activeIndex ? ' is-active' : ''}`}
          onClick={() => { onSelect(p.id); onClose() }}
        >
          <span className="person-av" aria-hidden="true">{initials(p.full_name)}</span>
          <span>{p.full_name}</span>
        </div>
      ))}
    </div>
  )
}
