import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { SignalDetail, SignalRevisionRow } from '@/lib/db/signals'
import type { SignalRow, TeamOption } from '@/lib/db/signals.types'
import type { PersonOption, BusinessUnitOption } from '@/lib/db/directory'
import { createSignalRecordAdapter, wrapSignalRecord, type SignalRecordAdapterInput } from './signal-record-adapter'
import type { RecordViewerAdapter } from '@/components/records/record-viewer.types'

const AUTHOR = 'p-author'
const teams: TeamOption[] = [
  { id: 't-1', name: 'Gordi HQ Operations', business_unit_id: 'bu-1', site_id: null, is_primary: true },
]
const people: PersonOption[] = [{ id: AUTHOR, full_name: 'Sari' }]
const businessUnits: BusinessUnitOption[] = [{ id: 'bu-1', name: 'HQ Ops' }]

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

const revisions: SignalRevisionRow[] = [
  { id: 'rev-1', signal_id: 'signal-1', actor_id: AUTHOR, field: 'attention', old_value: 'FYI', new_value: 'Needs attention', created_at: '2026-07-20T08:30:00Z' },
]

function makeInput(overrides: Partial<SignalRecordAdapterInput> = {}): SignalRecordAdapterInput {
  const signal = overrides.detail?.signal ?? makeSignal()
  return {
    detail: makeDetail(signal),
    revisions,
    teams,
    businessUnits,
    people,
    tasks: [{
      id: 'task-9', org_id: 'org', title: 'Restock oat milk', business_unit_id: 'bu-1', status: 'Open',
      responsible_person_id: AUTHOR, accountable_person_id: AUTHOR, consulted_person_ids: [], informed_person_ids: [],
      description: null, due_date: null, objective_id: null, work_line_id: null, last_activity_at: '',
      archived_at: null, created_by: AUTHOR, created_at: '', updated_at: '',
    }],
    comments: [],
    rosters: { teamMembers: {}, buMembers: {} },
    siteName: null,
    canAcknowledge: true,
    canCorrect: true,
    canComment: true,
    onAcknowledge: vi.fn(async () => {}),
    onCorrect: vi.fn(async () => {}),
    onComment: vi.fn(async () => {}),
    onLinkTask: vi.fn(async () => {}),
    onCreateFollowUp: vi.fn(async () => {}),
    onOpenTask: vi.fn(),
    ...overrides,
  }
}

function fieldKeys(adapter: RecordViewerAdapter): string[] {
  return adapter.metadata.flatMap((s) => s.fields.map((f) => f.key))
}

describe('createSignalRecordAdapter', () => {
  it('FR-V3-003 / SignalAdapterContract: renders Signal identity, metadata, content, activity, linked work, and actions', () => {
    const adapter = createSignalRecordAdapter(makeInput())
    expect(adapter.kind).toBe('signal')
    expect(adapter.typeLabel).toBe('Signal')
    expect(adapter.title).toMatch(/oat milk/i)

    const keys = fieldKeys(adapter)
    expect(keys).toContain('owningTeam')
    expect(keys).toContain('attention')

    // Body renders through a Signal-owned content slot.
    const body = adapter.contentSlots.find((s) => s.id === 'body')!
    const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>
    render(<>{body.render({ mode: 'panel', readOnly: false })}</>, { wrapper })
    expect(screen.getByText(/Oat milk ran out/)).toBeInTheDocument()

    // Linked Task is a relation that opens the Task.
    const rel = adapter.relations.find((r) => r.kind === 'task')!
    expect(rel.label).toBe('Restock oat milk')
    rel.onOpen?.()
    expect(makeInput).toBeDefined()

    // Revisions + acknowledgements become activity.
    expect(adapter.activity.length).toBeGreaterThan(0)
    expect(adapter.actions.map((a) => a.id)).toContain('acknowledge')
  })

  it('SignalVocabularyContract: never exposes PIC, Supervisor, due date, or Task status', () => {
    const adapter = createSignalRecordAdapter(makeInput())
    const keys = fieldKeys(adapter)
    expect(keys).not.toContain('pic')
    expect(keys).not.toContain('supervisor')
    expect(keys).not.toContain('dueDate')
    expect(keys).not.toContain('status')
    const blob = JSON.stringify(adapter.metadata)
    expect(blob).not.toMatch(/person in charge|supervisor|due date/i)
  })

  it('AC-V3-009: a retracted Signal keeps its tombstone and removes unauthorized actions', () => {
    const signal = makeSignal({ retracted_at: '2026-07-20T12:00:00Z', retract_reason: 'Posted to the wrong team' })
    const adapter = createSignalRecordAdapter(makeInput({ detail: makeDetail(signal) }))

    expect(adapter.permission.readOnly).toBe(true)
    expect(adapter.permission.reason).toMatch(/wrong team/i)
    // Identity + body are still present.
    expect(adapter.title).toMatch(/oat milk/i)
    // Acknowledge / correct / comment / link are gone on a retracted Signal.
    expect(adapter.permission.allowedActionIds).not.toContain('acknowledge')
    expect(adapter.actions.map((a) => a.id)).not.toContain('acknowledge')
  })
})

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
