export type CafeCaptureForm = 'production' | 'transfer' | 'waste'

export function isCafeCaptureRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function cafeCaptureDraftStorageKey(form: CafeCaptureForm, orgId: string, personId: string): string {
  return `mos:cafe:capture-draft:v1:${orgId}:${personId}:${form}`
}

export function readCafeCaptureDraft<T>(form: CafeCaptureForm, orgId: string, personId: string): T | null {
  try {
    const value = window.localStorage.getItem(cafeCaptureDraftStorageKey(form, orgId, personId))
    return value === null ? null : JSON.parse(value) as T
  } catch {
    return null
  }
}

export function writeCafeCaptureDraft<T>(form: CafeCaptureForm, orgId: string, personId: string, draft: T): void {
  try {
    window.localStorage.setItem(cafeCaptureDraftStorageKey(form, orgId, personId), JSON.stringify(draft))
  } catch {
    // The capture form remains usable when browser storage is unavailable or full.
  }
}

export function clearCafeCaptureDraft(form: CafeCaptureForm, orgId: string, personId: string): void {
  try {
    window.localStorage.removeItem(cafeCaptureDraftStorageKey(form, orgId, personId))
  } catch {
    // Clearing a best-effort draft must not interfere with a confirmed write.
  }
}
