import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn() }))
vi.mock('@/lib/db/default-stream', () => ({ fetchDefaultStream: vi.fn() }))
vi.mock('@/lib/db/kitchen-logs', async () => {
  // `streamCatalogFrom` is pure catalog arithmetic, not IO — the hook's job is to feed it the
  // right rows, so the real one stays and only the read is mocked.
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  return { ...actual, listStreamPairs: vi.fn() }
})

import { listActiveBranches } from '@/lib/db/branches'
import { fetchDefaultStream } from '@/lib/db/default-stream'
import { listStreamPairs } from '@/lib/db/kitchen-logs'
import { rememberStream, rememberedStreamKey } from '@/lib/cafe-stream'
import { useCafeStream } from './use-cafe-stream'

/**
 * useCafeStream (issue 456) — the bootstrap five Café surfaces used to each carry a copy of.
 *
 * The behaviour it owns is #440's and is proven there (cafe-stream.test.ts for the decision,
 * each page's suite + cafe-stream-walk for the surfaces). What is proven HERE is the seam the
 * extraction introduced, because that is the part the pages can no longer see: `resolve()`
 * must read and decide WITHOUT touching state, so a bootstrap that a newer switch has already
 * superseded cannot land behind its caller's guard.
 */
const BRANCH_RR = { id: 'b-rr', code: 'rumah_rames', name: 'Rumah Rames' }
const BRANCH_RAD = { id: 'b-rad', code: 'radiant', name: 'Radiant' }
const BRANCHES = [BRANCH_RAD, BRANCH_RR]
const PAIRS = BRANCHES.flatMap(b => [
  { branch_id: b.id, activity: 'kitchen' as const },
  { branch_id: b.id, activity: 'bar' as const },
])
const RADIANT_BAR = { branch: BRANCH_RAD, activity: 'bar' as const }

beforeEach(() => {
  vi.clearAllMocks()
  rememberStream(null)
  vi.mocked(listActiveBranches).mockResolvedValue(BRANCHES)
  vi.mocked(listStreamPairs).mockResolvedValue(PAIRS)
  vi.mocked(fetchDefaultStream).mockResolvedValue(RADIANT_BAR)
})

describe('useCafeStream — the shared Café bootstrap', () => {
  it('resolves the six-stream catalog and the module stream, and leaves state untouched', async () => {
    const { result } = renderHook(() => useCafeStream())

    const resolved = await act(async () => result.current.resolve())

    expect(resolved.options).toHaveLength(4) // two branches × two activities, from the pairs
    expect(resolved.branches).toEqual(BRANCHES)
    expect(resolved.stream).toEqual(RADIANT_BAR)
    // The seam: nothing is on screen until the caller adopts it, so a superseded read is
    // simply dropped rather than pairing one stream's name with another stream's rows.
    expect(result.current.stream).toBeNull()
    expect(result.current.options).toEqual([])
    expect(result.current.branches).toEqual([])
  })

  it('adopt() is what puts a resolved catalog on screen', async () => {
    const { result } = renderHook(() => useCafeStream())
    const resolved = await act(async () => result.current.resolve())

    act(() => result.current.adopt(resolved))

    await waitFor(() => expect(result.current.stream).toEqual(RADIANT_BAR))
    expect(result.current.options).toHaveLength(4)
  })

  // A test that claimed to prove supersession used to sit here. It did not: it resolved a stale
  // read, adopted only the FRESH one, and dropped the stale with `void` — so it asserted exactly
  // what the adopt() case above already asserts, and could not have gone red if the seam broke.
  // Deleted rather than reworded. The hook cannot enforce what a caller does with a value it
  // returns; what it guarantees is that resolve() alone never touches state (first case above).
  // Supersession is genuinely proven where it actually happens, at the page layer, by interleaving
  // a hung fetch: kitchen-stock-page.test.tsx and kitchen-log-page.test.tsx both do it.


  it('setStream records the choice for the whole module, not just this surface', () => {
    const { result } = renderHook(() => useCafeStream())

    act(() => result.current.setStream(RADIANT_BAR))

    expect(result.current.stream).toEqual(RADIANT_BAR)
    // The next Café surface reads this, which is the whole point of the module-scoped choice.
    expect(rememberedStreamKey()).toBe(`${BRANCH_RAD.id}|bar`)
  })
})
