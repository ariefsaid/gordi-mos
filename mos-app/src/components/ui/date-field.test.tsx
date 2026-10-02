import { createRef, useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/messages'
import { DateField, type DateFieldProps } from './date-field'

function renderField(props: Partial<DateFieldProps> = {}, locale: Locale = 'en') {
  const onChange = vi.fn()
  const onValidityChange = vi.fn()
  const view = render(
    <I18nProvider initialLocale={locale}>
      <DateField value="" onChange={onChange} onValidityChange={onValidityChange} aria-label="Due date" {...props} />
    </I18nProvider>,
  )
  return { onChange, onValidityChange, input: screen.getByRole('textbox', { name: 'Due date' }) as HTMLInputElement, ...view }
}

describe('DateField — day-first typed entry (#1191)', () => {
  it.each<Locale>(['en', 'id'])('typing 05/10/2026 stores 2026-10-05 (5 October, never 10 May) in %s', async (locale) => {
    const { onChange, input } = renderField({}, locale)
    await userEvent.type(input, '05/10/2026')
    expect(onChange).toHaveBeenLastCalledWith('2026-10-05')
    expect(onChange).not.toHaveBeenCalledWith('2026-05-10')
  })

  it('accepts a bare digit run and a non-padded day and month', async () => {
    const a = renderField()
    await userEvent.type(a.input, '05102026')
    expect(a.onChange).toHaveBeenLastCalledWith('2026-10-05')
    expect(a.input.value).toBe('05/10/2026')
    a.unmount()
    const b = renderField()
    await userEvent.type(b.input, '5/1/2026')
    expect(b.onChange).toHaveBeenLastCalledWith('2026-01-05')
  })

  it('inserts the separators while typing so the order stays visible', async () => {
    const { input } = renderField()
    await userEvent.type(input, '0510')
    expect(input.value).toBe('05/10')
  })

  it('shows the format as a hint while empty and while typing', async () => {
    const { input } = renderField()
    await userEvent.click(input)
    expect(input).toHaveAttribute('placeholder', 'dd/mm/yyyy')
    await userEvent.type(input, '05/1')
    expect(screen.getByText('dd/mm/yyyy')).toBeInTheDocument()
  })

  it('shows the format in the interface language', () => {
    const { input } = renderField({}, 'id')
    fireEvent.focus(input)
    expect(input).toHaveAttribute('placeholder', 'hh/bb/tttt')
  })

  it('rejects an impossible date visibly and stores nothing (31/02/2026)', async () => {
    const { onChange, onValidityChange, input } = renderField()
    await userEvent.type(input, '31/02/2026')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/doesn.t exist/i)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
    expect(onValidityChange).toHaveBeenLastCalledWith(true)
  })

  it('rejects a month-first value that only works in another locale order (10/25/2026)', async () => {
    const { onChange, input } = renderField()
    await userEvent.type(input, '10/25/2026')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('rejects a partial value on blur and never stores a guess (05/10 and 05/10/26)', async () => {
    const a = renderField()
    await userEvent.type(a.input, '05/10')
    await userEvent.tab()
    expect(a.onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/day\/month\/year/i)
    expect(a.input.value).toBe('05/10')
    a.unmount()
    const b = renderField()
    await userEvent.type(b.input, '05/10/26')
    await userEvent.tab()
    expect(b.onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('does not nag about a value that is still being typed', async () => {
    const { input } = renderField()
    await userEvent.type(input, '05/1')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('clears the error and reports valid once the value is corrected', async () => {
    const { onChange, onValidityChange, input } = renderField()
    await userEvent.type(input, '31/02/2026')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await userEvent.clear(input)
    await userEvent.type(input, '28/02/2026')
    expect(onChange).toHaveBeenLastCalledWith('2026-02-28')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onValidityChange).toHaveBeenLastCalledWith(false)
  })

  it('emptying the field is a real clear: onChange("") and no error', async () => {
    const { onChange, input } = renderField({ value: '2026-07-20' })
    await userEvent.clear(input)
    expect(onChange).toHaveBeenLastCalledWith('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a required field flags an empty value on blur', async () => {
    const { input } = renderField({ required: true })
    await userEvent.click(input)
    await userEvent.tab()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('rejects a date outside min/max visibly', async () => {
    const { onChange, input } = renderField({ min: '2026-01-01', max: '2026-12-31' })
    await userEvent.type(input, '05/10/2027')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/outside/i)
  })

  it('an in-range date inside min/max is stored', async () => {
    const { onChange, input } = renderField({ min: '2026-01-01', max: '2026-12-31' })
    await userEvent.type(input, '05/10/2026')
    expect(onChange).toHaveBeenLastCalledWith('2026-10-05')
  })

  it('picking from the calendar stores the picked ISO date: day-first digits while focused, the formatted date on blur', () => {
    const Harness = () => {
      const [value, setValue] = useState('')
      return <DateField value={value} onChange={setValue} aria-label="Due date" />
    }
    render(<I18nProvider><Harness /></I18nProvider>)
    fireEvent.change(screen.getByLabelText(/open calendar/i), { target: { value: '2026-08-01' } })
    // The picked value fills the editing text in the same day-first order the person types.
    expect((screen.getByRole('textbox', { name: 'Due date' }) as HTMLInputElement).value).toBe('01/08/2026')
    // On blur the field settles to the unambiguous display of the stored ISO value.
    fireEvent.blur(screen.getByRole('textbox', { name: 'Due date' }))
    expect((screen.getByRole('textbox', { name: 'Due date' }) as HTMLInputElement).value).toBe('1 Aug 2026')
  })

  it('adopts a value pushed in from outside (parent rollback or reload)', () => {
    const { rerender, input } = renderField({ value: '2026-07-20' })
    rerender(
      <I18nProvider>
        <DateField value="2026-08-02" onChange={() => {}} aria-label="Due date" />
      </I18nProvider>,
    )
    expect(input.value).toBe('2 Aug 2026')
  })
})

describe('DateField (primitive)', () => {
  it('shows an unambiguous "20 Jul 2026" at rest (F2 fix) and day-first digits while editing', async () => {
    const { input } = renderField({ value: '2026-07-20' })
    expect(input.value).toBe('20 Jul 2026')
    await userEvent.click(input)
    expect(input.value).toBe('20/07/2026')
  })

  it('shows the placeholder (em dash by default) when value is empty and unfocused', () => {
    const { input } = renderField()
    expect(input).toHaveAttribute('placeholder', '—')
  })

  it('forwards a ref to the text input (Escape-isolation contract)', () => {
    const ref = createRef<HTMLInputElement>()
    render(
      <I18nProvider>
        <DateField ref={ref} value="2026-07-20" onChange={() => {}} aria-label="Due date" />
      </I18nProvider>,
    )
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
    expect(ref.current?.type).toBe('text')
  })

  it('forwards onKeyDown and onBlur to the text input (save-on-blur call sites)', async () => {
    const onKeyDown = vi.fn()
    const onBlur = vi.fn()
    const { input } = renderField({ onKeyDown, onBlur })
    await userEvent.click(input)
    await userEvent.keyboard('{Enter}')
    expect(onKeyDown).toHaveBeenCalled()
    await userEvent.tab()
    expect(onBlur).toHaveBeenCalled()
  })

  it('applies the disabled state to the input and the modifier class', () => {
    const { input, container } = renderField({ disabled: true })
    expect(input.disabled).toBe(true)
    expect(container.querySelector('.mk-date')?.classList.contains('mk-date--disabled')).toBe(true)
  })

  it('adds the error class when error is true', () => {
    const { container } = renderField({ error: true })
    expect(container.querySelector('.mk-date')?.classList.contains('mk-date--error')).toBe(true)
  })

  it('adds the fullWidth class when fullWidth is true', () => {
    const { container } = renderField({ fullWidth: true })
    expect(container.querySelector('.mk-date')?.classList.contains('mk-date--full')).toBe(true)
  })

  it('label renders and is associated (htmlFor ↔ id) when label given', () => {
    render(<I18nProvider><DateField value="" onChange={() => {}} label="Due date" /></I18nProvider>)
    const input = screen.getByRole('textbox', { name: 'Due date' })
    const label = screen.getByText('Due date')
    expect(input.id).toBeTruthy()
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', input.id)
  })

  it('keeps the calendar picker keyboard-reachable after the date text field', async () => {
    const { input } = renderField()
    const picker = screen.getByLabelText(/open calendar/i)
    expect(picker).toHaveAttribute('type', 'date')
    expect(picker).toHaveAttribute('tabindex', '0')
    await userEvent.click(input)
    await userEvent.tab()
    expect(picker).toHaveFocus()
  })
})
