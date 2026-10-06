import type { ProductionActivity } from '@/lib/db/kitchen-logs.types'

export type CafeReceiveDraftScope = {
  personId: string
  branchId: string
  activity: ProductionActivity
  arrivalDate: string
}

export type CafeReceiveDraftEntry = {
  /** The item's name when it was counted, to say which line could not be restored. */
  name: string
  quantity: string
  unitId: string
  damagedWrong: boolean
}

export type CafeReceiveDraftContent = {
  clientKey: string
  entries: Record<string, CafeReceiveDraftEntry>
}

type StoredDraft = CafeReceiveDraftScope & CafeReceiveDraftContent & { version: 2; savedAt: number }

const STORAGE_PREFIX = 'mos.cafe.receiveDrafts.v2'
/** The first, unshipped key shape; anything left under it is deleted, never restored. */
const LEGACY_PREFIX = 'cafe.receive.draft.v1:'
/** An unsent count older than this is dropped from the device. */
export const CAFE_RECEIVE_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function storageKey(scope: CafeReceiveDraftScope): string {
  return [STORAGE_PREFIX, scope.personId, scope.branchId, scope.activity, scope.arrivalDate]
    .map((part, index) => index === 0 ? part : encodeURIComponent(part))
    .join('.')
}

function localStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function isScope(value: Record<string, unknown>, scope: CafeReceiveDraftScope): boolean {
  return value.personId === scope.personId
    && value.branchId === scope.branchId
    && value.activity === scope.activity
    && value.arrivalDate === scope.arrivalDate
}

function parseEntries(value: unknown): Record<string, CafeReceiveDraftEntry> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const entries: Record<string, CafeReceiveDraftEntry> = {}
  for (const [itemId, raw] of Object.entries(value)) {
    if (!itemId || raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
    const entry = raw as Record<string, unknown>
    if (typeof entry.name !== 'string' || typeof entry.quantity !== 'string' || typeof entry.unitId !== 'string'
      || typeof entry.damagedWrong !== 'boolean') return null
    entries[itemId] = { name: entry.name, quantity: entry.quantity, unitId: entry.unitId, damagedWrong: entry.damagedWrong }
  }
  return entries
}

export function loadCafeReceiveDraft(scope: CafeReceiveDraftScope): CafeReceiveDraftContent | null {
  const store = localStore()
  if (!store) return null
  try {
    const raw = store.getItem(storageKey(scope))
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
    const stored = value as Record<string, unknown>
    if (stored.version !== 2 || !isScope(stored, scope) || typeof stored.clientKey !== 'string' || !stored.clientKey) return null
    const entries = parseEntries(stored.entries)
    return entries ? { clientKey: stored.clientKey, entries } : null
  } catch {
    return null
  }
}

export function saveCafeReceiveDraft(
  scope: CafeReceiveDraftScope,
  draft: CafeReceiveDraftContent,
  now = Date.now(),
): boolean {
  const store = localStore()
  if (!store || !draft.clientKey || !parseEntries(draft.entries)) return false
  const value: StoredDraft = { version: 2, savedAt: now, ...scope, ...draft }
  try {
    store.setItem(storageKey(scope), JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function clearCafeReceiveDraft(scope: CafeReceiveDraftScope): void {
  try {
    localStore()?.removeItem(storageKey(scope))
  } catch {
    // Private browsing and device storage policies can deny even a remove; local drafts are best effort.
  }
}

function draftKeys(store: Storage): string[] {
  return Array.from({ length: store.length }, (_, index) => store.key(index))
    .filter((key): key is string => key !== null && (key.startsWith(`${STORAGE_PREFIX}.`) || key.startsWith(LEGACY_PREFIX)))
}

/** Remove every person's unsent counts from this device, for sign-out on a shared phone. */
export function clearAllCafeReceiveDrafts(): void {
  const store = localStore()
  if (!store) return
  try {
    for (const key of draftKeys(store)) store.removeItem(key)
  } catch { /* storage disabled: nothing was kept */ }
}

/** Drop legacy keys and drafts not saved within the last seven days. */
export function pruneCafeReceiveDrafts(now = Date.now()): void {
  const store = localStore()
  if (!store) return
  try {
    for (const key of draftKeys(store)) {
      let savedAt: unknown = null
      if (key.startsWith(`${STORAGE_PREFIX}.`)) {
        try { savedAt = (JSON.parse(store.getItem(key) ?? 'null') as Record<string, unknown> | null)?.savedAt } catch { /* unreadable */ }
      }
      if (typeof savedAt !== 'number' || now - savedAt > CAFE_RECEIVE_DRAFT_MAX_AGE_MS) store.removeItem(key)
    }
  } catch { /* storage disabled: nothing was kept */ }
}
