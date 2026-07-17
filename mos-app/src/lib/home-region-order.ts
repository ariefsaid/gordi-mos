// home-region-order.ts — per-user Home region order (OD-REDESIGN-18, Step 5 Track P).
// v1 store = localStorage (RATIFY-1, spec §7.1); one-line swap to a Personal-Profile column later.
// Guarded against private-mode/quota throws — always resolves to a valid order (NFR-501).

export type HomeRegionOrder = 'attention-first' | 'personal-first'
const DEFAULT: HomeRegionOrder = 'attention-first'
const key = (personId: string) => `gordi.home.regionOrder.${personId}`

/** Resolve the stored order for a person, or the default when nothing is stored/valid. */
export function resolveRegionOrder(personId: string): HomeRegionOrder {
  try {
    const v = window.localStorage.getItem(key(personId))
    return v === 'personal-first' || v === 'attention-first' ? v : DEFAULT
  } catch {
    return DEFAULT
  }
}
