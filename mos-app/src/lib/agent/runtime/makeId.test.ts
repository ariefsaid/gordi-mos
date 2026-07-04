// CQ#4 — the shared client-side id generator (crypto.randomUUID with a Math.random fallback).
// Extracted so mosNativeRuntime.ts and useAssistantPanel.ts import ONE implementation instead of
// each carrying its own copy. (handler.ts's copy is a separate Deno/Node boundary — no shared
// module there, by design.)
import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeId } from './makeId'

describe('makeId (CQ#4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a crypto.randomUUID() value when crypto.randomUUID is available', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-uuid-1234' })
    expect(makeId()).toBe('fixed-uuid-1234')
  })

  it('falls back to a non-empty random string when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {})
    const id = makeId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('produces distinct ids across calls (fallback path)', () => {
    vi.stubGlobal('crypto', {})
    const a = makeId()
    const b = makeId()
    expect(a).not.toBe(b)
  })
})
