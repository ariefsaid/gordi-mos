import { useEffect, useRef, type ReactElement } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  OverlayHostProvider,
  OverlayHostSlot,
  useOverlayHost,
  type OverlayEntry,
  type OverlayHostApi,
  type OverlayDeepLinkResolver,
  type OverlayHistoryDriver,
} from './overlay-host'
import { readOverlayMarker, type OverlayHistoryMarker } from './overlay-navigation'
import type {
  OverlayLeaveDecision,
  OverlayLeaveGuard,
  OverlayLeaveIntent,
  OverlayTransitionResult,
} from './overlay-navigation'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function ApiProbe({ onReady }: { onReady: (api: OverlayHostApi) => void }) {
  onReady(useOverlayHost())
  return <OverlayHostSlot owner="shell" />
}

function TwoSlotProbe({ onReady }: { onReady: (api: OverlayHostApi) => void }) {
  onReady(useOverlayHost())
  return (
    <>
      <OverlayHostSlot owner="shell" />
      <OverlayHostSlot owner="tasks" />
    </>
  )
}

function makeEntry(over: Partial<OverlayEntry> & Pick<OverlayEntry, 'key'>): OverlayEntry {
  return {
    owner: 'shell',
    tenant: 'record',
    label: over.label ?? `Entry ${over.key}`,
    content: <button type="button">{over.key} control</button>,
    ...over,
  }
}

function renderHost(node: (onReady: (api: OverlayHostApi) => void) => ReactElement) {
  let api!: OverlayHostApi
  const utils = render(
    <MemoryRouter initialEntries={['/work/tasks']}>
      <OverlayHostProvider>{node((value) => (api = value))}</OverlayHostProvider>
    </MemoryRouter>,
  )
  return { ...utils, getApi: () => api }
}

describe('overlay host — one active tenant', () => {
  it('AC-RPH-5 / host replacement: opening a Deputy root while a record root is open leaves one host and one frame', async () => {
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    await act(() =>
      getApi().openRoot(makeEntry({ key: 'deputy:1', tenant: 'deputy' }), 'ephemeral'),
    )
    expect(document.querySelectorAll('[data-overlay-host="true"]')).toHaveLength(1)
    expect(getApi().session?.frames).toHaveLength(1)
    expect(getApi().session?.frames.at(-1)?.entry.key).toBe('deputy:1')
  })

  it('FR-V3-006 host stack: push creates two logical frames but one physical host; pushing an existing key pops to it', async () => {
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    await act(() => getApi().push(makeEntry({ key: 'record:2' })))
    expect(getApi().session?.frames).toHaveLength(2)
    expect(document.querySelectorAll('[data-overlay-host="true"]')).toHaveLength(1)
    await act(() => getApi().push(makeEntry({ key: 'record:1' })))
    expect(getApi().session?.frames).toHaveLength(1)
    expect(getApi().session?.frames.at(-1)?.entry.key).toBe('record:1')
  })

  it('I2: internal Back pops exactly one frame; root Close returns to no session', async () => {
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    await act(() => getApi().push(makeEntry({ key: 'record:2' })))
    await act(() => getApi().back())
    expect(getApi().session?.frames).toHaveLength(1)
    expect(getApi().session?.frames.at(-1)?.entry.key).toBe('record:1')
    await act(() => getApi().close('explicit-close'))
    expect(getApi().session).toBeNull()
  })

  it('Host slot invariant: a shell slot and a tasks slot mounted together never render two physical hosts', async () => {
    const { getApi } = renderHost((onReady) => <TwoSlotProbe onReady={onReady} />)
    await act(() => getApi().openRoot(makeEntry({ key: 'record:1', owner: 'tasks' }), 'route'))
    expect(document.querySelectorAll('[data-overlay-host="true"]')).toHaveLength(1)
    expect(document.querySelector('[data-overlay-owner]')?.getAttribute('data-overlay-owner')).toBe(
      'tasks',
    )
  })

  it('I2: focus enters the panel on open and returns to the opener on root close', async () => {
    let api!: OverlayHostApi
    render(
      <MemoryRouter initialEntries={['/work/tasks']}>
        <OverlayHostProvider>
          <button type="button" onClick={() => void api.openRoot(makeEntry({ key: 'record:1' }), 'route')}>
            open record
          </button>
          <ApiProbe onReady={(value) => {
            api = value
          }} />
        </OverlayHostProvider>
      </MemoryRouter>,
    )
    const opener = screen.getByRole('button', { name: 'open record' })
    opener.focus()
    expect(document.activeElement).toBe(opener)

    await act(() => api.openRoot(makeEntry({ key: 'record:1' }), 'route'))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'record:1 control' }))

    await act(() => api.close('explicit-close'))
    expect(document.activeElement).toBe(opener)
  })
})

