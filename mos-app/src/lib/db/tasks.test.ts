import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TaskListRow, ChecklistItemRow, TaskEventRow } from './tasks.types'

// Mock the supabase module: the tasks data layer reaches mos via supabase.schema('mos').from(...).
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import {
  listTasks, getTask, createTask,
  updateTaskStatus, updateTaskFields, updateTaskRaci,
  archiveTask, unarchiveTask,
  addChecklistItem, toggleChecklistItem, reorderChecklistItem,
} from './tasks'
import { supabase } from '../supabase'

const schemaMock = vi.mocked(supabase.schema)

// ── Mock harness ──────────────────────────────────────────────────────────────
// A chainable query-builder recorder. Each .from(table) call returns a builder whose
// terminal awaited result is the queued response. Records select args, filters, inserts,
// updates, and order calls so tests can assert the query shape and that org_id is never sent.
interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  inserts: unknown[]
  updates: unknown[]
  orders: Array<[string, unknown]>
}

function makeSchema(responses: Record<string, { data: unknown; error: unknown }[]>, rec: Recorder) {
  // responses: table -> queue of results consumed in call order.
  const counters: Record<string, number> = {}
  const fromImpl = (table: string) => {
    rec.fromTables.push(table)
    const result = () => {
      const i = counters[table] ?? 0
      counters[table] = i + 1
      const queue = responses[table] ?? []
      return queue[Math.min(i, queue.length - 1)] ?? { data: null, error: null }
    }
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = vi.fn((s?: string) => { if (s) rec.selects.push(s); return builder })
    builder.insert = vi.fn((rows: unknown) => { rec.inserts.push(rows); return builder })
    builder.update = vi.fn((patch: unknown) => { rec.updates.push(patch); return builder })
    builder.eq = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.is = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.order = vi.fn((c: string, o: unknown) => { rec.orders.push([c, o]); return builder })
    builder.single = vi.fn(() => Promise.resolve(result()))
    builder.maybeSingle = vi.fn(() => Promise.resolve(result()))
    // Make the builder thenable so `await builder` (list/update paths) resolves to the queued result.
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    void chain
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], inserts: [], updates: [], orders: [] }
}

const TASK_ID = '00000000-0000-0000-0000-00000000a000'
const ACTOR = '40000000-0000-0000-0000-000000000001'

const sampleTask: TaskListRow = {
  id: TASK_ID, org_id: 'org', title: 'T', business_unit_id: 'bu', status: 'Open',
  responsible_person_id: ACTOR, accountable_person_id: ACTOR,
  consulted_person_ids: [], informed_person_ids: [], description: null, due_date: null,
  last_activity_at: '2026-06-10T00:00:00Z', archived_at: null, created_by: ACTOR,
  created_at: '2026-06-10T00:00:00Z', updated_at: '2026-06-10T00:00:00Z',
  business_unit: { id: 'bu', name: 'Cafe' },
  responsible: { id: ACTOR, full_name: 'Cahya' },
  accountable: { id: ACTOR, full_name: 'Cahya' },
}

beforeEach(() => vi.clearAllMocks())

function noOrgId(rec: Recorder) {
  // Neither a filter nor an inserted/updated payload may carry org_id (RLS stamps it — §8).
  expect(rec.eqs.filter(([c]) => c === 'org_id')).toHaveLength(0)
  const payloads = [...rec.inserts, ...rec.updates].flat()
  for (const p of payloads) {
    if (p && typeof p === 'object') expect(Object.keys(p)).not.toContain('org_id')
  }
}

// ── listTasks ───────────────────────────────────────────────────────────────
describe('listTasks', () => {
  it('embeds BU/R/A names, defaults to active-only + due asc, never sends org_id', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ tasks: [{ data: [sampleTask], error: null }] }, rec) as never)

    const rows = await listTasks()
    expect(rows).toEqual([sampleTask])
    expect(rec.fromTables).toContain('tasks')
    const sel = rec.selects.join(' ')
    expect(sel).toContain('business_unit:business_units(id,name)')
    expect(sel).toContain('responsible:people!responsible_person_id(id,full_name)')
    expect(sel).toContain('accountable:people!accountable_person_id(id,full_name)')
    // active-only by default (archived_at is null) and due_date ascending
    expect(rec.eqs).toContainEqual(['archived_at', null])
    expect(rec.orders[0][0]).toBe('due_date')
    noOrgId(rec)
  })

  it('applies businessUnitId / status / personId filters and includeArchived', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ tasks: [{ data: [], error: null }] }, rec) as never)
    await listTasks({ businessUnitId: 'bu', status: 'Blocked', personId: 'p1', includeArchived: true })
    expect(rec.eqs).toContainEqual(['business_unit_id', 'bu'])
    expect(rec.eqs).toContainEqual(['status', 'Blocked'])
    expect(rec.eqs).toContainEqual(['responsible_person_id', 'p1'])
    // includeArchived → no archived_at filter
    expect(rec.eqs.find(([c]) => c === 'archived_at')).toBeUndefined()
  })

  it('throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ tasks: [{ data: null, error: { message: 'boom' } }] }, rec) as never)
    await expect(listTasks()).rejects.toThrow(/boom/)
  })
})

