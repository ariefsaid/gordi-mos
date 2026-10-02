/**
 * SHIP GATE — build-time visibility for surfaces that are BUILT but outside the MVP payload.
 *
 * The full profile retains the existing MVP payload: Tasks + Signals + Café production (owner,
 * 2026-08-24). The build-time `cafe` profile narrows the shipped surface to Café and shared
 * support without deleting any route or changing authorization.
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
 * **A build-time constant, deliberately.** No table, no RLS, no admin toggle, no per-user state,
 * no cache to invalidate. At switch day the constant becomes a read and nothing else changes.
 *
 * **Visibility, never removal.** Nothing here is deleted. Removing a static gate restores its
 * surface where the selected profile permits it; profile-hidden Work entries remain closed in Café.
 */
import { APP_RELEASE_PROFILE } from '@/config/app-build-settings'
import { isProfilePathAvailable, type ReleaseProfile } from '@/config/build-settings'

export const SHIP_GATED_PATHS: readonly string[] = [
  // Events — already ruled retired (OD-WAY-60); #348 replaces it at milestone 4.
  '/work/events',
  // Post-MVP per OD-WAY-67. Both are still SliceStubPage.
  '/ecommerce',
  '/roastery',
  // Outside the payload, and carrying known visual debt (#250). Covers the whole subtree —
  // /money/detail, /money/budget, /money/pricing, /money/follow-ups — via the prefix rule below.
  '/money',
  // Objectives · Projects & Processes were here 2026-08-24 → 2026-08-25; the owner restored
  // them to the MVP (OD-WAY-63): Tasks roll up through them, so Home's drill needs its target.
]

/**
 * Is `path` hidden by the ship gate?
 *
 * Matches a statically gated path exactly OR anything beneath it, plus profile-hidden roots and
 * their legacy aliases. Query strings and hashes are stripped first — `/money?tab=detail` is the
 * same surface as `/money`. Café's one occurrence-scoped Task capability is an explicit guarded
 * exception in the route transform, never a navigation or command-menu entry.
 */
export function isShipGated(path: string): boolean {
  return isShipGatedInProfile(path, APP_RELEASE_PROFILE)
}

/** Profile-explicit form for build-profile tests and route transforms. */
export function isShipGatedInProfile(path: string, profile: ReleaseProfile): boolean {
  const pathname = path.split('#')[0].split('?')[0]
  return !isProfilePathAvailable(pathname, profile) ||
    SHIP_GATED_PATHS.some((gated) => pathname === gated || pathname.startsWith(gated + '/'))
}
