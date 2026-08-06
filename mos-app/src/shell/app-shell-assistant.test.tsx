// T29 — wire the deputy into AppShell behind SHOW_ASSISTANT (FR-P2-CF-003). Flag-off removes the
// panel and the top-bar launcher; flag-on mounts the provider + keep-mounted panel. The launcher is
// a neutral top-bar icon on EVERY viewport (DESIGN.md No-FAB Rule, owner-agreed 2026-07-07 — no
// floating orange FAB). AC-AP-001/005, AC-CF-003. Isolated so the SHOW_ASSISTANT mock leaves the
// existing app-shell tests (flag-off default) untouched.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

const flag = { SHOW_ASSISTANT: true }
vi.mock('@/config/features', () => ({
  get SHOW_ASSISTANT() {
    return flag.SHOW_ASSISTANT
  },
  SHOW_USER_VIEWS: false,
  SHOW_WEEKLY_UPDATES: false,
  SHOW_FOLLOWUPS: false,
  SHOW_PLAN_BUDGET: false,
  SHOW_DAILY_LOG: false,
}))

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))
// The always-live NotificationBell (SHOW_INBOX retired, D-1) fires useUnreadCount → countUnread.
vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue([]),
}))
vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

import { AppShell } from './app-shell'

const viewer = {
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
}

function setNarrow(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

function renderShell() {
  mockUseAuth.mockReturnValue({ status: 'authenticated', viewer, signOut: vi.fn() })
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div role="main">page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

// The keep-mounted panel section is always in the DOM when the flag is on (it self-gates
// visibility on `open`); closed, it is inert + aria-hidden so getByRole can't see it — query DOM.
function panelSection(): Element | null {
  return document.querySelector('[aria-label="Deputy"]')
}

describe('AppShell assistant wiring (T29)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    flag.SHOW_ASSISTANT = true
  })
  afterEach(() => setNarrow(false))

  it('AC-AP-005/AC-CF-003: flag-off mounts NO panel and NO top-bar launcher', () => {
    flag.SHOW_ASSISTANT = false
    setNarrow(false)
    renderShell()
    expect(screen.queryByRole('button', { name: 'Open deputy' })).toBeNull()
    expect(panelSection()).toBeNull()
    // The launcher gates on SHOW_ASSISTANT before viewport, so it is absent regardless of width.
  })

  it('AC-AP-001: flag-on desktop mounts the top-bar button + the keep-mounted (hidden) panel', () => {
    setNarrow(false)
    renderShell()
    // Top-bar assistant button present.
    expect(screen.getByRole('button', { name: 'Open deputy' })).toBeInTheDocument()
    // Panel is keep-mounted in the DOM (closed → inert + aria-hidden, not exposed via role).
    expect(panelSection()).not.toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Deputy' })).toBeNull()
    // Opening via the top-bar button exposes the drawer.
    fireEvent.click(screen.getByRole('button', { name: 'Open deputy' }))
    expect(screen.getByRole('complementary', { name: 'Deputy' })).toBeInTheDocument()
  })

  it('AC-AP-001: flag-on narrow mounts the header launcher (no FAB); clicking opens the phone sheet', () => {
    setNarrow(true)
    renderShell()
    const launcher = screen.getByRole('button', { name: 'Open deputy' })
    expect(launcher).toBeInTheDocument()
    // It is the neutral header icon, not a floating FAB — no fixed bottom offset.
    expect((launcher as HTMLElement).style.bottom).toBe('')
    // Phone: clicking the launcher opens the modal sheet.
    fireEvent.click(launcher)
    expect(screen.getByRole('dialog', { name: 'Deputy' })).toBeInTheDocument()
  })
})
