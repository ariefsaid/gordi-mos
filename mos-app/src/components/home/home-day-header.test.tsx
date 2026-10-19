import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomeHeadCounts } from './home-day-header'

const draw = (tally: { left: number; done?: number } | null, locale: 'en' | 'id' = 'en') => render(
  <MemoryRouter><I18nProvider initialLocale={locale}><HomeHeadCounts tally={tally} /></I18nProvider></MemoryRouter>,
)

// AC-042 — the tally's two grammars, and the absent one. The wrap/one-line half of the day
// header lives at the page + CSS layers (home-page.test.tsx, guard-home-day-header.css.test.ts).
describe('AC-042 — HomeHeadCounts: handled stays separate; open work names its personal scope', () => {
  it('no handled source → personal open-task copy is truthful in EN and ID, including zero', () => {
    const en = draw({ left: 11 })
    expect(screen.getByRole('link', { name: 'My open tasks · 11' })).toHaveAttribute('href', '/work/tasks?view=my-work')
    expect(screen.queryByText(/handled/)).toBeNull()
    en.unmount()

    const id = draw({ left: 11 }, 'id')
    expect(screen.getByRole('link', { name: 'Tugas terbuka saya · 11' })).toHaveAttribute('href', '/work/tasks?view=my-work')
    id.unmount()

    const zero = draw({ left: 0 })
    expect(screen.getByRole('link', { name: 'My open tasks · 0' })).toHaveAttribute('href', '/work/tasks?view=my-work')
    zero.unmount()
  })

  it('a handled source supplied → `N handled · N left`', () => {
    draw({ done: 3, left: 9 })
    expect(screen.getByRole('link', { name: '3 handled · 9 left' })).toHaveAttribute('href', '/work/tasks?view=my-work')
  })

  // DIV-G5: a tally that could not be assembled renders NOTHING — no figure, and no dash that
  // reads as one. The header keeps its greeting; it just states no number it cannot trace.
  it('a null tally renders nothing at all — absent, not zero', () => {
    const { container } = draw(null)
    expect(container).toBeEmptyDOMElement()
  })
})
