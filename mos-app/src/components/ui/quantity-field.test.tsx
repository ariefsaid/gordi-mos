import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { QuantityField } from './quantity-field'

const REASONS = [
  { raw: '12x', options: {}, en: 'Enter a number.', id: 'Masukkan angka.' },
  { raw: '1,2.3', options: {}, en: 'Use one mark: 1.5.', id: 'Gunakan satu tanda: 1,5.' },
  { raw: '-2', options: {}, en: 'Use zero or more.', id: 'Masukkan nol atau lebih.' },
  { raw: '1.5', options: { integerOnly: true }, en: 'Whole numbers only.', id: 'Bilangan bulat saja.' },
  { raw: '11', options: { max: 10 }, en: 'Number too large.', id: 'Angka terlalu besar.' },
  { raw: '1.125', options: { maxFractionDigits: 2 }, en: 'Use up to 2 decimals.', id: 'Maks. 2 angka desimal.' },
] as const

describe('QuantityField validation copy and keyboard entry', () => {
  it.each(REASONS)('shows the $raw reason in English and Indonesian', ({ raw, options, en, id }) => {
    for (const [locale, expected] of [['en', en], ['id', id]] as const) {
      const view = render(
        <I18nProvider initialLocale={locale}>
          <QuantityField label="Quantity" value={0} onChange={() => {}} {...options} />
        </I18nProvider>,
      )
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantity' }), { target: { value: raw } })
      expect(screen.getByRole('alert')).toHaveTextContent(expected)
      view.unmount()
    }
  })

  it('does not step an empty or invalid draft with ArrowUp/ArrowDown', () => {
    const onChange = vi.fn()
    render(
      <I18nProvider>
        <QuantityField label="Quantity" value={0} onChange={onChange} />
      </I18nProvider>,
    )
    const input = screen.getByRole('spinbutton', { name: 'Quantity' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.change(input, { target: { value: 'bad' } })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(onChange).not.toHaveBeenCalled()
  })
})
