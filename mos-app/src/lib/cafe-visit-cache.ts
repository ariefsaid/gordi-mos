// What a Café visit reads once and every Café page reuses: the active Locations
// and where each stream may send. Before this, every page re-read them.
//
// Scoped to the signed-in person (a different person starts clean), expires after a few minutes so a
// long-open tab still picks up changes made elsewhere, and is cleared by the admin screens that change
// Locations or routes (the routes themselves are read by their own admin screen). A failed read is never kept.
import { listCafeDestinationLocations, listCafeLocations, type CafeLocation, type DestinationLocation } from '@/lib/db/cafe-locations'

const TTL_MS = 5 * 60_000

type Slot = { at: number; value: Promise<unknown> }
let owner: string | null = null
const slots = new Map<string, Slot>()

function once<T>(viewerId: string | null, key: string, load: () => Promise<T>): Promise<T> {
  if (owner !== viewerId) { slots.clear(); owner = viewerId }
  const found = slots.get(key)
  if (found && Date.now() - found.at < TTL_MS) return found.value as Promise<T>
  const value = load()
  slots.set(key, { at: Date.now(), value })
  value.catch(() => { if (slots.get(key)?.value === value) slots.delete(key) })
  return value
}

/** Forget everything read so far (after a Location or route change, and between tests). */
export function clearCafeVisitCache(): void {
  slots.clear()
  owner = null
}

export const getCafeLocations = (viewerId: string | null): Promise<CafeLocation[]> =>
  once(viewerId, 'locations', () => listCafeLocations({ archived: false }))

export const getCafeDestinationLocations = (viewerId: string | null, branchId: string, activity: string): Promise<DestinationLocation[]> =>
  once(viewerId, `destinations:${branchId}|${activity}`, () => listCafeDestinationLocations(branchId, activity))
