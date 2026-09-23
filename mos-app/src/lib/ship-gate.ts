/**
 * SHIP GATE — build-time visibility for surfaces that are BUILT but outside the MVP payload.
 *
 * The MVP payload is Tasks + Signals + Café production (owner, 2026-08-24). Everything else that
 * already works stays in the tree and stays invisible, so it can merge to `dev` instead of ageing
 * on a branch — holding scope on branches is the expensive way to not ship something, and two
 * green sibling PRs have already broken `dev` once between them.
 *
 * **One array, one predicate.** The list below is the whole switch. It is honored by the ROUTER
 * (a gated path does not route — it forwards to Home, and its component never mounts) and by the
 * NAV (`isLive` / `visibleSections` / `sectionForPath` in `shell/`, the authorities every nav
 * surface already reads). Everything a gated surface orphans — Home's Objectives door, the ⌘K
 * palette, the breadcrumb — asks THIS predicate rather than growing its own hardcoded check.
 *
 * It sits **above** capabilities and access roles, never beside them: a gated surface is closed to
 * everyone regardless of role, so no test or review ever has to ask "gated for whom?".
 *
 * **A build-time constant, deliberately.** No table, no RLS, no admin toggle, no per-user state,
 * no cache to invalidate. At switch day the constant becomes a read and nothing else changes.
 *
 * **Visibility, never removal.** Nothing here is deleted. Deleting a path from the array restores
 * its surface — route, rail, drawer, palette, breadcrumb — with no other edit.
 */
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
 * Matches a gated path exactly OR anything beneath it, so gating a root gates its whole subtree
 * and nobody has to remember to list `/money/detail` beside `/money`. Query strings and hashes are
 * stripped first — `/money?tab=detail` is the same surface as `/money`.
 *
 * Route-table params (`:taskId`) and the `*` catch-all are ordinary strings here: neither can
 * prefix-match a gated root, so both fall through as ungated, which is the correct answer.
 */
export function isShipGated(path: string): boolean {
  const pathname = path.split('#')[0].split('?')[0]
  return SHIP_GATED_PATHS.some((gated) => pathname === gated || pathname.startsWith(gated + '/'))
}
