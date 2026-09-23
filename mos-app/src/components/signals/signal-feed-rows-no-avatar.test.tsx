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
    attention: 'FYI', category: null, audience: 'org',source: 'human',
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
    // AC-060: the row IS the record link — role="button" carrying the `signals.card.openSignal`
    // catalog name, so assistive tech hears what the whole-row surface does.
    expect(signalRow).toHaveAttribute('role', 'button')
    expect(screen.getByRole('button', { name: 'Open signal: The freezer alarm went off' })).toBe(signalRow)
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
    // The rule BLOCK is extracted and the floor asserted inside it: a file-wide
    // `toContain('min-height: 44px')` is satisfied by the search field's own floor, so deleting
    // the control's declaration (or renaming the selector) used to stay green.
    const rule = css.match(/\.home-signal-tools \.home-signal-add\s*\{[^}]*\}/)
    expect(rule).not.toBeNull()
    expect(rule![0]).toMatch(/min-height:\s*44px/)
    expect(css).not.toMatch(/home-signal-add[^}]*background\s*:\s*var\(--primary\)/s)
  })
})

describe('AC-061 archive rows keep one clean record activation', () => {
  it('removes per-row Create task and category actions from the archive variant', () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <SignalFeedRows
            signals={[row()]}
            authorNamesById={AUTHORS}
            teamNamesById={TEAMS}
            variant="archive"
            onOpen={vi.fn()}
          />
        </I18nProvider>
      </MemoryRouter>,
    )
    const signalRow = screen.getByRole('button', { name: /open signal: the freezer alarm went off/i })
    expect(signalRow.querySelectorAll('button, a')).toHaveLength(0)
  })
})

describe.each(['ambient', 'archive'] as const)('Signal row (%s) names its author, never their initials', (variant) => {
  it('renders the author name as plain text', () => {
    renderFeed(variant)
    expect(screen.getByText('Author One')).toHaveAttribute('title', 'Author One')
  })

  it('renders no initials mark anywhere in the row', () => {
    const { container } = renderFeed(variant)
    expect(screen.queryByText('CC')).not.toBeInTheDocument()
    expect(container.querySelector('.home-signal-avatar')).toBeNull()
  })

  it('the meta line is plain text — author · Team · time — with no bordered chips and no visibility line', () => {
    const { container } = renderFeed(variant)
    const meta = container.querySelector('.home-signal-meta')!
    expect(within(meta as HTMLElement).getByText('Author One')).toBeInTheDocument()
    expect(within(meta as HTMLElement).getByText('HQ Operations')).toBeInTheDocument()
    expect(meta.querySelector('.home-signal-location-chip')).toBeNull()
    expect(meta.querySelector('.home-signal-time-chip')).toBeNull()
    expect(meta.querySelectorAll('.home-signal-meta-fact').length).toBeGreaterThan(0)
    expect(within(meta as HTMLElement).queryByText('Visible to HQ Operations')).not.toBeInTheDocument()
  })

  // AC-025: each separator is bound into one group with the fact it introduces, so a narrow
  // column wraps BETWEEN facts and never orphans a bare "·" on its own line.
  it('binds every meta separator to the fact it introduces', () => {
    const { container } = renderFeed(variant)
    const meta = container.querySelector('.home-signal-meta')!
    const seps = meta.querySelectorAll('.home-signal-sep')
    expect(seps.length).toBeGreaterThan(0)
    for (const sep of seps) {
      expect(sep.parentElement!.textContent).toContain('·')
      expect(sep.parentElement!.textContent!.length).toBeGreaterThan(1)
    }
  })

  // AC-025 / P1: the meta carries the category when one is set — plain text on the same line,
  // in BOTH variants (one anatomy; a difference between Home and the archive is a defect).
  it('renders the category on the meta line when set', () => {
    const { container } = render(
      <I18nProvider>
        <SignalFeedRows
          signals={[row({ category: 'Quality' })]}
          authorNamesById={AUTHORS}
          teamNamesById={TEAMS}
          variant={variant}
        />
      </I18nProvider>,
    )
    const meta = container.querySelector('.home-signal-meta')!
    expect(within(meta as HTMLElement).getByText('Quality')).toHaveAttribute('title', 'Quality')
  })
})

// AC-026 (#770, cross-surface pin): the Home Signals column and the archive Feed render the SAME
// fixture through the ONE row component, and their row markup differs ONLY by the variant class —
// a structural difference between the two is P1's definition of a defect. The diff here is
// byte-exact on each row's outerHTML, so any variant-conditional element/class/text inside a row
// fails this test even when both variants look plausible in isolation.
describe('AC-026: Home column and archive Feed are one row anatomy', () => {
  const onOpen = vi.fn()

  function renderVariant(variant: 'ambient' | 'archive') {
    return render(
      <I18nProvider>
        <SignalFeedRows
          variant={variant}
          onOpen={onOpen}
          signals={[
            row({ id: 's-1', body: 'The freezer alarm went off', attention: 'Urgent', category: 'Equipment/facility' }),
            row({ id: 's-2', body: 'Espresso machine repaired', attention: 'FYI', category: null }),
          ]}
          authorNamesById={AUTHORS}
          teamNamesById={TEAMS}
        />
      </I18nProvider>,
    )
  }

  it('renders byte-identical row markup across the ambient and archive variants', () => {
    const ambient = renderVariant('ambient')
    const ambientRows = Array.from(ambient.container.querySelectorAll('.home-signal-row'))
      .map((row) => row.outerHTML)

    const archive = renderVariant('archive')
    const archiveRows = Array.from(archive.container.querySelectorAll('.home-signal-row'))
      .map((row) => row.outerHTML)

    expect(archiveRows).toHaveLength(2)
    expect(ambientRows).toEqual(archiveRows)
  })
})
