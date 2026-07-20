import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { InboxTriage, type InboxTriageProps } from './inbox-triage'
import type { TriageNotificationRow } from './read-handled-semantics'

function trow(id: string, over?: Partial<TriageNotificationRow>): TriageNotificationRow {
  return {
    id,
    severity: 'info',
    title: `Title ${id}`,
    body: `Body ${id}`,
    metadata: {},
    read_at: null,
    created_at: '2026-07-20T00:00:00Z',
    handled_at: null,
    ...over,
  }
}

function renderTriage(props: Partial<InboxTriageProps> = {}) {
  const full: InboxTriageProps = {
    mode: 'page',
    state: 'ready',
    rows: [trow('a'), trow('b', { read_at: '2026-07-20T01:00:00Z' })],
    filter: 'all',
    handledFilterAvailable: false,
    onFilterChange: vi.fn(),
    onOpen: vi.fn(),
    onRetry: vi.fn(),
    ...props,
  }
  render(
    <I18nProvider>
      <InboxTriage {...full} />
    </I18nProvider>,
  )
  return full
}

describe('InboxTriage — one chrome-free triage surface (AC-V3-006 / FR-V3-012 / J06)', () => {
  it('renders the All and Unread filters and reflects the active filter', () => {
    renderTriage({ filter: 'unread' })
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('omits the Handled filter when handledFilterAvailable is false (no dead tab)', () => {
    renderTriage({ handledFilterAvailable: false })
    expect(screen.queryByRole('button', { name: 'Handled' })).toBeNull()
  })

  it('shows the Handled filter when handledFilterAvailable is true', () => {
    renderTriage({ handledFilterAvailable: true })
    expect(screen.getByRole('button', { name: 'Handled' })).toBeInTheDocument()
  })

  it('clicking a filter calls onFilterChange with that filter', () => {
    const props = renderTriage()
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }))
    expect(props.onFilterChange).toHaveBeenCalledWith('unread')
  })

  it('loading state exposes a busy status region', () => {
    renderTriage({ state: 'loading', rows: [] })
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
  })

  it('error state shows Retry and calls onRetry', () => {
    const props = renderTriage({ state: 'error', rows: [] })
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(props.onRetry).toHaveBeenCalled()
  })

  it('empty state shows the caught-up message via the shared kit', () => {
    renderTriage({ state: 'empty', rows: [] })
    const empty = screen.getByTestId('empty-state')
    expect(empty).toHaveAttribute('data-empty-variant', 'quiet')
    expect(empty).toHaveTextContent(/caught up/i)
  })

  it('ready state renders one row per notification with title and body', () => {
    renderTriage()
    expect(screen.getByText('Title a')).toBeInTheDocument()
    expect(screen.getByText('Body a')).toBeInTheDocument()
    expect(screen.getByText('Title b')).toBeInTheDocument()
  })

  it('an unread row is marked unread in its accessible name and style hook', () => {
    renderTriage({ rows: [trow('a')] })
    const btn = screen.getByRole('button', { name: /Title a \(unread\)/ })
    expect(btn.closest('.inbox-row')).toHaveClass('inbox-row--unread')
  })

  it('clicking a row calls onOpen with that notification', () => {
    const props = renderTriage({ rows: [trow('a')] })
    fireEvent.click(screen.getByRole('button', { name: /Title a/ }))
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('renders row titles as inert text (no injected markup)', () => {
    renderTriage({ rows: [trow('x', { title: '<img src=x onerror=alert(1)>' })] })
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('exposes a Mark handled action only when onMarkHandled is supplied and the row is unhandled', () => {
    const onMarkHandled = vi.fn()
    renderTriage({ rows: [trow('a')], onMarkHandled })
    const row = screen.getByRole('button', { name: /Title a/ }).closest('.inbox-row')!
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /mark handled/i }))
    expect(onMarkHandled).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('does not offer Mark handled for an already-handled row', () => {
    renderTriage({
      rows: [trow('a', { handled_at: '2026-07-20T02:00:00Z' })],
      onMarkHandled: vi.fn(),
    })
    expect(screen.queryByRole('button', { name: /mark handled/i })).toBeNull()
  })

  it('a pending row disables its open button with aria-busy and announces via status', () => {
    renderTriage({ rows: [trow('a')], pendingIds: ['a'] })
    const btn = screen.getByRole('button', { name: /Title a/ })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent(/opening/i)
  })

  it('is chrome-free: no dialog role, no scrim, no close button — the host owns those', () => {
    renderTriage()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('.drawer-scrim, .drawer-modal-root')).toBeNull()
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
  })

  it('reflects its mode for the host without changing row meaning', () => {
    renderTriage({ mode: 'quick' })
    expect(document.querySelector('.inbox-triage')).toHaveAttribute('data-mode', 'quick')
  })
})
