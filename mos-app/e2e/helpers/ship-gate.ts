// The ship gate (issue 444), re-exported for the e2e suite.
//
// A journey whose surface is ship-gated cannot be walked: the router forwards every entry point
// home and the nav offers no door. Those specs are SKIPPED on this predicate rather than deleted
// or rewritten — the journey they encode is still true of the built surface, it is simply not
// reachable while the surface is hidden, and deleting a path from `SHIP_GATED_PATHS` un-skips them
// with no edit here.
//
// Imported from the app's own module, never re-listed: a second copy of the list is exactly the
// drift the gate exists to prevent.
export { isShipGated, SHIP_GATED_PATHS } from '../../src/lib/ship-gate'
