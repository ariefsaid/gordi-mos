export type CafeCaptureForm = 'production' | 'transfer' | 'waste'

export const CAFE_CAPTURE_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface CafeCaptureDraftScope {
  orgId: string
  personId: string
  form: CafeCaptureForm
  branchId: string
  activity: string
  logDate: string
}

export interface StoredCafeCaptureDraft<T> {
  scope: CafeCaptureDraftScope
  value: T
  updatedAt: string
}

const STORAGE_PREFIX = 'mos:cafe:capture-draft:v2'

function encode(value: string): string {
  return encodeURIComponent(value)
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isScope(value: unknown): value is CafeCaptureDraftScope {
  if (!value || typeof value !== 'object') return false
  const scope = value as Partial<CafeCaptureDraftScope>
  return typeof scope.orgId === 'string' && scope.orgId.length > 0
    && typeof scope.personId === 'string' && scope.personId.length > 0
    && (scope.form === 'production' || scope.form === 'transfer' || scope.form === 'waste')
    && typeof scope.branchId === 'string' && scope.branchId.length > 0
    && (scope.activity === 'kitchen' || scope.activity === 'bar')
    && typeof scope.logDate === 'string' && isDate(scope.logDate)
}

function scopePrefix(orgId: string, personId: string, form: CafeCaptureForm): string {
  return `${STORAGE_PREFIX}:${encode(orgId)}:${encode(personId)}:${form}:`
}

export function cafeCaptureDraftStorageKey(scope: CafeCaptureDraftScope): string {
  if (!isScope(scope)) throw new Error('Invalid Café capture draft scope')
  return `${scopePrefix(scope.orgId, scope.personId, scope.form)}${encode(scope.branchId)}:${encode(scope.activity)}:${scope.logDate}`
}

function parseScopeFromKey(key: string): CafeCaptureDraftScope | null {
  const prefix = `${STORAGE_PREFIX}:`
  if (!key.startsWith(prefix)) return null
  const parts = key.slice(prefix.length).split(':')
  if (parts.length !== 6) return null
  const [org, person, form, branch, activity, logDate] = parts
  const decoded = [org, person, branch, activity].map(part => decode(part ?? ''))
  if (decoded.some(part => part === null)) return null
  const scope = {
    orgId: decoded[0]!,
    personId: decoded[1]!,
    form,
    branchId: decoded[2]!,
    activity: decoded[3]!,
    logDate,
  }
  return isScope(scope) ? scope : null
}

function readByKey<T>(key: string, expectedScope?: CafeCaptureDraftScope, now = Date.now()): StoredCafeCaptureDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return null
    const envelope = JSON.parse(raw) as Partial<StoredCafeCaptureDraft<T>> & { version?: number }
    const keyScope = parseScopeFromKey(key)
    if (envelope.version !== 2 || !isScope(envelope.scope) || !keyScope
      || cafeCaptureDraftStorageKey(envelope.scope) !== cafeCaptureDraftStorageKey(keyScope)
      || (expectedScope && cafeCaptureDraftStorageKey(envelope.scope) !== cafeCaptureDraftStorageKey(expectedScope))
      || typeof envelope.updatedAt !== 'string') {
      window.localStorage.removeItem(key)
      return null
    }
    const updatedAtMs = Date.parse(envelope.updatedAt)
    if (!Number.isFinite(updatedAtMs) || updatedAtMs > now || now - updatedAtMs >= CAFE_CAPTURE_DRAFT_TTL_MS) {
      window.localStorage.removeItem(key)
      return null
    }
    return { scope: envelope.scope, value: envelope.value as T, updatedAt: envelope.updatedAt }
  } catch {
    return null
  }
}

export function readCafeCaptureDraft<T>(scope: CafeCaptureDraftScope): StoredCafeCaptureDraft<T> | null {
  try {
    return readByKey<T>(cafeCaptureDraftStorageKey(scope), scope)
  } catch {
    return null
  }
}

export function listCafeCaptureDrafts<T>(
  orgId: string,
  personId: string,
  form: CafeCaptureForm,
): StoredCafeCaptureDraft<T>[] {
  try {
    const prefix = scopePrefix(orgId, personId, form)
    const records: StoredCafeCaptureDraft<T>[] = []
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    for (const key of keys) {
      if (!key?.startsWith(prefix)) continue
      const record = readByKey<T>(key)
      if (record) records.push(record)
    }
    return records.sort((a, b) => b.scope.logDate.localeCompare(a.scope.logDate)
      || b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

export function writeCafeCaptureDraft<T>(scope: CafeCaptureDraftScope, value: T): string | null {
  try {
    const updatedAt = new Date().toISOString()
    window.localStorage.setItem(cafeCaptureDraftStorageKey(scope), JSON.stringify({
      version: 2,
      scope,
      value,
      updatedAt,
    }))
    return updatedAt
  } catch {
    // The capture form remains usable when browser storage is unavailable or full.
    return null
  }
}

export function clearCafeCaptureDraft(scope: CafeCaptureDraftScope): void {
  try {
    window.localStorage.removeItem(cafeCaptureDraftStorageKey(scope))
  } catch {
    // Clearing a best-effort draft must not interfere with a confirmed write.
  }
}

export function isCafeCaptureRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
