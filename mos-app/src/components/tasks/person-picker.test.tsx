import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PersonPicker } from './person-picker'
import type { PersonOption } from '@/lib/db/directory'

const people: PersonOption[] = [
  { id: 'p1', full_name: 'Ada Lovelace' },
  { id: 'p2', full_name: 'Alan Turing' },
  { id: 'p3', full_name: 'Grace Hopper' },
]

describe('PersonPicker', () => {
  it('lists selectable people and excludes the given ids', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<PersonPicker people={people} exclude={['p2', 'p3']} onSelect={onSelect} onClose={onClose} />)
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.click(screen.getByRole('option', { name: /ada lovelace/i }))
    expect(onSelect).toHaveBeenCalledWith('p1')
    expect(onClose).toHaveBeenCalled()
  })

  it('arrows/Home/End move the highlight and Enter picks it', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<PersonPicker people={people} onSelect={onSelect} onClose={onClose} />)
    const [ada, alan, grace] = screen.getAllByRole('option')
    expect(ada).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}')
    expect(alan).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}')
    expect(grace).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Home}')
    expect(ada).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('p3')
    expect(onClose).toHaveBeenCalled()
  })

  it('typing narrows the list and Enter picks the typed match, not the option under a resting pointer', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<PersonPicker people={people} onSelect={onSelect} onClose={vi.fn()} />)
    await user.hover(screen.getByRole('option', { name: /ada lovelace/i }))
    await user.keyboard('gra')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('p3')
  })

  it('shows an empty-result line when nobody matches', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<PersonPicker people={people} onSelect={onSelect} onClose={vi.fn()} />)
    await user.keyboard('zzz{Enter}')
    expect(screen.getByText('No people match')).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  // D-B2: Escape inside the picker dismisses it locally (and is consumed) so it never bubbles to
  // a host panel and closes the whole surface.
  it('Escape dismisses the picker via onClose and does not bubble to the host', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const hostEscape = vi.fn()
    render(
      <div onKeyDown={(e) => { if (e.key === 'Escape') hostEscape() }}>
        <PersonPicker people={people} onSelect={vi.fn()} onClose={onClose} />
      </div>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(hostEscape).not.toHaveBeenCalled()
  })
})
