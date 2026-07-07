import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from './select'

describe('Select (primitive)', () => {
  it('renders its <option> children and reflects the value prop', () => {
    render(
      <Select value="apple" data-testid="select">
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
        <option value="cherry">Cherry</option>
      </Select>,
    )
    const select = screen.getByTestId('select') as HTMLSelectElement
    expect(select.value).toBe('apple')
    expect(screen.getByText('Apple')).toBeTruthy()
    expect(screen.getByText('Banana')).toBeTruthy()
    expect(screen.getByText('Cherry')).toBeTruthy()
  })

  it('fires onChange with the new value on user selection', async () => {
    const onChange = vi.fn()
    render(
      <Select value="apple" onChange={onChange} data-testid="select">
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
        <option value="cherry">Cherry</option>
      </Select>,
    )
    const select = screen.getByTestId('select')
    await userEvent.selectOptions(select, 'banana')
    expect(onChange).toHaveBeenCalled()
  })

  it('fires onChange with the new value via fireEvent.change', () => {
    const onChange = vi.fn()
    render(
      <Select value="apple" onChange={onChange} data-testid="select">
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
        <option value="cherry">Cherry</option>
      </Select>,
    )
    const select = screen.getByTestId('select')
    fireEvent.change(select, { target: { value: 'banana' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('applies the disabled state when disabled', () => {
    render(
      <Select disabled data-testid="select">
        <option value="apple">Apple</option>
      </Select>,
    )
    const select = screen.getByTestId('select') as HTMLSelectElement
    expect(select.disabled).toBe(true)

    const { container } = render(
      <Select disabled data-testid="select">
        <option value="apple">Apple</option>
      </Select>,
    )
    expect(container.querySelector('.mk-select')?.classList.contains('mk-select--disabled')).toBe(true)
  })

  it('sets aria-invalid when error', () => {
    render(
      <Select error data-testid="select">
        <option value="apple">Apple</option>
      </Select>,
    )
    const select = screen.getByTestId('select')
    expect(select).toHaveAttribute('aria-invalid', 'true')
  })

  it('forwards aria-label to the native select', () => {
    render(
      <Select aria-label="Choose fruit" data-testid="select">
        <option value="apple">Apple</option>
      </Select>,
    )
    const select = screen.getByRole('combobox', { name: 'Choose fruit' })
    expect(select).toBeTruthy()
  })

  it('label renders and is associated (htmlFor ↔ id) when label given', () => {
    render(
      <Select label="Choose fruit" data-testid="select">
        <option value="apple">Apple</option>
      </Select>,
    )
    const select = screen.getByTestId('select')
    const label = screen.getByText('Choose fruit')
    expect(select.id).toBeTruthy()
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', select.id)
  })

  it('adds the fullWidth class when fullWidth is true', () => {
    const { container } = render(
      <Select fullWidth data-testid="select">
        <option value="apple">Apple</option>
      </Select>,
    )
    expect(container.querySelector('.mk-select')?.classList.contains('mk-select--full')).toBe(true)
  })

  it('adds the error class when error is true', () => {
    const { container } = render(
      <Select error data-testid="select">
        <option value="apple">Apple</option>
      </Select>,
    )
    expect(container.querySelector('.mk-select')?.classList.contains('mk-select--error')).toBe(true)
  })

  it('renders with role=combobox for a11y', () => {
    render(
      <Select aria-label="Choose fruit" data-testid="select">
        <option value="apple">Apple</option>
      </Select>,
    )
    expect(screen.getByRole('combobox')).toBeTruthy()
  })
})