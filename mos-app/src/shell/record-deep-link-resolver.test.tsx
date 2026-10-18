import { describe, it, expect, vi } from 'vitest'
import { isValidElement, type ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { MessageKey } from '@/i18n/messages'
import type { OverlayHistoryMarker } from './overlay-navigation'
import {
  createRecordDeepLinkResolver,
  RECORD_KINDS,
  type RecordKindRegistry,
} from './record-deep-link-resolver'
import { messages } from '@/i18n/messages'
import { isRedirect, leafInThisTable } from '@/test/route-table'
import type { FollowUpRecordHostProps } from '@/components/follow-ups/follow-up-record-host'
import type { SignalRecordHostProps } from '@/components/signals/signal-record-host'

vi.mock('@/components/follow-ups/follow-up-record-host', () => ({
  FollowUpRecordHost: ({ followUpId, mode }: FollowUpRecordHostProps) => (
    <div data-testid="lazy-follow-up-host" data-id={followUpId} data-mode={mode} />
  ),
}))
vi.mock('@/components/signals/signal-record-host', () => ({
  SignalRecordHost: ({ signalId, mode }: SignalRecordHostProps) => (
    <div data-testid="lazy-signal-host" data-id={signalId} data-mode={mode} />
  ),
}))

// D-A1 (item 4): the shell deep-link resolver rebuilds a record entry from a persisted route
// marker so a hard-load/refresh restores route sessions whose id lives only in the marker.
//
// PORT NOTE (#190): every assertion below is v4's, unchanged. What changed is where the per-kind
// content comes from — v4 hardcodes `import { SignalRecordHost }` / `import { FollowUpRecordHost }`
// and switches on the kind. The kinds are a registry parameter and the test supplies them. The
// subject was never the imports: it is the entryKey parsing, the ownership/tenancy of the rebuilt
// entry, the canonical `pageTo`, and the four refusals. #424 filled the live registry and made
// `pagePath` optional — the Follow-up kind is panel-only per DD-WAY-36/#369.
const t = (key: MessageKey) => key

// Real catalog keys — `signals.record.title` already existed; `followUps.record.title` was added
// with #424, and both exist in BOTH locales (the live-registry cases below call this on every
// kind). The follow-up mock carries no `pagePath` because DD-WAY-36 (#369) deleted that page; it
// mirrors the live descriptor.
const KINDS: RecordKindRegistry = {
  signal: {
    owner: 'signals',
    titleKey: 'signals.record.title',
    pagePath: (id) => `/work/signals/${id}`,
    renderPanel: (id) => <div data-testid="signal-panel">{id}</div>,
  },
  'follow-up': {
    owner: 'shell',
    titleKey: 'followUps.record.title',
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

  it('rebuilds a Follow-up record entry (owner=shell, panel-only — no pageTo)', () => {
    const entry = resolve(marker('follow-up:fu-3'), {} as never)
    expect(entry).toMatchObject({
      key: 'follow-up:fu-3',
      owner: 'shell',
      tenant: 'record',
    })
    expect(entry?.pageTo).toBeUndefined()
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

describe('RECORD_KINDS — the live registry (#424: a marker-only deep link reopens the record)', () => {
  // The registry sat empty through three sweeps because a test pinned it empty — a check that
  // asserts the defect cannot fail while the bug exists. These fail on exactly that: an empty
  // registry, a kind whose host moved, a page path naming the route DD-WAY-36 deleted, or a
  // titleKey the catalog does not hold.
  const live = createRecordDeepLinkResolver(t, RECORD_KINDS)

  it('carries exactly the two shipped kinds — Signal and Follow-up', () => {
    expect(Object.keys(RECORD_KINDS).sort()).toEqual(['follow-up', 'signal'])
  })

  it("each kind's titleKey is a real catalog key in BOTH locales", () => {
    for (const { titleKey } of Object.values(RECORD_KINDS)) {
      expect(messages.en[titleKey], `en missing ${titleKey}`).toBeDefined()
      expect(messages.id[titleKey], `id missing ${titleKey}`).toBeDefined()
    }
  })

  it('a Home-feed Signal restores synchronously and mounts its lazy host after loading', async () => {
    const entry = live(marker('signal:sig-9'), {} as never)
    expect(entry).not.toBeNull()
    expect(entry).toMatchObject({
      key: 'signal:sig-9',
      owner: 'signals',
      tenant: 'record',
      pageTo: { pathname: '/work/signals/sig-9' },
    })
    expect(isValidElement(entry?.content)).toBe(true)
    const content = entry?.content as ReactElement
    render(<I18nProvider>{content}</I18nProvider>)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(await screen.findByTestId('lazy-signal-host')).toHaveAttribute('data-id', 'sig-9')
    expect(screen.getByTestId('lazy-signal-host')).toHaveAttribute('data-mode', 'panel')
  })

  it('restores an Inbox-opened Signal into the Inbox slot after a hard reload', () => {
    const entry = live(marker('signal:sig-9'), { pathname: '/inbox' } as never)
    expect(entry?.owner).toBe('inbox')
    expect(entry?.pageTo).toEqual({ pathname: '/work/signals/sig-9' })
  })

  it('a queue Follow-up restores synchronously and mounts its lazy host after loading — DD-WAY-36', async () => {
    const entry = live(marker('follow-up:fu-3'), {} as never)
    expect(entry).not.toBeNull()
    expect(entry).toMatchObject({ key: 'follow-up:fu-3', owner: 'shell', tenant: 'record' })
    // Panel-only: a pageTo here would name the record route DD-WAY-36 (#369) removed.
    expect(entry?.pageTo).toBeUndefined()
    expect(isValidElement(entry?.content)).toBe(true)
    const content = entry?.content as ReactElement
    render(<I18nProvider>{content}</I18nProvider>)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(await screen.findByTestId('lazy-follow-up-host')).toHaveAttribute('data-id', 'fu-3')
    expect(screen.getByTestId('lazy-follow-up-host')).toHaveAttribute('data-mode', 'panel')
  })

  it("the Signal descriptor's canonical path is a real, non-redirect leaf of the production table", () => {
    const leaf = leafInThisTable('/work/signals/sig-9')
    expect(leaf, 'nothing in the route table matches /work/signals/:id').toBeDefined()
    expect(leaf?.route.path, '/work/signals/:id falls through to the not-found catch-all').not.toBe('*')
    expect(isRedirect(leaf?.route.element), '/work/signals/:id is a redirect, not a record page').toBe(false)
  })
})
