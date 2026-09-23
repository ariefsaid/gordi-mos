import { createRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DateField } from './date-field'

describe('DateField (primitive)', () => {
  it('renders the native date input with the ISO value (still the real picking control)', () => {
    render(<DateField value="2026-07-20" onChange={() => {}} aria-label="Due date" />)
    const input = screen.getByLabelText('Due date') as HTMLInputElement
    expect(input.type).toBe('date')
    expect(input.value).toBe('2026-07-20')
  })

  it('shows an unambiguous "22 Jul 2026" display instead of the native locale text — F2 fix', () => {
    render(<DateField value="2026-07-20" onChange={() => {}} aria-label="Due date" />)
    expect(screen.getByText('20 Jul 2026')).toBeInTheDocument()
  })

  it('shows the placeholder (em dash by default) when value is empty', () => {
    render(<DateField value="" onChange={() => {}} aria-label="Due date" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('fires onChange with the new ISO value via fireEvent.change', () => {
    const onChange = vi.fn()
    render(<DateField value="" onChange={onChange} aria-label="Due date" />)
    const input = screen.getByLabelText('Due date')
    fireEvent.change(input, { target: { value: '2026-08-01' } })
    expect(onChange).toHaveBeenCalledWith('2026-08-01')
  })

  it('forwards a ref to the underlying native input (Escape-isolation contract)', () => {
    const ref = createRef<HTMLInputElement>()
    render(<DateField ref={ref} value="2026-07-20" onChange={() => {}} aria-label="Due date" />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
    expect(ref.current?.type).toBe('date')
  })

  it('applies the disabled state to the native input and the disabled modifier class', () => {
    const { container } = render(<DateField value="" onChange={() => {}} disabled aria-label="Due date" />)
    const input = screen.getByLabelText('Due date') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(container.querySelector('.mk-date')?.classList.contains('mk-date--disabled')).toBe(true)
  })

  it('adds the error class when error is true', () => {
    const { container } = render(<DateField value="" onChange={() => {}} error aria-label="Due date" />)
    expect(container.querySelector('.mk-date')?.classList.contains('mk-date--error')).toBe(true)
  })

  it('adds the fullWidth class when fullWidth is true', () => {
    const { container } = render(<DateField value="" onChange={() => {}} fullWidth aria-label="Due date" />)
    expect(container.querySelector('.mk-date')?.classList.contains('mk-date--full')).toBe(true)
  })

  it('label renders and is associated (htmlFor ↔ id) when label given', () => {
    render(<DateField value="" onChange={() => {}} label="Due date" />)
    const input = screen.getByLabelText('Due date')
    const label = screen.getByText('Due date')
    expect(input.id).toBeTruthy()
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', input.id)
  })
})
