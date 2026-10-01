import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
  it('an unset field activates the first option so ArrowDown then Enter selects immediately', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderPicker({ value: '', onChange })
    screen.getByRole('combobox', { name: 'Status' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Open' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('blocked')
  })

  it('with an empty-value placeholder option first, arrows and Enter still select a person', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderPicker({
      label: 'Supervisor',
      value: '',
      options: [{ value: '', label: 'Select supervisor…' }, { value: 'p1', label: 'Ada' }, { value: 'p2', label: 'Alan' }],
      onChange,
    })
    screen.getByRole('combobox', { name: 'Supervisor' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Select supervisor…' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('p1')
  })

  it('keeps the highlighted option when the options reorder while the list is open', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = renderPicker({ onChange })
    screen.getByRole('combobox', { name: 'Status' }).focus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Blocked' })).toHaveAttribute('aria-selected', 'true')
    rerender(<Picker label="Status" value="open" options={[...options.slice(1), options[0]]} onChange={onChange} />)
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('blocked')
  })

  it('opens as an anchored listbox and selects with arrows, then returns focus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderPicker({ onChange })

    const trigger = screen.getByRole('combobox', { name: 'Status' })
    await user.click(trigger)
    const listbox = screen.getByRole('listbox', { name: 'Status' })
    expect(screen.getByRole('combobox', { name: 'Filter Status' })).toHaveFocus()
    expect(listbox).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Open' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('blocked')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('supports Home, End, typed filtering, and local Escape', async () => {
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
    await user.keyboard('{End}')
    expect(screen.getByRole('option', { name: 'Supervisor' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Home}')
    expect(screen.getByRole('option', { name: 'Open' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('su')
    expect(screen.getByRole('option', { name: 'Supervisor' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('option', { name: 'Blocked' })).not.toBeInTheDocument()
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

  it('keeps a long selected value discoverable when the trigger must clip it', () => {
    const longLabel = 'Gordi HQ Retail Operations and Customer Experience'
    renderPicker({
      value: 'long',
      options: [{ value: 'long', label: longLabel }],
    })

    const trigger = screen.getByRole('combobox', { name: 'Status' })
    expect(trigger).toHaveAttribute('title', longLabel)
    expect(trigger).toHaveAttribute('data-full-value', longLabel)
    expect(trigger.querySelector('[data-full-value]')).toHaveAttribute('title', longLabel)
  })

  it('adds an optional trigger prefix without repeating it in the menu', async () => {
    const user = userEvent.setup()
    renderPicker({ triggerPrefix: 'Group' })

    const trigger = screen.getByRole('combobox', { name: 'Status' })
    expect(trigger).toHaveTextContent('Group: Open')
    expect(trigger).toHaveAttribute('data-full-value', 'Group: Open')
    await user.click(trigger)
    expect(screen.getByRole('option', { name: 'Done' })).toHaveTextContent('Done')
    expect(screen.queryByRole('option', { name: 'Group: Done' })).not.toBeInTheDocument()
  })

  it('shows the typed filter and Enter selects the match, not the option under a resting pointer', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderPicker({
      onChange,
      options: [
        { value: 'ada', label: 'Ada Lovelace' },
        { value: 'alan', label: 'Alan Turing' },
        { value: 'grace', label: 'Grace Hopper' },
      ],
    })

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.hover(screen.getByRole('option', { name: 'Ada Lovelace' }))
    await user.keyboard('gra')

    expect(screen.getByRole('combobox', { name: 'Filter Status' })).toHaveValue('gra')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith('grace')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveFocus()
  })

  it('shows an empty-result line when nothing matches and Enter selects nothing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderPicker({ onChange })

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.keyboard('zzz{Enter}')

    expect(screen.getByText('No matches')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('opens from the keyboard', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.tab()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('combobox', { name: 'Filter Status' })).toHaveFocus()
  })

  it('marks a 200-character unbroken label for single-line truncation', async () => {
    const user = userEvent.setup()
    const long = 'x'.repeat(200)
    renderPicker({ options: [{ value: 'long', label: long }], value: 'long' })
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    const label = screen.getByRole('option', { name: long }).querySelector('.picker__option-label')
    expect(label).toHaveTextContent(long)
    expect(label).toHaveClass('picker__option-label')
  })

  describe('option groups', () => {
    const grouped: PickerOption[] = [
      { value: 'a', label: 'Alpha', group: 'Not linked yet' },
      { value: 'b', label: 'Bravo', group: 'Not linked yet' },
      { value: 'c', label: 'Charlie (in Other)', group: 'Linked to another Objective' },
    ]

    it('names each run of grouped options with a heading, and options keep their own names', async () => {
      const user = userEvent.setup()
      renderPicker({ options: grouped, value: '' })
      await user.click(screen.getByRole('combobox', { name: 'Status' }))
      const first = screen.getByRole('group', { name: 'Not linked yet' })
      const second = screen.getByRole('group', { name: 'Linked to another Objective' })
      expect(within(first).getAllByRole('option').map((option) => option.textContent)).toEqual(['Alpha', 'Bravo'])
      expect(within(second).getAllByRole('option').map((option) => option.textContent)).toEqual(['Charlie (in Other)'])
    })

    it('hides a heading whose options are all filtered out, and Enter selects within the groups', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      renderPicker({ options: grouped, value: '', onChange })
      await user.click(screen.getByRole('combobox', { name: 'Status' }))
      await user.keyboard('char')
      expect(screen.getByText('Not linked yet')).not.toBeVisible()
      expect(screen.getByText('Linked to another Objective')).toBeVisible()
      await user.keyboard('{Enter}')
      expect(onChange).toHaveBeenCalledWith('c')
    })

    it('leaves an ungrouped list exactly as it was (no group wrappers)', async () => {
      const user = userEvent.setup()
      renderPicker()
      await user.click(screen.getByRole('combobox', { name: 'Status' }))
      expect(screen.queryByRole('group')).toBeNull()
    })
  })
})
