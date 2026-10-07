import { beforeEach, describe, expect, it } from 'vitest'
import {
  CAFE_RECEIVE_DRAFT_MAX_AGE_MS,
  clearAllCafeReceiveDrafts,
  clearCafeReceiveDraft,
  loadCafeReceiveDraft,
  pruneCafeReceiveDrafts,
  saveCafeReceiveDraft,
  type CafeReceiveDraftScope,
} from './cafe-receive-drafts'

const SCOPE: CafeReceiveDraftScope = {
  personId: 'person-1', branchId: 'branch-1', activity: 'kitchen', arrivalDate: '2026-10-06',
}
const DRAFT = {
  clientKey: 'stable-retry-key',
  entries: {
    bean: { name: 'Coffee bean', quantity: '2,5', unitId: 'unit-kg', damagedWrong: true },
  },
}
const draftKeys = () => Object.keys(localStorage).filter(key => key.includes('receiveDrafts') || key.startsWith('cafe.receive.'))

beforeEach(() => localStorage.clear())

describe('Café receive offline drafts', () => {
  it('AC-1006 persists an explicit local draft scoped by person, stream and arrival date', () => {
    expect(saveCafeReceiveDraft(SCOPE, DRAFT)).toBe(true)
    expect(loadCafeReceiveDraft(SCOPE)).toEqual(DRAFT)
    expect(loadCafeReceiveDraft({ ...SCOPE, personId: 'person-2' })).toBeNull()
    expect(loadCafeReceiveDraft({ ...SCOPE, activity: 'bar' })).toBeNull()
    expect(loadCafeReceiveDraft({ ...SCOPE, arrivalDate: '2026-10-05' })).toBeNull()
    expect(draftKeys()).toEqual(['mos.cafe.receiveDrafts.v2.person-1.branch-1.kitchen.2026-10-06'])
  })

  it('AC-1006 clearing one scope leaves other people and dates intact', () => {
    saveCafeReceiveDraft(SCOPE, DRAFT)
    const otherDate = { ...SCOPE, arrivalDate: '2026-10-05' }
    saveCafeReceiveDraft(otherDate, { clientKey: 'other-key', entries: {} })

    clearCafeReceiveDraft(SCOPE)

    expect(loadCafeReceiveDraft(SCOPE)).toBeNull()
    expect(loadCafeReceiveDraft(otherDate)).toEqual({ clientKey: 'other-key', entries: {} })
  })

  it('AC-1006 ignores corrupt, foreign-scope or old-version storage instead of restoring it', () => {
    const key = 'mos.cafe.receiveDrafts.v2.person-1.branch-1.kitchen.2026-10-06'
    localStorage.setItem(key, '{not json')
    expect(loadCafeReceiveDraft(SCOPE)).toBeNull()
    localStorage.setItem(key, JSON.stringify({ version: 2, savedAt: 1, ...SCOPE, ...DRAFT, personId: 'person-2' }))
    expect(loadCafeReceiveDraft(SCOPE)).toBeNull()
    localStorage.setItem(key, JSON.stringify({ version: 1, ...SCOPE, ...DRAFT }))
    expect(loadCafeReceiveDraft(SCOPE)).toBeNull()
  })

  it('AC-1006 clearing the device removes every person’s drafts, the first key shape included, and nothing else', () => {
    saveCafeReceiveDraft(SCOPE, DRAFT)
    saveCafeReceiveDraft({ ...SCOPE, personId: 'person-2' }, DRAFT)
    localStorage.setItem('cafe.receive.draft.v1:person-1:branch-1:kitchen:2026-10-06', '{}')
    localStorage.setItem('mos.tasks.groupBy', 'owner')

    clearAllCafeReceiveDrafts()

    expect(draftKeys()).toEqual([])
    expect(localStorage.getItem('mos.tasks.groupBy')).toBe('owner')
  })

  it('AC-1006 a draft not saved for seven days, and any first-shape key, is pruned; a recent one stays', () => {
    const now = Date.parse('2026-10-14T00:00:00Z')
    saveCafeReceiveDraft(SCOPE, DRAFT, now - CAFE_RECEIVE_DRAFT_MAX_AGE_MS - 1)
    const recent = { ...SCOPE, arrivalDate: '2026-10-13' }
    saveCafeReceiveDraft(recent, DRAFT, now - 60_000)
    localStorage.setItem('cafe.receive.draft.v1:person-1:branch-1:kitchen:2026-10-13', '{}')

    pruneCafeReceiveDrafts(now)

    expect(loadCafeReceiveDraft(SCOPE)).toBeNull()
    expect(loadCafeReceiveDraft(recent)).toEqual(DRAFT)
    expect(draftKeys()).toEqual(['mos.cafe.receiveDrafts.v2.person-1.branch-1.kitchen.2026-10-13'])
  })
})
