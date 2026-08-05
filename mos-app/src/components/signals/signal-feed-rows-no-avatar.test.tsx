// A Signal names its author — it never draws their initials (owner, 2026-07-28: "remove the
// profile icon for the person's initial. just use the name").
//
// SignalFeedRows is the ONE Signal anatomy (DESIGN.md § Signal row (v4)), shared by Home's
// ambient tail AND the /work/signals archive Feed, so BOTH variants are asserted here rather than
// forking a Home-only row. The signed mockup states the reason in its own source: the disc "cost
// 28px of measure in the 300px feed column" and "the name already carries the identity".
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { SignalFeedRows } from './signal-feed-rows'
import type { SignalRow } from '@/lib/db/signals.types'

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'person-cahya', owning_team_id: 'team-hq',
    occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
    attention: 'FYI', category: null, source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-07-16T02:00:00Z',
    ...overrides,
  }
}

const AUTHORS = { 'person-cahya': 'Cahya Cafe' }
const TEAMS = { 'team-hq': 'HQ Operations' }

function renderFeed(variant: 'ambient' | 'archive') {
  return render(
    <I18nProvider>
      <SignalFeedRows
        signals={[row()]}
        authorNamesById={AUTHORS}
        teamNamesById={TEAMS}
        variant={variant}
      />
    </I18nProvider>,
  )
}

describe.each(['ambient', 'archive'] as const)('Signal row (%s) names its author, never their initials', (variant) => {
  it('renders the author name as plain text', () => {
    renderFeed(variant)
    expect(screen.getByText('Cahya Cafe')).toBeInTheDocument()
  })

  it('renders no initials mark anywhere in the row', () => {
    const { container } = renderFeed(variant)
    expect(screen.queryByText('CC')).not.toBeInTheDocument()
    expect(container.querySelector('.home-signal-avatar')).toBeNull()
  })

  it('the meta line still reads author · team · time, with nothing orphaned', () => {
    const { container } = renderFeed(variant)
    const meta = container.querySelector('.home-signal-meta')!
    expect(within(meta as HTMLElement).getByText('Cahya Cafe')).toBeInTheDocument()
    expect(within(meta as HTMLElement).getByText('HQ Operations')).toBeInTheDocument()
    expect(meta.textContent?.startsWith('Cahya Cafe·HQ Operations·')).toBe(true)
  })
})
