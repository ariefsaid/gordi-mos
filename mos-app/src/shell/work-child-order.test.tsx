/**
 * One nav order, both surfaces (#446).
 *
 * The desktop rail listed Work's children Tasks · Projects & Processes · Objectives · Signals,
 * the phone drawer listed them Signals · Tasks · Projects & Processes · Objectives — same five
 * items, same IA, two orders, because the rail re-sorted `children` through a table of its own
 * while the drawer rendered them as declared. A nav list is worth most when muscle memory carries
 * it, and muscle memory does not survive changing device.
 *
 * This file is the guard that the two can never disagree again. It renders BOTH surfaces for the
 * same viewer and compares the hrefs they emit, in document order, against the single declared
 * source — so a re-sort reintroduced on either side goes red here rather than in someone's hands.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { DESTINATIONS } from './destinations'
import { visibleSections } from './sections'
import { RailNav } from './rail-nav'
import { MobileDrawer } from './mobile-drawer'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

const ACCESS_ROLES = ['admin']

function setAuth() {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Cahya Cafe',
        email: 'c@example.test', archived_at: null, must_change_password: false,
        created_at: '', updated_at: '',
      },
      roles: [{ id: 'r0', org_id: 'o1', business_unit_id: 'bu', name: 'Managing Director', reports_to_role_id: null, created_at: '', updated_at: '' }],
      isManager: false,
      accessRoles: ACCESS_ROLES,
    },
    signOut: vi.fn(),
  })
}

function shell(ui: React.ReactNode) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/tasks']}>{ui}</MemoryRouter>
      </I18nProvider>
    </ThemeProvider>,
  )
}

/**
 * Every Work CHILD link a surface emits, in document order.
 *
 * Selected by the ladder's child-rung marker (`rail-item--child`, DD-WAY-33) rather than by href
 * alone: both surfaces give the Work PARENT row `/work/tasks` as its primaryPath, so an href-only
 * scan reads that parent as a sixth child and the two lists stop being comparable. The rung class
 * is what actually says "this row is a child", and both surfaces already set it from the same
 * stylesheet.
 */
function workChildHrefs(root: HTMLElement): string[] {
  return Array.from(
    root.querySelectorAll<HTMLAnchorElement>('a.rail-item--child[href^="/work/"]'),
  ).map((a) => a.getAttribute('href') ?? '')
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setAuth()
})

describe('Work children: one declared order, every surface (issue 446)', () => {
  // The ONE source: the `children` array in destinations.tsx, filtered by the same gate both
  // surfaces apply. Read here rather than re-typed, so the expectation cannot drift from the
  // registry — only from a surface that stopped honouring it, which is the defect being guarded.
  const declaredOrder = visibleSections(
    DESTINATIONS.find((d) => d.id === 'work')!.children ?? [],
    ACCESS_ROLES,
  ).map((c) => c.path)

  it('the declared order is the E7 family sequence, flattened', () => {
    // Events is ship-gated (#348 rides milestone 4), so it is absent from what a viewer sees.
    expect(declaredOrder).toEqual([
      '/work/tasks',
      '/work/projects',
      '/work/objectives',
      '/work/signals',
    ])
  })

  it('the desktop rail renders Work children in the declared order', () => {
    shell(<RailNav />)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(workChildHrefs(nav)).toEqual(declaredOrder)
  })

  it('the phone drawer renders Work children in the declared order', () => {
    shell(<MobileDrawer open onClose={vi.fn()} />)
    const nav = screen.getByRole('navigation', { name: 'More destinations' })
    expect(workChildHrefs(nav)).toEqual(declaredOrder)
  })

  it('rail and drawer agree — the same five items in the same sequence', () => {
    const rail = shell(<RailNav />)
    const railOrder = workChildHrefs(rail.container.querySelector('nav')!)
    rail.unmount()
    const drawer = shell(<MobileDrawer open onClose={vi.fn()} />)
    const drawerOrder = workChildHrefs(
      drawer.container.querySelector('nav[aria-label="More destinations"]')!,
    )
    expect(drawerOrder).toEqual(railOrder)
  })
})
