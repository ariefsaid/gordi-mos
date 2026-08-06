/**
 * Nav reachability — every live surface has a way in that is not a typed URL, for a real viewer,
 * on a real viewport.
 *
 * This guard exists because the same defect has now landed FOUR times in one port, and a suite of
 * 2900+ passing tests caught none of them:
 *
 *  1. the Money destination was narrowed to `finance|admin` while its ROUTE still admitted the
 *     financial VIEW tiers — manager and supervisor kept the surface and lost every link to it;
 *  2. the Café module shipped with one link while its five working screens sat in `CAFE_SECTIONS`,
 *     imported by nothing but a breadcrumb lookup;
 *  3. …and the first draft of this file counted those same registries as "nav", so it passed while
 *     defect 2 was live: the dead data was the thing being counted;
 *  4. and then, below 920px — where there is no rail — the drawer dropped the promoted module
 *     *with its children*, so Café's five screens had no phone nav at all, on the primary device
 *     of the staff who use them daily.
 *
 * All four are one shape: **the nav narrower than the route**. Draft 1 of this guard failed to hold
 * it for two reasons, and this rewrite fixes both:
 *
 *  - it was REGISTRY-based, not RENDERER-based. Its own comment said "a path being written down
 *    somewhere is not a way in — only a rendered link is", and then it counted registry entries.
 *    Defect 4's paths were written down; nothing rendered them on a phone.
 *  - it was ROLE-BLIND. It ignored `anyOf` entirely, so re-narrowing any role gate was invisible
 *    to it — which is exactly defect 1.
 *
 * A fifth followed: module visibility was decided by a regex over the viewer's JOB-ROLE NAME, so
 * many seeded job roles saw no module at all while the routes admitted them.
 *
 * `OD-WAY-51` (owner ruling) settles the model rather than the symptoms: **navigation mirrors what
 * the route admits.** If a route admits a viewer, that viewer gets a rendered way in, at every
 * viewport; the nav is never narrower than the authorization.
 *
 * So this file renders the three real nav surfaces for a persona, reads the links back out of the
 * DOM, and compares them against what `routeConfig`'s own gates say that persona may reach —
 * both directions. The expected set comes from the route table, never from the persona list, so a
 * viewer nobody designed for is a first-class case instead of a blind spot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue([]),
}))

import { RailNav } from './rail-nav'
import { MobileDrawer } from './mobile-drawer'
import { BottomTabBar } from './bottom-tab-bar'
import { flattenRoutes, isRedirect, routeAdmits } from '@/test/route-table'
import type { RouteHandle } from './route-classification'

function setAuthAs(accessRoles: string[], roleNames: string[]) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Test Viewer',
        email: 't@example.test', archived_at: null, must_change_password: false,
        created_at: '', updated_at: '',
      },
      roles: roleNames.map((n, i) => ({
        id: `r${i}`, org_id: 'o1', business_unit_id: 'bu', name: n,
        reports_to_role_id: null, created_at: '', updated_at: '',
      })),
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  })
}

interface Persona {
  name: string
  accessRoles: string[]
  roleNames: string[]
}

// Real viewers, not role strings. The Café floor member is the persona the fourth defect hit.
const PERSONAS: Persona[] = [
  { name: 'Café floor member', accessRoles: ['member'], roleNames: ['Head Barista'] },
  { name: 'Café ops lead', accessRoles: ['ops_lead'], roleNames: ['Cafe Ops Lead'] },
  // One viewer per module, or the sweep under-reports: a module renders in the rail only for a
  // viewer whose JOB ROLE matches its `workMatch`, so a module nobody in this list is affiliated
  // with would look unreachable when it is merely un-personified.
  { name: 'roastery member', accessRoles: ['member'], roleNames: ['Roastery Lead'] },
  { name: 'ecommerce member', accessRoles: ['member'], roleNames: ['Ecommerce Lead'] },
  // OD-WAY-51's first-class case, not an afterthought: plenty of real job roles match no module
  // regex at all, and under the ruling that must change nothing about what they can reach. The
  // role name here is invented on purpose — the real roster is an untracked file (CLAUDE.md's
  // public-repo rule) and this test needs "matches nothing", not a specific person's job title.
  { name: 'no-module viewer', accessRoles: ['member'], roleNames: ['Unmatched Role'] },
  { name: 'admin', accessRoles: ['admin'], roleNames: ['Managing Director'] },
  { name: 'finance', accessRoles: ['finance'], roleNames: ['Finance Lead'] },
  { name: 'manager', accessRoles: ['manager'], roleNames: ['Ops Manager'] },
  { name: 'supervisor', accessRoles: ['supervisor'], roleNames: ['Bar Supervisor'] },
]

/** Look a persona up by NAME. Index lookups rot the moment a persona is inserted — which is
 *  exactly what happened while writing this file. */
