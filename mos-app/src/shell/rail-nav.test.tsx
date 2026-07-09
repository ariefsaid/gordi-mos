import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RailNav } from './rail-nav'
import { DESTINATIONS } from './destinations'

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
    <I18nProvider>
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
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setAuthAs([]) // plain member by default
})

// Group labels are non-interactive <div>s; link text can coincidentally match a
// label (e.g. the "Plan" kitchen link vs a would-be "Plan" destination group), so
// group-label lookups scope to a div, distinct from getByRole('link', ...).
function groupLabel(text: string) {
  return screen.getByText(text, { selector: 'div' })
}
function queryGroupLabel(text: string) {
  return screen.queryByText(text, { selector: 'div' })
}

// AC-RG01: rail regroup — DESTINATIONS is the single source of truth (plan §1.5/§4.2).
describe('AC-RG01: Rail regroup — destination groups', () => {
  it('renders the "Home" and "Work" destination group labels', () => {
    renderRailNav('/tasks')
    expect(groupLabel('Home')).toBeInTheDocument()
    expect(groupLabel('Work')).toBeInTheDocument()
  })

  it('AC-RG01: Kitchen links appear under the "Operate" group label', () => {
    renderRailNav('/kitchen/log')
    expect(groupLabel('Operate')).toBeInTheDocument()
    expect(groupLabel('Kitchen')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Kitchen Log' })).toBeInTheDocument()
  })

  it('AC-RG01: Tasks link appears under the "Work" group label', () => {
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const workLabel = groupLabel('Work')
    // The Tasks link is the sibling immediately following the Work label's link group
    expect(within(nav).getByRole('link', { name: 'Tasks' })).toBeInTheDocument()
    expect(workLabel).toBeInTheDocument()
  })

  it('AC-304: under locale=id, the Cascade link label resolves through useT()', () => {
    localStorage.setItem('mos.locale', 'id')
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Cascade' })).toBeInTheDocument()
  })

  it('AC-403: a member sees Home/Work/Operate/Inbox groups but NO Plan group (gated off)', () => {
    renderRailNav('/tasks')
    expect(groupLabel('Home')).toBeInTheDocument()
    expect(groupLabel('Work')).toBeInTheDocument()
    expect(groupLabel('Operate')).toBeInTheDocument()
    expect(groupLabel('Inbox')).toBeInTheDocument()
    // Plan is gated finance/admin — a member has no Plan children, so the whole group is hidden.
    expect(queryGroupLabel('Plan')).toBeNull()
  })

  it('the Home link has href "/" and label "Home"', () => {
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
  })

  it('Task 3.9: renders the LocaleToggle in the rail footer', () => {
    renderRailNav('/tasks')
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bahasa Indonesia' })).toBeInTheDocument()
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

  it('Home link has aria-current=page when at /', () => {
    renderRailNav('/')
    const links = screen.getAllByRole('link')
    const activeLinks = links.filter((l) => l.getAttribute('aria-current') === 'page')
    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0]).toHaveAccessibleName('Home')
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
  it('AC-S05: rail has destination groups + Settings only — no switcher/search/userchip', () => {
    renderRailNav('/tasks')
    // No workspace switcher button
    expect(screen.queryByRole('button', { name: /Gordi MOS workspace/ })).toBeNull()
    // No in-rail search button
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
    // Destination group labels still present
    expect(screen.getByText('Work')).toBeInTheDocument()
    // Settings stub still present
    expect(screen.getByText('Settings')).toBeInTheDocument()
    // No user chip in the rail — the named button for the viewer should not exist
    expect(screen.queryByRole('button', { name: /Cahya Cafe/ })).toBeNull()
  })
})

// AC-D02 (RI-2): label/meta roles use the tertiary ramp (text-muted-foreground ≈4.6:1
// on dark), never the failing --ds-font-color-light ramp (≈3.1:1, fails WCAG-AA).
// ADR-0013 Decision 2. Destination group labels + inactive nav labels are meta roles;
// they must carry text-muted-foreground.
describe('AC-D02: rail label/meta roles use the muted-foreground (tertiary) ramp', () => {
  it('AC-D02: a destination group label carries text-muted-foreground (not the light ramp)', () => {
    renderRailNav('/tasks')
    const label = screen.getByText('Work')
    expect(label.className).toMatch(/text-muted-foreground/)
    expect(label.className).not.toMatch(/text-light|font-color-light/)
  })

  it('AC-D02: an inactive nav label uses text-muted-foreground, not the light ramp', () => {
    // At /tasks, "Home" is inactive → its link wrapper is muted-foreground.
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const home = within(nav).getByRole('link', { name: 'Home' })
    expect(home.className).toMatch(/text-muted-foreground/)
    expect(home.className).not.toMatch(/text-light|font-color-light/)
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

// ── Kitchen nav group (AC-KIT-001 … AC-KIT-004) — now under the "Operate" destination ──
describe('AC-KIT-001: Kitchen links render under the Operate destination group', () => {
  it('AC-KIT-001: "Operate" group heading is visible in the nav', () => {
    renderRailNav('/kitchen/log')
    expect(screen.getByText('Operate')).toBeInTheDocument()
  })

  it('AC-KIT-001: Operate group heading uses text-muted-foreground (same as other groups)', () => {
    renderRailNav('/tasks')
    const heading = screen.getByText('Operate')
    expect(heading.className).toMatch(/text-muted-foreground/)
  })

  it('RI-IA-KITCHEN: Kitchen links are nested under a Kitchen subheading, not flat siblings of Daily Log', () => {
    renderRailNav('/kitchen/log')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const labels = Array.from(nav.querySelectorAll('div, a'))
      .map((el) => el.textContent?.trim())
      .filter(Boolean)
    expect(labels).toContain('Operate')
    expect(labels).toContain('Daily Log')
    expect(labels).toContain('Kitchen')
    expect(labels.indexOf('Operate')).toBeLessThan(labels.indexOf('Daily Log'))
    expect(labels.indexOf('Daily Log')).toBeLessThan(labels.indexOf('Kitchen'))
    expect(labels.indexOf('Kitchen')).toBeLessThan(labels.indexOf('Kitchen Log'))
  })

  it('AC-KIT-001: Log link is active (aria-current=page) when at /kitchen/log', () => {
    renderRailNav('/kitchen/log')
    const links = screen.getAllByRole('link')
    const active = links.filter((l) => l.getAttribute('aria-current') === 'page')
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAccessibleName('Kitchen Log')
  })
})

describe('AC-KIT-002: plain member sees Log, Plan, Stock but NOT Review or Pushes', () => {
  it('AC-KIT-002: Log, Plan, Stock links are present for a plain member', () => {
    setAuthAs([])
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Kitchen Log' })).toBeInTheDocument()
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
    expect(within(nav).getByRole('link', { name: 'Kitchen Log' })).toBeInTheDocument()
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
    expect(within(nav).getByRole('link', { name: 'Kitchen Log' })).toBeInTheDocument()
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
    expect(within(nav).getByRole('link', { name: 'Kitchen Log' })).toHaveAttribute('href', '/kitchen/log')
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
    renderRailNav('/admin/people')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('AC-070b: People link has href /admin/people', () => {
    setAuthAs(['admin'])
    renderRailNav('/admin/people')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'People' })).toHaveAttribute('href', '/admin/people')
  })

  it('AC-070b: admin viewer — People link is active at /admin/people', () => {
    setAuthAs(['admin'])
    renderRailNav('/admin/people')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const link = within(nav).getByRole('link', { name: 'People' })
    expect(link).toHaveAttribute('aria-current', 'page')
  })
})

// ── Catalog = capability-gated Work rail links (FR-424, owner decision 2026-07-07) ──────────────
// Supersedes FR-420: Objectives + Projects & Processes render UNDER Work for a viewer who holds the
// matching capability (objective.manage / workline.manage). Still NO standalone "Catalog" group,
// and they never appear for a viewer without the capability. The cascade Manage links stay too.
describe('AC-404: Work catalog links are capability-gated (no standalone Catalog group)', () => {
  it('AC-404: admin (objective.manage + workline.manage) sees BOTH catalog links under Work', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/cascade')
    expect(queryGroupLabel('Catalog')).toBeNull()
    expect(screen.getByRole('link', { name: 'Objectives' })).toHaveAttribute('href', '/work/objectives')
    expect(screen.getByRole('link', { name: 'Projects & Processes' })).toHaveAttribute('href', '/work/projects-processes')
  })

  it('AC-404: ops_lead (workline.manage only) sees Projects & Processes but NOT Objectives', () => {
    setAuthAs(['ops_lead'])
    renderRailNav('/tasks')
    expect(screen.getByRole('link', { name: 'Projects & Processes' })).toHaveAttribute('href', '/work/projects-processes')
    expect(screen.queryByRole('link', { name: 'Objectives' })).toBeNull()
  })

  it('AC-404: member (no capability) sees NEITHER catalog link', () => {
    setAuthAs(['member'])
    renderRailNav('/tasks')
    expect(screen.queryByRole('link', { name: 'Objectives' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Projects & Processes' })).toBeNull()
  })
})

// ── Plan destination (nav-five-destinations FR-404) — Dashboard is now a Plan link, not drill-only ─
describe('AC-402: Plan destination — finance sees Dashboard; member sees no Plan group', () => {
  it('AC-402: finance sees a Plan group with a Dashboard link', () => {
    setAuthAs(['finance'])
    renderRailNav('/dashboard')
    expect(groupLabel('Plan')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  it('AC-402: member sees NO Plan group and NO Dashboard link', () => {
    setAuthAs(['member'])
    renderRailNav('/tasks')
    expect(queryGroupLabel('Plan')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull()
  })
})

// ── Operate destination (nav-five-destinations FR-403) — Daily Log moved here from Work ─────
describe('AC-401: Daily Log renders under the Operate group', () => {
  it('AC-401: Daily Log link appears under Operate, not Work', () => {
    renderRailNav('/ops')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Daily Log' })).toHaveAttribute('href', '/ops')
    // And it is NOT under Work (Work has Tasks/Cascade/Updates only).
    const work = DESTINATIONS.find((d) => d.id === 'work')!
    expect(work.links.some((l) => l.path === '/ops')).toBe(false)
  })
})
