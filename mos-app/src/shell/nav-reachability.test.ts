/**
 * Nav reachability — every live surface has a way in that is not a typed URL.
 *
 * This guard exists because the same defect landed twice in one port, and 2891 passing tests saw
 * neither:
 *
 *  1. the Money destination was narrowed to `finance|admin` while its ROUTE still admitted the
 *     financial VIEW tiers, so manager and supervisor kept the surface and lost every link to it;
 *  2. the Café module shipped with one link (`/cafe`) while its five working screens — Log, Plan,
 *     Stock, Review, Pushes, in daily use by kitchen staff — sat in `CAFE_SECTIONS` imported by
 *     nothing but a breadcrumb lookup. Dead data, and five surfaces reachable only by typing.
 *
 * Both are the same shape: **the nav narrower than the route**. Nothing asserted the relationship,
 * so nothing went red. This does.
 *
 * The exceptions are an explicit, named list with a reason each, never a silent gap — a surface
 * that nobody can navigate to should have to argue for itself here, in writing.
 */
import { describe, it, expect } from 'vitest'
import { DESTINATIONS, MODULES, UTILITY } from './destinations'

import { flattenRoutes, isRedirect } from '@/test/route-table'
import type { RouteHandle } from './route-classification'

/**
 * Every path a nav surface can actually put in front of a viewer.
 *
 * ONLY the three registries the rail, the bottom bar and the drawer render from — `DESTINATIONS`,
 * `MODULES`, `UTILITY` — and only through the fields those renderers read: `primaryPath`, `links`
 * and `children`.
 *
 * `SECTIONS` / `CAFE_SECTIONS` / `ADMIN_SECTIONS` are deliberately NOT counted. They are the
 * BREADCRUMB's lookup tables. Counting them is how the first draft of this guard passed while the
 * defect it exists to catch was live: CAFE_SECTIONS listed all five Café paths, correctly
 * labelled, the whole time nothing rendered them. A path being written down somewhere is not a way
 * in — only a rendered link is.
 */
function navigablePaths(): Set<string> {
  const paths = new Set<string>()
  for (const d of [...DESTINATIONS, ...MODULES.flatMap((g) => g.items), ...UTILITY]) {
    if (d.primaryPath) paths.add(d.primaryPath)
    for (const l of [...d.links, ...(d.children ?? [])]) paths.add(l.path)
  }
  return paths
}

/**
 * Surfaces with NO nav entry, each here for a stated reason. Adding a line to this list is a
 * decision someone has to defend in review; leaving a surface out of nav silently is not possible.
 */
const NO_NAV_ENTRY_BY_DESIGN: Record<string, string> = {
  // Placeholders — the destination is real and navigable, the RECORD door beneath it is not a
  // place anyone navigates to; it is opened from a list or a deep link.
  '/work/signals/:signalId': 'record door — opened from the Signals list or a deep link, never from nav',
  '/work/tasks/new': 'record door — opened by the create action, not a nav entry',
  '/work/tasks/:taskId': 'record door — opened from the Tasks table or a deep link',
  '/work/follow-ups/:id': 'record door — opened from the follow-ups queue or a deep link',
  '/ops/new': 'record door — opened from the Daily Log surface',
  '/ops/:id/edit': 'record door — opened from a Daily Log row',

  // Live `dev` surfaces with no entry in the ported IA. Real gaps, owned elsewhere.
  '/ops': "Daily Log — a live dev surface with no v4 IA entry; reached from Home's own links. Owed a retirement-or-adoption ticket",
  '/money/detail': 'Money detail tab — reached from the Money surface itself, not a separate nav entry',
  '/money/budget': "flag-gated (SHOW_PLAN_BUDGET, default off). dev's Plan destination linked it when the flag was on; restoring that link belongs to the Money surface port",
  '/money/pricing': "flag-gated (SHOW_PLAN_BUDGET, default off). Same as /money/budget",
  '/money/follow-ups': 'flag-gated (SHOW_FOLLOWUPS, default off) and deferred past the MVP',

  // Infrastructure and DEV-only harnesses.
  '/recovery': 'unauthenticated password-recovery screen — reached from the login page and by emailed link',
}

describe('nav reachability: every live surface has a nav entry, or a stated reason not to', () => {
  const nav = navigablePaths()

  /** Page routes that render a surface — redirects and gates excluded. */
  const surfaces = flattenRoutes().filter(({ path, route }) => {
    if (route.element === undefined || isRedirect(route.element)) return false
    if ((route.handle as RouteHandle | undefined)?.kind !== 'page') return false
    return path !== '/' && !path.startsWith('/dev/') && !path.startsWith('/__')
  })

  it('the sweep found the route table — it cannot pass by enumerating nothing', () => {
    expect(surfaces.length).toBeGreaterThan(15)
    expect(nav.size).toBeGreaterThan(10)
  })

  it.each(surfaces.map((s) => [s.path] as const))('%s is reachable from the nav', (path) => {
    if (path in NO_NAV_ENTRY_BY_DESIGN) {
      expect(NO_NAV_ENTRY_BY_DESIGN[path].length, `${path} needs a real reason`).toBeGreaterThan(20)
      return
    }
    expect(nav.has(path), `${path} renders a surface but no nav registry names it`).toBe(true)
  })

  it('every exception is a route that still exists — the list cannot rot', () => {
    const live = new Set(flattenRoutes().map((f) => f.path))
    const stale = Object.keys(NO_NAV_ENTRY_BY_DESIGN).filter((p) => !live.has(p))
    expect(stale).toEqual([])
  })

  it("Café's five working screens are all named by the nav, not just its root", () => {
    // The specific regression: CAFE_SECTIONS held these and the module linked none of them.
    for (const path of ['/cafe/log', '/cafe/plan', '/cafe/stock', '/cafe/review', '/cafe/pushes']) {
      expect(nav.has(path), `${path} lost its nav entry`).toBe(true)
    }
  })

  it('a nav link never points at a path the route table does not serve', () => {
    // The mirror image of the check above, and the reason it is worth having: a rail entry that
    // 404s is as broken as a surface with no rail entry.
    const served = new Set(flattenRoutes().map((f) => f.path))
    const dangling = [...nav].filter((p) => !served.has(p))
    expect(dangling).toEqual([])
  })
})
