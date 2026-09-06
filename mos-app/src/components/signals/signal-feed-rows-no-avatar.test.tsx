// A Signal names its author — it never draws their initials (owner, 2026-07-28: "remove the
// profile icon for the person's initial. just use the name").
//
// SignalFeedRows is the ONE Signal anatomy (DESIGN.md § Signal row (v4)), shared by Home's
// ambient tail AND the /work/signals archive Feed, so BOTH variants are asserted here rather than
// forking a Home-only row. The signed mockup states the reason in its own source: the disc "cost
// 28px of measure in the 300px feed column" and "the name already carries the identity".
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { SignalFeedRows } from './signal-feed-rows'
import type { SignalRow } from '@/lib/db/signals.types'

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'person-author-a', owning_team_id: 'team-hq',
    occurred_at: '2026-07-16T02:00:00Z', body: 'The freezer alarm went off',
    attention: 'FYI', category: null, source: 'human',
    retracted_at: null, retract_reason: null, edited_at: null,
    created_at: '2026-07-16T02:00:00Z',
    ...overrides,
  }
}

const AUTHORS = { 'person-author-a': 'Author One' }
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

describe('AC-060 Home rows are read-only record links', () => {
  it('renders only feed facts, opens the record from the row surface, and has no row actions or visibility line', async () => {
    const onOpen = vi.fn()
    const { container } = render(
      <I18nProvider>
        <SignalFeedRows
          signals={[row()]}
          authorNamesById={AUTHORS}
          teamNamesById={TEAMS}
          onOpen={onOpen}
        />
      </I18nProvider>,
    )
    const signalRow = container.querySelector('[data-signal-id="signal-1"]') as HTMLElement
    await userEvent.click(signalRow)
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'signal-1' }))
    expect(screen.queryByRole('button', { name: /create task/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add category/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Visible to HQ Operations')).not.toBeInTheDocument()
    expect(screen.getByText('Author One')).toBeInTheDocument()
    expect(screen.getByText('HQ Operations')).toBeInTheDocument()
  })

  it('supports a Share-only toolbar when search is disabled', () => {
    render(
      <I18nProvider>
        <SignalFeedRows
          signals={[row()]}
          authorNamesById={AUTHORS}
          teamNamesById={TEAMS}
          onShareClick={vi.fn()}
          showSearch={false}
        />
      </I18nProvider>,
    )
    expect(screen.getByRole('button', { name: /share a signal/i })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })
})

describe('AC-062 toolbar CSS contract', () => {
  it('pins the outline toolbar control and 44px floor in the component stylesheet', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/signals/signal-feed-rows.css'), 'utf8')
    expect(css).toContain('.home-signal-tools .home-signal-add')
    expect(css).toContain('min-height: 44px')
    expect(css).not.toMatch(/home-signal-add[^}]*background\s*:\s*var\(--primary\)/s)
  })
})

describe('AC-061 archive rows keep record actions', () => {
  it('keeps Create task and Add category in the archive variant', () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <SignalFeedRows
            signals={[row()]}
            authorNamesById={AUTHORS}
            teamNamesById={TEAMS}
            variant="archive"
            createTaskHref={() => '/work/tasks/new'}
            onCategorize={vi.fn()}
          />
        </I18nProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /create task/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument()
  })
})

describe.each(['ambient', 'archive'] as const)('Signal row (%s) names its author, never their initials', (variant) => {
  it('renders the author name as plain text', () => {
    renderFeed(variant)
    expect(screen.getByText('Author One')).toBeInTheDocument()
  })

  it('renders no initials mark anywhere in the row', () => {
    const { container } = renderFeed(variant)
    expect(screen.queryByText('CC')).not.toBeInTheDocument()
    expect(container.querySelector('.home-signal-avatar')).toBeNull()
  })

  it('the meta line carries the author, location/time chips, and archive visibility', () => {
    const { container } = renderFeed(variant)
    const meta = container.querySelector('.home-signal-meta')!
    expect(within(meta as HTMLElement).getByText('Author One')).toBeInTheDocument()
    expect(within(meta as HTMLElement).getByText('HQ Operations')).toBeInTheDocument()
    expect(meta.querySelector('.home-signal-location-chip')).toHaveTextContent('HQ Operations')
    expect(meta.querySelector('.home-signal-time-chip')).toHaveTextContent(/2026/)
    if (variant === 'archive') expect(within(meta as HTMLElement).getByText('Visible to HQ Operations')).toBeInTheDocument()
    else expect(within(meta as HTMLElement).queryByText('Visible to HQ Operations')).not.toBeInTheDocument()
  })
})
