// #802 — offline is an error state inside the frame, not a crash.
//
// AC-025: a rejected data read renders ErrorState ("Couldn't reach the server" + Retry) inside the
//         page frame; rail and header stay in the DOM; the crash fallback never appears; Retry
//         re-issues the read.
// AC-026: while `navigator.onLine === false` the header carries one muted "You're offline" line
//         (localized), and nothing once the browser is back online.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn().mockResolvedValue([]),
  getPeople: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue([]),
}))
vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

import { AppShell } from './app-shell'

function authenticate() {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000001',
        org_id: '10000000-0000-0000-0000-000000000001',
        user_id: 'auth-user-001',
        full_name: 'Cahya Cafe',
        email: 'cahya@example.test',
        archived_at: null,
        must_change_password: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
      accessRoles: [],
      affiliated: [],
    },
    signOut: vi.fn(),
  })
}

/** Drives `navigator.onLine` and the events the browser fires with it. */
function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online })
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'))
  })
}

function renderShell(page: React.ReactNode, { crashBoundary = false } = {}) {
  authenticate()
  const tree = (
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={page} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  )
  // The app mounts the crash boundary above <App/> in main.tsx; a test that expects a rethrow
  // needs the same catcher, or the exception escapes the run.
  return render(crashBoundary ? <ErrorBoundary>{tree}</ErrorBoundary> : tree)
}

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  localStorage.clear()
  vi.restoreAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-025
// ─────────────────────────────────────────────────────────────────────────────
describe('AC-025 — a rejected data read is an error inside the frame', () => {
  /**
   * A page whose read runs on mount and whose rejection reaches render — the shape every data
   * surface in the app has. The read is a spy so "Retry re-reads" is a counted fact, not a claim.
   */
  function DataPage({ read }: { read: () => Promise<string> }) {
    const [rows, setRows] = useState<string | null>(null)
    const [error, setError] = useState<unknown>(null)
    useEffect(() => {
      let live = true
      read().then(
        (r) => live && setRows(r),
        (e) => live && setError(e),
      )
      return () => {
        live = false
      }
    }, [read])
    if (error) throw error
    return <div>{rows ?? 'reading…'}</div>
  }

  beforeEach(() => {
    // React logs every boundary-caught error; the assertions below are the record, not the noise.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders ErrorState with the network sentence and Retry, keeping rail and header', async () => {
    const read = vi.fn<() => Promise<string>>().mockRejectedValue(new TypeError('Failed to fetch'))
    const { container } = renderShell(<DataPage read={read} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t reach the server')
    expect(alert).toHaveTextContent('Check your connection and try again.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()

    // The frame survived: the shell header and the desktop rail are still mounted.
    expect(container.querySelector('header')).not.toBeNull()
    expect(container.querySelector('aside')).not.toBeNull()

    // …and the crash fallback never rendered.
    expect(screen.queryByText('Something went wrong')).toBeNull()
    expect(container.querySelector('.error-boundary')).toBeNull()
  })

  it('Retry re-issues the read', async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue('12 rows')
    renderShell(<DataPage read={read} />)

    await screen.findByRole('alert')
    expect(read).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('12 rows')).toBeInTheDocument())
    expect(read).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a render exception that is NOT a network failure still reaches the crash boundary', async () => {
    const read = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('cannot read x of undefined'))
    // The shell boundary rethrows it, so the crash boundary above the app is what answers — the
    // in-frame network state must NOT swallow an exception Retry cannot fix.
    renderShell(<DataPage read={read} />, { crashBoundary: true })

    await screen.findByText('This screen stopped working')
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByText('Couldn’t reach the server')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-026
// ─────────────────────────────────────────────────────────────────────────────
describe('AC-026 — the header says offline exactly once, and only while offline', () => {
  it('shows one muted line while the browser reports offline, and none when it returns', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    renderShell(<div>page</div>)

    const lines = screen.getAllByText('You’re offline')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveClass('text-muted-foreground')

    setOnline(true)
    expect(screen.queryByText('You’re offline')).toBeNull()

    setOnline(false)
    expect(screen.getAllByText('You’re offline')).toHaveLength(1)
  })

  it('renders the Indonesian line under locale id', () => {
    localStorage.setItem('mos.locale', 'id')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    renderShell(<div>page</div>)

    expect(screen.getByText('Anda sedang offline')).toBeInTheDocument()
    expect(screen.queryByText('You’re offline')).toBeNull()
  })
})
