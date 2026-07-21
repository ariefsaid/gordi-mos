import { describe, it, expect, expectTypeOf } from 'vitest'
import type {
  RecordKind,
  RecordViewerAdapter,
  RecordContentSlot,
} from './record-viewer.types'

/**
 * Type-level + fixture proof that the shared grammar carries two REAL, DISTINCT
 * domain models and no fake Standard/SOP kind. These fixtures are presentation
 * projections — a Task exposes Business Unit / PIC / Supervisor / status / due and
 * an explicit missing-Team state; a Signal exposes none of those Task fields.
 */

// A real Task projection — Business Unit is distinct from Team, PIC/Supervisor are
// the ownership vocabulary, and Team is honestly "not assigned yet" (no team_id row).
const taskAdapter: RecordViewerAdapter = {
  kind: 'task',
  id: 'task-1',
  title: 'Restock oat milk',
  typeLabel: 'Task',
  metadata: [
    {
      id: 'ownership',
      label: 'Ownership',
      fields: [
        { key: 'businessUnit', label: 'Business Unit', control: 'select', value: 'bu-retail', displayValue: 'Retail Ops', editable: true },
        { key: 'pic', label: 'Person in charge (PIC)', control: 'person', value: 'p-1', displayValue: 'Riri', editable: true },
        { key: 'supervisor', label: 'Supervisor', control: 'person', value: 'p-2', displayValue: 'Ibnu', editable: true },
        { key: 'team', label: 'Team', control: 'team', value: null, displayValue: 'Team not assigned yet (data migration)', editable: false, readOnlyReason: 'No team_id on this task yet' },
      ],
    },
    {
      id: 'lifecycle',
      label: 'Lifecycle',
      fields: [
        { key: 'status', label: 'Status', control: 'status', value: 'open', displayValue: 'Open', editable: true },
        { key: 'dueDate', label: 'Due date', control: 'date', value: '2026-07-25', displayValue: '25 Jul 2026', editable: true },
      ],
    },
  ],
  relations: [],
  contentSlots: [
    { id: 'checklist', label: 'Checklist', render: () => null },
  ],
  activity: [],
  actions: [],
  permission: { readOnly: false, allowedActionIds: ['complete', 'archive'] },
  state: 'ready',
}

// A real Signal projection — no PIC, Supervisor, due date, or Task status.
const signalAdapter: RecordViewerAdapter = {
  kind: 'signal',
  id: 'signal-1',
  title: 'Oat milk stockout',
  typeLabel: 'Signal',
  metadata: [
    {
      id: 'context',
      label: 'Context',
      fields: [
        { key: 'owningTeam', label: 'Owning Team', control: 'team', value: 't-1', displayValue: 'Gordi HQ Operations', editable: false, readOnlyReason: 'Owning Team is fixed after posting' },
        { key: 'attention', label: 'Attention', control: 'select', value: 'needs', displayValue: 'Needs attention', editable: true },
      ],
    },
  ],
  relations: [],
  contentSlots: [{ id: 'body', label: 'Body', render: () => null }],
  activity: [],
  actions: [],
  permission: { readOnly: false, allowedActionIds: ['acknowledge', 'comment'] },
  state: 'ready',
}

describe('RecordViewer contract', () => {
  it('RecordKind carries only the live, distinct domain models and no fake Standard/SOP member', () => {
    // Type-level exhaustiveness: every RecordKind narrows to a real live model.
    expectTypeOf<RecordKind>().toEqualTypeOf<'task' | 'signal' | 'follow-up'>()
    // A Standard/SOP fixture would fail to typecheck — proving no fake proxy kind exists.
    // @ts-expect-error — 'standard' is not a live RecordKind (no live Standard/SOP model).
    const notAKind: RecordKind = 'standard'
    expect(notAKind).toBe('standard')
  })

  it('a Task projection exposes Business Unit distinct from Team and PIC/Supervisor ownership', () => {
    const ownership = taskAdapter.metadata.find((s) => s.id === 'ownership')!
    const bu = ownership.fields.find((f) => f.key === 'businessUnit')!
    const team = ownership.fields.find((f) => f.key === 'team')!
    expect(bu.label).toBe('Business Unit')
    expect(team.label).toBe('Team')
    // The missing-Team honesty: Team is NOT relabeled from the Business Unit value.
    expect(team.displayValue).not.toBe(bu.displayValue)
    expect(team.displayValue).toMatch(/not assigned yet/i)
    expect(ownership.fields.map((f) => f.key)).toContain('pic')
    expect(ownership.fields.map((f) => f.key)).toContain('supervisor')
    // No RACI vocabulary leaks into Task field keys or labels.
    const labels = taskAdapter.metadata.flatMap((s) => s.fields.map((f) => `${f.key} ${f.label}`))
    expect(labels.join(' ')).not.toMatch(/responsible|accountable|consulted|informed|raci/i)
  })

  it('a Signal projection exposes none of the Task-only fields', () => {
    const keys = signalAdapter.metadata.flatMap((s) => s.fields.map((f) => f.key))
    expect(keys).not.toContain('pic')
    expect(keys).not.toContain('supervisor')
    expect(keys).not.toContain('dueDate')
    expect(keys).not.toContain('status')
  })

  it('a content slot accepts a typed renderer without exposing a block-authoring API', () => {
    const slot: RecordContentSlot = taskAdapter.contentSlots[0]
    // The only authored surface is a render function receiving mode + readOnly.
    expectTypeOf(slot.render).parameter(0).toEqualTypeOf<{ mode: 'panel' | 'page'; readOnly: boolean }>()
    expect(slot.render({ mode: 'panel', readOnly: false })).toBeNull()
  })
})
