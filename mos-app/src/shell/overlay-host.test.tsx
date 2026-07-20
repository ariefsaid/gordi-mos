import type { ReactElement } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  OverlayHostProvider,
  OverlayHostSlot,
  useOverlayHost,
  type OverlayEntry,
  type OverlayHostApi,
} from './overlay-host'
import type { OverlayLeaveDecision, OverlayLeaveGuard } from './overlay-navigation'

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
    let decision = deferred<OverlayLeaveDecision>()
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

  it('leave-guard unguarded: a clean entry commits synchronously without a guard', async () => {
    const { getApi } = renderHost((onReady) => <ApiProbe onReady={onReady} />)
    await act(() => getApi().openRoot(makeEntry({ key: 'record:1' }), 'route'))
    const result = await act(() => getApi().close('explicit-close'))
    expect(result).toEqual({ status: 'committed' })
    expect(getApi().session).toBeNull()
  })
})