describe('overlay host — leave guard transaction', () => {
  it('leave-guard host race: coalesces every repeated leave action into one pending guard', async () => {
    const decision = deferred<OverlayLeaveDecision>()
    const leaveGuard: OverlayLeaveGuard = vi.fn(() => decision.promise)
    const dirtyEntry = makeEntry({
      key: 'synthetic:draft',
      tenant: 'quick',
      label: 'Synthetic draft',
      content: <button type="button">Draft control</button>,
      leaveGuard,
    })
    const nextEntry = makeEntry({ key: 'synthetic:next', label: 'Next record' })
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)

    await act(() => getApi().openRoot(dirtyEntry, 'ephemeral'))
    let closePromise!: Promise<{ status: string }>
    act(() => {
      closePromise = getApi().close('explicit-close')
    })
    await waitFor(() => expect(getApi().pendingLeave?.intent.kind).toBe('close'))
    act(() => {
      void getApi().close('escape')
      void getApi().back()
      void getApi().replaceRoot(nextEntry)
      void getApi().replaceCurrent(nextEntry)
      void getApi().push(nextEntry)
      void getApi().openPage('/work/tasks/1')
    })
    expect(leaveGuard).toHaveBeenCalledTimes(1)
    expect(getApi().pendingLeave?.intent).toMatchObject({
      kind: 'close',
      via: 'explicit-close',
      from: { key: 'synthetic:draft', owner: 'shell' },
    })

    await act(async () => {
      decision.resolve({ decision: 'deny' })
      await closePromise
    })
    await expect(closePromise).resolves.toEqual({ status: 'denied' })
    expect(screen.getByRole('button', { name: 'Draft control' })).toBeInTheDocument()
    expect(getApi().session?.frames.at(-1)?.entry.key).toBe('synthetic:draft')
    expect(getApi().pendingLeave).toBeNull()
  })

  it('leave-guard allow: an allowed close commits the transition and re-guards a later leave', async () => {
    const guardCalls: string[] = []
    const decision = deferred<OverlayLeaveDecision>()
    const leaveGuard: OverlayLeaveGuard = vi.fn((intent) => {
      guardCalls.push(intent.kind)
      return decision.promise
    })
    const dirtyEntry = makeEntry({
      key: 'synthetic:draft',
      tenant: 'quick',
      content: <button type="button">Draft control</button>,
      leaveGuard,
    })
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() => getApi().openRoot(dirtyEntry, 'ephemeral'))

    let closePromise!: Promise<{ status: string }>
    act(() => {
      closePromise = getApi().close('explicit-close')
    })
    await waitFor(() => expect(getApi().pendingLeave).not.toBeNull())
    await act(async () => {
      decision.resolve({ decision: 'allow' })
      await closePromise
    })
    await expect(closePromise).resolves.toEqual({ status: 'committed' })
    expect(getApi().session).toBeNull()
    expect(guardCalls).toEqual(['close'])
  })

  it('leave-guard intents: each action passes its typed intent with key/owner-only summaries', async () => {
    const seen: unknown[] = []
    const leaveGuard: OverlayLeaveGuard = vi.fn((intent) => {
      seen.push(intent)
      return Promise.resolve({ decision: 'deny' as const })
    })
    const dirtyEntry = makeEntry({
      key: 'synthetic:draft',
      tenant: 'quick',
      content: <button type="button">Draft control</button>,
      leaveGuard,
    })
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() => getApi().openRoot(dirtyEntry, 'ephemeral'))
    await act(() => getApi().push(makeEntry({ key: 'synthetic:next' })))

    expect(seen.at(-1)).toMatchObject({
      kind: 'replace',
      via: 'push',
      from: { key: 'synthetic:draft', owner: 'shell' },
      to: { key: 'synthetic:next', owner: 'shell' },
    })
    // No React node, dirty flag, or domain row leaked into the intent summary.
    const summary = (seen.at(-1) as { from: Record<string, unknown> }).from
    expect(Object.keys(summary).sort()).toEqual(['key', 'owner'])
  })

  it('leave-guard intent matrix: every leave-like action is denied with its exact typed intent and re-guards after each deny', async () => {
    const seen: OverlayLeaveIntent[] = []
    const leaveGuard: OverlayLeaveGuard = vi.fn((intent) => {
      seen.push(intent)
      return Promise.resolve({ decision: 'deny' as const })
    })
    const dirtyEntry = makeEntry({
      key: 'synthetic:draft',
      tenant: 'quick',
      pageTo: '/work/tasks/1',
      content: <button type="button">Draft control</button>,
      leaveGuard,
    })
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() => getApi().openRoot(dirtyEntry, 'ephemeral'))

    // Each leave-like action, fired SEPARATELY (never coalesced): the guard receives the exact
    // intent kind + via, the deny leaves the guarded draft frame in place, and — the re-guard proof —
    // the guard is invoked once more for the very next action after the prior deny cleared.
    const cases: { fire: () => Promise<OverlayTransitionResult>; kind: OverlayLeaveIntent['kind']; via: string }[] = [
      { fire: () => getApi().close('explicit-close'), kind: 'close', via: 'explicit-close' },
      { fire: () => getApi().close('escape'), kind: 'close', via: 'escape' },
      { fire: () => getApi().back(), kind: 'back', via: 'internal-back' },
      { fire: () => getApi().replaceRoot(makeEntry({ key: 'synthetic:root' })), kind: 'replace', via: 'replace-root' },
      { fire: () => getApi().replaceCurrent(makeEntry({ key: 'synthetic:cur' })), kind: 'replace', via: 'replace-current' },
      { fire: () => getApi().push(makeEntry({ key: 'synthetic:next' })), kind: 'replace', via: 'push' },
      { fire: () => getApi().openPage('/work/tasks/1'), kind: 'open-page', via: 'open-page' },
    ]

    for (const [index, testCase] of cases.entries()) {
      const result = await act(() => testCase.fire())
      // Denied: nothing committed, the guarded draft is still the live top frame.
      expect(result).toEqual({ status: 'denied' })
      expect(getApi().session?.frames.at(-1)?.entry.key).toBe('synthetic:draft')
      expect(getApi().pendingLeave).toBeNull()
      // Re-guard-after-deny: this action invoked the guard exactly once more…
      expect(leaveGuard).toHaveBeenCalledTimes(index + 1)
      // …with its exact typed intent and a key/owner-only source summary.
      expect(seen.at(-1)).toMatchObject({
        kind: testCase.kind,
        via: testCase.via,
        from: { key: 'synthetic:draft', owner: 'shell' },
      })
    }
  })

  it('leave-guard unguarded: a clean entry commits synchronously without a guard', async () => {
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    const result = await act(() => getApi().close('explicit-close'))
    expect(result).toEqual({ status: 'committed' })
    expect(getApi().session).toBeNull()
  })
})

