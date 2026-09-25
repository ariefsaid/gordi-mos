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
vi.mock('@/lib/db/cafe-opening', () => ({ listCafeViewerTeams: vi.fn() }))
vi.mock('@/auth/use-auth')

import { listActiveBranches } from '@/lib/db/branches'
import { fetchDefaultStream } from '@/lib/db/default-stream'
import { listStreamPairs } from '@/lib/db/kitchen-logs'
import { listCafeViewerTeams } from '@/lib/db/cafe-opening'
import { useAuth } from '@/auth/use-auth'
import { rememberStream, rememberedStreamKey } from '@/lib/cafe-stream'
import { resetCafeLocations } from '@/lib/cafe-opening-location'
import { streamKey } from '@/lib/kitchen-action-label'
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
  { branch_id: b.id, activity: 'kitchen' as const, produces: b !== BRANCH_RAD },
  { branch_id: b.id, activity: 'bar' as const, produces: true },
])
const RADIANT_BAR = { branch: BRANCH_RAD, activity: 'bar' as const, produces: true }

beforeEach(() => {
  vi.clearAllMocks()
  rememberStream(null)
  resetCafeLocations()
  vi.mocked(listActiveBranches).mockResolvedValue(BRANCHES)
  vi.mocked(listStreamPairs).mockResolvedValue(PAIRS)
  vi.mocked(fetchDefaultStream).mockResolvedValue(RADIANT_BAR)
  // Unauthenticated by default (matches the pre-existing, unmocked React.createContext default of
  // `{status: 'loading'}` every other case here relied on) — `viewerId` is null either way, so
  // `listCafeViewerTeams` is never called unless a test opts into an authenticated viewer.
  vi.mocked(useAuth).mockReturnValue({ status: 'loading' })
  vi.mocked(listCafeViewerTeams).mockResolvedValue([])
})

describe('useCafeStream — the shared Café bootstrap', () => {
  it('resolves the enumerable stream catalog and the module stream, and leaves state untouched', async () => {
    const { result } = renderHook(() => useCafeStream())

    const resolved = await act(async () => result.current.resolve())

    expect(resolved.options).toHaveLength(4) // two branches × two activities, from the pairs
    expect(resolved.branches).toEqual(BRANCHES)
    expect(resolved.stream).toEqual(RADIANT_BAR)
    // #781 item 3: the person's own default, kept alongside `stream` for display even once a
    // session switch has moved `stream` elsewhere — CafeStreamBar's "Your Team" tag and "Back
    // to <home>" action both read this.
    expect(resolved.homeStream).toEqual(RADIANT_BAR)
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


  it('item 3 (#781): a session switch moves `stream` but leaves `homeStream` alone', async () => {
    const { result } = renderHook(() => useCafeStream())
    const resolved = await act(async () => result.current.resolve())
    act(() => result.current.adopt(resolved))
    await waitFor(() => expect(result.current.homeStream).toEqual(RADIANT_BAR))

    const BRANCH_RR_KITCHEN = { branch: BRANCH_RR, activity: 'kitchen' as const, produces: true }
    act(() => result.current.setStream(BRANCH_RR_KITCHEN))

    expect(result.current.stream).toEqual(BRANCH_RR_KITCHEN)
    // The default itself never moved — CafeStreamBar's "Back to <home>" still knows what home is.
    expect(result.current.homeStream).toEqual(RADIANT_BAR)
  })

  // Coordinator follow-up to item 1: marking is not defaulting. The binding rule only bars a
  // SECONDARY current membership from becoming the DEFAULT (`homeStream`/`stream`); it says
  // nothing about display, so every stream Team the person currently belongs to — not only the
  // one that resolved to a default — must be findable for the "Your Team" tag.
  it('myStreamKeys: a Krishna-like person (home = office Team, current member of a stream Team too)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      status: 'authenticated',
      viewer: { person: { id: 'p-krishna' } },
    } as ReturnType<typeof useAuth>)
    // The home Team is not a stream (an office Team) — no default (FR-002).
    vi.mocked(fetchDefaultStream).mockResolvedValue(null)
    vi.mocked(listCafeViewerTeams).mockResolvedValue([
      {
        id: 'team-office', name: 'Ops Office', business_unit_id: 'bu-1', site_id: null,
        is_primary: true, branch_id: null, activity: null,
      },
      {
        id: 'team-rr-kitchen', name: 'Rumah Rames Kitchen', business_unit_id: 'bu-1', site_id: null,
        is_primary: false, branch_id: BRANCH_RR.id, activity: 'kitchen',
      },
    ])

    const { result } = renderHook(() => useCafeStream())
    const resolved = await act(async () => result.current.resolve())

    expect(listCafeViewerTeams).toHaveBeenCalledWith('p-krishna')
    // Nothing preselected — the office Team is not a stream, so there is still no default.
    expect(resolved.stream).toBeNull()
    expect(resolved.homeStream).toBeNull()
    // ...but the CURRENT (secondary) stream membership is findable for "Your Team" tagging,
    // independent of the (missing) default.
    expect(resolved.myStreamKeys.has(streamKey(BRANCH_RR.id, 'kitchen'))).toBe(true)
    // The office Team contributes nothing — it carries no (branch, activity) to key by.
    expect(resolved.myStreamKeys.size).toBe(1)
  })

  it('a failed Team-membership read drops the "Your Team" tags, never the surface', async () => {
    vi.mocked(useAuth).mockReturnValue({
      status: 'authenticated',
      viewer: { person: { id: 'p-krishna' } },
    } as ReturnType<typeof useAuth>)
    vi.mocked(listCafeViewerTeams).mockRejectedValue(new Error('network'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useCafeStream())
    const resolved = await act(async () => result.current.resolve())

    expect(resolved.stream).toEqual(RADIANT_BAR)
    expect(resolved.options).toHaveLength(4)
    expect(resolved.myStreamKeys.size).toBe(0)
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('setStream records the choice for the whole module at that location', () => {
    const { result } = renderHook(() => useCafeStream())

    act(() => result.current.setStream(RADIANT_BAR))

    expect(result.current.stream).toEqual(RADIANT_BAR)
    // The next Café surface AT THE SAME LOCATION reads this — still the point of the module-scoped
    // choice (#440). OD-CAFE-1 narrows the scope to the location, so the slot is keyed by branch:
    // a stream belongs to one branch's books, and another branch must not inherit it.
    expect(rememberedStreamKey(null, BRANCH_RAD.id)).toBe(`${BRANCH_RAD.id}|bar`)
    // ...and the unscoped slot every branch would read is NOT what was written.
    expect(rememberedStreamKey()).toBeNull()
  })
})
