// AttentionBrief tests — TDD (AC-508..511, Step 5 Track C).
// Presentation-only: takes `lanes` as props (HomePage does the fetching). Mirrors home-page.test.tsx's
// MemoryRouter + I18nProvider wrapper.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AttentionLane } from '@/lib/home-attention'
import { AttentionBrief } from './attention-brief'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

function renderBrief(lanes: AttentionLane[]) {
  return render(createElement(AttentionBrief, { lanes }), { wrapper })
}

describe('AC-508: lanes with items render as drill-links', () => {
  it('renders every ready lane item as a link to its canonical route', () => {
    const lanes: AttentionLane[] = [
      { kind: 'overdue', state: 'ready', items: [{ id: 'o1', title: 'Overdue task', route: '/work/tasks/o1' }] },
      { kind: 'due-today', state: 'ready', items: [{ id: 'd1', title: 'Due today task', route: '/work/tasks/d1' }] },
      { kind: 'mentions', state: 'ready', items: [{ id: 'm1', title: 'A mention', route: '/inbox' }] },
      { kind: 'failed-checks', state: 'ready', items: [{ id: 'f1', title: 'Opening prep · 2026-07-16', route: '/cafe/log' }] },
    ]
    renderBrief(lanes)

    for (const item of [
      { text: 'Overdue task', route: '/work/tasks/o1' },
      { text: 'Due today task', route: '/work/tasks/d1' },
      { text: 'A mention', route: '/inbox' },
      { text: 'Opening prep · 2026-07-16', route: '/cafe/log' },
    ]) {
      const link = screen.getByText(item.text).closest('a')
      expect(link).not.toBeNull()
      expect(link!.getAttribute('href')).toBe(item.route)
    }
  })
})

describe('AC-509: all-clear empty state, no misleading zeros', () => {
  it('shows the all-caught-up state and renders no lane at all when every lane is ready and empty', () => {
    const lanes: AttentionLane[] = [
      { kind: 'overdue', state: 'ready', items: [] },
      { kind: 'due-today', state: 'ready', items: [] },
      { kind: 'mentions', state: 'ready', items: [] },
      { kind: 'failed-checks', state: 'ready', items: [] },
    ]
    renderBrief(lanes)

    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
    // No lane renders at all (never a misleading "0 overdue" tile).
    expect(screen.queryByText('Overdue')).toBeNull()
    expect(screen.queryByText('Due today')).toBeNull()
    expect(screen.queryByText('Mentions')).toBeNull()
    expect(screen.queryByText('Failed checks')).toBeNull()

    // Minor (a) — a compact, left-aligned calm affirmation, not the centered checkmark
    // floating in a void (manager-02-afterlogin.png). Same EmptyState primitive, adjusted
    // usage/CSS only.
    expect(screen.getByTestId('empty-state')).toHaveClass('attention-all-clear')
  })
})

