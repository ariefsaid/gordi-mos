import { describe, it, expect } from 'vitest'
import type { MessageKey } from '@/i18n/messages'
import type { OverlayHistoryMarker } from './overlay-navigation'
import { createRecordDeepLinkResolver } from './record-deep-link-resolver'

// D-A1 (item 4): the shell deep-link resolver rebuilds a record entry from a persisted route
// marker so a hard-load/refresh restores route sessions whose id lives only in the marker.
const t = (key: MessageKey) => key
const resolve = createRecordDeepLinkResolver(t)

function marker(entryKey: string): OverlayHistoryMarker {
  return { sessionId: 's1', depth: 0, entryKey, mode: 'route', historyIndex: 0 }
}

describe('createRecordDeepLinkResolver', () => {
  it('rebuilds a Signal record entry (owner=signals, canonical pageTo)', () => {
    const entry = resolve(marker('signal:sig-9'), {} as never)
    expect(entry).not.toBeNull()
    expect(entry).toMatchObject({
      key: 'signal:sig-9',
      owner: 'signals',
      tenant: 'record',
      pageTo: { pathname: '/work/signals/sig-9' },
    })
    expect(entry?.content).toBeTruthy()
  })

  it('rebuilds a Follow-up record entry (owner=shell, canonical pageTo)', () => {
    const entry = resolve(marker('follow-up:fu-3'), {} as never)
    expect(entry).toMatchObject({
      key: 'follow-up:fu-3',
      owner: 'shell',
      tenant: 'record',
      pageTo: { pathname: '/work/follow-ups/fu-3' },
    })
    expect(entry?.content).toBeTruthy()
  })

  it('does NOT rebuild a Task (its ?record= page effect owns the addressable restore)', () => {
    expect(resolve(marker('task:t-1'), {} as never)).toBeNull()
  })

  it('returns null for an unknown kind or a malformed key', () => {
    expect(resolve(marker('mystery:x'), {} as never)).toBeNull()
    expect(resolve(marker('nocolon'), {} as never)).toBeNull()
    expect(resolve(marker('signal:'), {} as never)).toBeNull()
  })
})
