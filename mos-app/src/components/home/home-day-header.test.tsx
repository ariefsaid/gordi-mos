// The Home header's day state, as rendered. The rule itself is unit-tested in
// lib/home-day-state.test.ts; this file tests what the VIEWER gets out of it — including the
// state the header exists to protect against: a tally it cannot stand behind.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomeHeadCounts, HomeHeadState } from './home-day-header'
import { messages } from '@/i18n/messages'

const draw = (node: React.ReactNode) => render(<I18nProvider>{node}</I18nProvider>)

describe('HomeHeadCounts — the day’s tally, right of the greeting', () => {
  it('states both halves of the tally in one line', () => {
    draw(<HomeHeadCounts tally={{ done: 3, left: 9 }} />)
    expect(screen.getByText('3 handled · 9 left')).toBeInTheDocument()
  })

  it('DIV-G5: presents no total it cannot stand behind — a null tally is a dash, not a zero', () => {
    draw(<HomeHeadCounts tally={null} />)
    expect(screen.queryByText(/handled/)).toBeNull()
    expect(screen.queryByText(/\b0\b/)).toBeNull()
    expect(screen.getByText('—')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('HomeHeadState — the rule-driven state line + progress track', () => {
  it('renders the phrasing the rule chose for these counts', () => {
    // 0 handled → the "fresh" band; rotation 0 → its first phrasing.
    draw(<HomeHeadState tally={{ done: 0, left: 12 }} rotation={0} />)
    expect(screen.getByText(messages.en['home.day.fresh.1'])).toBeInTheDocument()
  })

  it('the countdown band renders the real number, interpolated', () => {
    draw(<HomeHeadState tally={{ done: 9, left: 2 }} rotation={0} />)
    expect(screen.getByText('2 more to go.')).toBeInTheDocument()
  })

  it('an all-clear day reads clear', () => {
    draw(<HomeHeadState tally={{ done: 6, left: 0 }} rotation={0} />)
    expect(screen.getByText(messages.en['home.day.clear.1'])).toBeInTheDocument()
  })

  it('the track is a real progressbar carrying the handled share', () => {
    draw(<HomeHeadState tally={{ done: 3, left: 9 }} rotation={0} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAccessibleName('Handled today')
    expect(bar).toHaveAttribute('aria-valuenow', '25')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar.firstElementChild).toHaveStyle({ width: '25%' })
  })

  it('DIV-G5: an unknowable tally says so in words and draws NO progress track', () => {
    draw(<HomeHeadState tally={null} rotation={0} />)
    expect(screen.getByText(messages.en['home.day.tallyPending'])).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('holds its height across the pending → resolved transition (no header jump)', () => {
    const { container, rerender } = draw(<HomeHeadState tally={null} rotation={0} />)
    const pendingRow = container.querySelector('.home-head-state')
    expect(pendingRow).not.toBeNull()
    rerender(
      <I18nProvider><HomeHeadState tally={{ done: 3, left: 9 }} rotation={0} /></I18nProvider>,
    )
    expect(container.querySelector('.home-head-state')).not.toBeNull()
    expect(container.querySelectorAll('.home-head-msg')).toHaveLength(1)
  })

  it('a negative or absurd count never escapes the track', () => {
    draw(<HomeHeadState tally={{ done: 40, left: 0 }} rotation={0} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })
})