describe('AC-510: per-lane error is fail-soft', () => {
  it('shows the error affordance for the errored lane while the ready lane still renders its items', () => {
    const lanes: AttentionLane[] = [
      { kind: 'overdue', state: 'ready', items: [{ id: 'o1', title: 'Overdue task', route: '/work/tasks/o1' }] },
      { kind: 'mentions', state: 'error', items: [] },
    ]
    renderBrief(lanes)

    expect(screen.getByText("Couldn't load this list. Refresh to try again.")).toBeInTheDocument()
    expect(screen.getByText('Overdue task').closest('a')).not.toBeNull()
    // Minor (b) — the errored lane keeps its title visible ("which list failed?").
    expect(screen.getByRole('heading', { name: 'Mentions', level: 3 })).toBeInTheDocument()
  })

  // Home retry/projection convergence (2026-07-21): the error lane's "Refresh to try
  // again" copy previously had no wired retry callback at all — clicking nothing ever
  // re-fetched the errored projection. AttentionBrief is presentation-only, so it just
  // forwards `lane.onRetry` to the shared ErrorState Retry button.
  it('a lane error renders a Retry button that calls the lane\'s onRetry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const lanes: AttentionLane[] = [
      { kind: 'overdue', state: 'ready', items: [{ id: 'o1', title: 'Overdue task', route: '/work/tasks/o1' }] },
      { kind: 'mentions', state: 'error', items: [], onRetry },
    ]
    renderBrief(lanes)

    const retryButton = screen.getByRole('button', { name: /retry/i })
    await user.click(retryButton)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('an error lane with no onRetry renders no Retry button (never a dead-end control)', () => {
    const lanes: AttentionLane[] = [
      { kind: 'mentions', state: 'error', items: [] },
    ]
    renderBrief(lanes)
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('a loading lane shows an aria-busy skeleton without blocking a ready sibling', () => {
    const lanes: AttentionLane[] = [
      { kind: 'overdue', state: 'loading', items: [] },
      { kind: 'mentions', state: 'ready', items: [{ id: 'm1', title: 'A mention', route: '/inbox' }] },
    ]
    renderBrief(lanes)

    const region = screen.getByRole('region', { name: 'Needs attention' })
    expect(region.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.getByText('A mention').closest('a')).not.toBeNull()
    // Minor (b) — the loading lane keeps its title visible too (which list is loading).
    expect(screen.getByRole('heading', { name: 'Overdue', level: 3 })).toBeInTheDocument()
  })
})

describe('Minors — per-lane item count in the lane title (RI-6d)', () => {
  it('appends the item count to a ready lane\'s title ("Overdue · 2")', () => {
    const lanes: AttentionLane[] = [
      {
        kind: 'overdue',
        state: 'ready',
        items: [
          { id: 'o1', title: 'Task A', route: '/work/tasks/o1' },
          { id: 'o2', title: 'Task B', route: '/work/tasks/o2' },
        ],
      },
    ]
    renderBrief(lanes)

    expect(screen.getByRole('heading', { name: 'Overdue · 2', level: 3 })).toBeInTheDocument()
  })
})

describe('Decision context — each task row shows its PIC (avatar + name) and owning Team/BU caption (Luna J01/J02)', () => {
  it('renders the PIC name, avatar initials, and the BU caption on a compact meta line within the row link', () => {
    const lanes: AttentionLane[] = [
      {
        kind: 'overdue',
        state: 'ready',
        items: [{
          id: 'o1',
          title: 'Restock oat milk',
          route: '/work/tasks/o1',
          meta: 'Thu, 16 Jul',
          pic: { name: 'Rara Owner', initials: 'RO' },
          caption: 'Café',
        }],
      },
    ]
    renderBrief(lanes)

    const link = screen.getByText('Restock oat milk').closest('a')!
    // The decision context lives inside the same drill-link (one compact meta line).
    expect(within(link).getByText('Rara Owner')).toBeInTheDocument()
    expect(within(link).getByText('RO')).toBeInTheDocument()   // avatar initials
    expect(within(link).getByText('Café')).toBeInTheDocument() // owning-BU caption
    expect(within(link).getByText('Thu, 16 Jul')).toBeInTheDocument()
  })

  it('renders no avatar/caption when a row carries no decision context (mentions stay clean)', () => {
    const lanes: AttentionLane[] = [
      { kind: 'mentions', state: 'ready', items: [{ id: 'm1', title: 'A mention', route: '/inbox' }] },
    ]
    renderBrief(lanes)

    const link = screen.getByText('A mention').closest('a')!
    expect(link.querySelector('.attention-lane-avatar')).toBeNull()
  })
})

describe('AC-511: ≤390px first content is attention, not config', () => {
  it('shows the attention item first and renders no configuration control inside the region', () => {
    const lanes: AttentionLane[] = [
      { kind: 'overdue', state: 'ready', items: [{ id: 'o1', title: 'Overdue task', route: '/work/tasks/o1' }] },
    ]
    render(
      createElement('div', { style: { width: 390 } }, createElement(AttentionBrief, { lanes })),
      { wrapper },
    )

    const region = screen.getByRole('region', { name: 'Needs attention' })
    const firstLink = within(region).getAllByRole('link')[0]
    expect(firstLink.textContent).toContain('Overdue task')
    expect(within(region).queryByRole('combobox')).toBeNull()
    expect(within(region).queryByTestId('home-order-toggle')).toBeNull()
  })
})

describe('RI-4: the attention region carries a real visible heading, coherent with its aria name', () => {
  it('renders "Needs attention" as a visible heading element, and the region name comes from it (no double source)', () => {
    const lanes: AttentionLane[] = [
      { kind: 'overdue', state: 'ready', items: [{ id: 'o1', title: 'Overdue task', route: '/work/tasks/o1' }] },
    ]
    renderBrief(lanes)

    const heading = screen.getByRole('heading', { name: 'Needs attention' })
    expect(heading).toBeVisible()

    const region = screen.getByRole('region', { name: 'Needs attention' })
    // The region's accessible name is sourced from the visible heading (aria-labelledby),
    // never a parallel aria-label string — one source of truth, no double-announcement.
    expect(region).not.toHaveAttribute('aria-label')
    expect(region.getAttribute('aria-labelledby')).toBe(heading.id)
  })
})
