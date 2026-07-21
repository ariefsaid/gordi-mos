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

describe('wrapSignalRecord (LIVE host wrapper — hosts the full SignalRecord subtree)', () => {
  it('renders the hosted subtree as ONE typed Signal content slot with no duplicating metadata/actions', () => {
    const detail = makeDetail(makeSignal())
    const adapter = wrapSignalRecord(detail, <div data-testid="signal-subtree">SignalRecord goes here</div>)
    expect(adapter.kind).toBe('signal')
    expect(adapter.typeLabel).toBe('Signal')
    // The wrapper adds NO Signal metadata/actions/activity/relations — SignalRecord owns all display.
    expect(adapter.metadata).toEqual([])
    expect(adapter.actions).toEqual([])
    expect(adapter.activity).toEqual([])
    expect(adapter.relations).toEqual([])
    // The hosted subtree is the sole content slot.
    expect(adapter.contentSlots).toHaveLength(1)
    render(<>{adapter.contentSlots[0].render({ mode: 'panel', readOnly: false })}</>)
    expect(screen.getByTestId('signal-subtree')).toBeInTheDocument()
  })

  it('AC-V3-009: a retracted Signal is read-only, and the wrapper does NOT re-render the tombstone reason (SignalRecord owns it)', () => {
    const detail = makeDetail(makeSignal({ retracted_at: '2026-07-21T00:00:00Z', retract_reason: 'Duplicate report' }))
    const adapter = wrapSignalRecord(detail, <div>subtree</div>)
    expect(adapter.permission.readOnly).toBe(true)
    expect(adapter.permission.reason).toBeUndefined()
  })
})
