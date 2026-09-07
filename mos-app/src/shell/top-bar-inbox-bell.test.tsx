// AC-069 / AC-070 / AC-071 — this file pins the phone bell as a link to `/inbox` and the desktop
// bell as a quick panel in the ONE shared overlay host (no URL mutation, focus returns to the bell
// on close, a row pushes the canonical record, internal Back returns to triage). A render without
// a mounted host falls back to the full `/inbox` route. Isolated so the mocks don't perturb broader
// top-bar layout tests.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { UseNotifications } from '@/hooks/useNotifications'
import type { NotificationRow } from '@/lib/db/notifications'
import { OverlayHostProvider, OverlayHostSlot } from './overlay-host'

vi.mock('./use-is-narrow')
import { useIsNarrow } from './use-is-narrow'
const mockNarrow = vi.mocked(useIsNarrow)

vi.mock('@/hooks/useUnreadCount', () => ({ useUnreadCount: vi.fn() }))
import { useUnreadCount } from '@/hooks/useUnreadCount'
const mockUnreadCount = vi.mocked(useUnreadCount)

vi.mock('@/hooks/useNotifications', () => ({ useNotifications: vi.fn() }))
import { useNotifications } from '@/hooks/useNotifications'
const mockUse = vi.mocked(useNotifications)

import { TopBar } from './top-bar'

const originalMatchMedia = window.matchMedia

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  })
})

function notif(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n1',
    severity: 'info',
    title: 'Budget review',
    body: 'Q3 budget',
    metadata: { entity: { type: 'task', id: 't1' } },
    read_at: null,
    created_at: '2026-07-20T00:00:00Z',
    ...over,
  }
}

function hook(over: Partial<UseNotifications> = {}): UseNotifications {
  return {
    notifications: [notif()],
    unreadCount: 1,
    loading: false,
    error: null,
    markRead: vi.fn(),
    markHandled: vi.fn(),
    refresh: vi.fn(),
    ...over,
  }
}

function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="loc">{loc.pathname}</span>
}

function stubViewport(width: 767 | 768) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === '(min-width: 768px)' ? width === 768 : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function renderShell() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/work/tasks']}>
        <OverlayHostProvider>
          <TopBar onOpenDrawer={vi.fn()} />
          <OverlayHostSlot owner="shell" />
          <Routes>
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </OverlayHostProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUse.mockReturnValue(hook())
  mockUnreadCount.mockReturnValue({ unreadCount: 0, loading: false, refresh: vi.fn() })
  stubViewport(768)
})

describe('Inbox bell — phone link / desktop quick panel (AC-069/070/071)', () => {
  it('AC-069: phone bell is a link to Inbox and does not mount the quick panel', () => {
    stubViewport(767)
    mockNarrow.mockReturnValue(true)
    mockUnreadCount.mockReturnValue({ unreadCount: 2, loading: false, refresh: vi.fn() })
    renderShell()

    const bell = screen.getByRole('link', { name: 'Inbox, 2 unread' })
    expect(bell).toHaveAttribute('href', '/inbox')
    fireEvent.click(bell)
    expect(screen.getByTestId('loc')).toHaveTextContent('/inbox')
    expect(screen.queryByRole('group', { name: /filter notifications/i })).toBeNull()
  })

  it.each([
    { width: 767 as const, role: 'link' as const },
    { width: 768 as const, role: 'button' as const },
  ])('real useIsDesktop seam at $widthpx renders the bell as a $role', ({ width, role }) => {
    stubViewport(width)
    mockNarrow.mockReturnValue(true)
    renderShell()

    expect(screen.getByRole(role, { name: 'Inbox' })).toBeInTheDocument()
  })

  it('desktop: opens quick triage in the shared host without mutating the URL', () => {
    stubViewport(768)
    mockNarrow.mockReturnValue(false)
    renderShell()

    expect(screen.getByTestId('loc')).toHaveTextContent('/work/tasks')
    fireEvent.click(screen.getByRole('button', { name: 'Inbox' }))

    // The quick triage mounts in the ONE shared host; the URL is unchanged (ephemeral root).
    expect(screen.getByRole('group', { name: /filter notifications/i })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-overlay-host]').length).toBe(1)
    expect(screen.getByTestId('loc')).toHaveTextContent('/work/tasks')
  })

  it('desktop: a row pushes the canonical record; internal Back returns to the triage queue', () => {
    mockNarrow.mockReturnValue(false)
    renderShell()

    fireEvent.click(screen.getByRole('button', { name: 'Inbox' }))
    // Open the notification's record — it pushes onto the same host stack.
    fireEvent.click(screen.getByRole('button', { name: /Budget review/ }))
    expect(screen.getByRole('button', { name: /open full page/i })).toBeInTheDocument()

    // Internal Back pops the record and returns to the exact triage queue.
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }))
    expect(screen.getByRole('group', { name: /filter notifications/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open full page/i })).toBeNull()
    expect(document.querySelectorAll('[data-overlay-host]').length).toBe(1)
  })

  it('AC-051: desktop button renders the shared unread figure', () => {
    stubViewport(768)
    mockNarrow.mockReturnValue(true)
    mockUnreadCount.mockReturnValue({ unreadCount: 2, loading: false, refresh: vi.fn() })
    mockUse.mockReturnValue(hook({ notifications: [notif(), notif({ id: 'n2', title: 'Hiring plan' })], unreadCount: 2 }))

    renderShell()

    expect(screen.getByRole('button', { name: 'Inbox, 2 unread' })).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('desktop: closing the quick triage returns focus to the bell', () => {
    stubViewport(768)
    mockNarrow.mockReturnValue(false)
    renderShell()

    const bell = screen.getByRole('button', { name: 'Inbox' })
    bell.focus()
    fireEvent.click(bell)
    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }))
    expect(document.activeElement).toBe(bell)
  })
})
