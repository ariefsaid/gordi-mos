// AttentionBrief tests — TDD (AC-508..511, Step 5 Track C).
// Presentation-only: takes `lanes` as props (HomePage does the fetching). Mirrors home-page.test.tsx's
// MemoryRouter + I18nProvider wrapper.

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
