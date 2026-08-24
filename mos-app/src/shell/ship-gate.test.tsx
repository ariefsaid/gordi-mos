/**
 * THE SHIP GATE, held from both ends (#444).
 *
 * One array (`lib/ship-gate.ts`) closes a surface in two places that have to agree: the ROUTER
 * must not route it, and the NAV must not offer it. This file asserts both halves against the
 * same list, so they cannot drift — which is the whole reason the gate is one constant instead of
 * a flag per surface.
 *
 * It is the ship-gate half of `OD-WAY-51` ("navigation mirrors what the route admits"), and it
 * strengthens that rule rather than competing with it: `nav-reachability.test.tsx` proves the nav
 * is never NARROWER than the route for a viewer the route admits; this file proves that when the
 * route stops admitting anyone at all, every rendered door closes with it — at every viewport,
 * for the viewer who sees the most.
 *
 * The gate sits ABOVE roles, never beside them. `admin` is used as the strictest persona precisely
 * because they hold everything: if the gate held only for a plain member it would be a role gate
 * wearing a different name.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { SHIP_GATED_PATHS, isShipGated } from '@/lib/ship-gate'

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
import { DESTINATIONS, MODULES, isLive } from './destinations'
import { SECTIONS, sectionForPath, visibleSections } from './sections'
import { flattenRoutes, isRedirect, redirectProps, leafInThisTable } from '@/test/route-table'

/**
 * The viewer who sees the MOST — every access role the app knows, and a job-role name that matches
 * every module's `workMatch`. A gate that closes for this persona closes for everyone, so nothing
 * here can pass by accident on a viewer who was never shown the surface in the first place.
 */
const OMNISCIENT_ROLES = ['admin', 'finance', 'manager', 'supervisor', 'ops_lead', 'member']

function setOmniscientViewer() {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Director Viewer',
        email: 'd@example.test', archived_at: null, must_change_password: false,
        created_at: '', updated_at: '',
      },
      // One name matching every module regex (cafe · ecommerce · roast), so no module is missing
      // from the sweep merely because nobody was affiliated with it.
      roles: [{
        id: 'r0', org_id: 'o1', business_unit_id: 'bu', name: 'Cafe Ecommerce Roastery Director',
        reports_to_role_id: null, created_at: '', updated_at: '',
      }],
      isManager: true,
      accessRoles: OMNISCIENT_ROLES,
    },
    signOut: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
}

function hrefsIn(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).map(
    (a) => a.getAttribute('href')!,
  )
}

/** Put the harness on a phone viewport — BottomTabBar returns null above 920px. */
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

function wrap(node: React.ReactNode) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>{node}</MemoryRouter>
      </I18nProvider>
    </ThemeProvider>
  )
}

/** Every link the DESKTOP rail renders — full width and the 920–1099px compact icon regime. */
function railHrefs(): string[] {
  const out: string[] = []
  for (const compact of [false, true]) {
    setOmniscientViewer()
    const { unmount } = render(wrap(<RailNav compact={compact} />))
    out.push(...hrefsIn(screen.getByRole('navigation', { name: 'Primary' })))
    unmount()
  }
  return [...new Set(out)]
}

/** Every link a PHONE viewer can reach: the bottom tab bar plus everything behind More. */
function phoneHrefs(): string[] {
  return atPhoneWidth(() => {
    setOmniscientViewer()
    const { unmount } = render(
      wrap(
        <>
          <BottomTabBar />
          <MobileDrawer open onClose={() => {}} />
        </>,
      ),
    )
    // Both surfaces must have rendered, or this silently measures half a phone.
    expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /more/i })).toBeInTheDocument()
    const links = hrefsIn(document.body)
    unmount()
    return [...new Set(links)]
  })
}

