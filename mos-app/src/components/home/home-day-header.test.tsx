import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomeHeadCounts } from './home-day-header'

const draw = (tally: { left: number; done?: number } | null) => render(
  <I18nProvider><HomeHeadCounts tally={tally} /></I18nProvider>,
)

// AC-042 — the tally's two grammars, and the absent one. The wrap/one-line half of the day
// header lives at the page + CSS layers (home-page.test.tsx, guard-home-day-header.css.test.ts).
describe('AC-042 — HomeHeadCounts: N handled only with a real source; otherwise N left', () => {
  it('no handled source → the tally is `N left` alone', () => {
    draw({ left: 11 })
    expect(screen.getByText('11 left')).toBeInTheDocument()
    expect(screen.queryByText(/handled/)).toBeNull()
  })

  it('a handled source supplied → `N handled · N left`', () => {
    draw({ done: 3, left: 9 })
    expect(screen.getByText('3 handled · 9 left')).toBeInTheDocument()
  })

  // DIV-G5: a tally that could not be assembled renders NOTHING — no figure, and no dash that
  // reads as one. The header keeps its greeting; it just states no number it cannot trace.
  it('a null tally renders nothing at all — absent, not zero', () => {
    const { container } = draw(null)
    expect(container).toBeEmptyDOMElement()
  })
})
