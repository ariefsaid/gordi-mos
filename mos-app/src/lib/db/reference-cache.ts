import { getReadScope } from '@/lib/scoped-reads'

// Tiny stale-while-revalidate cache for reference data (objectives, work lines, people, business
// units — #1359): the palette/pickers re-read these lists on every mount even though they change
// a few times a day. Serve the last copy at once, refresh past the TTL in the background. Keys
// carry the read scope, so a login/logout/role change can never serve another viewer's rows.
// Admin writes invalidate explicitly (see invalidateReferenceCache). No new dependency — this is
// the house module-store pattern (use-rail-collapse-pref.ts) with a TTL.

interface Entry { data: unknown; fetchedAt: number }

export interface ReferenceCacheOptions {
  /** Stable identity for reads made before an authenticated read scope is published. */
  identity?: string
  /** Keep the entry for this browser tab across full page loads. */
  persist?: boolean
  /** Wait for an expired entry to refresh rather than returning it stale. */
  staleWhileRevalidate?: boolean
}

const TTL_MS = 60_000
const STORAGE_PREFIX = 'mos.reference-cache:'
const cache = new Map<string, Entry>()
const inFlight = new Map<string, Promise<unknown>>()
let activeScope: string | null = null

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(key)}`
}

function readPersistentEntry(key: string): Entry | undefined {
  const storage = sessionStorageOrNull()
  if (!storage) return undefined
  try {
    const raw = storage.getItem(storageKey(key))
    if (!raw) return undefined
    const value = JSON.parse(raw) as Partial<Entry>
    if (typeof value.fetchedAt !== 'number' || !Object.hasOwn(value, 'data')) {
      storage.removeItem(storageKey(key))
      return undefined
    }
    return { data: value.data, fetchedAt: value.fetchedAt }
  } catch {
    return undefined
  }
}

function writePersistentEntry(key: string, entry: Entry): void {
  try {
    sessionStorageOrNull()?.setItem(storageKey(key), JSON.stringify(entry))
  } catch {
    // Storage is an optional extension of the in-memory cache.
  }
}

function removePersistentEntries(prefix?: string): void {
  const storage = sessionStorageOrNull()
  if (!storage) return
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index)
    if (!key?.startsWith(STORAGE_PREFIX)) continue
    let cacheKey: string
    try {
      cacheKey = decodeURIComponent(key.slice(STORAGE_PREFIX.length))
    } catch {
      storage.removeItem(key)
      continue
    }
    if (!prefix || cacheKey.includes(`:${prefix}`)) storage.removeItem(key)
  }
}

function scopeKey(name: string, overrideIdentity?: string): string | null {
  if (overrideIdentity) return `${overrideIdentity}:${name}`
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
export function withReferenceCache<T>(
  name: string,
  load: () => Promise<T>,
  options: ReferenceCacheOptions = {},
): Promise<T> {
  const key = scopeKey(name, options.identity)
  if (!key) return load()
  const hit = cache.get(key) ?? (options.persist ? readPersistentEntry(key) : undefined)
  if (hit && !cache.has(key)) cache.set(key, hit)
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return Promise.resolve(structuredClone(hit.data) as T)

  const pending = inFlight.get(key)
  if (pending) {
    return hit && options.staleWhileRevalidate !== false
      ? Promise.resolve(structuredClone(hit.data) as T)
      : pending as Promise<T>
  }

  const refresh = load()
    .then((data) => {
      // A write may invalidate this key while the request is in flight. Only the newest request
      // may repopulate the cache after that invalidation.
      if (inFlight.get(key) === refresh) {
        const entry = { data, fetchedAt: Date.now() }
        cache.set(key, entry)
        if (options.persist) writePersistentEntry(key, entry)
        inFlight.delete(key)
      }
      return data
    })
    .catch((error) => {
      if (inFlight.get(key) === refresh) inFlight.delete(key)
      throw error
    })
  inFlight.set(key, refresh)

  if (hit && options.staleWhileRevalidate !== false) {
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
  removePersistentEntries(prefix)
}

export function __resetReferenceCacheForTests(clearPersistent = true): void {
  cache.clear()
  inFlight.clear()
  activeScope = null
  if (clearPersistent) removePersistentEntries()
}