// ── getTask ───────────────────────────────────────────────────────────────────
describe('getTask', () => {
  it('returns task + checklist (position asc) + events (created_at desc), never sends org_id', async () => {
    const rec = freshRec()
    const checklist: ChecklistItemRow[] = []
    const events: TaskEventRow[] = []
    schemaMock.mockReturnValue(makeSchema({
      tasks: [{ data: sampleTask, error: null }],
      task_checklist_items: [{ data: checklist, error: null }],
      task_events: [{ data: events, error: null }],
    }, rec) as never)

    const out = await getTask(TASK_ID)
    expect(out.task).toEqual(sampleTask)
    expect(out.checklist).toEqual(checklist)
    expect(out.events).toEqual(events)
    expect(rec.orders).toContainEqual(['position', { ascending: true }])
    expect(rec.orders).toContainEqual(['created_at', { ascending: false }])
    noOrgId(rec)
  })

  it('throws when the task read errors', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      tasks: [{ data: null, error: { message: 'nope' } }],
      task_checklist_items: [{ data: [], error: null }],
      task_events: [{ data: [], error: null }],
    }, rec) as never)
    await expect(getTask(TASK_ID)).rejects.toThrow(/nope/)
  })
})

// ── createTask ─────────────────────────────────────────────────────────────────
describe('createTask', () => {
  it('inserts the task (with created_by, no org_id) then a created event, returns the new id', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      tasks: [{ data: { id: TASK_ID }, error: null }],
      task_events: [{ data: null, error: null }],
    }, rec) as never)

    const id = await createTask({
      title: 'New', businessUnitId: 'bu',
      responsiblePersonId: ACTOR, accountablePersonId: ACTOR, createdBy: ACTOR,
    })
    expect(id).toBe(TASK_ID)
    const taskInsert = rec.inserts[0] as Record<string, unknown>
    expect(taskInsert.title).toBe('New')
    expect(taskInsert.business_unit_id).toBe('bu')
    expect(taskInsert.responsible_person_id).toBe(ACTOR)
    expect(taskInsert.accountable_person_id).toBe(ACTOR)
    expect(taskInsert.created_by).toBe(ACTOR)
    const eventInsert = rec.inserts[1] as Record<string, unknown>
    expect(eventInsert.event_type).toBe('created')
    expect(eventInsert.actor_person_id).toBe(ACTOR)
    expect(eventInsert.task_id).toBe(TASK_ID)
    noOrgId(rec)
  })

  it('throws if the task insert errors', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      tasks: [{ data: null, error: { message: 'insert failed' } }],
    }, rec) as never)
    await expect(createTask({
      title: 'X', businessUnitId: 'bu',
      responsiblePersonId: ACTOR, accountablePersonId: ACTOR, createdBy: ACTOR,
    })).rejects.toThrow(/insert failed/)
  })

  it('throws if the created-event insert errors', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      tasks: [{ data: { id: TASK_ID }, error: null }],
      task_events: [{ data: null, error: { message: 'event failed' } }],
    }, rec) as never)
    await expect(createTask({
      title: 'X', businessUnitId: 'bu',
      responsiblePersonId: ACTOR, accountablePersonId: ACTOR, createdBy: ACTOR,
    })).rejects.toThrow(/event failed/)
  })
})

