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
 *
 * Issue 479 adds the THIRD surface. The ⌘K palette was left holding its own re-typed sequence
 * (Work, Signals, Projects & Processes, Objectives) — and the reason it drifted unseen is exactly
 * that this guard rendered the rail and the drawer only. A guard that covers two of three surfaces
 * licenses the third to drift. All three render here now, from the one declared array.
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

// The palette's debounced record search is irrelevant to nav order and would reach for a real
// Supabase client at import time; stub the three readers it fans out to.
vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/signals', () => ({ searchSignalsByBody: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/follow-ups', () => ({ searchFollowUpsByCounterparty: vi.fn().mockResolvedValue([]) }))
vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { CommandMenu } from '@/components/command/command-menu'
const mockUseAuth = vi.mocked(useAuth)

// Every role a viewer can hold, not just admin: an order divergence conditioned on
// `accessRoles.includes('admin')` shipped green through this whole file.
const ROLES = ['admin', 'ops_lead', 'member', 'finance', 'manager', 'supervisor'] as const

let CURRENT_ROLES: string[] = ['admin']
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
      accessRoles: CURRENT_ROLES,
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

/**
 * Every Work CHILD row the ⌘K palette emits, in document order.
 *
 * The palette renders `role="option"` divs, not anchors, so there is no href to read; each row
 * carries its target as `data-to` and its rung as `data-child` — the palette's counterpart of the
 * `rail-item--child` class, and needed for the same reason: the Work PARENT row targets
 * `/work/tasks` too, so a target-only scan would read it as a fifth child and the three lists
 * would stop being comparable.
 */
function paletteWorkChildTargets(root: HTMLElement): string[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[data-child="true"][data-to^="/work/"]'),
  ).map((el) => el.getAttribute('data-to') ?? '')
}

function palette() {
  return shell(<CommandMenu open onClose={vi.fn()} onShareSignal={vi.fn()} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setAuth()
})

describe.each(ROLES)('Work children: one declared order, every surface — viewer %s', (role) => {
  beforeEach(() => { CURRENT_ROLES = [role]; setAuth() })
  // The ONE source: the `children` array in destinations.tsx, filtered by the same gate both
  // surfaces apply. Read here rather than re-typed, so the expectation cannot drift from the
  // registry — only from a surface that stopped honouring it, which is the defect being guarded.
  const declaredOrder = visibleSections(
    DESTINATIONS.find((d) => d.id === 'work')!.children ?? [],
    [role],
  ).map((c) => c.path)

  it('the declared order is the E7 family sequence, flattened', () => {
    // Events is ship-gated (#348 rides milestone 4), so it is absent from what a viewer sees.
    const full = ['/work/tasks', '/work/projects', '/work/objectives', '/work/signals']
    expect(declaredOrder).toEqual(full.filter((p) => declaredOrder.includes(p)))
    expect(declaredOrder.length).toBeGreaterThan(0)
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

  it('the ⌘K palette renders Work children in the declared order (issue 479)', () => {
    const view = palette()
    expect(paletteWorkChildTargets(view.container)).toEqual(declaredOrder)
  })

  it('rail, drawer and palette agree — the same items in the same sequence', () => {
    const rail = shell(<RailNav />)
    const railOrder = workChildHrefs(rail.container.querySelector('nav')!)
    rail.unmount()
    const drawer = shell(<MobileDrawer open onClose={vi.fn()} />)
    const drawerOrder = workChildHrefs(
      drawer.container.querySelector('nav[aria-label="More destinations"]')!,
    )
    drawer.unmount()
    const view = palette()
    const paletteOrder = paletteWorkChildTargets(view.container)

    // Compared pairwise rather than all-to-declared, so this stays a genuine cross-surface
    // agreement check: it goes red when any ONE surface re-sorts, including a case where two
    // surfaces drifted together.
    expect(drawerOrder).toEqual(railOrder)
    expect(paletteOrder).toEqual(railOrder)
    // …and none of the three is passing on an empty list.
    expect(railOrder.length).toBeGreaterThan(1)
  })
})