describe('issue 444 ship gate — the route and the nav close from the same switch', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // ── The harness has to be able to fail ───────────────────────────────────────────────────
  it('the gate is non-empty and the sweep renders real nav', () => {
    expect(SHIP_GATED_PATHS.length).toBeGreaterThan(0)
    // Enough links that "no gated link rendered" cannot be true merely because nothing rendered.
    expect(railHrefs().length).toBeGreaterThan(5)
    expect(phoneHrefs().length).toBeGreaterThan(5)
  })

  it('the predicate matches a gated root, its subtree, and nothing else', () => {
    expect(isShipGated('/money')).toBe(true)
    expect(isShipGated('/money/detail')).toBe(true)
    expect(isShipGated('/money?tab=detail')).toBe(true)
    expect(isShipGated('/work/tasks')).toBe(false)
    expect(isShipGated('/')).toBe(false)
    // A prefix that is not a path SEGMENT boundary is a different surface, not a child.
    expect(isShipGated('/moneybox')).toBe(false)
  })

  // ── Half one: no gated path routes ───────────────────────────────────────────────────────
  it.each(SHIP_GATED_PATHS.map((p) => [p] as const))(
    '%s does not route — it forwards to Home, and its component never mounts',
    (path) => {
      const leaf = leafInThisTable(path)
      expect(leaf, `${path} matches nothing in the route table`).toBeDefined()
      expect(isRedirect(leaf!.route.element), `${path} still renders a surface`).toBe(true)
      expect(redirectProps(leaf!.route.element).to).toBe('/')
    },
  )

  it('every route BENEATH a gated path forwards home too — no sub-surface survives its root', () => {
    const survivors = flattenRoutes()
      .filter(({ path, route }) => isShipGated(path) && route.element !== undefined)
      .filter(({ route }) => !isRedirect(route.element))
      .map(({ path }) => path)
    expect(survivors, 'gated paths that still render a surface').toEqual([])
  })

  it('no redirect anywhere in the table names a gated path — a gated doormat is a dead end', () => {
    // `/dashboard` → `/money` used to be a live retired path. With Money gated it would forward a
    // viewer onto a route that forwards them again; the gate re-points it at Home instead.
    const naming = flattenRoutes()
      .filter(({ route }) => isRedirect(route.element))
      .map(({ path, route }) => [path, redirectProps(route.element).to] as const)
      .filter(([, to]) => isShipGated(to))
    expect(naming, 'redirects still pointing at a gated surface').toEqual([])
  })

  // ── Half two: no rendered link points at a gated path, at any viewport ───────────────────
  it('the desktop rail offers no gated surface — full width and compact', () => {
    const gated = railHrefs().filter(isShipGated)
    expect(gated, 'rail links pointing at a ship-gated surface').toEqual([])
  })

  it('the phone offers no gated surface — bottom tabs and the More drawer', () => {
    const gated = phoneHrefs().filter(isShipGated)
    expect(gated, 'phone links pointing at a ship-gated surface').toEqual([])
  })

  // ── The two halves, joined ───────────────────────────────────────────────────────────────
  it('every rendered nav link lands on a route that actually renders a surface', () => {
    // The join that makes this file more than two independent lists: a link may only exist if the
    // path behind it still serves something. Un-gate a path in the array but forget the nav (or
    // vice versa) and one of these two goes red.
    const rendered = [...new Set([...railHrefs(), ...phoneHrefs()])]
    const forwarding = rendered.filter((href) => {
      const leaf = leafInThisTable(href.split('?')[0])
      return leaf === undefined || isRedirect(leaf.route.element)
    })
    expect(forwarding, 'rendered in the nav but the route forwards elsewhere').toEqual([])
  })

  // ── Hidden, not deleted ──────────────────────────────────────────────────────────────────
  it('every gated surface is still wired in the registries — this is visibility, not removal', () => {
    // Deleting the registry entries would also make the assertions above pass, and would make
    // switch day a revert instead of a one-line edit. The entries stay; only their visibility
    // changes, and Money keeps the access-role gate it will need back (ADR-0050 D8 / ADR-0051).
    const registered = new Set([
      ...DESTINATIONS.flatMap((d) => [...d.links, ...(d.children ?? [])]).map((l) => l.path),
      ...MODULES.flatMap((g) => g.items).flatMap((m) => [...m.links, ...(m.children ?? [])]).map((l) => l.path),
      ...SECTIONS.map((s) => s.path),
    ])
    const missing = SHIP_GATED_PATHS.filter((p) => !registered.has(p))
    expect(missing, 'gated paths deleted from the registries instead of hidden').toEqual([])

    const money = DESTINATIONS.find((d) => d.id === 'money')
    expect(money?.anyOf, 'Money lost its access-role gate while hidden').toBeDefined()
  })

  // ── The orphans the gate creates ─────────────────────────────────────────────────────────
  it('the nav authorities themselves answer the gate — not just the rendered output', () => {
    // Straight at the two functions every nav surface reads, so a NEW surface built on them
    // inherits the gate without being added to this file.
    const money = DESTINATIONS.find((d) => d.id === 'money')!
    expect(isLive(money, OMNISCIENT_ROLES)).toBe(false)
    const work = DESTINATIONS.find((d) => d.id === 'work')!
    const workChildPaths = visibleSections(work.children ?? [], OMNISCIENT_ROLES).map((s) => s.path)
    expect(workChildPaths.filter(isShipGated)).toEqual([])
    // …and Work still has children, so the assertion above is not passing on an empty list.
    expect(workChildPaths).toContain('/work/tasks')
    expect(workChildPaths).toContain('/work/signals')
  })

  it.each(SHIP_GATED_PATHS.map((p) => [p] as const))(
    'breadcrumb / SECTIONS resolution finds nothing at %s',
    (path) => {
      expect(sectionForPath(path)).toBeNull()
    },
  )

  it('…and still resolves an ungated path — the resolver is not simply broken', () => {
    expect(sectionForPath('/work/tasks')?.path).toBe('/work/tasks')
    expect(sectionForPath('/cafe/log')?.path).toBe('/cafe/log')
  })
})
