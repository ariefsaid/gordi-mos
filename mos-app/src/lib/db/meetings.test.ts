import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { WriteUpConflictError, WriteUpTooLargeError } from './objective-writeup'
import {
  MINUTES_MAX_BYTES, addAttendee, createMeeting, createMeetingTask, getMeeting, getMeetingTitlesByIds,
  listMeetings, listMeetingsForRecord, listMeetingTasks, listStillOpen, readMinutes, removeAttendee,
  saveMinutes, searchMeetingsByTitle, startNextMeeting, updateMeetingFields,
} from './meetings'

const schemaMock = vi.mocked(supabase.schema)

type Result = { data: unknown; error: unknown }
interface Calls {
  tables: string[]
  rpcs: Array<[string, Record<string, unknown>]>
  updates: unknown[]
  upserts: unknown[]
  eqs: Array<[string, unknown]>
  ors: string[]
  ilikes: Array<[string, unknown]>
}

/** Chainable PostgREST stand-in: every query on `table` resolves to its queued results, in order. */
function stub(tables: Record<string, Result[]>, rpcs: Record<string, Result> = {}): Calls {
  const calls: Calls = { tables: [], rpcs: [], updates: [], upserts: [], eqs: [], ors: [], ilikes: [] }
  const seen: Record<string, number> = {}
  const from = (table: string) => {
    calls.tables.push(table)
    const queue = tables[table] ?? []
    const i = seen[table] ?? 0
    seen[table] = i + 1
    const result = queue[Math.min(i, queue.length - 1)] ?? { data: [], error: null }
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'is', 'in', 'neq', 'order', 'limit']) b[m] = vi.fn(() => b)
    b.eq = vi.fn((c: string, v: unknown) => { calls.eqs.push([c, v]); return b })
    b.ilike = vi.fn((c: string, v: unknown) => { calls.ilikes.push([c, v]); return b })
    b.or = vi.fn((s: string) => { calls.ors.push(s); return b })
    b.update = vi.fn((p: unknown) => { calls.updates.push(p); return b })
    b.upsert = vi.fn((p: unknown) => { calls.upserts.push(p); return Promise.resolve(result) })
    b.maybeSingle = vi.fn(() => Promise.resolve(result))
    b.then = (resolve: (v: unknown) => void) => resolve(result)
    return b
  }
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    calls.rpcs.push([name, args])
    return Promise.resolve(rpcs[name] ?? { data: null, error: null })
  })
  schemaMock.mockReturnValue({ from, rpc } as never)
  return calls
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'm1', title: 'Weekly ops', starts_at: null, owning_team_id: 't1', work_line_id: null, objective_id: null,
  is_private: false, previous_meeting_id: null, series_id: 's1', sequence_number: 1, created_by: 'p1',
  archived_at: null, updated_at: 'u1', ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('meetings data layer', () => {
  it('lists My meetings as attended or team-owned, with attendees and open-task counts', async () => {
    const calls = stub({
      meeting_attendees: [
        { data: [{ meeting_id: 'm1' }], error: null },
        { data: [{ meeting_id: 'm1', person_id: 'p1' }, { meeting_id: 'm1', person_id: 'p2' }], error: null },
      ],
      meetings: [{ data: [row(), row({ id: 'm2', is_private: true })], error: null }],
      tasks: [{ data: [{ meeting_id: 'm1' }, { meeting_id: 'm1' }, { meeting_id: 'm2' }], error: null }],
    })
    const rows = await listMeetings({ scope: 'mine', personId: 'p1', teamIds: ['t1'], search: ' ops ' })
    expect(calls.ors).toEqual(['id.in.(m1),owning_team_id.in.(t1)'])
    expect(calls.ilikes).toEqual([['title', '%ops%']])
    expect(rows.map((r) => [r.id, r.attendeeIds, r.openTaskCount])).toEqual([['m1', ['p1', 'p2'], 2], ['m2', [], 1]])
    expect(rows[1].isPrivate).toBe(true)
  })

  it('lists nothing for My meetings when the viewer attends nothing and has no Team', async () => {
    stub({ meeting_attendees: [{ data: [], error: null }] })
    expect(await listMeetings({ scope: 'mine', personId: 'p1', teamIds: [] })).toEqual([])
  })

  it('lists All meetings without a membership filter', async () => {
    const calls = stub({ meetings: [{ data: [row()], error: null }], meeting_attendees: [{ data: [], error: null }], tasks: [{ data: [], error: null }] })
    const rows = await listMeetings({ scope: 'all' })
    expect(calls.ors).toEqual([])
    expect(rows).toHaveLength(1)
  })

  it('reads one Meeting with attendees and its Previous / Next links', async () => {
    stub({
      meetings: [
        { data: row({ id: 'm2', previous_meeting_id: 'm1', sequence_number: 2 }), error: null },
        { data: { id: 'm1', title: 'Weekly ops', sequence_number: 1, starts_at: 'd1' }, error: null },
        { data: null, error: null },
      ],
      meeting_attendees: [{ data: [{ meeting_id: 'm2', person_id: 'p1' }], error: null }],
    })
    const m = await getMeeting('m2')
    expect(m?.attendeeIds).toEqual(['p1'])
    expect(m?.previous).toEqual({ id: 'm1', title: 'Weekly ops', sequenceNumber: 1, startsAt: 'd1' })
    expect(m?.next).toBeNull()
  })

  it('returns null for a Meeting the caller cannot read', async () => {
    stub({ meetings: [{ data: null, error: null }] })
    expect(await getMeeting('hidden')).toBeNull()
  })

  it('creates a Meeting and starts the next one through the RPCs', async () => {
    const calls = stub({}, { create_meeting: { data: 'new1', error: null }, start_next_meeting: { data: 'next1', error: null } })
    expect(await createMeeting({ title: 'Ops', owningTeamId: 't1', attendeeIds: ['p2'] })).toBe('new1')
    expect(calls.rpcs[0]).toEqual(['create_meeting', {
      p_title: 'Ops', p_owning_team_id: 't1', p_starts_at: null, p_is_private: false,
      p_work_line_id: null, p_objective_id: null, p_attendee_ids: ['p2'],
    }])
    expect(await startNextMeeting('new1')).toBe('next1')
    expect(calls.rpcs[1]).toEqual(['start_next_meeting', { p_meeting_id: 'new1' }])
  })

  it('updates only the named fields and tells the caller when the Meeting is not editable', async () => {
    const calls = stub({ meetings: [{ data: [{ id: 'm1' }], error: null }] })
    await updateMeetingFields('m1', { title: 'New', startsAt: null, isPrivate: true })
    expect(calls.updates).toEqual([{ title: 'New', starts_at: null, is_private: true }])
    stub({ meetings: [{ data: [], error: null }] })
    await expect(updateMeetingFields('m1', { title: 'x' })).rejects.toThrow('not editable')
  })

  it('reads minutes with their updated_at token', async () => {
    stub({ meetings: [{ data: { minutes: [{ type: 'paragraph' }], updated_at: 'u1' }, error: null }] })
    expect(await readMinutes('m1')).toEqual({ minutes: [{ type: 'paragraph' }], updatedAt: 'u1' })
    stub({ meetings: [{ data: { minutes: null, updated_at: 'u1' }, error: null }] })
    expect(await readMinutes('m1')).toEqual({ minutes: null, updatedAt: 'u1' })
  })

  it('saves minutes conditionally on the read updated_at and never sends updated_at', async () => {
    const calls = stub({ meetings: [{ data: [{ updated_at: 'u2' }], error: null }] })
    expect(await saveMinutes('m1', [{ type: 'paragraph' }], 'u1')).toBe('u2')
    expect(calls.updates).toEqual([{ minutes: [{ type: 'paragraph' }] }])
    expect(calls.eqs).toEqual([['id', 'm1'], ['updated_at', 'u1']])
  })

  it('refuses a save when zero rows match, and an oversized document without a request', async () => {
    stub({ meetings: [{ data: [], error: null }] })
    await expect(saveMinutes('m1', [], 'u1')).rejects.toBeInstanceOf(WriteUpConflictError)
    const calls = stub({ meetings: [{ data: [{ updated_at: 'u2' }], error: null }] })
    const big = [{ type: 'paragraph', content: 'x'.repeat(MINUTES_MAX_BYTES) }]
    await expect(saveMinutes('m1', big, 'u1')).rejects.toBeInstanceOf(WriteUpTooLargeError)
    expect(calls.updates).toEqual([])
  })

  it('adds an attendee by upsert (re-adding clears removal) and removes softly', async () => {
    const calls = stub({ meeting_attendees: [{ data: null, error: null }] })
    await addAttendee('m1', 'p2')
    expect(calls.upserts).toEqual([{ meeting_id: 'm1', person_id: 'p2', removed_at: null }])
    await removeAttendee('m1', 'p2')
    expect(calls.updates).toHaveLength(1)
    expect(Object.keys(calls.updates[0] as object)).toEqual(['removed_at'])
    expect(calls.eqs).toEqual([['meeting_id', 'm1'], ['person_id', 'p2']])
  })

  it('creates a Task in a Meeting with defaults left to the database', async () => {
    const calls = stub({}, { create_meeting_task: { data: 'task1', error: null } })
    expect(await createMeetingTask({ meetingId: 'm1', title: 'Call supplier', dueDate: '2027-01-15' })).toBe('task1')
    expect(calls.rpcs[0]).toEqual(['create_meeting_task', {
      p_meeting_id: 'm1', p_title: 'Call supplier', p_pic_id: null, p_due_date: '2027-01-15',
      p_team_id: null, p_supervisor_id: null,
    }])
  })

  it('maps still-open and meeting tasks to Task, PIC, Due, Status rows', async () => {
    const task = { id: 'k1', title: 'Pay bill', responsible_person_id: 'p1', accountable_person_id: 'p2', due_date: '2027-01-15', status: 'Open', meeting_id: 'm1' }
    const calls = stub({}, { meeting_still_open: { data: [task], error: null }, meeting_tasks: { data: [task], error: null } })
    const expected = [{ id: 'k1', title: 'Pay bill', responsibleId: 'p1', supervisorId: 'p2', dueDate: '2027-01-15', status: 'Open', meetingId: 'm1' }]
    expect(await listStillOpen('m2')).toEqual(expected)
    expect(await listMeetingTasks('m1')).toEqual(expected)
    expect(calls.rpcs.map(([n]) => n)).toEqual(['meeting_still_open', 'meeting_tasks'])
  })

  it('lists Meetings linked to a Project/Process or an Objective', async () => {
    const calls = stub({ meetings: [{ data: [{ id: 'm1', title: 'Ops', starts_at: 'd1', is_private: true }], error: null }] })
    expect(await listMeetingsForRecord({ objectiveId: 'o1' })).toEqual([{ id: 'm1', title: 'Ops', startsAt: 'd1', isPrivate: true }])
    await listMeetingsForRecord({ workLineId: 'w1' })
    expect(calls.eqs).toEqual([['objective_id', 'o1'], ['work_line_id', 'w1']])
  })

  it('resolves titles and search through RLS-filtered reads', async () => {
    stub({ meetings: [{ data: [{ id: 'm1', title: 'Ops' }], error: null }] })
    expect(await getMeetingTitlesByIds(['m1', 'hidden'])).toEqual([{ id: 'm1', title: 'Ops' }])
    expect(await getMeetingTitlesByIds([])).toEqual([])
    const calls = stub({ meetings: [{ data: [{ id: 'm1', title: 'Ops', starts_at: null }], error: null }] })
    expect(await searchMeetingsByTitle('op')).toEqual([{ id: 'm1', title: 'Ops', startsAt: null }])
    expect(calls.ilikes).toHaveLength(1)
    // An empty query lists the newest, with no title filter.
    expect(await searchMeetingsByTitle('  ')).toEqual([{ id: 'm1', title: 'Ops', startsAt: null }])
    expect(calls.ilikes).toHaveLength(1)
  })

  it('surfaces database errors', async () => {
    stub({ meetings: [{ data: null, error: { message: 'boom' } }] })
    await expect(getMeeting('m1')).rejects.toThrow('boom')
    stub({}, { create_meeting: { data: null, error: { message: 'denied' } } })
    await expect(createMeeting({ title: 'x', owningTeamId: 't' })).rejects.toThrow('denied')
  })
})
