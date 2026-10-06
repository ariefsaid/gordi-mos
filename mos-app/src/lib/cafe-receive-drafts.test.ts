import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearCafeReceiveDraft,
  loadCafeReceiveDraft,
  saveCafeReceiveDraft,
  type CafeReceiveDraftScope,
} from './cafe-receive-drafts'

const SCOPE: CafeReceiveDraftScope = {
  personId: 'person-1', branchId: 'branch-1', activity: 'kitchen', arrivalDate: '2026-10-06',
}
const DRAFT = {
  clientKey: 'stable-retry-key',
  entries: {
    bean: { quantity: '2,5', unitId: 'unit-kg', damagedWrong: true },
  },
}

beforeEach(() => localStorage.clear())

describe('Café receive offline drafts', () => {
  it('AC-1039 persists an explicit local draft scoped by person, stream and arrival date', () => {
    expect(saveCafeReceiveDraft(SCOPE, DRAFT)).toBe(true)
    expect(loadCafeReceiveDraft(SCOPE)).toEqual(DRAFT)
    expect(loadCafeReceiveDraft({ ...SCOPE, personId: 'person-2' })).toBeNull()
    expect(loadCafeReceiveDraft({ ...SCOPE, activity: 'bar' })).toBeNull()
    expect(loadCafeReceiveDraft({ ...SCOPE, arrivalDate: '2026-10-05' })).toBeNull()
  })

  it('AC-1039 clearing one scope leaves other people and dates intact', () => {
    saveCafeReceiveDraft(SCOPE, DRAFT)
    const otherDate = { ...SCOPE, arrivalDate: '2026-10-05' }
    saveCafeReceiveDraft(otherDate, { clientKey: 'other-key', entries: {} })

    clearCafeReceiveDraft(SCOPE)

    expect(loadCafeReceiveDraft(SCOPE)).toBeNull()
    expect(loadCafeReceiveDraft(otherDate)).toEqual({ clientKey: 'other-key', entries: {} })
  })

  it('AC-1039 ignores corrupt or foreign-scope storage instead of restoring it', () => {
    const key = 'cafe.receive.draft.v1:person-1:branch-1:kitchen:2026-10-06'
    localStorage.setItem(key, '{not json')
    expect(loadCafeReceiveDraft(SCOPE)).toBeNull()
    localStorage.setItem(key, JSON.stringify({ version: 1, ...SCOPE, ...DRAFT, personId: 'person-2' }))
    expect(loadCafeReceiveDraft(SCOPE)).toBeNull()
  })
})
