import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomeLayoutPicker } from './home-layout-picker'

function renderPicker(value: 'focused' | 'overview' | 'list' = 'focused', onChange = vi.fn(), locale: 'en' | 'id' = 'en') {
  render(
    <I18nProvider initialLocale={locale}>
      <HomeLayoutPicker value={value} onChange={onChange} />
    </I18nProvider>,
  )
  return onChange
}

// Each choice's accessible name carries what it does, in the person's language, not just its name.
const DESCRIPTION_CLAUSES: Record<'en' | 'id', RegExp[]> = {
  en: [/Priority work in one column/, /Priority work first/, /One continuous list/],
  id: [/Antrean prioritas/, /Pekerjaan prioritas di awal/, /Satu daftar berkelanjutan/],
}

describe('HomeLayoutPicker (OD-V4-9, FR-920)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('offers exactly three named layout choices and marks the current choice', () => {
    renderPicker('overview')
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /focused/i })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /overview/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /list/i })).not.toBeChecked()
  })

  it('AC-930 / #1302: keyboard focus follows each layout choice and scrolls its visible card into view', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    const options = screen.getAllByRole('radio')
    const original = HTMLElement.prototype.scrollIntoView
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    })
    try {
      await user.tab()
      expect(options[0]).toHaveFocus()
      expect(options[0]).toBeChecked()
      await user.keyboard('{ArrowRight}')
      expect(options[1]).toHaveFocus()
      expect(onChange).toHaveBeenCalledWith('overview')
      await user.keyboard('{ArrowRight}')
      expect(options[2]).toHaveFocus()
      expect(onChange).toHaveBeenCalledWith('list')
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' })
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(options[2].nextElementSibling)
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: original,
      })
    }
  })

  it.each(['en', 'id'] as const)('FR-920: every option says what it does, not just its name (%s)', (locale) => {
    renderPicker('focused', vi.fn(), locale)
    screen.getAllByRole('radio').forEach((radio, index) => {
      expect(radio).toHaveAccessibleName(DESCRIPTION_CLAUSES[locale][index])
    })
  })

  it('lets the person select a different layout from the picker', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    await user.click(screen.getByRole('radio', { name: /list/i }))
    expect(onChange).toHaveBeenCalledWith('list')
  })
})
