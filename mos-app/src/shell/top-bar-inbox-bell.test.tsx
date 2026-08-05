// AC-V3-006 / AC-RPH-4 — the Inbox bell is two honest doors: on desktop it quick-opens the SAME
// InboxTriage surface as an ephemeral root in the ONE shared overlay host (no URL mutation, focus
// returns to the bell on close, a row pushes the canonical record, internal Back returns to triage);
// on phone it navigates to the full `/inbox` route. Isolated file so the mocks don't perturb the
// broader top-bar layout tests.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { UseNotifications } from '@/hooks/useNotifications'
import type { NotificationRow } from '@/lib/db/notifications'
import { OverlayHostProvider, OverlayHostSlot } from './overlay-host'

vi.mock('./use-is-narrow')
import { useIsNarrow } from './use-is-narrow'
const mockNarrow = vi.mocked(useIsNarrow)

vi.mock('@/hooks/useUnreadCount', () => ({ useUnreadCount: () => ({ unreadCount: 0 }) }))

vi.mock('@/hooks/useNotifications', () => ({ useNotifications: vi.fn() }))
import { useNotifications } from '@/hooks/useNotifications'
const mockUse = vi.mocked(useNotifications)

import { TopBar } from './top-bar'

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
    refresh: vi.fn(),
    ...over,
  }
}

function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="loc">{loc.pathname}</span>
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
})

describe('Inbox bell — two doors (AC-V3-006 / AC-RPH-4)', () => {
  it('desktop: opens quick triage in the shared host without mutating the URL', () => {
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

  it('desktop: closing the quick triage returns focus to the bell', () => {
    mockNarrow.mockReturnValue(false)
    renderShell()

    const bell = screen.getByRole('button', { name: 'Inbox' })
    bell.focus()
    fireEvent.click(bell)
    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }))
    expect(document.activeElement).toBe(bell)
  })

  it('phone: navigates to the full /inbox route instead of opening a host panel', () => {
    mockNarrow.mockReturnValue(true)
    renderShell()

    fireEvent.click(screen.getByRole('button', { name: 'Inbox' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/inbox')
    expect(document.querySelectorAll('[data-overlay-host]').length).toBe(0)
  })
})
