import { getReadScope } from '@/lib/scoped-reads'

// Tiny stale-while-revalidate cache for reference data (objectives, work lines, people, business
// units — #1359): the palette/pickers re-read these lists on every mount even though they change
// a few times a day. Serve the last copy at once, refresh past the TTL in the background. Keys
// carry the read scope, so a login/logout/role change can never serve another viewer's rows.
// Admin writes invalidate explicitly (see invalidateReferenceCache). No new dependency — this is
// the house module-store pattern (use-rail-collapse-pref.ts) with a TTL.

interface Entry { data: unknown; fetchedAt: number }

const TTL_MS = 60_000
const cache = new Map<string, Entry>()
const inFlight = new Map<string, Promise<unknown>>()
let activeScope: string | null = null

function scopeKey(name: string): string | null {
  const scope = getReadScope()
  if (!scope) {
    if (activeScope !== null) {
      cache.clear()
      inFlight.clear()
      activeScope = null
    }
    return null
  }
  const identity = `${scope.generation}:${scope.authUserId}:${scope.viewerId}:${scope.orgId}:${scope.authorityKey}`
  if (identity !== activeScope) {
    cache.clear()
    inFlight.clear()
    activeScope = identity
  }
  return `${identity}:${name}`
}

/** SWR read: fresh cache → serve; stale cache → serve stale + revalidate in the background;
 * miss → await the load. Null scope (pre-auth/tests) bypasses the cache entirely. */
export function withReferenceCache<T>(name: string, load: () => Promise<T>): Promise<T> {
  const key = scopeKey(name)
  if (!key) return load()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return Promise.resolve(structuredClone(hit.data) as T)

  const pending = inFlight.get(key)
  if (pending) return hit ? Promise.resolve(structuredClone(hit.data) as T) : pending as Promise<T>

  const refresh = load()
    .then((data) => {
      // A write may invalidate this key while the request is in flight. Only the newest request
      // may repopulate the cache after that invalidation.
      if (inFlight.get(key) === refresh) {
        cache.set(key, { data, fetchedAt: Date.now() })
        inFlight.delete(key)
      }
      return data
    })
    .catch((error) => {
      if (inFlight.get(key) === refresh) inFlight.delete(key)
      throw error
    })
  inFlight.set(key, refresh)

  if (hit) {
    refresh.catch(() => {}) // the background refresh's failure must not be unhandled; caller has stale data
    return Promise.resolve(structuredClone(hit.data) as T)
  }
  return refresh as Promise<T>
}

/** Admin writes invalidate by prefix so the next read hits the wire ('mos.objectives', 'mos.work_lines', 'shared.people'). */
export function invalidateReferenceCache(prefix?: string): void {
  for (const key of cache.keys()) {
    if (!prefix || key.includes(`:${prefix}`)) cache.delete(key)
  }
  for (const key of inFlight.keys()) {
    if (!prefix || key.includes(`:${prefix}`)) inFlight.delete(key)
  }
}

export function __resetReferenceCacheForTests(): void {
  cache.clear()
  inFlight.clear()
  activeScope = null
}