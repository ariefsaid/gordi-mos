import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { UseNotifications } from '@/hooks/useNotifications'
import type { NotificationRow } from '@/lib/db/notifications'
import { OverlayHostProvider, OverlayHostSlot } from '@/shell/overlay-host'
import { InboxTriageConnected } from './inbox-triage-connected'

// The connected triage owns the live wiring; the data hook is mocked so we drive rows/state directly.
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: vi.fn() }))
import { useNotifications } from '@/hooks/useNotifications'
const mockUse = vi.mocked(useNotifications)

// JQ-4 / D-A4: opening a notification now mounts the SAME actionable record host every other door
// uses. This wiring test's oracle is the HOST grammar (mark-read, one physical host, Open-full-page,
// Back→Inbox) — NOT the record internals (those have their own suites) — so the shared record hosts
// are stubbed to a lightweight marker carrying the id, proving the door mounts the real record host
// (never a bespoke zero-action summary) without coupling this test to every record DAL.
vi.mock('@/components/tasks/task-surface', () => ({
  TaskSurface: ({ taskId }: { taskId: string | null }) => (
    <div data-testid="task-record-host" data-task-id={taskId ?? ''} />
  ),
}))
vi.mock('@/components/signals/signal-record-host', () => ({
  SignalRecordHost: ({ signalId }: { signalId: string }) => (
    <div data-testid="signal-record-host" data-signal-id={signalId} />
  ),
}))

function notif(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n1',
    severity: 'info',
    title: 'Budget review',
    body: 'Please review Q3 budget',
    metadata: { entity: { type: 'task', id: 't1' } },
    read_at: null,
    created_at: '2026-07-20T00:00:00Z',
    ...over,
  }
}

function hook(over: Partial<UseNotifications> = {}): UseNotifications {
  return {
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: null,
    markRead: vi.fn(),
    refresh: vi.fn(),
    ...over,
  }
}

// Renders the connected triage as a page body plus the ONE shared Inbox host slot, so an opened
// record actually mounts through the real overlay host (no bespoke drawer).
function renderConnected() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/inbox']}>
        <OverlayHostProvider>
          <InboxTriageConnected mode="page" />
          <OverlayHostSlot owner="inbox" />
          <Routes>
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </OverlayHostProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="loc">{loc.pathname}</span>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUse.mockReturnValue(hook())
})

