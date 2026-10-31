import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cafeReceiptExplanationDraftIds,
  pruneCafeReceiptExplanationDrafts,
  readCafeReceiptExplanationDrafts,
  writeCafeReceiptExplanationDrafts,
} from './cafe-receipt-explanation-draft'

const DRAFT = { line: { conditions: ['damaged_wrong'] as ['damaged_wrong'], condition_reason: 'Seal torn', serverUpdatedAt: null } }

beforeEach(() => localStorage.clear())

describe('receipt explanation cleanup', () => {
  it('enumerates every stored receipt only for the current person, including older drafts', () => {
    writeCafeReceiptExplanationDrafts('me', 'old', DRAFT)
    writeCafeReceiptExplanationDrafts('me', 'recent', DRAFT)
    writeCafeReceiptExplanationDrafts('other', 'private', DRAFT)
    localStorage.setItem('unrelated', 'kept')
    expect(cafeReceiptExplanationDraftIds('me').sort()).toEqual(['old', 'recent'])
  })

  it.each(['Submitted', 'Approved', 'Rejected'])('removes a %s receipt while preserving Counted and unchecked drafts', status => {
    for (const id of ['old', 'counted', 'unchecked']) writeCafeReceiptExplanationDrafts('me', id, DRAFT)
    pruneCafeReceiptExplanationDrafts('me', [{ id: 'old', status }, { id: 'counted', status: 'Counted' }])
    expect(readCafeReceiptExplanationDrafts('me', 'old')).toEqual({})
    expect(cafeReceiptExplanationDraftIds('me').sort()).toEqual(['counted', 'unchecked'])
  })

  it('keeps receiving usable when device storage is unavailable', () => {
    const keys = vi.spyOn(Storage.prototype, 'key').mockImplementation(() => { throw new Error('disabled') })
    localStorage.setItem('unrelated', 'kept')
    expect(cafeReceiptExplanationDraftIds('me')).toEqual([])
    keys.mockRestore()
  })
})
