import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { RailNav } from './rail-nav'
import { SHOW_WEEKLY_UPDATES, SHOW_DAILY_LOG } from '@/config/features'

// RailNav now reads useAuth to role-filter the Kitchen group.
vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

// Default: authenticated plain member (no elevated access roles).
// All existing tests rely on this default; kitchen-specific tests override as needed.
function setAuthAs(accessRoles: string[] = []) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000001',
        org_id: '10000000-0000-0000-0000-000000000001',
        user_id: 'auth-user-001',
        full_name: 'Test User',
        email: 'test@gordi.id',
        archived_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  })
}

// Helper component to probe current location
function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderRailNav(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <RailNav />
              <LocationDisplay />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setAuthAs([]) // plain member by default
})

// AC-002: nav-only rail (ADR-0013 D1 — workspace switcher + search + user chip moved to top bar)
describe('AC-002: Rail contents', () => {
  it('shows the Workspace section label and nav links (no switcher/search/userchip)', () => {
    renderRailNav('/tasks')
    // Workspace section label still present
    expect(screen.getByText('Workspace')).toBeInTheDocument()
    // Brand / switcher and search are now in the top bar — not in the rail
    expect(screen.queryByRole('button', { name: /Gordi MOS workspace/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
  })

  it('renders the visible nav links in order (My Week / Tasks always; Weekly Updates / Daily Log per feature flag)', () => {
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const links = within(nav).getAllByRole('link')
    // The Kitchen group (Log/Plan/Stock at minimum) is also rendered — count all links
    const workspaceExpected = [
      'My Week',
      'Tasks',
      ...(SHOW_WEEKLY_UPDATES ? ['Weekly Updates'] : []),
      ...(SHOW_DAILY_LOG ? ['Daily Log'] : []),
    ]
    // Workspace links are the first N links; Kitchen links follow
    workspaceExpected.forEach((name, i) => expect(links[i]).toHaveAccessibleName(name))
  })

  it('has no badge-count elements', () => {
    const { container } = renderRailNav('/tasks')
    expect(container.querySelector('[data-badge]')).toBeNull()
  })

  it('Settings item has aria-disabled=true and coming-soon title', () => {
    renderRailNav('/tasks')
    const settings = screen.getByText('Settings').closest('[aria-disabled]')
    expect(settings).toHaveAttribute('aria-disabled', 'true')
    expect(settings).toHaveAttribute('title', 'Settings — coming soon')
  })

  it('clicking Settings does not navigate away from /tasks', async () => {
    const user = userEvent.setup()
    renderRailNav('/tasks')
    const settings = screen.getByText('Settings')
    await user.click(settings)
    expect(screen.getByTestId('location').textContent).toBe('/tasks')
  })
})

// AC-003: active nav per route
describe('AC-003: Active nav per route', () => {
  it('Tasks link has aria-current=page when at /tasks, others do not', () => {
    renderRailNav('/tasks')
    const links = screen.getAllByRole('link')
    const activeLinks = links.filter((l) => l.getAttribute('aria-current') === 'page')
    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0]).toHaveAccessibleName('Tasks')
  })

  it('My Week link has aria-current=page when at /', () => {
    renderRailNav('/')
    const links = screen.getAllByRole('link')
    const activeLinks = links.filter((l) => l.getAttribute('aria-current') === 'page')
    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0]).toHaveAccessibleName('My Week')
  })
})

// FIX-5: Settings is reachable by AT — tabindex 0, aria-disabled, no-op on activation
describe('FIX-5: Settings reachable by assistive technology', () => {
  it('Settings element has tabIndex=0 so it is in tab order', () => {
    renderRailNav('/tasks')
    const settings = screen.getByText('Settings').closest('[aria-disabled]') as HTMLElement | null
    expect(settings).toBeTruthy()
    expect(settings!.tabIndex).toBe(0)
  })

  it('Settings element has aria-label or accessible name that includes "Settings" and "coming soon"', () => {
    renderRailNav('/tasks')
    const settings = screen.getByText('Settings').closest('[aria-disabled]') as HTMLElement | null
    expect(settings).toBeTruthy()
    // aria-label should mention "Settings — coming soon" for AT announcement
    const ariaLabel = settings!.getAttribute('aria-label') ?? settings!.getAttribute('title') ?? ''
    expect(ariaLabel.toLowerCase()).toMatch(/settings.*coming soon|coming soon.*settings/i)
  })

  it('pressing Enter on Settings does not navigate', async () => {
    const user = userEvent.setup()
    renderRailNav('/tasks')
    const settings = screen.getByText('Settings').closest('[aria-disabled]') as HTMLElement
    settings.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('location').textContent).toBe('/tasks')
  })
})

// AC-S05: rail is nav-only after the top-bar revamp — no switcher, no search, no user chip
describe('AC-S05: rail is navigation-only', () => {
  it('AC-S05: rail has nav group + Settings only — no switcher/search/userchip', () => {
    renderRailNav('/tasks')
    // No workspace switcher button
    expect(screen.queryByRole('button', { name: /Gordi MOS workspace/ })).toBeNull()
    // No in-rail search button
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
    // Nav group label still present
    expect(screen.getByText('Workspace')).toBeInTheDocument()
    // Settings stub still present
    expect(screen.getByText('Settings')).toBeInTheDocument()
    // No user chip in the rail — the named button for the viewer should not exist
    expect(screen.queryByRole('button', { name: /Cahya Cafe/ })).toBeNull()
  })
})

