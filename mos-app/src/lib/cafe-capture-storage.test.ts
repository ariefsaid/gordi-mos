import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CAFE_CAPTURE_DRAFT_TTL_MS,
  cafeCaptureDraftStorageKey,
  clearCafeCaptureDraft,
  isCafeCaptureRequestId,
  listCafeCaptureDrafts,
  readCafeCaptureDraft,
  writeCafeCaptureDraft,
} from './cafe-capture-storage'
import type { CafeCaptureDraftScope } from './cafe-capture-storage'

const BASE_SCOPE: CafeCaptureDraftScope = {
  orgId: 'org-1',
  personId: 'person-1',
  form: 'production',
  branchId: 'branch-1',
  activity: 'kitchen',
  logDate: '2026-10-02',
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-02T10:00:00.000Z'))
})

afterEach(() => vi.useRealTimers())

describe('Cafe capture draft storage', () => {
  it('keys drafts by org, person, form, stream, and log date', () => {
    const otherDate = { ...BASE_SCOPE, logDate: '2026-10-01' }
    const otherStream = { ...BASE_SCOPE, activity: 'bar' }

    expect(cafeCaptureDraftStorageKey(BASE_SCOPE)).not.toBe(cafeCaptureDraftStorageKey(otherDate))
    expect(cafeCaptureDraftStorageKey(BASE_SCOPE)).not.toBe(cafeCaptureDraftStorageKey(otherStream))
    expect(cafeCaptureDraftStorageKey(BASE_SCOPE)).not.toBe(cafeCaptureDraftStorageKey({ ...BASE_SCOPE, personId: 'person-2' }))
  })

  it('lists other-date drafts without returning them from the current-date read', () => {
    writeCafeCaptureDraft({ ...BASE_SCOPE, logDate: '2026-10-01' }, { entries: ['yesterday'] })
    writeCafeCaptureDraft(BASE_SCOPE, { entries: ['today'] })
    writeCafeCaptureDraft({ ...BASE_SCOPE, activity: 'bar' }, { entries: ['other stream'] })

    expect(readCafeCaptureDraft<{ entries: string[] }>(BASE_SCOPE)?.value.entries).toEqual(['today'])
    expect(listCafeCaptureDrafts<{ entries: string[] }>('org-1', 'person-1', 'production'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ scope: { ...BASE_SCOPE, logDate: '2026-10-01' }, value: { entries: ['yesterday'] } }),
        expect.objectContaining({ scope: BASE_SCOPE, value: { entries: ['today'] } }),
        expect.objectContaining({ scope: { ...BASE_SCOPE, activity: 'bar' }, value: { entries: ['other stream'] } }),
      ]))
  })

  it('expires drafts after seven days and removes expired storage', () => {
    vi.setSystemTime(new Date(Date.now() - CAFE_CAPTURE_DRAFT_TTL_MS - 1))
    localStorage.setItem(cafeCaptureDraftStorageKey(BASE_SCOPE), JSON.stringify({
      version: 2,
      scope: BASE_SCOPE,
      value: { entries: ['old'] },
      updatedAt: new Date(Date.now() - CAFE_CAPTURE_DRAFT_TTL_MS - 1).toISOString(),
    }))
    vi.setSystemTime(new Date('2026-10-02T10:00:00.000Z'))

    expect(readCafeCaptureDraft(BASE_SCOPE)).toBeNull()
    expect(localStorage.getItem(cafeCaptureDraftStorageKey(BASE_SCOPE))).toBeNull()
  })

  it('clears only the exact stream and date draft', () => {
    const yesterday = { ...BASE_SCOPE, logDate: '2026-10-01' }
    writeCafeCaptureDraft(BASE_SCOPE, { entries: ['today'] })
    writeCafeCaptureDraft(yesterday, { entries: ['yesterday'] })

    clearCafeCaptureDraft(BASE_SCOPE)

    expect(readCafeCaptureDraft(BASE_SCOPE)).toBeNull()
    expect(readCafeCaptureDraft(yesterday)?.value).toEqual({ entries: ['yesterday'] })
  })
})

describe('isCafeCaptureRequestId', () => {
  it('accepts canonical UUIDs', () => {
    expect(isCafeCaptureRequestId('40000000-0000-0000-0000-000000000001')).toBe(true)
  })

  it.each([
    '------------------------------------',
    '40000000000000000000000000000001',
    'not-a-uuid',
    null,
  ])('rejects malformed persisted identities (%s)', value => {
    expect(isCafeCaptureRequestId(value)).toBe(false)
  })
})
