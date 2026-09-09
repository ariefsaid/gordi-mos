import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Picker, type PickerOption } from './picker'

const options: PickerOption[] = [
  { value: 'open', label: 'Open' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

function renderPicker(overrides: Partial<React.ComponentProps<typeof Picker>> = {}) {
  return render(
    <Picker
      label="Status"
      value="open"
      options={options}
      onChange={vi.fn()}
      {...overrides}
    />,
  )
}

describe('Picker', () => {
  it('opens as an anchored listbox and selects with arrows, then returns focus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderPicker({ onChange })

    const trigger = screen.getByRole('combobox', { name: 'Status' })
    await user.click(trigger)
    const listbox = screen.getByRole('listbox', { name: 'Status' })
    expect(listbox).toHaveFocus()
    expect(screen.getByRole('option', { name: 'Open' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('blocked')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('supports Home, End, repeated-character typeahead, and local Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const hostEscape = vi.fn()
    render(
      <div onKeyDown={(event) => { if (event.key === 'Escape') hostEscape() }}>
        <Picker
          label="Status"
          value="open"
          options={[...options, { value: 'supervisor', label: 'Supervisor' }]}
          onChange={onChange}
        />
      </div>,
    )

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    const listbox = screen.getByRole('listbox', { name: 'Status' })
    await user.keyboard('{End}')
    expect(listbox).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Supervisor' }).id)
    await user.keyboard('{Home}')
    expect(listbox).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Open' }).id)
    await user.keyboard('ss')
    expect(listbox).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Supervisor' }).id)
    await user.keyboard('{Escape}')

    expect(onChange).not.toHaveBeenCalled()
    expect(hostEscape).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveFocus()
  })

  it('skips disabled options and never opens while disabled or busy', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = renderPicker({
      onChange,
      options: [
        { value: 'open', label: 'Open' },
        { value: 'blocked', label: 'Blocked', disabled: true },
        { value: 'done', label: 'Done' },
      ],
    })

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('done')

    rerender(<Picker label="Status" value="open" options={options} onChange={onChange} disabled />)
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeDisabled()
    await user.click(screen.getByRole('combobox', { name: 'Status' })).catch(() => {})
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    rerender(<Picker label="Status" value="open" options={options} onChange={onChange} busy />)
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveAttribute('aria-busy', 'true')
  })

  it('closes on outside pointer and lets Tab move to the next control', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Picker label="Status" value="open" options={options} onChange={vi.fn()} />
        <button type="button">Next control</button>
      </>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Status' })
    await user.click(trigger)
    await user.keyboard('{Tab}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next control' })).toHaveFocus()

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Next control' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