function persona(name: string): Persona {
  const found = PERSONAS.find((p) => p.name === name)
  if (!found) throw new Error(`no persona named "${name}"`)
  return found
}

function hrefsIn(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]')).map((a) =>
    a.getAttribute('href')!,
  )
}

/** The links the DESKTOP rail actually renders for this viewer. */
function railLinks(p: Persona): string[] {
  setAuthAs(p.accessRoles, p.roleNames)
  const { unmount } = render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <RailNav />
        </MemoryRouter>
      </I18nProvider>
    </ThemeProvider>,
  )
  const links = hrefsIn(screen.getByRole('navigation', { name: 'Primary' }))
  unmount()
  return links
}

/**
 * Put the harness on a 390px viewport for the duration of `fn`.
 *
 * `BottomTabBar` short-circuits to `null` above 920px (`useIsNarrow`), and jsdom's default
 * matchMedia stub reports `matches: false` — so without this the bottom bar renders NOTHING and a
 * "phone" measurement silently covers the drawer alone. The first draft of `phoneLinks` had
 * exactly that bug, and its docstring claimed otherwise: the same "a claim not backed by what
 * runs" defect this whole file exists to catch.
 */
function atPhoneWidth<T>(fn: () => T): T {
  const real = window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: /max-width/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  try {
    return fn()
  } finally {
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: real })
  }
}

/**
 * The links a PHONE viewer can reach: the bottom tab bar plus everything behind More.
 *
 * Read off `document.body` rather than the render container, so a drawer rendered through a portal
 * still counts — the point is what a viewer can see, not where React put it.
 */
function phoneLinks(p: Persona): string[] {
  return atPhoneWidth(() => phoneLinksAtWidth(p))
}

function phoneLinksAtWidth(p: Persona): string[] {
  setAuthAs(p.accessRoles, p.roleNames)
  const { unmount } = render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <BottomTabBar />
          <MobileDrawer open onClose={() => {}} />
        </MemoryRouter>
      </I18nProvider>
    </ThemeProvider>,
  )
  // BOTH surfaces must have rendered, or this silently measures half a phone. The drawer is a
  // dialog; the bottom bar is the tab-bar navigation that only exists below 920px.
  expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument()
  expect(
    document.body.querySelector('.bottom-tab-bar, nav[class*="bottom"]') ??
      screen.getByRole('button', { name: /more/i }),
    'the bottom tab bar did not render — the phone measurement is incomplete',
  ).toBeTruthy()
  const links = hrefsIn(document.body)
  unmount()
  return [...new Set(links)]
}

/** Every path any persona can reach, at either viewport. */
function allReachable(): { rail: Set<string>; phone: Set<string> } {
  const rail = new Set<string>()
  const phone = new Set<string>()
  for (const p of PERSONAS) {
    for (const l of railLinks(p)) rail.add(l)
    for (const l of phoneLinks(p)) phone.add(l)
  }
  return { rail, phone }
}

/**
 * Surfaces with NO nav entry, each here for a stated reason. Adding a line is a decision someone
 * has to defend in review; leaving a surface out of nav silently is not possible.
 */
