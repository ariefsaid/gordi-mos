// AttentionBrief tests — TDD (AC-508..511, Step 5 Track C).
// Presentation-only: takes `lanes` as props (HomePage does the fetching). Mirrors home-page.test.tsx's
// MemoryRouter + I18nProvider wrapper.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
