/**
 * The access boundary (#800, OD-WAY-98 (8)) — what a denied deep link meets.
 *
 * The three route guards are rendered here rather than the component alone: "the guards render
 * the ONE boundary" is the claim, and a test that only mounts `<AccessBoundary />` would stay
 * green through a guard that quietly went back to `<Navigate to="/">`.
 *
 * Every panel case is driven from a route that is LIVE — `/cafe/pushes`, `/cafe/review`,
 * `/admin/people`, `/work/projects`. Money is ship-gated, so no viewer of any role ever reaches a
 * Money panel; the Money case in this file is the forward, asserted against the real table.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  MemoryRouter, Route, Routes, RouterProvider, createMemoryRouter, matchRoutes, useLocation,
  type RouteObject,
} from 'react-router-dom'
import { isValidElement, type ReactNode } from 'react'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { RequireAccessRole } from '@/auth/require-access-role'
import { AdminRoute } from '@/auth/admin-route'
import { RequireCapability } from '@/auth/require-capability'
import { routeConfig } from '@/router'
import { I18nProvider } from '@/i18n/I18nProvider'
import { BreadcrumbTitleProvider } from './breadcrumb-title'
import { Breadcrumb } from './breadcrumb'
import { DESTINATIONS, UTILITY, isLive, navUtility, viewerAdmittedToRoute } from './destinations'

const mockUseAuth = vi.mocked(useAuth)

/** The gate that guards `/cafe/pushes` in the real table — a live route, so the panel is reachable. */
const CAFE_PUSHES_ROLES = ['ops_lead', 'admin'] as const
/** The gate that guards `/cafe/review`. */
const CAFE_REVIEW_ROLES = ['ops_lead', 'admin', 'supervisor'] as const

function setViewer(accessRoles: string[]) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'U', email: null,
        must_change_password: false, archived_at: null, created_at: '', updated_at: '',
      },
      roles: [],
      isManager: false,
      accessRoles,
      affiliated: [],
    },
    signOut: vi.fn(),
  } as never)
}

/** Reports where a navigation landed — mounted so a redirect cannot pass as a rendered boundary. */
function Landing() {
  return <div data-testid="landing">{useLocation().pathname}</div>
}

/** Renders `guard` over `path`, with a live surface behind it and a catch-all in front of it. */
function renderAt(path: string, guard: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={guard}>
          <Route path={path} element={<div data-testid="surface">surface</div>} />
        </Route>
        <Route path="*" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  )
}

function panel(): HTMLElement {
  return screen.getByTestId('empty-state')
}

