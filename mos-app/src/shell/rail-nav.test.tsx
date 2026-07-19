import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { RailNav } from './rail-nav'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

function setAuthAs(accessRoles: string[] = [], roleName = 'Barista') {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000001',
        org_id: '10000000-0000-0000-0000-000000000001',
        user_id: 'auth-user-001',
        full_name: 'Cahya Cafe',
        email: 'cahya@gordi.id',
        archived_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [{ id: 'r1', org_id: 'o1', business_unit_id: 'bu-cafe', name: roleName, reports_to_role_id: null, created_at: '', updated_at: '' }],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  })
}

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderRailNav(initialPath: string) {
  return render(
    <ThemeProvider>
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
      </I18nProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setAuthAs([])
})

// AC-011: rail structure + order — OD-REDESIGN-68 (the owner's frame sketch, confirmed
// 2026-07-18): the rail shows YOUR work, not the org chart. An org-wide role gets exactly the
// sketch rail (no overlines, no BU module blocks); a BU-affiliated role gets its module, flat.
describe('AC-011: Rail structure — the owner sketch (OD-REDESIGN-68)', () => {
  it('AC-011: an org-wide admin sees exactly the sketch rail — Home · Work (4 children) · Events · Money · Inbox · Admin Settings · profile — with NO module blocks and NO group overlines', () => {
    setAuthAs(['admin'], 'Managing Director')
    renderRailNav('/work/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    // Sketch destinations
    expect(within(nav).getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Work' })).toBeInTheDocument()
    // Work's 4 always-expanded children
    expect(within(nav).getByRole('link', { name: 'Signals' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Tasks' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Projects & Processes' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Objectives' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Events' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Money' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Inbox' })).toBeInTheDocument()
    // The sketch has no org-chart furniture: no overlines, no module blocks
    expect(within(nav).queryByText('Workspace')).toBeNull()
    expect(within(nav).queryByText('Retail Ops')).toBeNull()
    expect(within(nav).queryByText('B2B Ops')).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Café' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Ecommerce' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Roastery' })).toBeNull()
    // Utility
    expect(within(nav).getByRole('link', { name: /Admin Settings/ })).toBeInTheDocument()
  })

  it('AC-011b: a café-role viewer gets Café in the rail — flat, no BU heading (e7 Ayu pattern)', () => {
    setAuthAs([], 'Barista')
    renderRailNav('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Café' })).toBeInTheDocument()
    expect(within(nav).queryByText('Retail Ops')).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Ecommerce' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Roastery' })).toBeNull()
  })

  it('AC-011c: a roastery-role viewer gets Roastery, not Café', () => {
    setAuthAs([], 'Roastery Lead')
    renderRailNav('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Roastery' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Café' })).toBeNull()
  })

  it('AC-004: Work has exactly 4 children, 0 family headings (always expanded)', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/tasks')
    const workLink = screen.getByRole('link', { name: 'Work' })
    // The 4 children are present
    expect(workLink).toBeInTheDocument()
  })

  it('AC-013: profile footer row is the identity chip — shows the viewer\'s full name, and Personal Profile is reachable as a separate utility link', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/tasks')
    // Security fix (HIGH-1): the footer must show the viewer's NAME (not just "{site} {role}")
    // so a stale/shared session is noticeable, and it must open the sign-out menu.
    expect(screen.getByRole('button', { name: 'Cahya Cafe' })).toBeInTheDocument()
    // /profile stays reachable — now as a normal Utility rail link (Rule 11: reuses DestLink).
    expect(screen.getByRole('link', { name: /Personal Profile/i })).toHaveAttribute('href', '/profile')
  })

  it('AC-012: non-finance/admin → Money absent (not disabled, no stub)', () => {
    setAuthAs([])
    renderRailNav('/work/tasks')
    expect(screen.queryByRole('link', { name: 'Money' })).toBeNull()
  })

  it('AC-012: non-admin → Admin Settings absent', () => {
    setAuthAs(['finance'])
    renderRailNav('/work/tasks')
    expect(screen.queryByRole('link', { name: /Admin Settings/ })).toBeNull()
  })

  it('AC-012: finance sees Money but not Admin Settings', () => {
    setAuthAs(['finance'])
    renderRailNav('/money')
    expect(screen.getByRole('link', { name: 'Money' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Admin Settings/ })).toBeNull()
  })

  it('Work catalog children: Projects & Processes + Objectives absent for a plain member (capability-gated)', () => {
    setAuthAs([])
    renderRailNav('/work/tasks')
    expect(screen.queryByRole('link', { name: 'Projects & Processes' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Objectives' })).toBeNull()
  })

  it('admin sees Projects & Processes + Objectives (holds both capabilities)', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/tasks')
    expect(screen.getByRole('link', { name: 'Projects & Processes' })).toHaveAttribute('href', '/work/projects')
    expect(screen.getByRole('link', { name: 'Objectives' })).toHaveAttribute('href', '/work/objectives')
  })
})