// ── update status / fields / raci ───────────────────────────────────────────────
describe('update mutations', () => {
  it('updateTaskStatus updates status then logs a status_changed event with from/to/actor', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      tasks: [{ data: null, error: null }],
      task_events: [{ data: null, error: null }],
    }, rec) as never)
    await updateTaskStatus(TASK_ID, 'Open', 'In Progress', ACTOR)
    expect(rec.updates[0]).toEqual({ status: 'In Progress' })
    const ev = rec.inserts[0] as Record<string, unknown>
    expect(ev.event_type).toBe('status_changed')
    expect(ev.from_value).toBe('Open')
    expect(ev.to_value).toBe('In Progress')
    expect(ev.actor_person_id).toBe(ACTOR)
    noOrgId(rec)
  })

  it('updateTaskFields updates given fields then logs a field_edited event', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      tasks: [{ data: null, error: null }],
      task_events: [{ data: null, error: null }],
    }, rec) as never)
    await updateTaskFields(TASK_ID, { description: 'updated', due_date: '2026-06-20' }, ACTOR)
    expect(rec.updates[0]).toEqual({ description: 'updated', due_date: '2026-06-20' })
    expect((rec.inserts[0] as Record<string, unknown>).event_type).toBe('field_edited')
    noOrgId(rec)
  })

  it('updateTaskRaci updates consulted/informed arrays then logs a raci_edited event', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      tasks: [{ data: null, error: null }],
      task_events: [{ data: null, error: null }],
    }, rec) as never)
    await updateTaskRaci(TASK_ID, { consulted_person_ids: ['p1'], informed_person_ids: ['p2'] }, ACTOR)
    expect(rec.updates[0]).toEqual({ consulted_person_ids: ['p1'], informed_person_ids: ['p2'] })
    expect((rec.inserts[0] as Record<string, unknown>).event_type).toBe('raci_edited')
    noOrgId(rec)
  })

  it('updateTaskStatus throws if the update errors', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      tasks: [{ data: null, error: { message: 'update boom' } }],
    }, rec) as never)
    await expect(updateTaskStatus(TASK_ID, 'Open', 'Done', ACTOR)).rejects.toThrow(/update boom/)
  })
})

// ── archive / unarchive ─────────────────────────────────────────────────────────
describe('archive mutations', () => {
  it('archiveTask sets archived_at then logs an archived event', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      tasks: [{ data: null, error: null }],
      task_events: [{ data: null, error: null }],
    }, rec) as never)
    await archiveTask(TASK_ID, ACTOR)
    const patch = rec.updates[0] as Record<string, unknown>
    expect(patch.archived_at).not.toBeNull()
    expect((rec.inserts[0] as Record<string, unknown>).event_type).toBe('archived')
    noOrgId(rec)
  })

  it('unarchiveTask clears archived_at then logs an unarchived event', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      tasks: [{ data: null, error: null }],
      task_events: [{ data: null, error: null }],
    }, rec) as never)
    await unarchiveTask(TASK_ID, ACTOR)
    expect(rec.updates[0]).toEqual({ archived_at: null })
    expect((rec.inserts[0] as Record<string, unknown>).event_type).toBe('unarchived')
    noOrgId(rec)
  })

  it('archiveTask throws if the update errors', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      tasks: [{ data: null, error: { message: 'archive boom' } }],
    }, rec) as never)
    await expect(archiveTask(TASK_ID, ACTOR)).rejects.toThrow(/archive boom/)
  })
})

// ── checklist CRUD ───────────────────────────────────────────────────────────────
describe('checklist mutations', () => {
  it('addChecklistItem inserts the item then logs a field_edited event', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      task_checklist_items: [{ data: null, error: null }],
      task_events: [{ data: null, error: null }],
    }, rec) as never)
    await addChecklistItem(TASK_ID, 'Step', 0, ACTOR)
    const item = rec.inserts[0] as Record<string, unknown>
    expect(item.task_id).toBe(TASK_ID)
    expect(item.label).toBe('Step')
    expect(item.position).toBe(0)
    expect((rec.inserts[1] as Record<string, unknown>).event_type).toBe('field_edited')
    noOrgId(rec)
  })

  it('toggleChecklistItem updates is_done then logs a field_edited event', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      task_checklist_items: [{ data: null, error: null }],
      task_events: [{ data: null, error: null }],
    }, rec) as never)
    await toggleChecklistItem('item-1', true, TASK_ID, ACTOR)
    expect(rec.updates[0]).toEqual({ is_done: true })
    expect(rec.eqs).toContainEqual(['id', 'item-1'])
    expect((rec.inserts[0] as Record<string, unknown>).event_type).toBe('field_edited')
    noOrgId(rec)
  })

  it('reorderChecklistItem updates position (no event)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      task_checklist_items: [{ data: null, error: null }],
    }, rec) as never)
    await reorderChecklistItem('item-1', 3)
    expect(rec.updates[0]).toEqual({ position: 3 })
    expect(rec.eqs).toContainEqual(['id', 'item-1'])
    noOrgId(rec)
  })

  it('addChecklistItem throws if the item insert errors', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      task_checklist_items: [{ data: null, error: { message: 'item boom' } }],
    }, rec) as never)
    await expect(addChecklistItem(TASK_ID, 'X', 0, ACTOR)).rejects.toThrow(/item boom/)
  })
})
