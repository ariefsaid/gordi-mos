import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from './select'

const options = (
  <>
    <option value="apple">Apple</option>
    <option value="banana">Banana</option>
    <option value="cherry">Cherry</option>
  </>
)

function openSelect() {
  return userEvent.click(screen.getByRole('combobox'))
}

describe('Select (primitive)', () => {
  it('renders a designed combobox and exposes its options through an anchored listbox', async () => {
    render(
      <Select value="apple" aria-label="Choose fruit" data-testid="select">
        {options}
      </Select>,
    )

    const trigger = screen.getByRole('combobox', { name: 'Choose fruit' })
    expect(trigger).toHaveTextContent('Apple')
    expect(trigger.tagName).toBe('BUTTON')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await userEvent.click(trigger)
    const listbox = screen.getByRole('listbox', { name: 'Choose fruit' })
    expect(listbox).toBeInTheDocument()
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Apple', 'Banana', 'Cherry',
    ])
    expect(within(listbox).getByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'true')
  })

  it('fires the native-shaped change event and updates the form bridge when an option is chosen', async () => {
    const user = userEvent.setup()
    let changedValue = ''
    const onChange = vi.fn((event: React.ChangeEvent<HTMLSelectElement>) => { changedValue = event.target.value })
    render(
      <form>
        <Select
          label="Choose fruit"
          name="fruit"
          value="apple"
          onChange={onChange}
          data-testid="select"
        >
          {options}
        </Select>
      </form>,
    )

    await openSelect()
    await user.click(screen.getByRole('option', { name: 'Banana' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(changedValue).toBe('banana')
    expect(screen.getByTestId('select')).toHaveTextContent('Apple')
    expect(screen.getByTestId('select').closest('.mk-select')?.querySelector('[data-select-native]')).toHaveValue('apple')
    expect(new FormData(screen.getByRole('combobox', { name: 'Choose fruit' }).closest('form')!).get('fruit')).toBe('apple')
  })

  it('supports uncontrolled defaultValue and keeps the bridge in sync after selection', async () => {
    const user = userEvent.setup()
    render(
      <Select label="Choose fruit" defaultValue="apple" data-testid="select">
        {options}
      </Select>,
    )
    expect(screen.getByTestId('select')).toHaveTextContent('Apple')

    await openSelect()
    await user.click(screen.getByRole('option', { name: 'Cherry' }))

    expect(screen.getByTestId('select')).toHaveTextContent('Cherry')
    expect(screen.getByTestId('select').closest('.mk-select')?.querySelector('[data-select-native]')).toHaveValue('cherry')
  })

  it('mirrors a native form reset back to the visible trigger', async () => {
    const user = userEvent.setup()
    render(
      <form>
        <Select label="Choose fruit" defaultValue="apple" data-testid="select">
          {options}
        </Select>
      </form>,
    )
    const trigger = screen.getByTestId('select')
    const form = trigger.closest('form')!

    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: 'Cherry' }))
    expect(trigger).toHaveTextContent('Cherry')

    await act(async () => {
      form.reset()
      await Promise.resolve()
    })
    expect(trigger).toHaveTextContent('Apple')
    expect(trigger.closest('.mk-select')?.querySelector('[data-select-native]')).toHaveValue('apple')
  })

  it('supports arrows, Home/End, typeahead, Enter, Escape, and focus return', async () => {
    const user = userEvent.setup()
    let changedValue = ''
    const onChange = vi.fn((event: React.ChangeEvent<HTMLSelectElement>) => { changedValue = event.target.value })
    render(
      <Select label="Choose fruit" value="apple" onChange={onChange}>
        <option value="apple">Apple</option>
        <option value="banana" disabled>Banana</option>
        <option value="cherry">Cherry</option>
        <option value="clementine">Clementine</option>
      </Select>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Choose fruit' })
    await user.click(trigger)
    const listbox = screen.getByRole('listbox', { name: 'Choose fruit' })

    await user.keyboard('{ArrowDown}')
    expect(listbox).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Cherry' }).id,
    )
    await user.keyboard('{End}')
    expect(listbox).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Clementine' }).id,
    )
    await user.keyboard('a')
    expect(listbox).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Apple' }).id,
    )
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(changedValue).toBe('cherry')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('dismisses on outside click without changing the selected value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <>
        <Select label="Choose fruit" value="apple" onChange={onChange} />
        <button type="button">Outside</button>
      </>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Choose fruit' })
    await user.click(trigger)
    expect(screen.getByRole('listbox', { name: 'Choose fruit' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger).toHaveTextContent('Choose fruit')
  })

  it('skips disabled choices and does not open while disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Select label="Choose fruit" value="apple" onChange={onChange} disabled>
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
      </Select>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Choose fruit' })
    expect(trigger).toBeDisabled()
    await user.click(trigger)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    render(
      <Select label="Choose fruit" value="apple" onChange={onChange}>
        <option value="apple">Apple</option>
        <option value="banana" disabled>Banana</option>
      </Select>,
    )
    const enabledTrigger = screen.getAllByRole('combobox', { name: 'Choose fruit' }).at(-1)!
    await user.click(enabledTrigger)
    const disabledOption = screen.getAllByRole('option', { name: 'Banana' }).at(-1)!
    expect(disabledOption).toHaveAttribute('aria-disabled', 'true')
    await user.click(disabledOption)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('associates labels, forwards error/description semantics, and keeps the shared shell classes', () => {
    render(
      <Select
        id="fruit"
        label="Choose fruit"
        error
        required
        aria-describedby="fruit-help"
        fullWidth
        data-testid="select"
      >
        <option value="apple">Apple</option>
      </Select>,
    )
    const trigger = screen.getByTestId('select')
    expect(trigger).toHaveAttribute('id', 'fruit')
    expect(screen.getByText('Choose fruit')).toHaveAttribute('for', 'fruit')
    expect(trigger).toHaveAttribute('aria-invalid', 'true')
    expect(trigger).toHaveAttribute('aria-required', 'true')
    expect(trigger).toHaveAttribute('aria-describedby', 'fruit-help')
    expect(trigger.closest('.mk-select')).toHaveClass('mk-select--error', 'mk-select--full')
    expect(screen.getByTestId('select').closest('.mk-select')?.querySelector('[data-select-native]')).toBeRequired()
  })
})