describe('access boundary', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // ── AC-019 ────────────────────────────────────────────────────────────────────────────────
  // Desktop is the default render: jsdom computes no layout, so "at 1440" is the un-narrowed
  // case, and the phone difference is a CSS contract (AC-021 below).
  describe('AC-019: a Sales member deep-links to /cafe/pushes', () => {
    beforeEach(() => {
      setViewer(['member'])
      renderAt('/cafe/pushes', <RequireAccessRole anyOf={CAFE_PUSHES_ROLES} />)
    })

    it('stays on the route — no surface, and nothing navigated', () => {
      expect(screen.queryByTestId('surface')).not.toBeInTheDocument()
      expect(screen.queryByTestId('landing')).not.toBeInTheDocument()
    })

    it('renders the page head titled for the area, with the Access required sentence', () => {
      const head = screen.getByTestId('page-head')
      expect(within(head).getByRole('heading', { level: 1 })).toHaveTextContent('Café')
      expect(within(head).getByText('Access required')).toBeInTheDocument()
    })

    it('renders one quiet dashed panel: the area sentence, the admin sentence, one outline Back', () => {
      expect(within(panel()).getByRole('heading', { level: 2 }))
        .toHaveTextContent('Café is outside your access')
      expect(within(panel()).getByText('An admin changes access in Admin Settings.'))
        .toBeInTheDocument()
      const back = within(panel()).getByRole('link', { name: 'Back to Home' })
      expect(back).toHaveClass('btn', 'btn-outline')
    })

    it('offers exactly one control in the panel — a wall is not a menu', () => {
      const controls = [
        ...within(panel()).queryAllByRole('link'),
        ...within(panel()).queryAllByRole('button'),
      ]
      expect(controls).toHaveLength(1)
    })

    it('names the area and nothing inside it — the boundary exposes no data', () => {
      // The whole rendered text is the area label plus the two fixed sentences. Any figure,
      // record title or count leaking through the guard would show up as an extra digit here.
      expect(panel().textContent).toBe(
        '—Café is outside your accessAn admin changes access in Admin Settings.Back to Home',
      )
    })
  })

  // ── AC-020 ────────────────────────────────────────────────────────────────────────────────
  it('AC-020: Finance at /admin/people is told the AREA, not the screen', () => {
    setViewer(['finance'])
    renderAt('/admin/people', <AdminRoute />)
    // `Admin Settings`, the thing an admin would grant — not `People`, a screen this viewer has
    // never been shown the name of.
    expect(screen.getByRole('heading', { level: 2 }))
      .toHaveTextContent('Admin Settings is outside your access')
    expect(screen.queryByTestId('landing')).not.toBeInTheDocument()
  })

  it('AC-020: a member at /cafe/review meets the Café panel — a child names its area', () => {
    setViewer(['member'])
    renderAt('/cafe/review', <RequireAccessRole anyOf={CAFE_REVIEW_ROLES} />)
    expect(screen.getByRole('heading', { level: 2 }))
      .toHaveTextContent('Café is outside your access')
  })

  // ── AC-021 ────────────────────────────────────────────────────────────────────────────────
  describe('AC-021: phone (≤390)', () => {
    // jsdom computes no layout, so nothing in this block MEASURES anything. What the two
    // stylesheet cases below assert is the text of the rules; the measurement they stand for —
    // panel and button at the full column, `scrollWidth <= 390` — is the Playwright geometry
    // guard's, and saying so here is what keeps this file's name honest.
    const css = readFileSync(resolve(__dirname, 'access-boundary.css'), 'utf8')
    const phoneBlock = css.slice(css.indexOf('@media'))

    it('the stylesheet declares the phone block that runs panel and button to the full column', () => {
      expect(phoneBlock).toContain('@media (max-width: 767.98px)')
      expect(phoneBlock).toMatch(/\.access-boundary \.empty-state-frame \{[^}]*width: 100%/)
      expect(phoneBlock).toMatch(/\.access-boundary \.empty-state-frame \{[^}]*max-width: 100%/)
      expect(phoneBlock).toMatch(/\.access-boundary \.empty-actions \.btn \{[^}]*width: 100%/)
    })

    it('the stylesheet declares no fixed width, no min-width, and a border-box frame', () => {
      // The two ways this file could author overflow: full width plus padding on a content box,
      // and a hardcoded px width in a 390px column. Neither is a measurement — a parent, a gap or
      // a long word can still overflow, and only the geometry guard can see that.
      expect(css).toMatch(/\.access-boundary \.empty-state-frame \{[^}]*box-sizing: border-box/)
      expect(css).not.toMatch(/width:\s*\d+px/)
      expect(css).not.toMatch(/min-width:/)
    })

    it('the panel carries the class those rules target — a rule with no element is no rule', () => {
      setViewer(['member'])
      renderAt('/cafe/pushes', <RequireAccessRole anyOf={CAFE_PUSHES_ROLES} />)
      expect(panel()).toHaveClass('access-boundary')
      expect(within(panel()).getByRole('link', { name: 'Back to Home' }).parentElement)
        .toHaveClass('empty-actions')
    })

    it('Back lands on /', async () => {
      setViewer(['member'])
      renderAt('/cafe/pushes', <RequireAccessRole anyOf={CAFE_PUSHES_ROLES} />)
      await userEvent.click(screen.getByRole('link', { name: 'Back to Home' }))
      expect(screen.getByTestId('landing')).toHaveTextContent('/')
    })
  })

  // ── AC-022 ────────────────────────────────────────────────────────────────────────────────
  describe('AC-022: navigation is unchanged', () => {
    // The RENDERED sweep — every persona, every nav surface, both viewports — is owned by
    // `nav-reachability.test.tsx` and `ship-gate.test.tsx`. What is asserted here is the seam
    // those sweeps read, so this file fails if the boundary is ever mistaken for a reason to
    // widen a nav surface.
    it('a Sales member is offered no Money and no Admin door', () => {
      const money = DESTINATIONS.find((d) => d.id === 'money')!
      expect(isLive(money, ['member'])).toBe(false) // rail group, tab bar, More drawer
      expect(navUtility(['member']).map((u) => u.id)).not.toContain('admin')
      expect(viewerAdmittedToRoute('/money', ['member'])).toBe(false) // ⌘K
      expect(viewerAdmittedToRoute('/admin/people', ['member'])).toBe(false)
      // Not vacuous: the same authorities DO open the Admin door for an admin.
      expect(navUtility(['admin']).map((u) => u.id)).toContain('admin')
      expect(UTILITY.map((u) => u.id)).toContain('admin')
    })

    // The forward has to be asserted where it actually happens. Reading the gated LEAF's element
    // off the table and finding a `<Navigate>` there proves nothing: a guard sits ABOVE that leaf
    // and renders in its place, so the leaf never mounts — which is exactly how a member came to
    // be shown a Money panel while the shape assertion stayed green. These cases mount the real
    // table's own gate and leaf objects and read where the viewer ends up.
    describe('the ship gate forwards /money before any guard speaks', () => {
      it.each([
        ['a Sales member', ['member']],
        ['a finance viewer', ['finance']],
        ['an admin', ['admin']],
      ])('%s lands on / with no panel', (_who, roles) => {
        setViewer(roles)
        renderRealChain('/money')
        expect(screen.getByTestId('landing')).toHaveTextContent('/')
        expect(screen.queryByTestId('empty-state'), 'a gated area named itself').not.toBeInTheDocument()
      })

      it('/money/detail forwards too — the gate covers the subtree', () => {
        setViewer(['member'])
        renderRealChain('/money/detail')
        expect(screen.getByTestId('landing')).toHaveTextContent('/')
        expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
      })

      it('is not vacuous: the same chain, ungated, renders the boundary', () => {
        setViewer(['member'])
        renderRealChain('/admin/people')
        expect(screen.queryByTestId('landing')).not.toBeInTheDocument()
        expect(screen.getByTestId('empty-state')).toBeInTheDocument()
      })
    })
  })

  // ── AC-023 ────────────────────────────────────────────────────────────────────────────────
  describe('AC-023: all three guards render the ONE boundary', () => {
    const CASES = [
      ['RequireAccessRole', '/cafe/pushes', <RequireAccessRole anyOf={CAFE_PUSHES_ROLES} />, 'Café'],
      ['AdminRoute', '/admin/people', <AdminRoute />, 'Admin Settings'],
      ['RequireCapability', '/work/projects', <RequireCapability capability="workline.manage" />, 'Projects & Processes'],
    ] as const

    it.each(CASES)('%s renders the boundary in place for an authenticated viewer', (_n, path, guard, area) => {
      setViewer(['member'])
      renderAt(path, guard)
      expect(screen.queryByTestId('landing'), 'a guard navigated away').not.toBeInTheDocument()
      expect(screen.getByTestId('empty-state')).toHaveClass('access-boundary')
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(`${area} is outside your access`)
    })

    it.each(CASES)('%s still redirects before the session is authenticated — no boundary flash', (_n, path, guard) => {
      mockUseAuth.mockReturnValue({ status: 'loading' } as never)
      renderAt(path, guard)
      expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
      expect(screen.getByTestId('landing')).toHaveTextContent('/')
    })

    // A capability gate closes ONE link inside a destination the viewer holds: the rail beside
    // this panel lists Work, expanded and marked active. "Work is outside your access" denies
    // something the same screen shows the viewer holding, so the panel names the link.
    it('the capability gate names the LINK, never the area the viewer plainly has', () => {
      setViewer(['member'])
      renderAt('/work/projects', <RequireCapability capability="workline.manage" />)
      expect(screen.getByRole('heading', { level: 2 }).textContent).not.toContain('Work is outside')
    })
  })

  // ── The shell chrome says the same word the panel does ─────────────────────────────────────
  describe('the chrome does not name what the panel withholds', () => {
    const CHROME_CASES = [
      ['/admin/people', 'Admin Settings', <AdminRoute />],
      ['/work/projects', 'Projects & Processes', <RequireCapability capability="workline.manage" />],
    ] as const

    it.each(CHROME_CASES)('%s: the desktop breadcrumb reads "%s" and nothing else', (path, label, guard) => {
      setViewer(['member'])
      renderChrome(path, guard, false)
      expect(crumbText()).toBe(label)
    })

    it.each(CHROME_CASES)('%s: the phone header reads "%s"', (path, label, guard) => {
      setViewer(['member'])
      renderChrome(path, guard, true)
      expect(crumbText()).toBe(label)
    })

    it('not vacuous: with no boundary mounted the same crumbs keep their trail', () => {
      setViewer(['admin'])
      renderChrome('/work/projects', <RequireCapability capability="workline.manage" />, false)
      expect(crumbText()).toBe('Work · Projects & Processes')
    })
  })
})

