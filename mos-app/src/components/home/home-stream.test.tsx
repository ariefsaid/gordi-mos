import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomeStream, type HomeStreamProps } from './home-stream'
import type { StreamBand, StreamItem } from '@/lib/home-stream'

function item(overrides: Partial<StreamItem> = {}): StreamItem {
  return { id: 'i-' + Math.random().toString(36).slice(2, 8), title: 'A row', route: '/work/tasks/x', ...overrides }
}
const emptyBand = (kind: StreamBand['kind']): StreamBand => ({ kind, state: 'ready', items: [] })

function renderStream(overrides: Partial<HomeStreamProps> = {}) {
  const props: HomeStreamProps = {
    taskState: 'ready',
    onRetryTasks: vi.fn(),
    overdue: [],
    dueToday: [],
    blocked: [],
    myWork: [],
    openCount: 0,
    failedChecks: emptyBand('failed-checks'),
    mentions: emptyBand('mentions'),
    order: 'attention-first',
    attentionAnchorId: 'attention-brief',
    ...overrides,
  }
  return render(
    <I18nProvider><MemoryRouter>
      <HomeStream {...props} />
    </MemoryRouter></I18nProvider>,
  )
}

describe('HomeStream — the consequence-ranked stream', () => {
  it('renders an overdue row with its reason chip (the ranking cue) and status pill', () => {
    renderStream({
      overdue: [item({ id: 't-late', title: 'Restock oat milk', reason: { tone: 'overdue', days: 9 }, status: 'In Progress' })],
    })
    expect(screen.getByText('Restock oat milk')).toBeInTheDocument()
    // Reason chip makes the ranking legible at a glance ("Overdue · 9d") — beats E7's generic status.
    expect(screen.getByText('Overdue · 9d')).toBeInTheDocument()
    // Band divider carries the count.
    expect(screen.getByRole('heading', { name: 'Overdue · 1' })).toBeInTheDocument()
  })

  it('ranks bands across record types in one stream: overdue → due-today → blocked → failed-checks → mentions', () => {
    renderStream({
      overdue: [item({ id: 'o', title: 'Overdue row', reason: { tone: 'overdue', days: 2 } })],
      dueToday: [item({ id: 'd', title: 'Due-today row', reason: { tone: 'due' } })],
      blocked: [item({ id: 'b', title: 'Blocked row', reason: { tone: 'blocked' } })],
      failedChecks: { kind: 'failed-checks', state: 'ready', items: [item({ id: 'f', title: 'Failed check', reason: { tone: 'check' } })] },
      mentions: { kind: 'mentions', state: 'ready', items: [item({ id: 'm', title: 'A mention', reason: { tone: 'mention' } })] },
    })
    const titles = ['Overdue row', 'Due-today row', 'Blocked row', 'Failed check', 'A mention']
      .map(txt => screen.getByText(txt))
    for (let i = 0; i < titles.length - 1; i++) {
      expect(Boolean(titles[i].compareDocumentPosition(titles[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    }
  })

  it('default order = attention-first: the attention group precedes the my-work group', () => {
    renderStream({ order: 'attention-first', overdue: [item({ title: 'Late' })] })
    const attn = screen.getByTestId('attention-group')
    const mine = screen.getByTestId('my-work-group')
    expect(Boolean(attn.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('my-work-first (personal-first) puts the my-work group before the attention group', () => {
    renderStream({ order: 'personal-first', overdue: [item({ title: 'Late' })] })
    const attn = screen.getByTestId('attention-group')
    const mine = screen.getByTestId('my-work-group')
    expect(Boolean(mine.compareDocumentPosition(attn) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('shows the "all caught up" affirmation when every attention band is ready and empty', () => {
    renderStream({})
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
  })

  it('the my-work band shows the capped rows + an "All tasks · N →" drill link with the full open count', () => {
    renderStream({
      myWork: [item({ id: 'w1', title: 'Open work A' }), item({ id: 'w2', title: 'Open work B' })],
      openCount: 11,
    })
    expect(screen.getByText('Open work A')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /all tasks · 11/i })
    expect(link.getAttribute('href')).toBe('/work/tasks?view=my-work')
  })

  it('a ready-but-empty my-work band teaches, never a silent void', () => {
    renderStream({ overdue: [item({ title: 'Late' })], myWork: [], openCount: 1 })
    expect(screen.getByText(/nothing else open/i)).toBeInTheDocument()
  })

  it('a failed tasks projection renders ONE retriable error (never one per task band)', async () => {
    const onRetryTasks = vi.fn()
    renderStream({ taskState: 'error', onRetryTasks })
    const errors = screen.getAllByText("Couldn't load this list. Refresh to try again.")
    expect(errors).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetryTasks).toHaveBeenCalledTimes(1)
  })

  it('a loading tasks projection renders one consolidated loading shell', () => {
    renderStream({ taskState: 'loading' })
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(1)
  })

  it('the region is a landmark with an accessible name (a11y — the greeting head stays the visible lead)', () => {
    renderStream({})
    expect(screen.getByRole('region', { name: /what needs you/i })).toBeInTheDocument()
  })
})
