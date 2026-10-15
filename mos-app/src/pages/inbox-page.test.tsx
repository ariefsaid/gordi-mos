import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { OverlayHostProvider } from '@/shell/overlay-host'
import type { UseNotifications } from '@/hooks/useNotifications'
import type { NotificationRow } from '@/lib/db/notifications'

vi.mock('@/hooks/useNotifications', () => ({ useNotifications: vi.fn() }))
import { useNotifications } from '@/hooks/useNotifications'
import { InboxPage } from './inbox-page'

const mockUseNotifications = vi.mocked(useNotifications)

function notification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n-1',
    severity: 'info',
    title: 'Task assigned',
    body: 'Review budget',
    metadata: { entity: { type: 'task', id: 'task-1', route: '/tasks/task-1' } },
    read_at: null,
    created_at: '2026-07-07T00:00:00Z',
    ...overrides,
  }
}

function hookState(overrides: Partial<UseNotifications> = {}): UseNotifications {
  return {
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: null,
    hasMore: false,
    loadingMore: false,
    loadMoreError: false,
    loadMore: vi.fn().mockResolvedValue(undefined),
    markRead: vi.fn(),
    markHandled: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  }
}

function renderPage(locale: 'en' | 'id' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter>
        <InboxPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

function renderHostedPage() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <OverlayHostProvider>
          <InboxPage />
        </OverlayHostProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseNotifications.mockReturnValue(hookState())
})

