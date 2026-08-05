import { describe, it, expect } from 'vitest'
import type { MessageKey } from '@/i18n/messages'
import type { OverlayHistoryMarker } from './overlay-navigation'
import {
  createRecordDeepLinkResolver,
  RECORD_KINDS,
  type RecordKindRegistry,
} from './record-deep-link-resolver'

// D-A1 (item 4): the shell deep-link resolver rebuilds a record entry from a persisted route
// marker so a hard-load/refresh restores route sessions whose id lives only in the marker.
//
// PORT NOTE (#190): every assertion below is v4's, unchanged. What changed is where the per-kind
// content comes from — v4 hardcodes `import { SignalRecordHost }` / `import { FollowUpRecordHost }`
// and switches on the kind; neither module exists on this line, and both belong to surface tickets
// the port has not reached. So the kinds are a registry parameter and the test supplies them. The
// subject was never the imports: it is the entryKey parsing, the ownership/tenancy of the rebuilt
// entry, the canonical `pageTo`, and the four refusals.
const t = (key: MessageKey) => key

// Real catalog keys — v4's `signals.record.title` / `followUps.record.title` arrive with the
// surfaces that own them, and a cast to a key the catalog does not hold would be exactly the kind
// of comment-that-lies this port keeps finding.
const KINDS: RecordKindRegistry = {
  signal: {
    owner: 'signals',
    titleKey: 'nav.updates',
    pagePath: (id) => `/work/signals/${id}`,
    renderPanel: (id) => <div data-testid="signal-panel">{id}</div>,
  },
  'follow-up': {
    owner: 'shell',
    titleKey: 'nav.followUps',
    pagePath: (id) => `/work/follow-ups/${id}`,
    renderPanel: (id) => <div data-testid="follow-up-panel">{id}</div>,
  },
}

const resolve = createRecordDeepLinkResolver(t, KINDS)

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

  it('an id containing a colon keeps everything after the FIRST separator', () => {
    // The kind is the prefix up to the first ':' — an id is opaque and may contain one.
    const entry = resolve(marker('signal:a:b'), {} as never)
    expect(entry?.key).toBe('signal:a:b')
    expect(entry?.pageTo).toEqual({ pathname: '/work/signals/a:b' })
  })
})

describe('RECORD_KINDS — the live registry', () => {
  // The registry is empty on this branch and the app therefore restores no marker-only deep link.
  // Asserted rather than assumed, so "the resolver did nothing" is a stated contract a reviewer can
  // check, not a silence. The first surface ticket to register a kind flips this case, and must.
  it('is empty until a record surface ports, so the wired resolver restores nothing yet', () => {
    expect(Object.keys(RECORD_KINDS)).toEqual([])
    const live = createRecordDeepLinkResolver(t, RECORD_KINDS)
    expect(live(marker('signal:sig-9'), {} as never)).toBeNull()
  })
})