const NO_NAV_ENTRY_BY_DESIGN: Record<string, string> = {
  '/work/signals/:signalId': 'record door — opened from the Signals list or a deep link, never from nav',
  '/work/tasks/new': 'record door — opened by the create action, not a nav entry',
  '/work/tasks/:taskId': 'record door — opened from the Tasks table or a deep link',
  '/work/follow-ups/:id': 'record door — opened from the follow-ups queue or a deep link',
  '/ops/new': 'record door — opened from the Daily Log surface',
  '/ops/:id/edit': 'record door — opened from a Daily Log row',
  '/ops': "Daily Log — a live dev surface with no v4 IA entry; reached from Home's own links. Owed a retirement-or-adoption ticket",
  // Corrected: the previous reason said "reached from the Money surface itself", which is false.
  // The Detail tab does not navigate to this PATH — it writes `?tab=detail` onto the current one
  // via setSearchParams. Nothing in the app links `/money/detail`; breadcrumb.tsx only renders a
  // crumb for it. Its one real caller is the `/dashboard/detail` redirect.
  '/money/detail': 'no link exists to this path — the Detail tab writes ?tab=detail on /money via setSearchParams. It survives only as the /dashboard/detail redirect target, for old bookmarks',
  '/money/budget': "flag-gated (SHOW_PLAN_BUDGET, default off). dev's Plan destination linked it when the flag was on; restoring that link belongs to the Money surface port",
  '/money/pricing': 'flag-gated (SHOW_PLAN_BUDGET, default off). Same as /money/budget',
  '/money/follow-ups': 'flag-gated (SHOW_FOLLOWUPS, default off) and deferred past the MVP',
  '/recovery': 'unauthenticated password-recovery screen — reached from the login page and by emailed link',
}

/** Routes carrying an element that this sweep does NOT check, and why each is exempt.
 *
 *  `surfaceRoutes()` filters on `handle.kind === 'page'`, which fails OPEN: a page route that
 *  forgets its handle silently escapes the sweep instead of failing it. Pinning the escapee list
 *  closes that — a new escapee has to be added here deliberately, in front of a reviewer. */
const NOT_A_SURFACE: Record<string, string> = {
  '/': 'the index route — Home, always reachable; the sweep skips it by definition',
  '/login': 'unauthenticated landing screen, outside the shell',
  '/dev/ui': 'DEV-only primitives gallery, stripped from the production build',
  '/dev/views': 'DEV-only view-composition harness',
  '/dev/views/:viewId': 'DEV-only view-composition harness',
  '/__home-stacked': 'DEV-only preview of the stacked Home composition',
  '/*': 'the not-found catch-all — a fallback, not a destination; nothing should ever link to it',
  // Also carries a NO_NAV_ENTRY_BY_DESIGN entry. That one is inert (this route is classified
  // infrastructure, so the sweep never reaches it) and is left in place deliberately: the rot
  // check keeps it honest, and it documents the same fact for a reader who looks there first.
  '/recovery': 'unauthenticated password-recovery screen — classified infrastructure, outside the shell',
}

/** Page routes that render a surface — redirects, gates and DEV-only harnesses excluded. */
function surfaceRoutes() {
  return flattenRoutes().filter(({ path, route }) => {
    if (route.element === undefined || isRedirect(route.element)) return false
    if ((route.handle as RouteHandle | undefined)?.kind !== 'page') return false
    return path !== '/' && !path.startsWith('/dev/') && !path.startsWith('/__')
  })
}

/** Everything with an element that `surfaceRoutes()` drops, for the fail-closed check below. */
function escapees(): string[] {
  const swept = new Set(surfaceRoutes().map((s) => s.path))
  return [
    ...new Set(
      flattenRoutes()
        .filter(({ path, route }) => {
          if (route.element === undefined || isRedirect(route.element)) return false
          return !swept.has(path)
        })
        .map((f) => f.path),
    ),
  ].sort()
}

