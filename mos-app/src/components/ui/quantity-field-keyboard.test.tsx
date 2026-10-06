import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { QuantityField } from './quantity-field'

describe('QuantityField arrow-key behavior', () => {
  it('does not step a valid quantity with ArrowUp/ArrowDown', () => {
    const onChange = vi.fn()
    render(
      <I18nProvider>
        <QuantityField label="Quantity" value={2.3} onChange={onChange} />
      </I18nProvider>,
    )
    const input = screen.getByRole('spinbutton', { name: 'Quantity' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveValue('2.3')
    expect(onChange).not.toHaveBeenCalled()
  })
})
