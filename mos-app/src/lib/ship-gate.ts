/**
 * SHIP GATE — build-time visibility for surfaces that are BUILT but outside the MVP payload.
 *
 * The full profile retains the declared MVP payload. The build-time `cafe` profile narrows the
 * shipped surface to Café and shared support without deleting any route or changing authorization.
 *
 * **One predicate.** The static list below and the selected build profile feed the same
 * `isShipGated` decision. It is honored by the ROUTER (a gated path does not route — it forwards
 * to the profile landing surface, and its component never mounts) and by the NAV (`isLive` /
 * `visibleSections` / `sectionForPath`, the authorities every nav surface already reads). Every
 * gated surface and record entry point asks THIS predicate rather than growing its own check.
 *
 * It sits **above** capabilities and access roles, never beside them: a gated surface is closed to
 * everyone regardless of role, so no test or review ever has to ask "gated for whom?".
 *
 * **Three ship states** per path: `released | hidden | preview`. `preview` is a local-launch-only
 * state for designed-but-not-connected screens (handover/README.md): allowed only on the dev server
 * started with `VITE_FUTURE_PREVIEW=1` on localhost:4400. It grants no permission and never reaches
 * a production build.
 *
 * **A build-time constant, deliberately.** No table, no RLS, no admin toggle, no per-user state,
 * no cache to invalidate. At switch day the constant becomes a read and nothing else changes.
 *
 * **Visibility, never removal.** Nothing here is deleted. Removing a static gate restores its
 * surface where the selected profile permits it; profile-hidden Work entries remain closed in Café.
 */
import { APP_RELEASE_PROFILE } from '@/config/app-build-settings'
import { isProfilePathAvailable, type ReleaseProfile } from '@/config/build-settings'

const SHIP_GATED_PATHS: readonly string[] = [
  // Events — already ruled retired (OD-WAY-60); #348 replaces it at milestone 4.
  '/work/events',
  // Post-MVP per OD-WAY-67. Both are still SliceStubPage.
  '/ecommerce',
  '/roastery',
  // Objectives · Projects & Processes were here 2026-08-24 → 2026-08-25; the owner restored
  // them to the MVP (OD-WAY-63): Tasks roll up through them, so Home's drill needs its target.
]

/**
 * Designed-but-not-connected screens (handover/README.md "preview ship-gate contract"). Each root
 * covers its descendants. Never gate the existing capture / Records / balance / Access routes here.
 */
const SHIP_PREVIEW_PATHS: readonly string[] = [
  '/cafe/transfer-routes',
  '/cafe/locations',
  '/admin/modules',
  // Where Modules lived before it became its own Admin page; the old path redirects to /admin/modules and stays closed with it.
  '/admin/access/modules',
  // Hide in MOS on Recipes: no route of its own. Every switch, filter and column asks this path (lib/recipe-visibility-preview.ts), so the
  // released /cafe/recipes page is unchanged when the preview is off.
  '/cafe/recipes/visibility',
]

export type ShipState = 'released' | 'hidden' | 'preview'

/** The launch facts the preview predicate reads; a plain object so the rule is testable. */
export interface PreviewFacts {
  dev: boolean
  mode: string
  flag: string | undefined
  hostname: string | undefined
  port: string | undefined
  /** The one port the preview is allowed on (4400 unless the launch names another for a side server). */
  allowedPort?: string
}

const PREVIEW_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const PREVIEW_PORT = '4400'

/**
 * Preview is allowed iff the dev server was launched with the opt-in flag on a local address and
 * the port the launch names (4400). Missing browser, global or env = false. No query parameter,
 * role, local storage or runtime switch can enable it.
 */
export function previewAllowedFor(facts: PreviewFacts): boolean {
  return facts.dev === true &&
    facts.mode === 'development' &&
    facts.flag === '1' &&
    typeof facts.hostname === 'string' && PREVIEW_HOSTS.includes(facts.hostname) &&
    typeof facts.port === 'string' && facts.port === (facts.allowedPort || PREVIEW_PORT)
}

export function isPreviewAllowed(): boolean {
  try {
    return previewAllowedFor({
      dev: import.meta.env.DEV === true,
      mode: import.meta.env.MODE,
      flag: import.meta.env.VITE_FUTURE_PREVIEW,
      hostname: typeof window === 'undefined' ? undefined : window.location.hostname,
      port: typeof window === 'undefined' ? undefined : window.location.port,
      allowedPort: import.meta.env.VITE_FUTURE_PREVIEW_PORT,
    })
  } catch {
    return false
  }
}

const stripPath = (path: string) => path.split('#')[0].split('?')[0]
const covers = (root: string, pathname: string) => pathname === root || pathname.startsWith(root + '/')

/**
 * The ship state of `path` in a profile: exact-or-descendant match after stripping query/hash,
 * longest registered path wins. Profile-excluded paths are always hidden.
 */
export function shipStateInProfile(path: string, profile: ReleaseProfile): ShipState {
  const pathname = stripPath(path)
  if (!isProfilePathAvailable(pathname, profile)) return 'hidden'
  let best: { length: number; state: ShipState } | null = null
  const consider = (roots: readonly string[], state: ShipState) => {
    for (const root of roots) if (covers(root, pathname) && (!best || root.length > best.length)) best = { length: root.length, state }
  }
  consider(SHIP_GATED_PATHS, 'hidden')
  consider(SHIP_PREVIEW_PATHS, 'preview')
  return (best as { state: ShipState } | null)?.state ?? 'released'
}

/**
 * Is `path` hidden by the ship gate?
 *
 * True for a statically gated path or anything beneath it, a profile-hidden root (and its legacy
 * aliases), and a `preview` path where preview is not allowed. Query strings and hashes are
 * stripped first — `/money?tab=detail` is the same surface as `/money`. Café's one
 * occurrence-scoped Task capability is an explicit guarded exception in the route transform,
 * never a navigation or command-menu entry.
 */
export function isShipGated(path: string): boolean {
  return isShipGatedInProfile(path, APP_RELEASE_PROFILE)
}

/** Profile-explicit form for build-profile tests and route transforms. */
export function isShipGatedInProfile(path: string, profile: ReleaseProfile): boolean {
  const state = shipStateInProfile(path, profile)
  return state === 'hidden' || (state === 'preview' && !isPreviewAllowed())
}