describe('nav reachability — rendered links, real viewers, both viewports', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  const surfaces = surfaceRoutes()

  it('nothing escapes the sweep by accident — the escapee list is pinned (fail closed)', () => {
    // `surfaceRoutes()` filters on handle.kind === 'page'. That fails OPEN: forget a handle and a
    // real surface silently drops out of every reachability assertion above. Pinning the list
    // means a new escapee turns this red instead of disappearing quietly.
    expect(escapees()).toEqual(Object.keys(NOT_A_SURFACE).sort())
    for (const [path, reason] of Object.entries(NOT_A_SURFACE)) {
      expect(reason.length, `${path} needs a real reason`).toBeGreaterThan(20)
    }
  })

  it('the sweep renders real nav and enumerates the real table — it cannot pass on nothing', () => {
    expect(surfaces.length).toBeGreaterThan(15)
    const { rail, phone } = allReachable()
    expect(rail.size).toBeGreaterThan(8)
    expect(phone.size).toBeGreaterThan(8)
  })

  // ── OD-WAY-51, the whole rule in two assertions ──────────────────────────────────────────
  //
  // "If a route admits a viewer, that viewer gets a rendered way in — at every viewport. The
  // navigation must never be narrower than the authorization."
  //
  // The expected set is DERIVED from routeConfig's own gates, per persona. That is the part that
  // matters: the previous sweep accepted "SOME persona reaches it", and the personas were picked
  // to match the very regex that was hiding things — so it could only ever confirm what someone
  // had already thought of. Now a persona nobody designed for is a first-class case.
  describe.each(PERSONAS.map((p) => [p.name, p] as const))('%s', (_name, p) => {
    const admitted = () =>
      surfaceRoutes()
        .map((s) => s.path)
        .filter((path) => !(path in NO_NAV_ENTRY_BY_DESIGN))
        .filter((path) => routeAdmits(path, p.accessRoles))

    it('reaches every route that admits them, on the rail', () => {
      const rendered = new Set(railLinks(p))
      const missing = admitted().filter((path) => !rendered.has(path))
      expect(missing, 'admitted by the route, no rendered rail link').toEqual([])
    })

    it('reaches every route that admits them, on a phone', () => {
      const rendered = new Set(phoneLinks(p))
      const missing = admitted().filter((path) => !rendered.has(path))
      expect(missing, 'admitted by the route, no rendered phone link').toEqual([])
    })

    it('is never shown a link the route would bounce them from', () => {
      // The reverse direction. A nav wider than the route is its own defect: the viewer taps a
      // link and gets thrown out, which reads as the app being broken rather than as a permission.
      const shown = [...new Set([...railLinks(p), ...phoneLinks(p)])]
      const bounced = shown.filter((path) => !routeAdmits(path, p.accessRoles))
      expect(bounced, 'rendered in the nav but the route bounces this viewer').toEqual([])
    })
  })

  it('every exception is a route that still exists — the list cannot rot', () => {
    const live = new Set(flattenRoutes().map((f) => f.path))
    const stale = Object.keys(NO_NAV_ENTRY_BY_DESIGN).filter((p) => !live.has(p))
    expect(stale).toEqual([])
  })

  it('every exception is genuinely absent from the rendered nav — the list cannot lie', () => {
    // The inverse of the sweep, and the half that was missing. Without it an exception can claim
    // "this has no nav entry" long after someone gives it one, and the file keeps asserting a
    // reason that stopped being true — which is exactly the wrong-explanation defect this whole
    // stack keeps producing. Reproduced by the gate: adding /ops as a rendered Café child left the
    // suite fully green while the exception still declared it unreachable.
    const { rail, phone } = allReachable()
    const contradicted = Object.keys(NO_NAV_ENTRY_BY_DESIGN).filter(
      (p) => rail.has(p) || phone.has(p),
    )
    expect(
      contradicted,
      'these paths ARE rendered in the nav, so their "no nav entry" exception is false — delete the exception',
    ).toEqual([])
  })

  // ── The phone half. There is no rail below 920px, and the bottom bar renders one link per
  // destination with no children, so the drawer is the ONLY route to a module's sub-screens.
  describe("Café's five screens on a phone (#242)", () => {
    it('a Café floor member reaches Log, Plan and Stock at 390px', () => {
      const links = phoneLinks(persona('Café floor member'))
      for (const p of ['/cafe/log', '/cafe/plan', '/cafe/stock']) {
        expect(links, `${p} unreachable on a phone`).toContain(p)
      }
    })

    it('a Café floor member does NOT see Review or Pushes — the same gate their routes carry', () => {
      const links = phoneLinks(persona('Café floor member'))
      expect(links).not.toContain('/cafe/review')
      expect(links).not.toContain('/cafe/pushes')
    })

    it('OD-WAY-51: a viewer whose job role matches NO module still reaches the ungated screens', () => {
      // The persona the old model excluded outright — a substantial share of the roster.
      const p = persona('no-module viewer')
      for (const path of ['/cafe/log', '/cafe/plan', '/cafe/stock']) {
        expect(phoneLinks(p), `${path} unreachable on a phone`).toContain(path)
        expect(railLinks(p), `${path} unreachable on the rail`).toContain(path)
      }
    })

    it('OD-WAY-51: …and is still NOT shown Review or Pushes — their routes gate them', () => {
      // The ruling widens nav to match the route; it does not remove gates. Without this the case
      // above would pass just as well if every gate had been deleted.
      const p = persona('no-module viewer')
      expect(phoneLinks(p)).not.toContain('/cafe/review')
      expect(railLinks(p)).not.toContain('/cafe/pushes')
    })

    it('a Café ops lead reaches all five at 390px, Review and Pushes included', () => {
      const links = phoneLinks(persona('Café ops lead'))
      for (const p of ['/cafe/log', '/cafe/plan', '/cafe/stock', '/cafe/review', '/cafe/pushes']) {
        expect(links, `${p} unreachable on a phone`).toContain(p)
      }
    })

    it('…and reaches all five on the desktop rail too', () => {
      const links = railLinks(persona('Café ops lead'))
      for (const p of ['/cafe/log', '/cafe/plan', '/cafe/stock', '/cafe/review', '/cafe/pushes']) {
        expect(links, `${p} unreachable on the rail`).toContain(p)
      }
    })
  })

  // ── The role half. Draft 1 ignored `anyOf` entirely, so the Money narrowing was invisible to it.
  describe('role gates: a viewer admitted by the ROUTE sees a link', () => {
    it.each([['manager', persona('manager')], ['supervisor', persona('supervisor')]] as const)(
      '%s holds financial VIEW visibility and sees a Money link (AC-128 / AC-327)',
      (_name, persona) => {
        expect(railLinks(persona)).toContain('/money')
        expect(phoneLinks(persona)).toContain('/money')
      },
    )

    it('a plain member sees no Money link — the gate is real, not absent', () => {
      // Without this the case above would pass just as well with no gate at all.
      expect(railLinks(persona('Café floor member'))).not.toContain('/money')
      expect(phoneLinks(persona('Café floor member'))).not.toContain('/money')
    })

    it('only an admin sees the Admin link', () => {
      expect(railLinks(persona('admin'))).toContain('/admin/people')
      expect(railLinks(persona('Café floor member'))).not.toContain('/admin/people')
    })
  })

  // The generalisation of #242. The sweep above accepts "rail OR phone", so a surface that loses
  // its phone entry but keeps its rail entry still passes it — which is exactly the shape of #242,
  // and only the Café-specific cases above would have caught it. The drawer is designed to mirror
  // the rail, so anything a viewer can reach on the desktop they must also reach on their phone.
  // Below 920px there is no rail at all: a phone-only loss is a total loss for that viewer.
  it.each(PERSONAS.map((p) => [p.name, p] as const))(
    '%s reaches everything on a phone that they reach on the rail',
    (_name, p) => {
      const rail = railLinks(p)
      const phone = new Set(phoneLinks(p))
      // `/work` is the rail's Work PARENT (a location, not a surface); the drawer lists Work's
      // children directly instead of repeating the parent.
      const missing = [...new Set(rail)].filter((l) => l !== '/work' && !phone.has(l))
      expect(missing, `reachable on the rail but not on a phone`).toEqual([])
    },
  )

  it('a rendered nav link never points at a path the route table does not serve', () => {
    // The mirror image: a rail entry that 404s is as broken as a surface with no rail entry.
    const served = new Set(flattenRoutes().map((f) => f.path))
    const { rail, phone } = allReachable()
    const dangling = [...new Set([...rail, ...phone])].filter((p) => !served.has(p))
    expect(dangling).toEqual([])
  })
})