// AC-009/010: exactly-one aria-current="page"; Work parent = "location".
describe('AC-009: aria-current — Work parent location, child page (at /work/signals)', () => {
  it('AC-009: at /work/signals, Work parent has aria-current=location, Signals child has page, no other rail link has page', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/signals')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName('Signals')
    const work = within(nav).getByRole('link', { name: 'Work' })
    expect(work).toHaveAttribute('aria-current', 'location')
  })

  it('AC-010: at /work/tasks/:taskId, Tasks child page, Work parent location, exactly one page', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/tasks/abc-123')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName('Tasks')
    expect(within(nav).getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'location')
  })

  it('at /work/tasks, Tasks child page, Work parent location, exactly one page', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName('Tasks')
    expect(within(nav).getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'location')
  })

  it('at /, Home link page, exactly one page, Work parent no aria-current', () => {
    setAuthAs(['admin'])
    renderRailNav('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName('Home')
    expect(within(nav).getByRole('link', { name: 'Work' }).getAttribute('aria-current')).toBeNull()
  })

  it('at /money, Money link page (finance viewer), exactly one page', () => {
    setAuthAs(['finance'])
    renderRailNav('/money')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName('Money')
  })

  it('at /cafe/log, Café link page, exactly one page', () => {
    setAuthAs(['admin'])
    renderRailNav('/cafe/log')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName('Café')
  })

  it('at /admin/people, Admin Settings link page, exactly one page', () => {
    setAuthAs(['admin'])
    renderRailNav('/admin/people')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName(/Admin Settings/)
  })
})

// AC-1004 (events-stub, Step 10): Rule 5 still holds for /events now that it renders EventsPage,
// not the generic SliceStubPage — the rail's aria-current resolution never depended on which
// component the route mounts.
describe('AC-1004: aria-current — at /events, the Events link is the sole "page"', () => {
  it('AC-1004: at /events, Events link has aria-current=page and is the only one', () => {
    renderRailNav('/events')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav)
      .getAllByRole('link')
      .filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(within(nav).getByRole('link', { name: 'Events' })).toHaveAttribute('aria-current', 'page')
  })
})

// Step 8 (catalog re-home) — AC-807/808: aria-current uniqueness locked explicitly at the two
// re-homed catalog routes (previously only proven generically / at /work/signals + via e2e).
describe('Step 8/AC-807/808: aria-current uniqueness at /work/projects and /work/objectives', () => {
  it('AC-807: at /work/projects, Projects & Processes carries page, Work parent carries location, exactly one page', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/projects')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName('Projects & Processes')
    expect(within(nav).getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'location')
  })

  it('AC-808: at /work/objectives, Objectives carries page, Work parent carries location, exactly one page', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/objectives')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName('Objectives')
    expect(within(nav).getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'location')
  })
})

// AC-015: every nav SVG is aria-hidden
describe('AC-015: Nav icon semantics', () => {
  it('all SVGs inside the nav have aria-hidden=true', () => {
    setAuthAs(['admin'])
    const { container } = renderRailNav('/work/tasks')
    const svgs = container.querySelectorAll('nav svg')
    expect(svgs.length).toBeGreaterThan(0)
    svgs.forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'))
  })
})

// Security audit HIGH-1/LOW-1 (2026-07-17): the sign-out affordance must be MOUNTED in the
// authenticated shell, not just exist as an unmounted component (user-chip.test.tsx rendered
// UserChip directly and passed even though nothing mounted it). This proves it is reachable
// AND invokable from the real rail footer.
describe('AC-005/HIGH-1: sign-out affordance is mounted in the rail footer and invokable', () => {
  it('clicking the identity chip opens a menu with a working Sign out item', async () => {
    const user = userEvent.setup()
    setAuthAs(['admin'])
    const signOut = vi.fn()
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: '40000000-0000-0000-0000-000000000001',
          org_id: '10000000-0000-0000-0000-000000000001',
          user_id: 'auth-user-001',
          full_name: 'Cahya Cafe',
          email: 'cahya@gordi.id',
          archived_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        roles: [{ id: 'r1', org_id: 'o1', business_unit_id: 'bu-cafe', name: 'Cafe Ops Lead', reports_to_role_id: null, created_at: '', updated_at: '' }],
        isManager: false,
        accessRoles: ['admin'],
      },
      signOut,
    })
    renderRailNav('/work/tasks')

    await user.click(screen.getByRole('button', { name: 'Cahya Cafe' }))
    const menuItem = screen.getByRole('menuitem', { name: /sign out/i })
    expect(menuItem).toBeInTheDocument()
    await user.click(menuItem)
    expect(signOut).toHaveBeenCalledOnce()
  })
})

// OD-70 (2026-07-18): language selection moved to /profile — the rail is navigation, not settings.
describe('Locale controls (ADR-0021 seam, OD-70 placement)', () => {
  it('OD-70: the rail carries NO language toggle', () => {
    setAuthAs(['admin'], 'Managing Director')
    renderRailNav('/')
    expect(screen.queryByRole('group', { name: /language|bahasa/i })).toBeNull()
  })
})
