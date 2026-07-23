import { describe, it, expect } from 'vitest'
import type { SignalDetail } from '@/lib/db/signals'
import type { SignalRow } from '@/lib/db/signals.types'
import { wrapSignalRecord, firstLine } from './signal-record-adapter'

// OD-REDESIGN-90 anatomy (docs/specs/record-page-anatomy.spec.md §2.1): a Signal packs its five
// job regions into ORDERED content slots — message → reach → discussion → facts → history — with
// the shared RecordViewer's generic regions (metadata/relations/activity/actions) empty, so the
// message leads and the ordering never leaks into every other RecordViewer consumer.

function makeSignal(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: 'p-author', owning_team_id: 't-1', occurred_at: '2026-07-20T08:00:00Z',
    body: 'Oat milk ran out during the morning rush.', attention: 'Needs attention',
    category: 'Inventory/availability', source: 'human', retracted_at: null, retract_reason: null,
    edited_at: null, created_at: '2026-07-20T08:05:00Z',
    ...overrides,
  }
}

function makeDetail(signal: SignalRow): SignalDetail {
  return { signal, mentions: [], acknowledgements: [], tasks: [] }
}

function makeInput(overrides: Partial<Parameters<typeof wrapSignalRecord>[0]> = {}): Parameters<typeof wrapSignalRecord>[0] {
  return {
    detail: makeDetail(makeSignal()),
    occurredLabel: '20 Jul 2026, 15:00 WIB',
    reach: <div data-testid="reach-node" />,
    discussion: <div data-testid="discussion-node" />,
    facts: <div data-testid="facts-node" />,
    history: null,
    ...overrides,
  }
}

describe('wrapSignalRecord (OD-REDESIGN-90 JTBD anatomy)', () => {
  it('AC-ANAT-002: the identity title is the body first line, UNTRUNCATED (never an ellipsized slice)', () => {
    const longLine = 'Grinder 2 at HQ bar is throwing inconsistent doses — pulled it for a burr check before the morning rush.'
    expect(longLine.length).toBeGreaterThan(80)
    const adapter = wrapSignalRecord(makeInput({ detail: makeDetail(makeSignal({ body: longLine })) }))
    expect(adapter.title).toBe(longLine)
    expect(adapter.title.endsWith('…')).toBe(false)
    // firstLine takes ONLY the first line — a second line never leaks into the heading.
    expect(firstLine('Line one.\nLine two.')).toBe('Line one.')
  })

  it('AC-ANAT-001: content leads — the ordered content slots are [message, reach, discussion, facts]; generic regions are empty', () => {
    const adapter = wrapSignalRecord(makeInput())
    expect(adapter.contentSlots.map((s) => s.id)).toEqual(['message', 'reach', 'discussion', 'facts'])
    // The generic RecordViewer regions carry NOTHING — the Signal composes via content slots only,
    // so no Facts/metadata block can precede the message (F1).
    expect(adapter.metadata).toEqual([])
    expect(adapter.relations).toEqual([])
    expect(adapter.activity).toEqual([])
    expect(adapter.actions).toEqual([])
  })

  it('orders History last, only when the record has been edited', () => {
    const withHistory = wrapSignalRecord(makeInput({ history: <div data-testid="history-node" /> }))
    expect(withHistory.contentSlots.map((s) => s.id)).toEqual(['message', 'reach', 'discussion', 'facts', 'history'])
    const withoutHistory = wrapSignalRecord(makeInput({ history: null }))
    expect(withoutHistory.contentSlots.map((s) => s.id)).not.toContain('history')
  })

  it('AC-V3-009 (reframed): a retracted Signal is read-only, drops reach + discussion, keeps message(tombstone) + facts', () => {
    const detail = makeDetail(makeSignal({ retracted_at: '2026-07-21T00:00:00Z', retract_reason: 'Duplicate report' }))
    const adapter = wrapSignalRecord(makeInput({ detail, history: null }))
    expect(adapter.permission.readOnly).toBe(true)
    // The retract reason is the message-region tombstone — never a second whole-record note (LAW-6).
    expect(adapter.permission.reason).toBeUndefined()
    expect(adapter.contentSlots.map((s) => s.id)).toEqual(['message', 'facts'])
  })
})
