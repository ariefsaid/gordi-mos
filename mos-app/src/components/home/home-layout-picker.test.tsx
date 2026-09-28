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

const SUITABILITY_CLAUSE: Record<'en' | 'id', RegExp> = {
  en: /\bBest when\b/,
  id: /\bPaling cocok\b/,
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

  it('AC-930: every option is reachable and selectable by keyboard', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    const options = screen.getAllByRole('radio')
    await user.tab()
    expect(options[0]).toHaveFocus()
    expect(options[0]).toBeChecked()
    await user.keyboard('{ArrowRight}')
    expect(options[1]).toHaveFocus()
    expect(onChange).toHaveBeenCalledWith('overview')
    await user.keyboard('{ArrowRight}')
    expect(options[2]).toHaveFocus()
    expect(onChange).toHaveBeenCalledWith('list')
  })

  it.each(['en', 'id'] as const)('FR-920: every option says who it suits, not just its shape (%s)', (locale) => {
    renderPicker('focused', vi.fn(), locale)
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAccessibleName(SUITABILITY_CLAUSE[locale])
    }
  })

  it('gives each choice a distinct structural preview and a suitability description', () => {
    renderPicker()
    const optionCard = (name: RegExp) => screen.getByRole('radio', { name }).nextElementSibling!

    const focused = optionCard(/focused/i)
    const overview = optionCard(/overview/i)
    const list = optionCard(/list/i)

    expect(focused.querySelector('.hlp-tabs')).toBeInTheDocument()
    expect(overview.querySelectorAll('.hlp-box').length).toBeGreaterThanOrEqual(3)
    expect(list.querySelectorAll('.hlp-pair').length).toBeGreaterThanOrEqual(4)
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAccessibleName(/best when/i)
    }
  })

  it('lets the person select a different layout from the picker', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    await user.click(screen.getByRole('radio', { name: /list/i }))
    expect(onChange).toHaveBeenCalledWith('list')
  })
})
