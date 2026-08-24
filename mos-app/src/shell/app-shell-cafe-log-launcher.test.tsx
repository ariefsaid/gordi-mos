// #407 — the floor's one-tap capture path lives on the SHIPPED shell, not the fossil Home.
//
// The lesson this file encodes: #405 repointed the capture CTA to /cafe/log on a component only
// the DEV-only fossil Home mounted, and grep on the component's href "verified" it. A correct
// href on an unmounted component is indistinguishable from a working feature by grep alone. So
// this test pins the CALL SITE: it renders the real AppShell at phone width, taps the real `+`
// action launcher the shipped BottomTabBar renders, and walks the real CommandMenu entry to
// /cafe/log — and separately asserts the router config actually mounts THIS shell with a
// /cafe/log child, so the chain never dead-ends on a surface nothing ships.
import { isValidElement } from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, type RouteObject } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn().mockResolvedValue([]),
  getPeople: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/auth/use-auth')

// The route-admission seam (OD-WAY-51). REAL by default — the admitted case below exercises the
// real viewerAdmittedToRoute for a plain member with no access roles. Overridable per test
// because the not-admitted case cannot be reached through the real function today: /cafe/log
// carries no access-role gate, so every authenticated viewer is admitted. The override also
// proves the entry consults THIS seam (called with the /cafe/log route), not some private gate.
const seam = vi.hoisted(() => ({
  override: null as null | ((path: string, accessRoles: string[]) => boolean),
}))
vi.mock('@/shell/destinations', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/shell/destinations')>()
  return {
    ...mod,
    viewerAdmittedToRoute: (path: string, accessRoles: string[]) =>
      seam.override ? seam.override(path, accessRoles) : mod.viewerAdmittedToRoute(path, accessRoles),
  }
})

import { useAuth } from '@/auth/use-auth'
import { AppShell } from './app-shell'
import { routeConfig } from '@/router'

const mockUseAuth = vi.mocked(useAuth)

// Same matchMedia override the other shell tests use: matches=true simulates the phone viewport
// (useIsNarrow → true → BottomTabBar + the `+` launcher render).
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

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

// A plain member: NO access roles. The admitted case must hold for exactly this viewer — the
// floor member is the primary user, and the real seam admits them because the /cafe/log route
// carries no access-role gate.
function setMemberAuth() {
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
    },
    signOut: vi.fn(),
  })
}

function renderShellAtHome() {
  setMemberAuth()
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <LocationProbe />
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div role="main">home page</div>} />
            <Route path="cafe/log" element={<div role="main">cafe log page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

function openLauncher() {
  fireEvent.click(screen.getByRole('button', { name: 'Open actions' }))
  return screen.getByRole('dialog', { name: 'Command menu' })
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('mos.locale', 'en')
  seam.override = null
  setNarrow(true)
})
afterEach(() => {
  setNarrow(false)
  vi.clearAllMocks()
})

describe('AC-407: the shipped shell offers the floor a one-tap Café log capture path', () => {
  it('AC-407: phone Home → the `+` launcher lists the Café log entry, and tapping it lands on /cafe/log', () => {
    renderShellAtHome()
    expect(screen.getByTestId('location')).toHaveTextContent('/')

    openLauncher()
    const entry = screen.getByRole('option', { name: /Log Café production/i })
    fireEvent.click(entry)

    expect(screen.getByTestId('location')).toHaveTextContent('/cafe/log')
    expect(screen.getByText('cafe log page')).toBeInTheDocument()
  })

  it('AC-407: a viewer the /cafe/log route does NOT admit gets no entry — absent, never present-and-bouncing', () => {
    const denied = vi.fn(() => false)
    seam.override = denied
    renderShellAtHome()

    openLauncher()
    expect(screen.queryByRole('option', { name: /Log Café production/i })).toBeNull()
    // The three universal actions are untouched by the gate.
    expect(screen.getByRole('option', { name: /Ask Deputy/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Create task/i })).toBeInTheDocument()
    // And the absence came from the route-admission seam, asked about THIS route (OD-WAY-51) —
    // not from a private job-role gate.
    expect(denied).toHaveBeenCalledWith('/cafe/log', [])
  })

  it('AC-407: the router ships THIS shell — routeConfig mounts AppShell with an index Home and a /cafe/log child', () => {
    // The call-site chain's last link: the AppShell rendered above must be the one routeConfig
    // mounts, or this file would prove a shell nothing ships (the exact fossil failure mode).
    function findShellRoute(routes: RouteObject[]): RouteObject | null {
      for (const r of routes) {
        if (isValidElement(r.element) && r.element.type === AppShell) return r
        if (r.children) {
          const hit = findShellRoute(r.children)
          if (hit) return hit
        }
      }
      return null
    }
    const shellRoute = findShellRoute(routeConfig)
    expect(shellRoute).not.toBeNull()
    expect(shellRoute!.children?.some((c) => c.index)).toBe(true)
    expect(shellRoute!.children?.some((c) => c.path === 'cafe/log')).toBe(true)
  })
})
