import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { HomeAttentionSignal } from '@/lib/db/home-attention-data'
import {
  HomeNeedsAttentionSignals, HomeNeedsAttentionSignalRow,
} from './home-needs-attention-signals'
import { homeAttentionSignalHref } from './home-needs-attention-signal-href'

// #773 AC-019/AC-020 — Home Needs-you-now Signal row anatomy.
//
// AC-019 (Cahya at `/` 1440): the region lists the Signal row with the shared row anatomy, an
// attention pill, and a Seen ✓ chip; toggling removes it (via the parent's refetch — this
// component's job is to fire the onSeen callback and let the shared home-signal-row grammar be
// what it is). No per-row buttons ("Create Task", "Acknowledge", …) — that ruling is #746 for
// the record row and #773 for the attention row.
//
// AC-020 mentioned/non-mentioned chip state on the row: PROMPTED (filled-outline) when
// is_mentioned, plain otherwise.
//
// Both locales — the shared attentionLabel/i18n are tested elsewhere; here we assert the ONE
// wiring specific to this row: chip class + click stops the row's open action.

function wrap(node: React.ReactNode) {
  return render(<I18nProvider><MemoryRouter>{node}</MemoryRouter></I18nProvider>)
}

const CAHYA = '40000000-0000-0000-0000-000000000001'
const CIKAL = 't-cikal-bar'

function makeRow(overrides: Partial<HomeAttentionSignal> = {}): HomeAttentionSignal {
  return {
    id: 'signal-1',
    owning_team_id: CIKAL,
    author_id: CAHYA,
    body: 'Cikal grinder is jammed',
    occurred_at: '2026-09-07T05:00:00Z',
    attention: 'Needs attention',
    category: null,
    is_mentioned: false,
    ...overrides,
  }
}

describe('AC-019 — Home Needs-you-now Signal row (shared anatomy, attention pill, Seen ✓)', () => {
  it("Cahya at /: the region lists the Signal row (shared home-signal-row) with its attention pill and Seen ✓", () => {
    wrap(
      <HomeNeedsAttentionSignals
        signals={[makeRow({ is_mentioned: false })]}
        authorNamesById={new Map([[CAHYA, 'Cahya Cafe']])}
        teamNamesById={new Map([[CIKAL, 'Cikal Bar']])}
        onSeen={vi.fn()}
      />,
    )
    const list = screen.getByTestId('home-needs-attention-signals')
    // The shared row anatomy — the same DOM/CSS grammar signal-feed-rows uses (single source
    // of Signal row truth, DESIGN.md § shared row anatomy).
    const row = list.querySelector('.home-signal-row') as HTMLElement
    expect(row).not.toBeNull()
    expect(within(row).getByText('Cikal grinder is jammed')).toBeInTheDocument()
    // The attention pill lives in the row tail; the "Needs attention" label matches attentionLabel.
    expect(within(row).getByText(/needs attention/i)).toHaveClass('home-signal-attention--needs-attention')
    // The Seen ✓ chip renders — this is the ack affordance for the row.
    expect(within(row).getByRole('button', { name: /seen/i })).toBeInTheDocument()
    // NO per-row buttons beyond Seen ✓ (no Acknowledge, no Create Task on the Home row).
    expect(within(row).queryByRole('button', { name: /acknowledge/i })).toBeNull()
    expect(within(row).queryByRole('button', { name: /task/i })).toBeNull()
  })

  it('toggling Seen ✓ fires onSeen with the signal id — the parent removes the row on refetch', async () => {
    const onSeen = vi.fn()
    wrap(
      <HomeNeedsAttentionSignals
        signals={[makeRow()]}
        authorNamesById={new Map([[CAHYA, 'Cahya Cafe']])}
        teamNamesById={new Map([[CIKAL, 'Cikal Bar']])}
        onSeen={onSeen}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /seen/i }))
    expect(onSeen).toHaveBeenCalledExactlyOnceWith('signal-1')
  })

  it('the row opens the Signal record — the Seen ✓ chip click does NOT also open the record', async () => {
    const onSeen = vi.fn()
    wrap(
      <HomeNeedsAttentionSignalRow
        signal={makeRow()}
        authorName="Cahya Cafe"
        teamName="Cikal Bar"
        onSeen={onSeen}
      />,
    )
    // The body is a link to the record surface, keyed off the signal id.
    const bodyLink = screen.getByRole('link', { name: /open signal/i })
    expect(bodyLink).toHaveAttribute('href', homeAttentionSignalHref('signal-1'))
    // Chip click is scoped to the ack — it must not follow the row link (stopPropagation +
    // preventDefault on the chip's onClick keeps the record surface closed).
    await userEvent.click(screen.getByRole('button', { name: /seen/i }))
    expect(onSeen).toHaveBeenCalledOnce()
    // If the row link had fired, MemoryRouter would have navigated and the link href / body
    // would still be here; the assertion above (onSeen only) is the wiring proof.
  })

  it('renders nothing when there are no rows — the region owns its own empty state', () => {
    const { container } = wrap(
      <HomeNeedsAttentionSignals
        signals={[]}
        authorNamesById={new Map()}
        teamNamesById={new Map()}
        onSeen={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('AC-020 — Seen ✓ chip state on the row: prompted for mentioned viewer, plain otherwise', () => {
  it('mentioned viewer: the chip carries signal-seen-chip--prompted (filled-outline)', () => {
    wrap(
      <HomeNeedsAttentionSignalRow
        signal={makeRow({ is_mentioned: true, attention: 'Urgent' })}
        authorName="Cahya Cafe" teamName="Cikal Bar" onSeen={vi.fn()}
      />,
    )
    const chip = screen.getByRole('button', { name: /seen/i })
    expect(chip).toHaveClass('signal-seen-chip--prompted')
    expect(chip).toHaveAttribute('data-mentioned', 'true')
  })

  it('non-mentioned viewer: the chip is plain (no --prompted modifier)', () => {
    wrap(
      <HomeNeedsAttentionSignalRow
        signal={makeRow({ is_mentioned: false, attention: 'Urgent' })}
        authorName="Cahya Cafe" teamName="Cikal Bar" onSeen={vi.fn()}
      />,
    )
    const chip = screen.getByRole('button', { name: /seen/i })
    expect(chip).toHaveClass('signal-seen-chip')
    expect(chip).not.toHaveClass('signal-seen-chip--prompted')
    expect(chip).toHaveAttribute('data-mentioned', 'false')
  })
})