describe('overlay host — clean transitions (Task 3 step 4 replacement + stack)', () => {
  it('replaceRoot swaps the current tenant in place, clearing frames and keeping one host', async () => {
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    await act(() => getApi().push(makeEntry({ key: 'record:2' })))
    const result = await act(() => getApi().replaceRoot(makeEntry({ key: 'deputy:1', tenant: 'deputy' })))
    expect(result).toEqual({ status: 'committed' })
    expect(getApi().session?.frames).toHaveLength(1)
    expect(getApi().session?.frames.at(-1)?.entry.key).toBe('deputy:1')
    expect(document.querySelectorAll('[data-overlay-host="true"]')).toHaveLength(1)
  })

  it('replaceCurrent swaps only the top frame and preserves the stack below it', async () => {
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    await act(() => getApi().push(makeEntry({ key: 'record:2' })))
    await act(() => getApi().replaceCurrent(makeEntry({ key: 'record:3' })))
    expect(getApi().session?.frames.map((f) => f.entry.key)).toEqual(['record:1', 'record:3'])
  })

  it('openPage leaves the panel host (route seam performs the navigation)', async () => {
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() =>
      getApi().openRoot(makeEntry({ key: 'record:1', pageTo: '/work/tasks/1' }), 'route'),
    )
    const result = await act(() => getApi().openPage('/work/tasks/1'))
    expect(result).toEqual({ status: 'committed' })
    expect(getApi().session).toBeNull()
  })

  it('I2: internal Back at the root frame closes the session', async () => {
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    const result = await act(() => getApi().back())
    expect(result).toEqual({ status: 'committed' })
    expect(getApi().session).toBeNull()
  })

  it('replaceRoot with no active session opens a fresh ephemeral root', async () => {
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() => getApi().replaceRoot(makeEntry({ key: 'quick:1', tenant: 'quick' })))
    expect(getApi().session?.mode).toBe('ephemeral')
    expect(getApi().session?.frames.at(-1)?.entry.key).toBe('quick:1')
  })
})