// AC-D02 (RI-2): label/meta roles use the tertiary ramp (text-muted-foreground ≈4.6:1
// on dark), never the failing --ds-font-color-light ramp (≈3.1:1, fails WCAG-AA).
// ADR-0013 Decision 2. The rail's "Workspace" group label + inactive nav labels are
// meta roles; they must carry text-muted-foreground.
describe('AC-D02: rail label/meta roles use the muted-foreground (tertiary) ramp', () => {
  it('AC-D02: Workspace group label carries text-muted-foreground (not the light ramp)', () => {
    renderRailNav('/tasks')
    const label = screen.getByText('Workspace')
    expect(label.className).toMatch(/text-muted-foreground/)
    expect(label.className).not.toMatch(/text-light|font-color-light/)
  })

  it('AC-D02: an inactive nav label uses text-muted-foreground, not the light ramp', () => {
    // At /tasks, "My Week" is inactive → its link wrapper is muted-foreground.
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const myWeek = within(nav).getByRole('link', { name: /My Week/ })
    expect(myWeek.className).toMatch(/text-muted-foreground/)
    expect(myWeek.className).not.toMatch(/text-light|font-color-light/)
  })
})

// AC-015: every nav SVG is aria-hidden
describe('AC-015: Nav icon semantics', () => {
  it('all SVGs inside the nav have aria-hidden=true', () => {
    const { container } = renderRailNav('/tasks')
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
    svgs.forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })
  })
})

// ── Kitchen nav group (AC-KIT-001 … AC-KIT-004) ───────────────────────────────
describe('AC-KIT-001: Kitchen group renders in the nav', () => {
  it('AC-KIT-001: "Kitchen" group heading is visible in the nav', () => {
    renderRailNav('/kitchen/log')
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
  })

  it('AC-KIT-001: Kitchen group heading uses text-muted-foreground (same as Workspace)', () => {
    renderRailNav('/tasks')
    const heading = screen.getByText('Kitchen')
    expect(heading.className).toMatch(/text-muted-foreground/)
  })

  it('AC-KIT-001: Log link is active (aria-current=page) when at /kitchen/log', () => {
    renderRailNav('/kitchen/log')
    const links = screen.getAllByRole('link')
    const active = links.filter((l) => l.getAttribute('aria-current') === 'page')
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAccessibleName('Log')
  })
})

describe('AC-KIT-002: plain member sees Log, Plan, Stock but NOT Review or Pushes', () => {
  it('AC-KIT-002: Log, Plan, Stock links are present for a plain member', () => {
    setAuthAs([])
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Log' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Plan' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Stock' })).toBeInTheDocument()
  })

  it('AC-KIT-002: Review and Pushes links are NOT present for a plain member', () => {
    setAuthAs([])
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).queryByRole('link', { name: 'Review' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Pushes' })).toBeNull()
  })
})

describe('AC-KIT-003: ops_lead viewer sees all 5 Kitchen links', () => {
  it('AC-KIT-003: ops_lead sees Log, Plan, Stock, Review, Pushes', () => {
    setAuthAs(['ops_lead'])
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Log' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Plan' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Stock' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Review' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Pushes' })).toBeInTheDocument()
  })
})

describe('AC-KIT-004: admin viewer sees all 5 Kitchen links', () => {
  it('AC-KIT-004: admin sees Log, Plan, Stock, Review, Pushes', () => {
    setAuthAs(['admin'])
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Log' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Plan' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Stock' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Review' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Pushes' })).toBeInTheDocument()
  })
})

describe('AC-KIT-005: Kitchen group Kitchen links have correct hrefs', () => {
  it('AC-KIT-005: Log href is /kitchen/log, Plan is /kitchen/plan, Stock is /kitchen/stock', () => {
    setAuthAs([])
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Log' })).toHaveAttribute('href', '/kitchen/log')
    expect(within(nav).getByRole('link', { name: 'Plan' })).toHaveAttribute('href', '/kitchen/plan')
    expect(within(nav).getByRole('link', { name: 'Stock' })).toHaveAttribute('href', '/kitchen/stock')
  })

  it('AC-KIT-005: Review href is /kitchen/review, Pushes is /kitchen/pushes for ops_lead', () => {
    setAuthAs(['ops_lead'])
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/kitchen/review')
    expect(within(nav).getByRole('link', { name: 'Pushes' })).toHaveAttribute('href', '/kitchen/pushes')
  })
})

// ── Admin group nav (AC-070 nav-absence arm) ──────────────────────────────────
describe('AC-070: Admin nav group', () => {
  it('AC-070: non-admin viewer does NOT see the Users nav entry (absent from DOM)', () => {
    setAuthAs(['member'])
    renderRailNav('/tasks')
    expect(screen.queryByText('People')).not.toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('AC-070: ops_lead without admin does NOT see the Users nav entry', () => {
    setAuthAs(['ops_lead'])
    renderRailNav('/tasks')
    expect(screen.queryByText('People')).not.toBeInTheDocument()
  })

  it('AC-070b: admin viewer sees the Admin group and People nav entry', () => {
    setAuthAs(['admin'])
    renderRailNav('/admin/users')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('AC-070b: People link has href /admin/users', () => {
    setAuthAs(['admin'])
    renderRailNav('/admin/users')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'People' })).toHaveAttribute('href', '/admin/users')
  })

  it('AC-070b: admin viewer — People link is active at /admin/users', () => {
    setAuthAs(['admin'])
    renderRailNav('/admin/users')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const link = within(nav).getByRole('link', { name: 'People' })
    expect(link).toHaveAttribute('aria-current', 'page')
  })
})
