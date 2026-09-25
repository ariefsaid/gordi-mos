import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockEq, mockUpsert } = vi.hoisted(() => ({ mockEq: vi.fn(), mockUpsert: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: mockEq })), upsert: mockUpsert })),
  },
}))

import { supabase } from '@/lib/supabase'
import { readAccountLocale, saveAccountLocale } from './account-locale'

beforeEach(() => vi.clearAllMocks())

describe('account language data (#927)', () => {
  it('reads the account’s saved value from shared.person_preferences', async () => {
    mockEq.mockResolvedValue({ data: [{ locale: 'id' }], error: null })
    await expect(readAccountLocale('p1')).resolves.toBe('id')
    expect(supabase.from).toHaveBeenCalledWith('person_preferences')
    expect(mockEq).toHaveBeenCalledWith('person_id', 'p1')
  })

  it('no row, or a value outside the catalog, reads as no saved choice', async () => {
    mockEq.mockResolvedValue({ data: [], error: null })
    await expect(readAccountLocale('p1')).resolves.toBeNull()
    mockEq.mockResolvedValue({ data: [{ locale: 'fr' }], error: null })
    await expect(readAccountLocale('p1')).resolves.toBeNull()
  })

  it('a failed read throws instead of answering with a default', async () => {
    mockEq.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(readAccountLocale('p1')).rejects.toThrow('offline')
  })

  it('saves by upserting the one row keyed by the person', async () => {
    mockUpsert.mockResolvedValue({ error: null })
    await saveAccountLocale('p1', 'id')
    expect(mockUpsert).toHaveBeenCalledWith({ person_id: 'p1', locale: 'id' }, { onConflict: 'person_id' })
  })

  it('a failed save throws', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'denied' } })
    await expect(saveAccountLocale('p1', 'en')).rejects.toThrow('denied')
  })
})