// ── ROUTE SEAM (R-T-4): URL markers, openPage navigation, browser POP transaction,
//    deep-link restore, approval-token single-use. These use createMemoryRouter +
//    RouterProvider so the controller's useLocation/useNavigationType observe real POPs,
//    and an injected OverlayHistoryDriver whose `go` drives the router. ───────────────
function makeRouterHarness(options: {
  historyDriver?: OverlayHistoryDriver
  deepLinkResolver?: OverlayDeepLinkResolver
  initialEntries?: (string | { pathname: string; state?: unknown })[]
  initialIndex?: number
}) {
  let api!: OverlayHostApi
  const probe = (
    <OverlayHostProvider
      historyDriver={options.historyDriver}
      deepLinkResolver={options.deepLinkResolver}
    >
      <ApiProbe onReady={(value) => {
        api = value
      }} />
    </OverlayHostProvider>
  )
  const router = createMemoryRouter([{ path: '*', element: probe }], {
    initialEntries: options.initialEntries ?? ['/work/tasks'],
    initialIndex: options.initialIndex ?? 0,
  })
  const utils = render(<RouterProvider router={router} />)
  return { ...utils, router, getApi: () => api }
}

// A driver whose `go` is wired to the router AFTER creation (router is built first). `index`
// returns a monotonically increasing stamp so every pushed marker carries a distinct,
// observable historyIndex (deny assertions compare the preserved marker).
function wireDriver() {
  let counter = 0
  const goImpl: { current: (delta: number) => void } = { current: () => {} }
  const driver: OverlayHistoryDriver = {
    index: () => {
      counter += 1
      return counter
    },
    go: (delta: number) => goImpl.current(delta),
  }
  return { driver, connect: (router: ReturnType<typeof createMemoryRouter>) => {
    goImpl.current = (delta) => router.navigate(delta)
  } }
}

