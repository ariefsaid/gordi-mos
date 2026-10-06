import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { QuantityField } from './quantity-field'

const REASONS = [
  { raw: '12x', options: {}, en: 'Enter a number.', id: 'Masukkan angka.' },
  { raw: '1,2.3', options: {}, en: 'Use one mark: 1.5.', id: 'Gunakan satu tanda: 1,5.' },
  {
    raw: '1.500', options: { maxFractionDigits: 2 },
    en: 'Could mean 1500 or 1.500. If decimal, use 1–2 places.',
    id: 'Bisa berarti 1500 atau 1,500. Jika desimal, gunakan 1–2 angka.',
  },
  { raw: '-2', options: {}, en: 'Use zero or more.', id: 'Masukkan nol atau lebih.' },
  { raw: '1.5', options: { integerOnly: true }, en: 'Whole numbers only.', id: 'Bilangan bulat saja.' },
  { raw: '11', options: { max: 10 }, en: 'Number too large.', id: 'Angka terlalu besar.' },
  {
    raw: '1.125', options: { maxFractionDigits: 2 },
    en: 'Could mean 1125 or 1.125. If decimal, use 1–2 places.',
    id: 'Bisa berarti 1125 atau 1,125. Jika desimal, gunakan 1–2 angka.',
  },
] as const

describe('QuantityField validation copy and keyboard entry', () => {
  it.each([
    {
      raw: '1.250',
      en: 'Could mean 1250 or 1.250. If decimal, use 1–2 places.',
      id: 'Bisa berarti 1250 atau 1,250. Jika desimal, gunakan 1–2 angka.',
    },
    {
      raw: '0,125',
      en: 'Could mean 125 or 0.125. If decimal, use 1–2 places.',
      id: 'Bisa berarti 125 atau 0,125. Jika desimal, gunakan 1–2 angka.',
    },
  ])('rejects three-digit capture quantity $raw and offers both readings in each locale', ({ raw, en, id }) => {
    const onChange = vi.fn()
    for (const [locale, expected] of [['en', en], ['id', id]] as const) {
      const view = render(
        <I18nProvider initialLocale={locale}>
          <QuantityField label="Quantity" value={0} onChange={onChange} maxFractionDigits={2} />
        </I18nProvider>,
      )
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantity' }), { target: { value: raw } })
      expect(screen.getByRole('alert')).toHaveTextContent(expected)
      expect(onChange).not.toHaveBeenCalledWith(raw === '1.250' ? 1.25 : 0.125)
      view.unmount()
    }
  })

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

  it('keeps an error visible on refocus and clears it when the quantity becomes valid', () => {
    render(
      <I18nProvider>
        <QuantityField label="Quantity" value={0} onChange={() => {}} maxFractionDigits={2} />
      </I18nProvider>,
    )
    const input = screen.getByRole('spinbutton', { name: 'Quantity' })
    fireEvent.change(input, { target: { value: '1.125' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.focus(input)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '1.25' } })
    expect(screen.queryByRole('alert')).toBeNull()
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
