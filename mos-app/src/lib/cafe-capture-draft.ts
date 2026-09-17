// How much unsubmitted capture the Café Log is holding right now, readable by the module root.
//
// The root owns the location switch; the capture form owns the typed quantities. Switching
// location discards those quantities — correctly, because a typed number belongs to the stream it
// was typed against — but the root cannot see them, so it discarded them without asking. A person
// mid-count lost their work to a button that gave no warning.
//
// Deliberately the same shape as `cafe-stream.ts` and `cafe-opening-location.ts`: a module-level
// value, not a context. The root and the capture form are sibling elements under different route
// gates, so a provider would have to be hoisted into the router above both. This is one number
// and it is only ever read at the moment of a switch.
//
// NOT persisted. A draft lives in component state and dies with it; a count that outlived its
// form would make the root warn about work that no longer exists.

let stagedCount = 0

/** The capture form reports what it is holding. Called as staged quantities change. */
export function setCafeDraftCount(count: number): void {
  stagedCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

/** What the capture form is holding, for a caller about to discard it. */
export function cafeDraftCount(): number {
  return stagedCount
}

/** The form unmounted, or its draft was submitted or discarded. */
export function clearCafeDraftCount(): void {
  stagedCount = 0
}