describe('InboxTriageConnected — the live triage wiring (AC-V3-006 / FR-V3-008 / J06)', () => {
  it('opening a safe target marks it read (only) and mounts the shared actionable record host (JQ-4: never a zero-action summary)', () => {
    const markRead = vi.fn()
    mockUse.mockReturnValue(hook({ notifications: [notif()], markRead }))
    renderConnected()

    fireEvent.click(screen.getByRole('button', { name: /Budget review/ }))

    // Read is stamped; the shared canonical record host opens IN the Inbox panel — the same host
    // every other door mounts, so the triager can act on the record here (D-A4), plus the one
    // host-owned Open-full-page escalation.
    expect(markRead).toHaveBeenCalledWith('n1')
    expect(screen.getByTestId('task-record-host')).toHaveAttribute('data-task-id', 't1')
    expect(screen.getByRole('button', { name: /open full page/i })).toBeInTheDocument()
    expect(document.querySelector('[data-overlay-host][data-overlay-owner="inbox"]')).toBeTruthy()
    // One physical overlay host — never a second panel.
    expect(document.querySelectorAll('[data-overlay-host]').length).toBe(1)
  })

  it('JQ-4: a signal notification mounts the shared SignalRecordHost (its actions live in the panel)', () => {
    mockUse.mockReturnValue(hook({
      notifications: [notif({ metadata: { entity: { type: 'signal', id: 's9' } } })],
    }))
    renderConnected()

    fireEvent.click(screen.getByRole('button', { name: /Budget review/ }))

    expect(screen.getByTestId('signal-record-host')).toHaveAttribute('data-signal-id', 's9')
    expect(document.querySelectorAll('[data-overlay-host]').length).toBe(1)
  })

  it('an unavailable/unknown target opens no record and shows honest, localized copy', () => {
    const markRead = vi.fn()
    mockUse.mockReturnValue(hook({
      notifications: [notif({ metadata: { entity: { type: 'objective', id: 'o1' } } })],
      markRead,
    }))
    renderConnected()

    fireEvent.click(screen.getByRole('button', { name: /Budget review/ }))

    expect(screen.getByText(/doesn't link to an openable record/i)).toBeInTheDocument()
    expect(document.querySelectorAll('[data-overlay-host]').length).toBe(0)
    expect(screen.queryByRole('button', { name: /open full record/i })).toBeNull()
  })

  it('a feature-off follow_up target fails closed (never manufactured access)', () => {
    mockUse.mockReturnValue(hook({
      notifications: [notif({ metadata: { entity: { type: 'follow_up', id: 'f1' } } })],
    }))
    renderConnected()

    fireEvent.click(screen.getByRole('button', { name: /Budget review/ }))
    expect(screen.getByText(/isn't available yet/i)).toBeInTheDocument()
    expect(document.querySelectorAll('[data-overlay-host]').length).toBe(0)
  })

  it('the host "Open full page" door navigates to the canonical page and closes the overlay', () => {
    mockUse.mockReturnValue(hook({ notifications: [notif()] }))
    renderConnected()

    fireEvent.click(screen.getByRole('button', { name: /Budget review/ }))
    fireEvent.click(screen.getByRole('button', { name: /open full page/i }))

    expect(screen.getByTestId('loc')).toHaveTextContent('/work/tasks/t1')
    // The overlay is closed after promotion — no stacked panel behind the page.
    expect(document.querySelectorAll('[data-overlay-host]').length).toBe(0)
  })

  // D-A3 (fix work-order item 5): the /inbox page opens the record in ROUTE mode, so browser Back
  // closes the panel and returns to the Inbox queue. An ephemeral open pushed no history entry, so
  // Back ejected the user OUT of Inbox entirely — the dead-end I2 + OD-REDESIGN-20 ("Back returns
  // to Inbox") forbid.
  it('browser Back closes the record panel and returns to Inbox (never ejects the section)', async () => {
    mockUse.mockReturnValue(hook({ notifications: [notif()] }))
    let current: ReturnType<typeof useLocation> | null = null
    const getPath = () => current?.pathname
    function Probe() {
      current = useLocation()
      const navigate = useNavigate()
      return <button type="button" onClick={() => navigate(-1)}>Back</button>
    }
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/tasks', '/inbox']} initialIndex={1}>
          <OverlayHostProvider>
            <Probe />
            <InboxTriageConnected mode="page" />
            <OverlayHostSlot owner="inbox" />
          </OverlayHostProvider>
        </MemoryRouter>
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Budget review/ }))
    expect(document.querySelectorAll('[data-overlay-host]').length).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    // Panel closes …
    await waitFor(() => expect(document.querySelectorAll('[data-overlay-host]').length).toBe(0))
    // … and we remain on Inbox (Back did not eject to /work/tasks). The queue is still shown.
    expect(getPath()).toBe('/inbox')
    expect(screen.getByRole('button', { name: /Budget review/ })).toBeInTheDocument()
  })

  it('the Unread filter narrows the queue by read state; Handled stays withheld (no dead tab)', () => {
    mockUse.mockReturnValue(hook({
      notifications: [
        notif({ id: 'a', title: 'Unread one', read_at: null }),
        notif({ id: 'b', title: 'Read one', read_at: '2026-07-20T02:00:00Z' }),
      ],
    }))
    renderConnected()

    expect(screen.queryByRole('button', { name: 'Handled' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }))
    expect(screen.getByText('Unread one')).toBeInTheDocument()
    expect(screen.queryByText('Read one')).toBeNull()
  })

  it('renders the shared loading skeleton (never a bare/empty surface) while data is in flight', () => {
    mockUse.mockReturnValue(hook({ loading: true }))
    const { container } = renderConnected()
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.skeleton-rows')).not.toBeNull()
  })

  it('renders the shared retryable error state and calls refresh', () => {
    const refresh = vi.fn()
    mockUse.mockReturnValue(hook({ error: 'load failed', refresh }))
    renderConnected()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(refresh).toHaveBeenCalled()
  })
})