// ── Harnesses ────────────────────────────────────────────────────────────────────────────────

function isGuard(element: ReactNode): boolean {
  return (
    isValidElement(element) &&
    (element.type === RequireAccessRole || element.type === AdminRoute || element.type === RequireCapability)
  )
}

/**
 * Mounts the REAL table's chain for `path`, from its route gate downward.
 *
 * Mounting `routeConfig` whole would drag in ProtectedRoute, the shell and every lazy page. What
 * this needs is the pair the old shape assertion could not see together — the gate route object
 * and the route element the gate sits above — taken from `routeConfig` itself and re-nested as
 * they are nested there, so a change to either is a change to what this mounts.
 */
function renderRealChain(path: string) {
  const matches = matchRoutes(routeConfig, path)
  if (!matches) throw new Error(`${path} matches nothing in the real route table`)
  const gateIndex = matches.findIndex(({ route }) => isGuard(route.element))
  if (gateIndex < 0) throw new Error(`${path} passes through no route gate`)
  let chain: RouteObject[] | undefined
  for (let i = matches.length - 1; i >= gateIndex; i--) {
    const route = matches[i].route
    // Index and non-index routes are a discriminated union — an index route may carry no
    // children — so they are rebuilt on separate branches, as router.tsx's own gate does.
    chain = route.index ? [{ ...route }] : [{ ...route, ...(chain ? { children: chain } : {}) }]
  }
  const router = createMemoryRouter([...chain!, { path: '*', element: <Landing /> }], {
    initialEntries: [path],
  })
  return render(<RouterProvider router={router} />)
}

/** The boundary and the shell breadcrumb, sharing one BreadcrumbTitleProvider as the shell does. */
function renderChrome(path: string, guard: React.ReactElement, narrow: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: narrow, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  })
  return render(
    <I18nProvider>
      <BreadcrumbTitleProvider>
        <MemoryRouter initialEntries={[path]}>
          <nav aria-label="Breadcrumb"><Breadcrumb /></nav>
          <Routes>
            <Route element={guard}>
              <Route path={path} element={<div data-testid="surface">surface</div>} />
            </Route>
            <Route path="*" element={<Landing />} />
          </Routes>
        </MemoryRouter>
      </BreadcrumbTitleProvider>
    </I18nProvider>,
  )
}

function crumbText(): string {
  const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
  return (nav.textContent?.replace(/\s+/g, ' ').replace(/\s*·\s*/g, ' · ').trim() ?? '')
}
