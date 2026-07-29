import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomeLayoutPicker } from './home-layout-picker'

function renderPicker(value: 'focused' | 'overview' | 'list' = 'focused', onChange = vi.fn()) {
  render(
    <I18nProvider>
      <HomeLayoutPicker value={value} onChange={onChange} />
    </I18nProvider>,
  )
  return onChange
}

/**
 * FR-920 requires each option carry "a name and a one-sentence description of WHO IT SUITS".
 * That half of the requirement evaporated once already: the shipped copy described only the
 * option's SHAPE — which the wireframe thumbnail already draws — so the sentence said nothing
 * the diagram did not. There is no accessible-name hook for "this sentence names an audience",
 * so the machine proxy is the mockup's own lead-in for that clause, one per locale. Reword the
 * clause away from a suitability statement and this goes red.
 */
const SUITABILITY_CLAUSE: Record<'en' | 'id', RegExp> = {
  en: /\bBest when\b/,
  id: /\bPaling cocok\b/,
}

describe('HomeLayoutPicker (OD-V4-9, FR-920)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('FR-920: offers exactly three named options', () => {
    renderPicker()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /focused/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /overview/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /list/i })).toBeInTheDocument()
  })

  it('AC-930: the current choice is exposed to assistive tech, not colour alone', () => {
    renderPicker('overview')
    expect(screen.getByRole('radio', { name: /overview/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /focused/i })).not.toBeChecked()
  })

  it('AC-930: every option is reachable and selectable by keyboard', async () => {
    const onChange = renderPicker('focused')
    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('overview')
  })

  it.each(['en', 'id'] as const)(
    'FR-920: every option says WHO it suits, not just what shape it is (%s)',
    (locale) => {
      localStorage.setItem('mos.locale', locale)
      renderPicker()
      const options = screen.getAllByRole('radio')
      expect(options).toHaveLength(3)
      // The <label> wraps the input, so each radio's accessible name IS its name + description.
      for (const option of options) {
        expect(option).toHaveAccessibleName(SUITABILITY_CLAUSE[locale])
      }
    },
  )

  it('FR-920: each option draws its own wireframe — the diagram is what tells the three apart', () => {
    renderPicker()
    // The thumbnails are CSS-drawn (no text, no image), so their markup is their identity:
    // Focused = a tab strip, Overview = tiles, List = label/row pairs. If two options ever
    // draw the same diagram the picker stops being a picker.
    const cardFor = (name: RegExp) => screen.getByRole('radio', { name }).nextElementSibling!
    const focused = cardFor(/focused|fokus/i)
    const overview = cardFor(/overview|ikhtisar/i)
    const list = cardFor(/list|daftar/i)

    expect(focused.querySelectorAll('.hlp-tabs')).toHaveLength(1)
    expect(focused.querySelectorAll('.hlp-box')).toHaveLength(0)
    expect(focused.querySelectorAll('.hlp-pair')).toHaveLength(0)

    expect(overview.querySelectorAll('.hlp-box').length).toBeGreaterThanOrEqual(3)
    expect(overview.querySelectorAll('.hlp-tabs')).toHaveLength(0)
    expect(overview.querySelectorAll('.hlp-pair')).toHaveLength(0)

    // Four pairs, per the mockup: the row rhythm is what reads as "one continuous list", and
    // three of them left the thumb half-empty and closer to Focused's stack of plain lines.
    expect(list.querySelectorAll('.hlp-pair').length).toBeGreaterThanOrEqual(4)
    expect(list.querySelectorAll('.hlp-tabs')).toHaveLength(0)
    expect(list.querySelectorAll('.hlp-box')).toHaveLength(0)
  })

  it('reports the chosen layout', async () => {
    const onChange = renderPicker('focused')
    await userEvent.click(screen.getByRole('radio', { name: /list/i }))
    expect(onChange).toHaveBeenCalledWith('list')
  })
})