describe('overlay host — route seam (markers, openPage, deep-link)', () => {
  it('R-T-4 / FR-V3-005: openRoot(route) pushes a __mosOverlay marker into the URL state', async () => {
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    connect(router)

    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    const marker = readOverlayMarker(router.state.location.state)
    expect(marker).not.toBeNull()
    expect(marker).toMatchObject({
      sessionId: getApi().session?.id,
      depth: 0,
      entryKey: 'record:1',
      mode: 'route',
    })
    expect(typeof marker?.historyIndex).toBe('number')
  })

  it('R-T-4 / FR-V3-005: a linked-record push pushes a deeper marker (depth follows the stack)', async () => {
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    connect(router)

    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    await act(() => getApi().push(makeEntry({ key: 'record:2' })))
    expect(readOverlayMarker(router.state.location.state)?.depth).toBe(1)
    expect(readOverlayMarker(router.state.location.state)?.entryKey).toBe('record:2')
  })

  it('R-T-4 / FR-V3-005: ephemeral open pushes NO marker (Deputy/quick have no canonical URL)', async () => {
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    connect(router)

    await act(() => getApi().openRoot(makeEntry({ key: 'deputy:1', tenant: 'deputy' }), 'ephemeral'))
    expect(readOverlayMarker(router.state.location.state)).toBeNull()
    expect(getApi().session?.mode).toBe('ephemeral')
  })

  it('R-T-4: openPage navigates to the canonical page URL after a guarded leave commits', async () => {
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    connect(router)

    await act(() =>
      getApi().openRoot(makeEntry({ key: 'record:1', pageTo: '/work/tasks/1' }), 'route'),
    )
    const result = await act(() => getApi().openPage('/work/tasks/1'))
    expect(result).toEqual({ status: 'committed' })
    expect(getApi().session).toBeNull()
    expect(router.state.location.pathname + router.state.location.search).toBe('/work/tasks/1')
    // The panel marker is cleared on page promotion.
    expect(readOverlayMarker(router.state.location.state)).toBeNull()
  })

  it('R-T-4: openPage navigation still fires the guard when the entry is dirty, then navigates on allow', async () => {
    const decision = deferred<OverlayLeaveDecision>()
    const leaveGuard: OverlayLeaveGuard = vi.fn(() => decision.promise)
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    connect(router)

    await act(() =>
      getApi().openRoot(
        makeEntry({ key: 'synthetic:draft', tenant: 'quick', pageTo: '/work/tasks/1', leaveGuard }),
        'route',
      ),
    )
    let pagePromise!: Promise<{ status: string }>
    act(() => {
      pagePromise = getApi().openPage('/work/tasks/1')
    })
    await waitFor(() => expect(leaveGuard).toHaveBeenCalled())
    expect(leaveGuard).toHaveBeenCalledWith(expect.objectContaining({ kind: 'open-page' }))
    // Not navigated yet while the guard is pending.
    expect(router.state.location.pathname).toBe('/work/tasks')

    await act(async () => {
      decision.resolve({ decision: 'allow' })
      await pagePromise
    })
    expect(router.state.location.pathname + router.state.location.search).toBe('/work/tasks/1')
    expect(getApi().session).toBeNull()
  })

  it('R-T-4 deep-link: arriving on a URL carrying an overlay marker opens the session via the resolver', async () => {
    const marker: OverlayHistoryMarker = {
      sessionId: 'deep-1',
      depth: 0,
      entryKey: 'record:deep',
      mode: 'route',
      historyIndex: 9,
    }
    const deepLinkResolver: OverlayDeepLinkResolver = (m) =>
      makeEntry({ key: m.entryKey, owner: 'shell', label: 'Deep record' })
    const { getApi } = makeRouterHarness({
      deepLinkResolver,
      initialEntries: [{ pathname: '/work/tasks', state: { __mosOverlay: marker } }],
    })

    await waitFor(() => expect(getApi().session).not.toBeNull())
    expect(getApi().session?.id).toBe('deep-1')
    expect(getApi().session?.mode).toBe('route')
    expect(getApi().session?.frames.at(-1)?.entry.key).toBe('record:deep')
  })

  it('R-T-4 deep-link: no resolver → marker is observed but no session is fabricated', async () => {
    const marker: OverlayHistoryMarker = {
      sessionId: 'deep-2',
      depth: 0,
      entryKey: 'record:x',
      mode: 'route',
      historyIndex: 1,
    }
    const { getApi } = makeRouterHarness({
      initialEntries: [{ pathname: '/work/tasks', state: { __mosOverlay: marker } }],
    })
    // The seam reads the marker; without a tenant resolver it must not invent content.
    expect(getApi().session).toBeNull()
  })
})

