import { describe, it, expect } from 'vitest'
import type { AttentionItem } from './home-attention'
import { attentionCount, wibToday } from './home-attention'

describe('attentionCount', () => {
  it('sums items across lanes', () => {
    const a: AttentionItem = { id: 'a', title: 'a', route: '/x' }
    const b: AttentionItem = { id: 'b', title: 'b', route: '/x' }
    const c: AttentionItem = { id: 'c', title: 'c', route: '/x' }
    const d: AttentionItem = { id: 'd', title: 'd', route: '/x' }

    expect(attentionCount([{ items: [a, b] }, { items: [c] }, { items: [] }, { items: [d] }])).toBe(4)
  })
})

describe('wibToday', () => {
  it('formats a UTC instant as its Asia/Jakarta (UTC+7) calendar date', () => {
    // 2026-07-15T18:00:00Z is 2026-07-16 01:00 WIB — crosses the UTC day boundary.
    expect(wibToday(new Date('2026-07-15T18:00:00Z'))).toBe('2026-07-16')
  })
})