describe('InboxPage — shared state kit', () => {
  it('loading: renders the shared skeleton state instead of an empty inbox', () => {
    mockUseNotifications.mockReturnValue(hookState({ loading: true }))
    renderPage()

    // The connected triage body owns the loading grammar: a busy status region — never a bare
    // empty surface while data is still in flight.
    expect(screen.getAllByRole('status').some((status) => status.getAttribute('aria-busy') === 'true')).toBe(true)
    expect(screen.queryByText(/no notifications yet/i)).not.toBeInTheDocument()
  })

  it('error: renders the shared retryable ErrorState and calls refresh', () => {
    const refresh = vi.fn()
    mockUseNotifications.mockReturnValue(hookState({ error: 'load failed', refresh }))
    renderPage()

    expect(screen.getByText(/couldn't load inbox/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(refresh).toHaveBeenCalled()
  })

  it('empty: renders the shared quiet EmptyState', () => {
    renderPage()

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'quiet')
    expect(within(emptyState).getByText('No notifications yet')).toBeInTheDocument()
  })

  it('W4-3: empty copy names supported Signal notifications in both locales; the page offers one way on, to my tasks', () => {
    const english = renderPage('en')

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'quiet')
    expect(within(emptyState).getByText('Mentions and Signal retractions appear here.')).toBeInTheDocument()
    expect(within(emptyState).getByRole('link', { name: 'View my tasks' })).toHaveAttribute('href', '/work/tasks?view=my-work')

    english.unmount()
    renderPage('id')
    expect(within(screen.getByTestId('empty-state')).getByText(
      'Sebutan dan penarikan Sinyal akan muncul di sini.',
    )).toBeInTheDocument()
  })

  it('populated: renders the notification list', () => {
    mockUseNotifications.mockReturnValue(hookState({ notifications: [notification()] }))
    renderPage()

    expect(screen.getByRole('list', { name: /inbox/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Task assigned/ })).toBeInTheDocument()
  })

  it('keeps loaded Inbox rows visible and offers a localized continuation when another page exists', () => {
    const loadMore = vi.fn().mockResolvedValue(undefined)
    mockUseNotifications.mockReturnValue(hookState({
      notifications: [notification()],
      hasMore: true,
      loadMore,
    }))
    renderPage('id')

    expect(screen.getByText('1 item dimuat')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Muat item lainnya' }))
    expect(loadMore).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Muat item lainnya' })).toBeInTheDocument()
  })

  it('preserves the Inbox rows and offers localized retry after a continuation error', () => {
    const loadMore = vi.fn().mockResolvedValue(undefined)
    mockUseNotifications.mockReturnValue(hookState({
      notifications: [notification()],
      hasMore: true,
      loadMoreError: true,
      loadMore,
    }))
    renderPage('id')

    expect(screen.getByRole('button', { name: /Task assigned/ })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Tidak dapat memuat lagi.')
    fireEvent.click(screen.getByRole('button', { name: /coba lagi/i }))
    expect(loadMore).toHaveBeenCalledOnce()
  })

  it('AC-051: two unread mentions share the Unread count and appear under All and Unread', () => {
    const rows = [
      notification({ id: 'mention-1', title: 'Mention one' }),
      notification({ id: 'mention-2', title: 'Mention two' }),
      notification({ id: 'handled-1', title: 'Handled item', read_at: '2026-07-07T01:00:00Z' }),
    ]
    mockUseNotifications.mockReturnValue(hookState({ notifications: rows, unreadCount: 2 }))
    renderPage()

    expect(screen.getByRole('button', { name: /^Unread\s*2$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unread: .*Mention one/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unread: .*Mention two/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Handled item/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Unread\s*2$/i }))
    expect(screen.getByRole('button', { name: /Unread: .*Mention one/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unread: .*Mention two/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Handled item/i })).toBeNull()
  })

  it('AC-V3-002: page-owned Inbox records mount through the inbox collection host slot', () => {
    mockUseNotifications.mockReturnValue(hookState({ notifications: [notification()] }))
    renderHostedPage()

    fireEvent.click(screen.getByRole('button', { name: /Task assigned/ }))
    expect(document.querySelector('[data-overlay-host][data-overlay-owner="inbox"]')).toBeTruthy()
    expect(document.querySelector('.record-panel-chrome')).toBeTruthy()
  })
})

// Census R2 DO-1 (F-INBOX-1): the `.record-split` grid reserves a 360px/44% right track the moment
// it is applied, so it must exist only at >=1100px AND while a record is actually open — the same
// gate Signals/Tasks use. At rest (or on phone/tablet) triage owns the full width: no resting dead
// void, no ~80px crushed queue.
describe('DO-1 — the triage list is never squashed by an empty record track', () => {
  function stubMatchMedia(split: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('1100') ? split : false,
        media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }),
    })
  }

  it('at rest (no record open) the page applies no .record-split track at any width', () => {
    stubMatchMedia(true)
    mockUseNotifications.mockReturnValue(hookState({ notifications: [notification()] }))
    const { container } = renderHostedPage()
    expect(container.querySelector('.record-split')).toBeNull()
    // The dead companion class is gone too — it never had CSS.
    expect(container.querySelector('.inbox-page-split')).toBeNull()
  })

  it('>=1100px with a record open: the split track appears so the record sits beside the list', () => {
    stubMatchMedia(true)
    // The split needs a content track wide enough for list + record; with no shell mounted that is the viewport.
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1600 })
    mockUseNotifications.mockReturnValue(hookState({ notifications: [notification()] }))
    const { container } = renderHostedPage()
    fireEvent.click(screen.getByRole('button', { name: /Task assigned/ }))
    expect(container.querySelector('.record-split')).not.toBeNull()
  })

  it('below 1100px a record open never squashes the list — the host owns a modal instead', () => {
    stubMatchMedia(false)
    mockUseNotifications.mockReturnValue(hookState({ notifications: [notification()] }))
    const { container } = renderHostedPage()
    fireEvent.click(screen.getByRole('button', { name: /Task assigned/ }))
    expect(container.querySelector('.record-split')).toBeNull()
  })
})

describe('InboxPage — focused title, no decorative help tip', () => {
  it('does not add a help-tip control or meta row to the Inbox head', () => {
    const { container } = renderPage()
    const head = container.querySelector('[data-testid="page-head"]')!
    expect(head).not.toHaveClass('content-header--meta-inline')
    expect(head.querySelector('.ch-meta')).toBeNull()
    expect(screen.queryByRole('button', { name: /help/i })).toBeNull()
  })
})
