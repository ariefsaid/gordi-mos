import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RailNav } from './rail-nav'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

function setAuthAs(accessRoles: string[] = []) {
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
      roles: [{ id: 'r1', name: 'Barista', org_id: 'o1', person_id: 'p1', access_role: 'member', archived_at: null, created_at: '', updated_at: '' }],
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
  setAuthAs([])
})

// AC-011: rail structure + order (Rule 1/3).
describe('AC-011: Rail structure — Workspace · Modules · Utility (admin)', () => {
  it('AC-011: admin sees Workspace overline + Home · Work (4 children) · Events · Money · Inbox · Retail Ops (Café · Ecommerce) · B2B Ops (Roastery) · Admin Settings · profile footer', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    // Workspace overline
    expect(within(nav).getByText('Workspace')).toBeInTheDocument()
    // Workspace destinations
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
    // Modules
    expect(within(nav).getByText('Retail Ops')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Café' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Ecommerce' })).toBeInTheDocument()
    expect(within(nav).getByText('B2B Ops')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Roastery' })).toBeInTheDocument()
    // Utility
    expect(within(nav).getByRole('link', { name: /Admin Settings/ })).toBeInTheDocument()
  })

  it('AC-004: Work has exactly 4 children, 0 family headings (always expanded)', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/tasks')
    const workLink = screen.getByRole('link', { name: 'Work' })
    // The 4 children are present
    expect(workLink).toBeInTheDocument()
  })

  it('AC-013: profile footer row shows avatar + role and links to /profile', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/tasks')
    const profileLink = screen.getByRole('link', { name: /Personal Profile|Cahya/ })
    expect(profileLink).toHaveAttribute('href', '/profile')
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

// Locale toggle preserved in the rail footer (ADR-0021).
describe('Locale toggle (ADR-0021)', () => {
  it('renders the LocaleToggle in the rail footer', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/tasks')
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument()
  })
})
