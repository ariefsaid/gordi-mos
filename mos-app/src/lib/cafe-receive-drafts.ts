import type { ProductionActivity } from '@/lib/db/kitchen-logs.types'

export type CafeReceiveDraftScope = {
  personId: string
  branchId: string
  activity: ProductionActivity
  arrivalDate: string
}

export type CafeReceiveDraftEntry = {
  quantity: string
  unitId: string
  damagedWrong: boolean
}

export type CafeReceiveDraftContent = {
  clientKey: string
  entries: Record<string, CafeReceiveDraftEntry>
}

type StoredDraft = CafeReceiveDraftScope & CafeReceiveDraftContent & { version: 1 }

const STORAGE_PREFIX = 'cafe.receive.draft.v1'

function storageKey(scope: CafeReceiveDraftScope): string {
  return [STORAGE_PREFIX, scope.personId, scope.branchId, scope.activity, scope.arrivalDate]
    .map((part, index) => index === 0 ? part : encodeURIComponent(part))
    .join(':')
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
    if (typeof entry.quantity !== 'string' || typeof entry.unitId !== 'string' || typeof entry.damagedWrong !== 'boolean') return null
    entries[itemId] = { quantity: entry.quantity, unitId: entry.unitId, damagedWrong: entry.damagedWrong }
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
    if (stored.version !== 1 || !isScope(stored, scope) || typeof stored.clientKey !== 'string' || !stored.clientKey) return null
    const entries = parseEntries(stored.entries)
    return entries ? { clientKey: stored.clientKey, entries } : null
  } catch {
    return null
  }
}

export function saveCafeReceiveDraft(
  scope: CafeReceiveDraftScope,
  draft: CafeReceiveDraftContent,
): boolean {
  const store = localStore()
  if (!store || !draft.clientKey || !parseEntries(draft.entries)) return false
  const value: StoredDraft = { version: 1, ...scope, ...draft }
  try {
    store.setItem(storageKey(scope), JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function clearCafeReceiveDraft(scope: CafeReceiveDraftScope): void {
  const store = localStore()
  if (!store) return
  try {
    store.removeItem(storageKey(scope))
  } catch {
    // Private browsing and device storage policies can deny even a remove; local drafts are best effort.
  }
}
