import { describe, it, expect } from 'vitest'
import type { NotificationRow } from '@/lib/db/notifications'
import {
  isUnread,
  isHandled,
  isReadButUnhandled,
  matchesFilter,
  applyOpen,
  applyMarkHandled,
  INBOX_FILTERS,
  type TriageNotificationRow,
  type InboxFilter,
} from './read-handled-semantics'

function trow(over?: Partial<TriageNotificationRow>): TriageNotificationRow {
  const base: NotificationRow = {
    id: 'n1',
    severity: 'info',
    title: 'T',
    body: null,
    metadata: {},
    read_at: null,
    created_at: '2026-07-20T00:00:00Z',
  }
  return { ...base, handled_at: null, ...over }
}

// Provisional, owner-gated semantics (docs/plans/2026-07-20-v3-inbox-deputy.md §"provisional
// owner-gated semantics"): read = seen/opened; handled = explicitly triaged out of the queue.
// read-but-unhandled is a valid, representable state; handled never means completion/ack/approval.
describe('read/handled triage semantics (provisional, owner-gated)', () => {
  it('unread = read_at IS NULL', () => {
    expect(isUnread(trow({ read_at: null }))).toBe(true)
    expect(isUnread(trow({ read_at: '2026-07-20T01:00:00Z' }))).toBe(false)
  })

  it('handled = handled_at IS NOT NULL', () => {
    expect(isHandled(trow({ handled_at: null }))).toBe(false)
    expect(isHandled(trow({ handled_at: '2026-07-20T02:00:00Z' }))).toBe(true)
  })

  it('read-but-unhandled is a valid, distinct state', () => {
    const row = trow({ read_at: '2026-07-20T01:00:00Z', handled_at: null })
    expect(isReadButUnhandled(row)).toBe(true)
    expect(isUnread(row)).toBe(false)
    expect(isHandled(row)).toBe(false)
  })

  it('exposes exactly the all/unread/handled filters', () => {
    expect([...INBOX_FILTERS]).toEqual(['all', 'unread', 'handled'])
  })

  it('matchesFilter: all matches every row', () => {
    for (const row of [trow(), trow({ read_at: 'x' }), trow({ handled_at: 'y' })]) {
      expect(matchesFilter(row, 'all')).toBe(true)
    }
  })

  it('matchesFilter: unread uses read_at IS NULL', () => {
    expect(matchesFilter(trow({ read_at: null }), 'unread')).toBe(true)
    expect(matchesFilter(trow({ read_at: 'x' }), 'unread')).toBe(false)
  })

  it('matchesFilter: handled uses handled_at IS NOT NULL', () => {
    expect(matchesFilter(trow({ handled_at: 'y' }), 'handled')).toBe(true)
    expect(matchesFilter(trow({ handled_at: null }), 'handled')).toBe(false)
  })

  it('a read-but-unhandled row appears in All but NOT in Unread or Handled', () => {
    const row = trow({ read_at: 'x', handled_at: null })
    expect(matchesFilter(row, 'all')).toBe(true)
    expect(matchesFilter(row, 'unread')).toBe(false)
    expect(matchesFilter(row, 'handled')).toBe(false)
  })

  it('applyOpen marks read only — it never sets handled_at', () => {
    const opened = applyOpen(trow({ read_at: null, handled_at: null }), '2026-07-20T03:00:00Z')
    expect(opened.read_at).toBe('2026-07-20T03:00:00Z')
    expect(opened.handled_at).toBeNull()
  })

  it('applyOpen leaves an already-read row unchanged (idempotent, never re-triages)', () => {
    const already = trow({ read_at: '2026-07-20T00:30:00Z', handled_at: null })
    const opened = applyOpen(already, '2026-07-20T03:00:00Z')
    expect(opened.read_at).toBe('2026-07-20T00:30:00Z')
    expect(opened.handled_at).toBeNull()
  })

  it('applyMarkHandled sets handled_at and may also mark read', () => {
    const handled = applyMarkHandled(trow({ read_at: null, handled_at: null }), '2026-07-20T04:00:00Z')
    expect(handled.handled_at).toBe('2026-07-20T04:00:00Z')
    // Explicit Mark handled may also mark read.
    expect(handled.read_at).toBe('2026-07-20T04:00:00Z')
  })

  it('applyMarkHandled preserves an existing read_at rather than overwriting it', () => {
    const handled = applyMarkHandled(
      trow({ read_at: '2026-07-20T00:30:00Z', handled_at: null }),
      '2026-07-20T04:00:00Z',
    )
    expect(handled.read_at).toBe('2026-07-20T00:30:00Z')
    expect(handled.handled_at).toBe('2026-07-20T04:00:00Z')
  })

  it('filter values are the InboxFilter union', () => {
    const f: InboxFilter[] = ['all', 'unread', 'handled']
    expect(f.every((x) => (INBOX_FILTERS as readonly string[]).includes(x))).toBe(true)
  })
})
