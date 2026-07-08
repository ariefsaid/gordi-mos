import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
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
    markRead: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <InboxPage />
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
    const { container } = renderPage()

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
    expect(container.querySelector('.skeleton-rows')).not.toBeNull()
    expect(screen.queryByText(/caught up/i)).not.toBeInTheDocument()
  })

  it('error: renders the shared retryable ErrorState and calls refresh', () => {
    const refresh = vi.fn()
    mockUseNotifications.mockReturnValue(hookState({ error: 'load failed', refresh }))
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load inbox/i)
    expect(refresh).toHaveBeenCalled()
  })

  it('empty: renders the shared EmptyState caught-up copy', () => {
    const { container } = renderPage()

    expect(container.querySelector('.empty-state')).not.toBeNull()
    expect(screen.getByText(/caught up/i)).toBeInTheDocument()
  })

  it('W4-3: empty state names the notification source with at most one action (no forced CTA)', () => {
    const { container } = renderPage()

    // names the source — notifications (mentions/approvals/assignments) need attention
    expect(container.querySelector('.empty-state')).not.toBeNull()
    expect(screen.getByText(/attention/i)).toBeInTheDocument()
    // calm caught-up state: no forced CTA (≤1 action). Inbox routes to content.
    const actions = container.querySelector('.empty-actions')
    expect(actions === null || actions.querySelectorAll('button, a').length <= 1).toBe(true)
  })

  it('populated: renders the notification list without the home surface wash', () => {
    mockUseNotifications.mockReturnValue(hookState({ notifications: [notification()] }))
    const { container } = renderPage()

    expect(screen.getByRole('list', { name: /inbox/i })).toBeInTheDocument()
    expect(container.querySelector('.content-header')).not.toBeNull()
    expect(container.querySelector('main')?.style.backgroundImage).toBe('')
  })
})