describe('overlay host — browser POP transaction (clean + dirty)', () => {
  it('R-T-4 clean Back: a browser Back re-syncs the session to the shallower marker depth', async () => {
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    connect(router)

    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    await act(() => getApi().push(makeEntry({ key: 'record:2' })))
    expect(getApi().session?.frames.map((f) => f.entry.key)).toEqual(['record:1', 'record:2'])
    expect(readOverlayMarker(router.state.location.state)?.depth).toBe(1)

    await act(() => router.navigate(-1)) // browser Back → depth-0 marker
    expect(getApi().session?.frames.map((f) => f.entry.key)).toEqual(['record:1'])
    expect(readOverlayMarker(router.state.location.state)?.depth).toBe(0)
  })

  it('R-T-4 clean Forward: a matching Forward restores the cached frame (no lost history entry)', async () => {
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    connect(router)

    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    await act(() => getApi().push(makeEntry({ key: 'record:2' })))
    await act(() => router.navigate(-1)) // Back → record:1
    expect(getApi().session?.frames.map((f) => f.entry.key)).toEqual(['record:1'])

    await act(() => router.navigate(1)) // Forward → record:2 restored
    expect(getApi().session?.frames.map((f) => f.entry.key)).toEqual(['record:1', 'record:2'])
  })

  it('R-T-4 clean Back past root: a marker-free location closes the session', async () => {
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    connect(router)

    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    expect(getApi().session).not.toBeNull()
    await act(() => router.navigate(-1)) // Back past the root marker → collection
    expect(getApi().session).toBeNull()
    expect(readOverlayMarker(router.state.location.state)).toBeNull()
  })

  it('R-T-4 / FR-V3-012 dirty Back DENY: keeps the URL marker, the frame, and the focus; guard called once', async () => {
    const decision = deferred<OverlayLeaveDecision>()
    const leaveGuard: OverlayLeaveGuard = vi.fn(() => decision.promise)
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    connect(router)

    await act(() =>
      getApi().openRoot(
        makeEntry({ key: 'synthetic:draft', tenant: 'quick', leaveGuard }),
        'route',
      ),
    )
    const markerBefore = readOverlayMarker(router.state.location.state)
    expect(markerBefore).not.toBeNull()

    // Focus the draft control so we can assert focus is retained on deny.
    const draftControl = screen.getByRole('button', { name: 'synthetic:draft control' })
    draftControl.focus()
    expect(document.activeElement).toBe(draftControl)

    await act(() => router.navigate(-1)) // browser Back → collection
    await waitFor(() => expect(leaveGuard).toHaveBeenCalled())
    expect(leaveGuard).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'browser-pop', direction: 'back', delta: -1 }),
    )

    await act(async () => {
      decision.resolve({ decision: 'deny' })
    })
    // URL + marker preserved (the dirty draft stays visible at its original history entry).
    expect(readOverlayMarker(router.state.location.state)).toEqual(markerBefore)
    expect(router.state.location.pathname + router.state.location.search).toBe('/work/tasks')
    // Frame + session preserved.
    expect(getApi().session?.frames.at(-1)?.entry.key).toBe('synthetic:draft')
    expect(screen.getByRole('button', { name: 'synthetic:draft control' })).toBeInTheDocument()
    // The host did not steal focus away from the draft on denial.
    expect(document.activeElement).toBe(draftControl)
    // Single-use: the guard was consulted exactly once for this transition.
    expect(leaveGuard).toHaveBeenCalledTimes(1)
  })

  it('R-T-4 / FR-V3-012 dirty Back ALLOW: commits the session change and lands on the target', async () => {
    const decision = deferred<OverlayLeaveDecision>()
    const leaveGuard: OverlayLeaveGuard = vi.fn(() => decision.promise)
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    connect(router)

    await act(() =>
      getApi().openRoot(
        makeEntry({ key: 'synthetic:draft', tenant: 'quick', leaveGuard }),
        'route',
      ),
    )
    await act(() => router.navigate(-1)) // browser Back
    await waitFor(() => expect(leaveGuard).toHaveBeenCalled())

    await act(async () => {
      decision.resolve({ decision: 'allow' })
    })
    // Allow commits the close and the URL lands on the marker-free collection.
    expect(getApi().session).toBeNull()
    expect(readOverlayMarker(router.state.location.state)).toBeNull()
  })

  it('R-T-4 / FR-V3-012 dirty Back DENY then explicit Close: re-guards (approval token is one-use)', async () => {
    const decision1 = deferred<OverlayLeaveDecision>()
    const decision2 = deferred<OverlayLeaveDecision>()
    const seen: string[] = []
    // A queue of in-flight decisions so the implementation (seen.push) ALWAYS runs —
    // mockReturnValueOnce would bypass it and hide the intent.
    const queue: Promise<OverlayLeaveDecision>[] = [decision1.promise, decision2.promise]
    const leaveGuard: OverlayLeaveGuard = vi.fn((intent) => {
      seen.push(intent.kind)
      return queue.shift() ?? Promise.resolve<OverlayLeaveDecision>({ decision: 'deny' })
    })
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    connect(router)

    await act(() =>
      getApi().openRoot(
        makeEntry({ key: 'synthetic:draft', tenant: 'quick', leaveGuard }),
        'route',
      ),
    )
    await act(() => router.navigate(-1)) // browser Back → first guard (browser-pop)
    await waitFor(() => expect(leaveGuard).toHaveBeenCalledTimes(1))
    await act(async () => {
      decision1.resolve({ decision: 'deny' }) // denied: draft still mounted
    })
    // Ensure the in-flight request has fully cleared before the next leave.
    await waitFor(() => expect(getApi().pendingLeave).toBeNull())
    expect(getApi().session?.frames.at(-1)?.entry.key).toBe('synthetic:draft')

    // A brand-new leave after the token cleared MUST consult the guard again.
    let closePromise!: Promise<{ status: string }>
    act(() => {
      closePromise = getApi().close('explicit-close')
    })
    await waitFor(() => expect(leaveGuard).toHaveBeenCalledTimes(2))
    expect(seen.at(-1)).toBe('close')
    await act(async () => {
      decision2.resolve({ decision: 'allow' })
      await closePromise
    })
    expect(getApi().session).toBeNull()
  })

  it('R-T-4 / FR-V3-012: a repeated browser POP while a guard is pending never starts a second guard', async () => {
    const decision = deferred<OverlayLeaveDecision>()
    const leaveGuard: OverlayLeaveGuard = vi.fn(() => decision.promise)
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    connect(router)

    await act(() =>
      getApi().openRoot(
        makeEntry({ key: 'synthetic:draft', tenant: 'quick', leaveGuard }),
        'route',
      ),
    )
    await act(() => router.navigate(-1)) // browser Back → guard pending
    await waitFor(() => expect(leaveGuard).toHaveBeenCalledTimes(1))
    expect(getApi().pendingLeave?.intent.kind).toBe('browser-pop')

    // A second pop while the first is still pending is coalesced — no second guard call.
    await act(() => router.navigate(1))
    await act(() => router.navigate(-1))
    expect(leaveGuard).toHaveBeenCalledTimes(1)

    await act(async () => {
      decision.resolve({ decision: 'deny' })
    })
    expect(getApi().session?.frames.at(-1)?.entry.key).toBe('synthetic:draft')
  })

  it('R-T-4: a marker from a different session cannot steal the active host', async () => {
    const otherMarker: OverlayHistoryMarker = {
      sessionId: 'other-session',
      depth: 0,
      entryKey: 'someone-else',
      mode: 'route',
      historyIndex: 0,
    }
    const { driver, connect } = wireDriver()
    const { router, getApi } = makeRouterHarness({
      historyDriver: driver,
      initialEntries: [
        { pathname: '/work/tasks', state: { __mosOverlay: otherMarker } }, // index 0
        '/work/tasks', // index 1
      ],
      initialIndex: 1,
    })
    connect(router)

    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route')) // index 2 (ours)
    const ours = getApi().session?.id
    expect(ours).not.toBe('other-session')

    await act(() => router.navigate(-2)) // POP back to the other-session marker
    // The active session is untouched — the foreign marker did not steal it.
    expect(getApi().session?.id).toBe(ours)
    expect(getApi().session?.frames.at(-1)?.entry.key).toBe('record:1')
  })

  // FOUND AND FIXED WHILE PORTING (#190). A router reports its INITIAL navigation as POP — nobody
  // pressed Back. This effect's closure holds the location and navigation type from the render that
  // scheduled it, so on mount it held the pre-open location while a CHILD effect (a collection
  // restoring its own `?record=` on a cold load) had already opened the session: child effects run
  // before the parent's. The parent read a live session against a marker-free location, computed
  // "popped past the root", and closed the record the collection had just opened. Only a COLD
  // arrival is affected, which is why an in-app click never was, and why the v4 suite this file is
  // carried from never saw it — every one of its cases opens through the API after mount.
  it('mount is not a gesture: a session opened by a child effect on a cold arrival survives', async () => {
    const { driver, connect } = wireDriver()
    let api!: OverlayHostApi
    // A collection that opens its record in its own mount effect, exactly as a `?record=` restore
    // does. The open is deliberately NOT wrapped in act() by the test — it has to happen inside
    // React's own mount effect pass for the ordering that produced the defect to occur.
    function CollectionOnMount() {
      api = useOverlayHost()
      const ref = useRef(api)
      ref.current = api
      useEffect(() => {
        void ref.current.openRoot(makeEntry({ key: 'record:cold' }), 'route', true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return <OverlayHostSlot owner="shell" />
    }
    const router = createMemoryRouter(
      [{ path: '*', element: (
        <OverlayHostProvider historyDriver={driver}>
          <CollectionOnMount />
        </OverlayHostProvider>
      ) }],
      { initialEntries: ['/work/signals?record=cold'] },
    )
    render(<RouterProvider router={router} />)
    connect(router)

    await waitFor(() => expect(api.session?.frames.at(-1)?.entry.key).toBe('record:cold'))
    expect(document.querySelectorAll('[data-overlay-host="true"]')).toHaveLength(1)
    // …and the marker landed on the entry the collection had already pushed, not a duplicate.
    expect(readOverlayMarker(router.state.location.state)?.depth).toBe(0)
    // The seam is still live afterwards — the guard suppresses exactly one pass, not the sync. A
    // linked-record push adds a real history entry, and a browser Back off it re-syncs the stack.
    await act(() => api.push(makeEntry({ key: 'record:linked' })))
    expect(api.session?.frames.map((f) => f.entry.key)).toEqual(['record:cold', 'record:linked'])
    await act(() => router.navigate(-1))
    expect(api.session?.frames.map((f) => f.entry.key)).toEqual(['record:cold'])
  })

  it('R-T-4 no-index fallback: when index() is unavailable the dirty Back DENY still restores the marker', async () => {
    const decision = deferred<OverlayLeaveDecision>()
    const leaveGuard: OverlayLeaveGuard = vi.fn(() => decision.promise)
    const goImpl: { current: (delta: number) => void } = { current: () => {} }
    const driver: OverlayHistoryDriver = {
      index: () => null, // browser history index unavailable
      go: (delta) => goImpl.current(delta),
    }
    const { router, getApi } = makeRouterHarness({ historyDriver: driver })
    goImpl.current = (delta) => router.navigate(delta)

    await act(() =>
      getApi().openRoot(
        makeEntry({ key: 'synthetic:draft', tenant: 'quick', leaveGuard }),
        'route',
      ),
    )
    const markerBefore = readOverlayMarker(router.state.location.state)
    expect(markerBefore).not.toBeNull()

    await act(() => router.navigate(-1))
    await waitFor(() => expect(leaveGuard).toHaveBeenCalled())
    await act(async () => {
      decision.resolve({ decision: 'deny' })
    })
    // Deny still leaves the original marker in place even with no readable history index.
    expect(readOverlayMarker(router.state.location.state)).toEqual(markerBefore)
    expect(getApi().session?.frames.at(-1)?.entry.key).toBe('synthetic:draft')
  })
})
