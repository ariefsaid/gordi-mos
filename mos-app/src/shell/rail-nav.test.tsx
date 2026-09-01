import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { RailNav } from './rail-nav'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

function setAuthAs(accessRoles: string[] = [], roleNames: string[] | string = 'Barista') {
  const names = Array.isArray(roleNames) ? roleNames : [roleNames]
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
      roles: names.map((n, i) => ({ id: `r${i}`, org_id: 'o1', business_unit_id: 'bu-cafe', name: n, reports_to_role_id: null, created_at: '', updated_at: '' })),
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

function renderRailNav(initialPath: string, props: { compact?: boolean } = {}) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <RailNav {...props} />
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

// AC-011: rail structure + order — F2 fix (grouped IA spine, OD-REDESIGN-1 + DESIGN.md
// Navigation/Rail "Grouped items under Overline group labels"). The rail shows YOUR work, not
// the org chart, but grouped under Overline section labels: "Destinations" over the workspace
// zone, then one Overline per BU (Retail Ops / B2B Ops) over the viewer's role-matched module(s).
// Supersedes OD-REDESIGN-68's flat/no-overline rendering — CLAUDE.md's owner-artifact-deviations
// note records that treatment as an undetected deviation from the owner's actual artifact
// (OD-68, 2026-07-18), not a ratified end-state.
describe('AC-011: Rail structure — grouped IA spine (F2 fix)', () => {
  // OD-WAY-51 (owner ruling) replaces OD-REDESIGN-68's job-role-name scoping: navigation mirrors
  // what the ROUTE admits. The module routes are ungated, so every authenticated viewer — including
  // an org-wide admin — now sees the module blocks. The ruling accepts that consequence explicitly:
  // if a surface's audience should be narrower, the ROUTE is what gets narrowed, never the link.
  // Updated to the stated contract; the grouping and ordering assertions are untouched.
  it('AC-011: an org-wide admin sees Home · Work (4 children) · Events · Money · Inbox · the module blocks · Admin Settings', () => {
    setAuthAs(['admin'], 'Managing Director')
    renderRailNav('/work/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    // Grouped IA spine: the Destinations overline
    expect(within(nav).getByText('Destinations')).toBeInTheDocument()
    // Sketch destinations
    expect(within(nav).getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Work' })).toBeInTheDocument()
    // Work's 4 always-expanded children — nested under Work, not top-level peers
    expect(within(nav).getByRole('link', { name: 'Signals' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Tasks' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Inbox' })).toBeInTheDocument()
    // OD-WAY-51: the module routes admit this viewer, so their links render — under their BU
    // overlines, which is the part of the old contract that survives.
    expect(within(nav).getByText('Retail Ops')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Café' })).toBeInTheDocument()
    // Utility
    expect(within(nav).getByRole('link', { name: /Admin Settings/ })).toBeInTheDocument()
    // #444 — the day-one rail. Projects & Processes, Objectives, Events, Money, Ecommerce and
    // Roastery are BUILT and hidden: outside the MVP payload, so closed to everyone, admin
    // included. This viewer holds every capability there is, which is what makes their absence a
    // ship-gate result and not a capability one. The whole "B2B Ops" group goes with Roastery —
    // an overline with nothing under it is not a rail entry, it is a hole.
    // OD-WAY-63 restored Objectives + Projects & Processes to the MVP; the rest stay gated.
    expect(within(nav).getByRole('link', { name: 'Projects & Processes' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Objectives' })).toBeInTheDocument()
    for (const name of ['Events', 'Money', 'Ecommerce', 'Roastery']) {
      expect(within(nav).queryByRole('link', { name }), `${name} is ship-gated`).toBeNull()
    }
    expect(within(nav).queryByText('B2B Ops')).toBeNull()
  })

  it('AC-011b: a café-role viewer gets Café under a "Retail Ops" BU overline, plus its five screens', () => {
    setAuthAs([], 'Barista')
    renderRailNav('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByText('Retail Ops')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Café' })).toBeInTheDocument()
    // The module's own screens, which is what a barista actually opens the rail for.
    expect(within(nav).getByRole('link', { name: 'Log' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Stock' })).toBeInTheDocument()
    // …and NOT the ops_lead/admin ones: OD-WAY-51 widened nav to the route, it did not drop gates.
    expect(within(nav).queryByRole('link', { name: 'Review' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Pushes' })).toBeNull()
    // …and NOT the other two modules: #444 gates Ecommerce and Roastery as post-MVP. They used
    // to render here under OD-WAY-51 (their routes admitted everyone); now no route admits anyone.
    expect(within(nav).queryByRole('link', { name: 'Ecommerce' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Roastery' })).toBeNull()
  })

  it('AC-011d: an ops_lead sees every module, and Café\'s gated screens as well', () => {
    // Was "gets Café ONLY" — job-role affiliation deciding visibility, which OD-WAY-51 retired.
    // What the ruling makes assertable instead is the gate that IS real: ops_lead holds the
    // Review/Pushes access role, so those two render for them and not for a plain member.
    setAuthAs(['ops_lead'], ['Cafe Ops Lead', 'Sales Lead'])
    renderRailNav('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Café' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Review' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Pushes' })).toBeInTheDocument()
    // #444: the other two modules are ship-gated, so "every module" is Café on day one.
    expect(within(nav).queryByRole('link', { name: 'Ecommerce' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Roastery' })).toBeNull()
  })

  // #444: this case asserted Roastery under a "B2B Ops" overline. Roastery is ship-gated
  // (post-MVP), so the module — and with it the only item in its BU group — is gone from the
  // rail, and the group's overline goes too. Café still renders under Retail Ops, so the BU
  // grouping itself is still proven here rather than merely assumed.
  it('AC-011c: a roastery-role viewer gets no B2B Ops group while Roastery is ship-gated', () => {
    setAuthAs([], 'Roastery Lead')
    renderRailNav('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).queryByText('B2B Ops')).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Roastery' })).toBeNull()
    expect(within(nav).getByText('Retail Ops')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Café' })).toBeInTheDocument()
  })

  // DD-WAY-33 (#439): the Work sub-family eyebrows are DELETED, not suppressed. Only Cadence ever
  // rendered (the old ≥2-items rule silenced the other three), so one unexplained word floated
  // mid-list. This case used to assert 'Cadence' was PRESENT; the owner ruling reverses it. The
  // ORDER assertion survives, re-pointed at the owner-ruled sequence (#544, OD-REDESIGN-57(ii)).
  it('AC-004: Work children retain the owner-ruled order and NO sub-family eyebrow renders (DD-WAY-33; #544)', () => {
    setAuthAs(['admin'])
    const { container } = renderRailNav('/work/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    // The ruled children (#544, OD-REDESIGN-57(ii)): Signals · Tasks · Projects & Processes ·
    // Objectives. Events alone stays ship-gated (#348 rides milestone 4).
    expect(within(nav).getByRole('link', { name: 'Work' })).toBeInTheDocument()
    for (const name of ['Signals', 'Tasks', 'Projects & Processes', 'Objectives']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
    expect(within(nav).queryByRole('link', { name: 'Events' }), 'Events is ship-gated').toBeNull()
    for (const label of ['Execution', 'Work Systems', 'Direction', 'Cadence']) {
      expect(within(nav).queryByText(label)).toBeNull()
    }
    // Children render in owner-ruled order: Signals → Tasks → Projects & Processes
    // → Objectives (OD-REDESIGN-57(ii)).
    const precedes = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const links = ['Signals', 'Tasks', 'Projects & Processes', 'Objectives'].map((l) =>
      within(nav).getByRole('link', { name: l }))
    for (let i = 0; i < links.length - 1; i += 1) expect(precedes(links[i], links[i + 1])).toBe(true)
    expect(container).toBeTruthy()
  })

  it('AC-013: profile footer row is the identity chip — shows the viewer\'s full name, and Personal Profile is reachable inside its menu', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/tasks')
    // Security fix (HIGH-1): the footer must show the viewer's NAME (not just "{site} {role}")
    // so a stale/shared session is noticeable, and it must open the sign-out menu.
    const chip = screen.getByRole('button', { name: 'Cahya Cafe' })
    expect(chip).toBeInTheDocument()
    // Personal Profile moved OUT of the Utility rail row and INTO this menu (owner, 2026-08-26).
    // The requirement it was carrying is unchanged and still asserted here — /profile keeps a
    // RENDERED way in, not merely a route — only the surface holding it moved. Absent from the
    // rail proper, present one click into the chip: both halves, or this reads as a pass while
    // the surface is orphaned.
    expect(
      within(screen.getByRole('navigation', { name: 'Primary' })).queryByRole('link', { name: /Personal Profile/i }),
    ).toBeNull()
    fireEvent.click(chip)
    expect(screen.getByRole('menuitem', { name: /Personal Profile/i })).toHaveAttribute('href', '/profile')
  })

  // AC-011, not AC-013: the rail's ORDER — "…Admin Settings, and the profile footer — in that
  // order" — is AC-011's subject. AC-013 is the profile footer plus its orientation signal. Filed
  // under the wrong parent for four rounds; a reader chasing AC-013b lands on a different control.
  it('AC-011e: Admin Settings is the last rail row, and claims the rail\'s leftover space', () => {
    setAuthAs(['admin'])
    renderRailNav('/work/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const admin = within(nav).getByRole('link', { name: /Admin Settings/i })
    const railLinks = within(nav).getAllByRole('link')
    // Document order — true BEFORE this change too (Utility already rendered after the modules),
    // so this half guards against a later reshuffle, it does not prove today's fix.
    expect(railLinks[railLinks.length - 1]).toBe(admin)
    // The half that IS today's fix (owner, 2026-08-26: Admin pinned to the foot of the rail).
    // jsdom computes no layout, so this asserts the MECHANISM, not the pixels — and the mechanism
    // has TWO halves. Asserting `mt-auto` alone stayed green with `flex-1` stripped from the nav,
    // which destroys the pinning outright: auto margins consume free space only in a container
    // that grows. Both, or the test passes on a broken rail.
    expect(nav).toHaveClass('flex-1')
    expect(nav).toHaveClass('flex-col')
    expect(admin.closest('.rail-item-list-item')).toHaveClass('mt-auto')
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

  // #444: finance USED to see Money here. The ship gate sits above roles, so while `/money` is
  // gated the holder of the finance role sees no more of it than a plain member does — that is
  // the case above. `destinations.test.ts` keeps the Money role policy itself asserted on the
  // registry, so nothing about ADR-0050 D8 / ADR-0051 is lost while the surface is hidden.
  it('AC-012: finance sees neither Money (ship-gated) nor Admin Settings (admin-gated)', () => {
    setAuthAs(['finance'])
    renderRailNav('/')
    expect(screen.queryByRole('link', { name: 'Money' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Admin Settings/ })).toBeNull()
    // …and they still get a rail, so this is not passing on an empty render.
    expect(screen.getByRole('link', { name: 'Tasks' })).toBeInTheDocument()
  })

  it('Work catalog children: Projects & Processes is absent for a plain member (capability-gated); Objectives is present (OD-V4-1)', () => {
    setAuthAs([])
    renderRailNav('/work/tasks')
    expect(screen.queryByRole('link', { name: 'Projects & Processes' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Objectives' })).toHaveAttribute('href', '/work/objectives')
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

  // Was "at /money, Money link page (finance viewer)". #444 gates Money, so there is no Money
  // link to carry it — Inbox is the childless workspace root that still ships, and it holds the
  // identical claim: at a destination root, that destination's own link is the sole "page".
  it('at /inbox, Inbox link page, exactly one page', () => {
    setAuthAs(['finance'])
    renderRailNav('/inbox')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName(/^Inbox/)
  })

  // Updated to the STATED contract, not relaxed. Rule 5 is "the parent is a location, the active
  // child is the page" — which is exactly what AC-807/808 assert two cases below for Work. This
  // case previously put "page" on the Café parent because Café had no children to carry it: the
  // module shipped with one link and its five screens were unreachable from the nav at all. Now
  // that they render, Café follows the same rule Work does. Still "exactly one page" — the
  // invariant is unchanged and the case is stronger, because it now pins WHICH element holds it.
  it('at /cafe/log, the Log child carries page and the Café parent carries location, exactly one page', () => {
    setAuthAs(['admin'])
    renderRailNav('/cafe/log')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName('Log')
    expect(within(nav).getByRole('link', { name: 'Café' })).toHaveAttribute('aria-current', 'location')
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

// AC-1004 asserted that the Events link is the sole "page" at /work/events. #444 gates Events, so
// there is no Events link and no page to be on: the router forwards /work/events to Home. What the
// rail owes at a gated path is NOTHING — no link, and no "page" claimed by some other entry that
// happens to prefix-match. That is what is asserted now.
describe('AC-1004 (issue 444): /work/events is ship-gated — no Events link, and nothing claims "page"', () => {
  it('renders no Events link and no aria-current="page" at the gated path', () => {
    renderRailNav('/work/events')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).queryByRole('link', { name: 'Events' })).toBeNull()
    const hrefs = within(nav).getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).not.toContain('/work/events')
    const pageLinks = within(nav)
      .getAllByRole('link')
      .filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(0)
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
          email: 'cahya@example.test',
          archived_at: null,
          must_change_password: false,
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

// Rail count badges (E7 `.e7-count`) — Tasks (open count) + Signals (needs-attention count) from
// ONE shell aggregate. Quiet rule: a count that is zero or unavailable shows NO badge. The badge is
// aria-hidden (a redundant glance cue), so the link's accessible name is unchanged.
import type { RailCounts } from '@/lib/db/rail-counts'
function renderRailNavWithCounts(initialPath: string, counts: RailCounts | null | undefined) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="*" element={<RailNav counts={counts} />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </ThemeProvider>,
  )
}

describe('Rail count badges (Tasks · Signals)', () => {
  it('renders the open-Tasks and attention-Signals counts as trailing badges', () => {
    setAuthAs(['admin'], 'Managing Director')
    renderRailNavWithCounts('/work/tasks', { openTasks: 11, attentionSignals: 3 })
    // DO-18(d): the badge label joins the accname, so match on the leading label.
    const tasks = screen.getByRole('link', { name: /^Tasks/ })
    const signals = screen.getByRole('link', { name: /^Signals/ })
    expect(within(tasks).getByText('11')).toBeInTheDocument()
    expect(within(signals).getByText('3')).toBeInTheDocument()
  })

  it('shows a badge ONLY on Tasks and Signals — never on any other rail item', () => {
    setAuthAs(['admin'], 'Managing Director')
    renderRailNavWithCounts('/work/tasks', { openTasks: 11, attentionSignals: 3 })
    // Was pinned on Projects & Processes / Objectives, which #444 ship-gates out of the rail.
    // Widened rather than dropped: EVERY rendered link must carry no numeric badge except the two
    // named, so a new item cannot grow one unnoticed and this cannot rot the way naming two
    // specific children did. (Inbox's unread badge is its own read and is zero in this harness.)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const badged = within(nav)
      .getAllByRole('link')
      .filter((l) => within(l).queryByText(/^\d+$/) !== null)
      .map((l) => (l.textContent ?? '').replace(/\d+$/, ''))
    expect(badged.sort()).toEqual(['Signals', 'Tasks'])
  })

  it('omits a badge when its count is zero (E7 quiet rule)', () => {
    setAuthAs(['admin'], 'Managing Director')
    renderRailNavWithCounts('/work/tasks', { openTasks: 0, attentionSignals: 0 })
    expect(within(screen.getByRole('link', { name: 'Tasks' })).queryByText(/\d/)).toBeNull()
    expect(within(screen.getByRole('link', { name: 'Signals' })).queryByText(/\d/)).toBeNull()
  })

  it('omits all badges when counts are unavailable (null)', () => {
    setAuthAs(['admin'], 'Managing Director')
    renderRailNavWithCounts('/work/tasks', null)
    expect(within(screen.getByRole('link', { name: 'Tasks' })).queryByText(/\d/)).toBeNull()
    expect(within(screen.getByRole('link', { name: 'Signals' })).queryByText(/\d/)).toBeNull()
  })

  // DO-18(d) (census-sweep R2 tasks FINDING5, a11y half — deliberate UX change): the badge was
  // aria-hidden, so screen-reader users never got the count at all. It now carries an accessible
  // name stating what the count counts; the link's accname includes it.
  it('DO-18(d): the badge exposes an accessible name stating what the count counts', () => {
    setAuthAs(['admin'], 'Managing Director')
    renderRailNavWithCounts('/work/tasks', { openTasks: 7, attentionSignals: 3 })
    const tasks = screen.getByRole('link', { name: /^Tasks/ })
    const badge = within(tasks).getByText('7')
    expect(badge.getAttribute('aria-hidden')).not.toBe('true')
    expect(badge).toHaveAccessibleName('7 open tasks')
    const signals = screen.getByRole('link', { name: /^Signals/ })
    expect(within(signals).getByText('3')).toHaveAccessibleName('3 signals need attention')
  })
})

// OD-REDESIGN-84.2 (P1-1): the 920–1099.98px icon-only rail — icons stay, labels become
// accessible-only, group overlines hide, count badges stay (repositioned/compact).
describe('RailNav compact regime (OD-REDESIGN-84.2 / P1-1)', () => {
  it('every destination + Work child link keeps its full accessible name (icon-only ≠ unreachable)', () => {
    setAuthAs(['admin'], 'Managing Director')
    renderRailNav('/work/tasks', { compact: true })
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    // The day-one set: #444's gated entries (Projects & Processes, Objectives, Events, Money) do
    // not render at any width, so an icon-only rail cannot be asked to name them.
    for (const name of ['Home', 'Work', 'Tasks', 'Signals', 'Inbox']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('hides the "Destinations" overline and every BU module overline', () => {
    setAuthAs([], 'Barista')
    renderRailNav('/', { compact: true })
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).queryByText('Destinations')).toBeNull()
    expect(within(nav).queryByText('Retail Ops')).toBeNull()
    // The Café link itself is still reachable — only the group eyebrow above it hides.
    expect(within(nav).getByRole('link', { name: 'Café' })).toBeInTheDocument()
  })

  it('visually hides each link label via sr-only (present in the DOM, not shown)', () => {
    setAuthAs(['admin'], 'Managing Director')
    renderRailNav('/work/tasks', { compact: true })
    const home = screen.getByRole('link', { name: 'Home' })
    const label = within(home).getByText('Home')
    expect(label.className).toMatch(/sr-only/)
  })

  it('a Work child renders its section icon in compact mode (none at full width, B2 unaffected)', () => {
    setAuthAs(['admin'], 'Managing Director')
    const { rerender } = renderRailNav('/work/tasks', { compact: false })
    const tasksFull = screen.getByRole('link', { name: 'Tasks' })
    expect(tasksFull.querySelector('svg')).toBeNull()

    rerender(
      <ThemeProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={['/work/tasks']}>
            <Routes>
              <Route path="*" element={<RailNav compact />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </ThemeProvider>,
    )
    const tasksCompact = screen.getByRole('link', { name: 'Tasks' })
    expect(tasksCompact.querySelector('svg')).not.toBeNull()
  })

  it('a positive count badge still renders (compact styling) with its accessible name (DO-18d)', () => {
    setAuthAs(['admin'], 'Managing Director')
    render(
      <ThemeProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={['/work/tasks']}>
            <Routes>
              <Route path="*" element={<RailNav compact counts={{ openTasks: 4, attentionSignals: 0 }} />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </ThemeProvider>,
    )
    const tasks = screen.getByRole('link', { name: /^Tasks/ })
    const badge = within(tasks).getByText('4')
    expect(badge).toHaveAccessibleName('4 open tasks')
    expect(badge.className).toMatch(/rail-count-badge--compact/)
  })

  it('the account chip collapses to the avatar only (no visible name text)', () => {
    setAuthAs(['admin'], 'Managing Director')
    renderRailNav('/work/tasks', { compact: true })
    // The chip is still reachable by its accessible name...
    const chip = screen.getByRole('button', { name: 'Cahya Cafe' })
    expect(chip).toBeInTheDocument()
    // ...but the visible name text node is gone (avatar-only).
    expect(within(chip).queryByText('Cahya Cafe')).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// DD-WAY-33 (#439) — the rail's three-rung type ladder.
//
// The defect: group overline, destination and child all rendered at one visual weight, so Money
// and Inbox (which follow Work's children) read as belonging to the group above them. The fix is
// a ladder — group overline / destination / child — each rung a distinct size + weight + colour.
//
// jsdom computes no layout and applies no stylesheet, so a rendered-DOM assertion can only prove
// WHICH rung each row claims. The stylesheet is therefore read as source in the second half, which
// is what makes "distinguishable by something other than indent" able to FAIL: collapse the two
// rungs onto the same size/weight/colour and these break, even though the DOM is unchanged.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const railCss = readFileSync(resolve(__dirname, 'rail-nav.css'), 'utf8')

/** The declarations inside one rule of rail-nav.css, as `prop: value` strings. */
function ruleBody(selector: string): string[] {
  const m = railCss.match(new RegExp(`(?:^|\\})\\s*\\${selector}\\s*\\{([^}]*)\\}`, 'm'))
  if (!m) return []
  return m[1]
    .split(';')
    .map((d) => d.replace(/\/\*[\s\S]*?\*\//g, '').trim())
    .filter(Boolean)
}
const declared = (selector: string, prop: string): string | undefined =>
  ruleBody(selector)
    .find((d) => d.startsWith(`${prop}:`))
    ?.slice(prop.length + 1)
    .trim()

describe('DD-WAY-33 (#439): the rail type ladder', () => {
  it('no CADENCE — nor any other Work sub-family eyebrow — renders, at either rail width', () => {
    for (const compact of [false, true]) {
      setAuthAs(['admin'], 'Managing Director')
      const { container, unmount } = renderRailNav('/work/tasks', { compact })
      // Both catalogs: the four eyebrow strings are gone from the app entirely (their keys were
      // deleted with the path, which the orphaned-key guard independently proves).
      for (const word of ['Cadence', 'Irama', 'Execution', 'Eksekusi', 'Work Systems', 'Sistem Kerja', 'Direction', 'Arah']) {
        expect(container.textContent).not.toContain(word)
      }
      unmount()
    }
  })

  it('a destination and a child claim DIFFERENT rungs (the cue is the rung, not the indent)', () => {
    setAuthAs(['admin'], 'Managing Director')
    renderRailNav('/work/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const work = within(nav).getByRole('link', { name: 'Work' })
    const tasks = within(nav).getByRole('link', { name: /^Tasks/ })
    expect(work.className).toContain('rail-item--dest')
    expect(work.className).not.toContain('rail-item--child')
    expect(tasks.className).toContain('rail-item--child')
    expect(tasks.className).not.toContain('rail-item--dest')
    // Inbox follows Work's children in document order — the defect this ticket names. It must
    // claim the DESTINATION rung, or it reads as more of Work's list. (Money sat here too until
    // #444 gated it; the claim is about the rung, so one destination still proves it.)
    expect(within(nav).getByRole('link', { name: /^Inbox/ }).className).toContain('rail-item--dest')
  })

  it('the two item rungs differ in size, weight AND colour — not in indent alone', () => {
    for (const prop of ['font-size', 'font-weight', 'color']) {
      const dest = declared('.rail-item--dest', prop)
      const child = declared('.rail-item--child', prop)
      expect(dest, `.rail-item--dest declares no ${prop}`).toBeDefined()
      expect(child, `.rail-item--child declares no ${prop}`).toBeDefined()
      expect(child, `both rungs share one ${prop} — the ladder has collapsed`).not.toEqual(dest)
    }
    // …and their icons are sized apart too, so the ladder survives the icon-only compact regime.
    expect(declared('.rail-item--child', '--rail-rung-icon')).not.toEqual(declared('.rail-item--dest', '--rail-rung-icon'))
  })

  it('the group overline is the third, quietest rung and is still aria-hidden', () => {
    setAuthAs([], 'Barista')
    renderRailNav('/')
    const overline = screen.getByText('Retail Ops')
    expect(overline.className).toContain('rail-item-overline')
    expect(overline).toHaveAttribute('aria-hidden', 'true')
    expect(declared('.rail-item-overline', 'font-size')).toBe('var(--font-size-overline)')
    // Smaller than either item rung — the ramp's overline step, not a rung of its own.
    expect(declared('.rail-item-overline', 'font-size')).not.toEqual(declared('.rail-item--dest', 'font-size'))
  })

  it('every ladder value comes from a token — no raw px/hex/hsl in the rail stylesheet (#425, #327)', () => {
    const withoutComments = railCss.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(withoutComments).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
    for (const selector of ['.rail-item--dest', '.rail-item--child', '.rail-item-overline', '.rail-item-children']) {
      const body = ruleBody(selector)
      expect(body.length, `${selector} has no rule in rail-nav.css`).toBeGreaterThan(0)
      for (const decl of body) {
        expect(decl, `${selector} — ${decl} carries a raw px literal`).not.toMatch(/\d+(?:\.\d+)?px/)
      }
    }
  })

  it('the active treatment still wins at BOTH rungs (compound selector, not source order)', () => {
    expect(railCss).toContain('.rail-item--dest.rail-item--active')
    expect(railCss).toContain('.rail-item--child.rail-item--active')
    setAuthAs(['admin'], 'Managing Director')
    renderRailNav('/work/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const tasks = within(nav).getByRole('link', { name: /^Tasks/ })
    expect(tasks.className).toContain('rail-item--active')
    // Was Objectives — ship-gated by #444. Signals is the other child rung that still renders,
    // and it is the inactive one here, which is the comparison this case needs.
    expect(within(nav).getByRole('link', { name: /^Signals/ }).className).not.toContain('rail-item--active')
  })

  it('the compact icon rail keeps working: rungs still applied, indent guide dropped', () => {
    setAuthAs(['admin'], 'Managing Director')
    const { container } = renderRailNav('/work/tasks', { compact: true })
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Work' }).className).toContain('rail-item--dest')
    expect(within(nav).getByRole('link', { name: /^Tasks/ }).className).toContain('rail-item--child')
    // No hairline indent guide when there is no indent to guide.
    expect(container.querySelectorAll('.rail-item-children')).toHaveLength(0)
  })
})

