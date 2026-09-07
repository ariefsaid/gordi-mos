// #407 + #755 — the floor's one-tap capture path lives on the SHIPPED shell, gated by the WRITE
// gate, not the route.
//
// The lesson this file encodes: #405 repointed the capture CTA to /cafe/log on a component only
// the DEV-only fossil Home mounted, and grep on the component's href "verified" it. A correct
// href on an unmounted component is indistinguishable from a working feature by grep alone. So
// the journey cases here render the real AppShell at phone width, tap the real `+` action
// launcher the shipped BottomTabBar renders, and walk the real CommandMenu entry to /cafe/log.
//
// #755 (AC-022) re-points the entry's gate: the launcher offers a CAPTURE — a write — so the
// route-admission seam (which admits every authenticated reader, OD-WAY-51) is the wrong gate.
// The entry renders only for viewers the #744 Café write gate admits: affiliated, `ops_lead`
// or `admin` (FR-022, lib/cafe-affiliation.ts `canCaptureCafe`). A separate test pins that the
// router actually mounts THIS shell with a /cafe/log child, so the chain never dead-ends.
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

function setAuth(opts: { accessRoles: string[]; affiliated: string[] }) {
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
      accessRoles: opts.accessRoles,
      affiliated: opts.affiliated,
    },
    signOut: vi.fn(),
  })
}

function renderShellAtHome() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <LocationProbe />
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div role="main">home page</div>} />
            {/* #781: /cafe IS the Café capture list now (OD-WAY-95). The launcher's action
                lands here directly instead of going through /cafe/log's redirect. */}
            <Route path="cafe" element={<div role="main">cafe log page</div>} />
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
  setNarrow(true)
})
afterEach(() => {
  setNarrow(false)
  vi.clearAllMocks()
})

describe('AC-022 (#755): the `+` launcher offers the Café capture only to viewers the write gate admits', () => {
  it('AC-022: Sales (unaffiliated, no ops roles) gets Ask Deputy · Share Signal · Create task and NO Café capture', () => {
    setAuth({ accessRoles: [], affiliated: [] })
    renderShellAtHome()

    openLauncher()
    expect(screen.queryByRole('option', { name: /Log Café production/i })).toBeNull()
    // The launcher mode renders the Actions group only, so the option list IS the action
    // inventory: the three universal actions, nothing else.
    const actions = screen.getAllByRole('option').map((el) => el.textContent?.trim())
    expect(actions).toEqual(['Ask Deputy: what needs my attention?', 'Share Signal', 'Create task'])
  })

  it('AC-022: a Café Ops lead (`ops_lead`) sees the Café capture action', () => {
    setAuth({ accessRoles: ['ops_lead'], affiliated: [] })
    renderShellAtHome()

    openLauncher()
    expect(screen.getByRole('option', { name: /Log Café production/i })).toBeInTheDocument()
  })

  it('AC-022: an affiliated member (no access role) sees it too — affiliation alone admits', () => {
    setAuth({ accessRoles: [], affiliated: ['cafe'] })
    renderShellAtHome()

    openLauncher()
    expect(screen.getByRole('option', { name: /Log Café production/i })).toBeInTheDocument()
  })
})

describe('AC-407: the shipped shell offers the floor a one-tap Café log capture path', () => {
  it('AC-407: phone Home → an affiliated member taps the launcher entry and lands on /cafe (the Log)', () => {
    setAuth({ accessRoles: [], affiliated: ['cafe'] })
    renderShellAtHome()
    expect(screen.getByTestId('location')).toHaveTextContent('/')

    openLauncher()
    const entry = screen.getByRole('option', { name: /Log Café production/i })
    fireEvent.click(entry)

    expect(screen.getByTestId('location')).toHaveTextContent('/cafe')
    expect(screen.getByText('cafe log page')).toBeInTheDocument()
  })

  it('AC-407: the router ships THIS shell — routeConfig mounts AppShell with an index Home and a /cafe child', () => {
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
    expect(shellRoute!.children?.some((c) => c.path === 'cafe')).toBe(true)
  })
})
