import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonPicker } from './person-picker'
import type { PersonOption } from '@/lib/db/directory'

const people: PersonOption[] = [
  { id: 'p1', full_name: 'Ada Lovelace' },
  { id: 'p2', full_name: 'Alan Turing' },
]

describe('PersonPicker', () => {
  it('lists selectable people and excludes the given ids', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<PersonPicker people={people} exclude={['p2']} onSelect={onSelect} onClose={onClose} />)
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.click(screen.getByRole('option', { name: /ada lovelace/i }))
    expect(onSelect).toHaveBeenCalledWith('p1')
    expect(onClose).toHaveBeenCalled()
  })

  // D-B2: Escape inside the picker dismisses it locally (and is consumed) so it never bubbles to
  // a host panel and closes the whole surface.
  it('Escape dismisses the picker via onClose and does not bubble to the host', () => {
    const onClose = vi.fn()
    const hostEscape = vi.fn()
    render(
      <div onKeyDown={(e) => { if (e.key === 'Escape') hostEscape() }}>
        <PersonPicker people={people} onSelect={vi.fn()} onClose={onClose} />
      </div>,
    )
    fireEvent.keyDown(screen.getByRole('listbox', { name: /select person/i }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(hostEscape).not.toHaveBeenCalled()
  })
})
