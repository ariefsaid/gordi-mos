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
 * So: render the three real nav surfaces, for a persona, and read the links back out of the DOM.
 * A path counts as reachable only if some viewer can actually see a link to it somewhere.
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
import { flattenRoutes, isRedirect } from '@/test/route-table'
import type { RouteHandle } from './route-classification'

function setAuthAs(accessRoles: string[], roleNames: string[]) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Test Viewer',
        email: 't@gordi.id', archived_at: null, must_change_password: false,
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
 * The links a PHONE viewer can reach: the bottom tab bar plus everything behind More.
 *
 * Read off `document.body` rather than the render container, so a drawer rendered through a portal
 * still counts — the point is what a viewer can see, not where React put it.
 */
function phoneLinks(p: Persona): string[] {
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
  // The drawer must actually be open, or this silently measures the bottom bar alone.
  expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument()
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
  '/money/detail': 'Money detail tab — reached from the Money surface itself, not a separate nav entry',
  '/money/budget': "flag-gated (SHOW_PLAN_BUDGET, default off). dev's Plan destination linked it when the flag was on; restoring that link belongs to the Money surface port",
  '/money/pricing': 'flag-gated (SHOW_PLAN_BUDGET, default off). Same as /money/budget',
  '/money/follow-ups': 'flag-gated (SHOW_FOLLOWUPS, default off) and deferred past the MVP',
  '/recovery': 'unauthenticated password-recovery screen — reached from the login page and by emailed link',
}

/** Page routes that render a surface — redirects, gates and DEV-only harnesses excluded. */
function surfaceRoutes() {
  return flattenRoutes().filter(({ path, route }) => {
    if (route.element === undefined || isRedirect(route.element)) return false
    if ((route.handle as RouteHandle | undefined)?.kind !== 'page') return false
    return path !== '/' && !path.startsWith('/dev/') && !path.startsWith('/__')
  })
}

describe('nav reachability — rendered links, real viewers, both viewports', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  const surfaces = surfaceRoutes()

  it('the sweep renders real nav and enumerates the real table — it cannot pass on nothing', () => {
    expect(surfaces.length).toBeGreaterThan(15)
    const { rail, phone } = allReachable()
    expect(rail.size).toBeGreaterThan(8)
    expect(phone.size).toBeGreaterThan(8)
  })

  it.each(surfaces.map((s) => [s.path] as const))(
    '%s is reachable from a rendered nav link',
    (path) => {
      if (path in NO_NAV_ENTRY_BY_DESIGN) {
        expect(NO_NAV_ENTRY_BY_DESIGN[path].length, `${path} needs a real reason`).toBeGreaterThan(20)
        return
      }
      const { rail, phone } = allReachable()
      expect(
        rail.has(path) || phone.has(path),
        `${path} renders a surface but no viewer sees a link to it at either viewport`,
      ).toBe(true)
    },
  )

  it('every exception is a route that still exists — the list cannot rot', () => {
    const live = new Set(flattenRoutes().map((f) => f.path))
    const stale = Object.keys(NO_NAV_ENTRY_BY_DESIGN).filter((p) => !live.has(p))
    expect(stale).toEqual([])
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

  it('a rendered nav link never points at a path the route table does not serve', () => {
    // The mirror image: a rail entry that 404s is as broken as a surface with no rail entry.
    const served = new Set(flattenRoutes().map((f) => f.path))
    const { rail, phone } = allReachable()
    const dangling = [...new Set([...rail, ...phone])].filter((p) => !served.has(p))
    expect(dangling).toEqual([])
  })
})
