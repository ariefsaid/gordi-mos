import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskFilterSelect } from './task-filter-select'

const options = [{ value: 'due', label: 'Due soonest' }, { value: 'name', label: 'Task A–Z' }, { value: 'activity', label: 'Recent activity' }]

describe('Task filter option menu', () => {
  it('opens on the selected option, supports arrows, commits and returns focus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TaskFilterSelect label="Sort" value="due" options={options} onChange={onChange} />)
    const trigger = screen.getByRole('combobox', { name: 'Sort' })
    await user.click(trigger)
    const list = screen.getByRole('listbox', { name: 'Sort' })
    expect(list).toHaveFocus()
    expect(screen.getByRole('option', { name: 'Due soonest' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('name')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('supports Home, End and typeahead without committing on Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TaskFilterSelect label="Sort" value="due" options={options} onChange={onChange} />)
    const trigger = screen.getByRole('combobox')
    trigger.focus()
    await user.keyboard('{ArrowDown}{End}')
    const list = screen.getByRole('listbox')
    expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Recent activity' }).id)
    await user.keyboard('{Home}')
    expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Due soonest' }).id)
    await user.keyboard('t')
    expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Task A–Z' }).id)
    await user.keyboard('{Escape}')
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('selects by pointer and lets Tab move to the next control', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<><TaskFilterSelect label="Sort" value="due" options={options} onChange={onChange} /><button>Next filter</button></>)
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Recent activity' }))
    expect(onChange).toHaveBeenCalledWith('activity')
    await user.click(screen.getByRole('combobox'))
    await user.tab()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Next filter' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('combobox')).toHaveFocus()
  })

  it('cycles matching options on repeated characters while retaining multi-character search', async () => {
    const user = userEvent.setup()
    render(<TaskFilterSelect label="Sort" value="due" options={[
      { value: 'due', label: 'Due soonest' },
      { value: 'status', label: 'Status' },
      { value: 'supervisor', label: 'Supervisor' },
    ]} onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox'))
    const list = screen.getByRole('listbox')
    await user.keyboard('s')
    expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Status' }).id)
    await user.keyboard('s')
    expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Supervisor' }).id)
    await user.keyboard('s')
    expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Status' }).id)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('su')
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Supervisor' }).id)
  })

  it('keeps typeahead and menu navigation from triggering collection keyboard shortcuts', async () => {
    const user = userEvent.setup()
    const shortcut = vi.fn()
    render(<TaskFilterSelect label="Group" value="none" options={[{ value: 'none', label: 'None' }, { value: 'objective', label: 'Objective' }]} onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox'))
    window.addEventListener('keydown', shortcut)
    try {
      await user.keyboard('noj{ArrowDown}{Escape}')
      expect(shortcut).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', shortcut)
    }
  })

  it('consumes keyboard activation before it reaches collection shortcuts', async () => {
    const user = userEvent.setup()
    const shortcut = vi.fn()
    render(<TaskFilterSelect label="Status" value="any" options={[{ value: 'any', label: 'Any status' }]} onChange={vi.fn()} />)
    await user.tab()
    window.addEventListener('keydown', shortcut)
    try {
      await user.keyboard('{Enter}')
      expect(screen.getByRole('listbox')).toHaveFocus()
      expect(shortcut).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', shortcut)
    }
  })

  it('dismisses on outside pointer without changing the value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<><TaskFilterSelect label="Sort" value="due" options={options} onChange={onChange} /><button>Outside</button></>)
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })
})
