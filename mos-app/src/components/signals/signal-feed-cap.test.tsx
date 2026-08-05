// The ambient Signals column is CAPPED with an honest remainder (signed mockup:
// `const FEED_CAP = 6` + `See ${rest} more →`, docs/design-mockups/home-priority-2026-07-28).
// "A feed column that grows without limit is the wall of text again, just rotated 90 degrees."
// The cap is the AMBIENT tail's alone — the /work/signals archive Feed IS the full collection and
// capping it there would hide records from the surface whose whole job is to show them.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { SignalFeedRows } from './signal-feed-rows'
import type { SignalRow } from '@/lib/db/signals.types'

function row(i: number, overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: `signal-${i}`, author_id: 'person-author-a', owning_team_id: 'team-hq',
    occurred_at: `2026-07-16T02:00:0${i % 10}Z`, body: `Signal body number ${i}`,
    attention: 'FYI', category: null, source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: `2026-07-16T02:00:0${i % 10}Z`,
    ...overrides,
  }
}

const AUTHORS = { 'person-author-a': 'Author One' }
const TEAMS = { 'team-hq': 'HQ Operations' }

function renderFeed(
  variant: 'ambient' | 'archive',
  count: number,
  props: Partial<React.ComponentProps<typeof SignalFeedRows>> = {},
) {
  const signals = Array.from({ length: count }, (_, i) => row(i))
  return render(
    <I18nProvider>
      <MemoryRouter>
        <SignalFeedRows
          signals={signals}
          authorNamesById={AUTHORS}
          teamNamesById={TEAMS}
          variant={variant}
          {...props}
        />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('the ambient Signals column caps at 6 and states the remainder', () => {
  it('renders at most 6 rows when there are more', () => {
    const { container } = renderFeed('ambient', 11)
    expect(container.querySelectorAll('.home-signal-row')).toHaveLength(6)
  })

  it('offers the way through to the rest — a real destination, not a bare fact', async () => {
    renderFeed('ambient', 11)
    const more = screen.getByRole('link', { name: /see 5 more/i })
    expect(more).toHaveAttribute('href', '/work/signals')
  })

  it('states no remainder when nothing is hidden', () => {
    const { container } = renderFeed('ambient', 4)
    expect(container.querySelectorAll('.home-signal-row')).toHaveLength(4)
    expect(screen.queryByRole('link', { name: /more/i })).not.toBeInTheDocument()
  })

  it('carries a filtering query through, so the hidden rows are actually findable', async () => {
    renderFeed('ambient', 11, { onShareClick: () => {} })
    await userEvent.type(screen.getByRole('searchbox', { name: /search signals/i }), 'Signal body')
    expect(screen.getByRole('link', { name: /see 5 more/i }))
      .toHaveAttribute('href', '/work/signals?q=Signal+body')
  })

  it('the archive Feed is NOT capped — it is the full collection', () => {
    const { container } = renderFeed('archive', 11)
    expect(container.querySelectorAll('.home-signal-row')).toHaveLength(11)
    expect(screen.queryByRole('link', { name: /more/i })).not.toBeInTheDocument()
  })
})
