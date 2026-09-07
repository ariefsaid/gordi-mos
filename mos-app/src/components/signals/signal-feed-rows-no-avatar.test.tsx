// A Signal names its author — it never draws their initials (owner, 2026-07-28: "remove the
// profile icon for the person's initial. just use the name").
//
// SignalFeedRows is the ONE Signal anatomy (DESIGN.md § Signal row (v4)), shared by Home's
// ambient tail AND the /work/signals archive Feed, so BOTH variants are asserted here rather than
// forking a Home-only row. The signed mockup states the reason in its own source: the disc "cost
// 28px of measure in the 300px feed column" and "the name already carries the identity".
//
// Ticket 770 (owner ruling OD-WAY-96, AC-025/AC-026): the row carries NO per-row controls, the meta
// line is plain text (no bordered chips, no "Visible to <Team>"), and Home and the archive
// render the same markup — the ONE difference is the variant class the archive uses to fill
// Urgent rows.
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, within } from '@testing-library/react'
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

describe('AC-060 / Ticket 770 AC-025: rows are read-only record links with no per-row controls', () => {
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

describe('Ticket 770 AC-025/AC-026: the ONE row anatomy — rows carry no controls, ever', () => {
  function renderRow(variant: 'ambient' | 'archive') {
    const { container } = render(
      <I18nProvider>
        <SignalFeedRows
          signals={[row()]}
          authorNamesById={AUTHORS}
          teamNamesById={TEAMS}
          variant={variant}
          onOpen={vi.fn()}
        />
      </I18nProvider>,
    )
    return {
      feed: container.querySelector('.home-signal-feed') as HTMLElement,
      listItem: container.querySelector('.home-signal-item') as HTMLElement,
      signalRow: container.querySelector('[data-signal-id="signal-1"]') as HTMLElement,
    }
  }

  it('the archive variant renders the same button-less row grammar as the ambient variant', () => {
    const { signalRow, listItem } = renderRow('archive')
    // Zero buttons INSIDE the row — the record has `Create task`, `Add category`, and
    // `Acknowledge`, never the row.
    expect(signalRow.querySelectorAll('button')).toHaveLength(0)
    expect(signalRow.querySelectorAll('a')).toHaveLength(0)
    // ONE activation target per row — the row surface itself, carrying the shared open-affordance
    // catalog name.
    expect(signalRow).toHaveAttribute('role', 'button')
    expect(signalRow.getAttribute('aria-label')).toContain('Open signal:')
    // The <li> around it stays a plain list item, so the feed's <ul> still announces "list, N
    // items" to a screen reader — the activation target is its child, not the item itself.
    expect(listItem.tagName).toBe('LI')
    expect(listItem.hasAttribute('role')).toBe(false)
    expect(listItem.parentElement?.tagName).toBe('UL')
  })

  it("AC-026 — Home's ambient column and the archive Feed render byte-identical row markup from one fixture", () => {
    // AC-026's real claim is markup identity, so this asserts it directly: ONE fixture through the
    // ONE component twice, diffing the row subtree. A fork of the row markup for either surface
    // fails here — a class-marker check on the archive alone could not see it.
    const ambient = renderRow('ambient')
    const archive = renderRow('archive')
    expect(archive.signalRow.outerHTML).toBe(ambient.signalRow.outerHTML)
    // The ONE permitted difference is the variant class on the feed CONTAINER (the Urgent fill).
    expect(ambient.feed.className).toBe('home-signal-feed')
    expect(archive.feed.className).toBe('home-signal-feed home-signal-feed--archive')
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

  it('the meta line carries the author, Team, and time as PLAIN TEXT — no bordered chips (Ticket 770 AC-025)', () => {
    const { container } = renderFeed(variant)
    const meta = container.querySelector('.home-signal-meta')!
    expect(within(meta as HTMLElement).getByText('Author One')).toBeInTheDocument()
    expect(within(meta as HTMLElement).getByText('HQ Operations')).toBeInTheDocument()
    // Plain-text spans, not the retired bordered pill chrome.
    expect(meta.querySelector('.home-signal-team')).toHaveTextContent('HQ Operations')
    // AC-025 / DESIGN.md § Signal row: the occurred fact is `dd Mon HH:MM` — no year, no WIB
    // suffix. The fixture's 2026-07-16T02:00:00Z is 09:00 WIB on the 16th.
    expect(meta.querySelector('.home-signal-time')).toHaveTextContent('16 Jul 09:00')
    expect(meta.querySelector('.home-signal-location-chip')).toBeNull()
    expect(meta.querySelector('.home-signal-time-chip')).toBeNull()
    // AC-025: no visibility sentence on either variant.
    expect(within(meta as HTMLElement).queryByText('Visible to HQ Operations')).not.toBeInTheDocument()
  })

  it('Ticket 770 AC-025: category rides the meta line as plain text when set', () => {
    const { container } = render(
      <I18nProvider>
        <SignalFeedRows
          signals={[row({ id: 'signal-cat', category: 'Quality' })]}
          authorNamesById={AUTHORS}
          teamNamesById={TEAMS}
          variant={variant}
        />
      </I18nProvider>,
    )
    const meta = container.querySelector('.home-signal-meta')!
    const category = meta.querySelector('.home-signal-category')
    expect(category).not.toBeNull()
    expect(category).toHaveTextContent('Quality')
  })
})
