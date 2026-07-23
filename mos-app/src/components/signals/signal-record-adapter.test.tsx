import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { SignalDetail } from '@/lib/db/signals'
import type { SignalRow } from '@/lib/db/signals.types'
import { wrapSignalRecord } from './signal-record-adapter'

const AUTHOR = 'p-author'

function makeSignal(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    id: 'signal-1', author_id: AUTHOR, owning_team_id: 't-1', occurred_at: '2026-07-20T08:00:00Z',
    body: 'Oat milk ran out during the morning rush.', attention: 'Needs attention',
    category: 'Inventory/availability', source: 'human', retracted_at: null, retract_reason: null,
    edited_at: null, created_at: '2026-07-20T08:05:00Z',
    ...overrides,
  }
}

function makeDetail(signal: SignalRow): SignalDetail {
  return {
    signal,
    mentions: [],
    acknowledgements: [{ id: 'ack-1', signal_id: signal.id, person_id: AUTHOR, created_at: '2026-07-20T09:00:00Z' }],
    tasks: [{ id: 'link-1', signal_id: signal.id, task_id: 'task-9', created_by: AUTHOR }],
  }
}

function makeWrapInput(overrides: Partial<Parameters<typeof wrapSignalRecord>[0]> = {}): Parameters<typeof wrapSignalRecord>[0] {
  return {
    detail: makeDetail(makeSignal()),
    authorName: 'Sari',
    teamName: 'Gordi HQ Operations',
    revisions: [],
    acknowledgements: [],
    hasAcknowledged: false,
    canAcknowledge: true,
    onAcknowledge: vi.fn(),
    hostContent: <div data-testid="signal-subtree">SignalRecord goes here</div>,
    ...overrides,
  }
}

// P1-3 (anatomy parity, docs/reviews Luna P1-3): the LIVE host wrapper now converges the Signal
// record onto the SAME chrome/section rhythm as Task — a Facts metadata section, a body content
// slot, the shared Activity timeline, and the shared actions footer — instead of suppressing all
// of it behind one opaque content slot. SignalRecord's own typed workflow subtree still renders
// through it, unduplicated, as a second content slot.
describe('wrapSignalRecord (LIVE host wrapper — converges onto the Task record chrome/section rhythm, P1-3)', () => {
  it('renders the shared identity (title = body first line, no separate eyebrow) and a Facts metadata section', () => {
    const adapter = wrapSignalRecord(makeWrapInput({
      detail: makeDetail(makeSignal({ body: 'Oat milk ran out during the morning rush.\nDispatched a runner to the depot.' })),
    }))
    expect(adapter.kind).toBe('signal')
    expect(adapter.typeLabel).toBe('Signal')
    expect(adapter.eyebrow).toBeUndefined()
    // Title is the FIRST LINE only — the second line never leaks into the heading.
    expect(adapter.title).toBe('Oat milk ran out during the morning rush.')

    const keys = adapter.metadata.flatMap((s) => s.fields.map((f) => f.key))
    expect(adapter.metadata.map((s) => s.label)).toEqual(['Facts'])
    // Category is NOT a Facts row — the dedicated 8-family picker (workflow content slot, same
    // widget feed rows/cards use, Rule 11) already IS the value-display-plus-correct affordance;
    // a second row here would show the identical value twice.
    expect(keys).toEqual(['author', 'owningTeam', 'occurredAt', 'attention'])
    expect(keys).not.toContain('category')
    // Every Facts field is read-only.
    expect(adapter.metadata[0].fields.every((f) => !f.editable)).toBe(true)
  })

  it('adds Business Unit / Site rows only when resolved (conditional, like the prior head block)', () => {
    const withBoth = wrapSignalRecord(makeWrapInput({ businessUnitName: 'Retail Ops', siteName: 'Gordi HQ' }))
    const keysWithBoth = withBoth.metadata[0].fields.map((f) => f.key)
    expect(keysWithBoth).toContain('businessUnit')
    expect(keysWithBoth).toContain('site')

    const withNeither = wrapSignalRecord(makeWrapInput())
    const keysWithNeither = withNeither.metadata[0].fields.map((f) => f.key)
    expect(keysWithNeither).not.toContain('businessUnit')
    expect(keysWithNeither).not.toContain('site')
  })

  it('renders the body as its own content slot (not truncated — full multi-line body intact)', () => {
    const adapter = wrapSignalRecord(makeWrapInput({ detail: makeDetail(makeSignal({ body: 'Line one.\nLine two.' })) }))
    const body = adapter.contentSlots.find((s) => s.id === 'body')!
    render(<>{body.render({ mode: 'panel', readOnly: false })}</>)
    expect(screen.getByText(/Line one\.\s*Line two\./)).toBeInTheDocument()
  })

  it('hosts the SignalRecord subtree as a second, undiminished content slot', () => {
    const adapter = wrapSignalRecord(makeWrapInput())
    const workflow = adapter.contentSlots.find((s) => s.id === 'workflow')!
    render(<>{workflow.render({ mode: 'panel', readOnly: false })}</>)
    expect(screen.getByTestId('signal-subtree')).toBeInTheDocument()
  })

  it('combines revisions + acknowledgements into the shared Activity timeline', () => {
    const adapter = wrapSignalRecord(makeWrapInput({
      revisions: [{ id: 'rev-1', field: 'category', old_value: null, new_value: 'Quality', created_at: '2026-07-20T08:30:00Z', actorName: 'Sari' }],
      acknowledgements: [{ personName: 'Cahya Cafe', occurredAt: '2026-07-20T09:00:00Z' }],
    }))
    expect(adapter.activity).toHaveLength(2)
    expect(adapter.activity.map((a) => a.label)).toEqual(['Edited category', 'Acknowledged'])
  })

  it('surfaces Acknowledge as a shared action (same placement as Task Mark-complete/Archive) when eligible', () => {
    const onAcknowledge = vi.fn()
    const adapter = wrapSignalRecord(makeWrapInput({ onAcknowledge, canAcknowledge: true, hasAcknowledged: false }))
    expect(adapter.actions.map((a) => a.id)).toContain('acknowledge')
    expect(adapter.permission.allowedActionIds).toContain('acknowledge')
    const action = adapter.actions.find((a) => a.id === 'acknowledge')!
    void action.run()
    expect(onAcknowledge).toHaveBeenCalledTimes(1)
  })

  it('keeps a disabled, relabelled "Acknowledged" action once the viewer has already acknowledged (never disappears)', () => {
    const adapter = wrapSignalRecord(makeWrapInput({ hasAcknowledged: true }))
    const action = adapter.actions.find((a) => a.id === 'acknowledge')!
    expect(action.label).toBe('Acknowledged')
    expect(action.disabled).toBe(true)
  })

  it('AC-V3-009: a retracted Signal is read-only, drops the body slot + Acknowledge action, keeps Facts, and the wrapper does NOT re-render the tombstone reason (SignalRecord owns it)', () => {
    const detail = makeDetail(makeSignal({ retracted_at: '2026-07-21T00:00:00Z', retract_reason: 'Duplicate report' }))
    const adapter = wrapSignalRecord(makeWrapInput({ detail }))
    expect(adapter.permission.readOnly).toBe(true)
    expect(adapter.permission.reason).toBeUndefined()
    expect(adapter.actions.map((a) => a.id)).not.toContain('acknowledge')
    expect(adapter.contentSlots.map((s) => s.id)).toEqual(['workflow'])
    expect(adapter.metadata).toHaveLength(1) // Facts survives retraction (provenance stays legible)
  })
})
