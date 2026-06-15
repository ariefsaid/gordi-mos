import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonPicker } from './PersonPicker'
import type { PersonOption } from '../../lib/db/directory'

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
})
