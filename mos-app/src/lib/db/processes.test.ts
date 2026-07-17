import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the supabase module: the processes data layer reaches mos via
// supabase.schema('mos').from(...)/.rpc(...) — mirrors signals.test.ts/tasks.ts.
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { startRun, listDueRuns, listPendingTasks, resolvePendingTask } from './processes'
import { supabase } from '@/lib/supabase'
import type { DueProcessRun, PendingTaskRow } from './processes.types'

const schemaMock = vi.mocked(supabase.schema)

// ── Mock harness (mirrors signals.test.ts) ──────────────────────────────────
interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  rpcs: Array<[string, unknown]>
}

type Result = { data: unknown; error: unknown }

function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], rpcs: [] }
}

function makeClient(responses: Record<string, Result[]>, rec: Recorder) {
  const counters: Record<string, number> = {}
  function nextResult(key: string): Result {
    const i = counters[key] ?? 0
    counters[key] = i + 1
    const queue = responses[key] ?? []
    return queue[Math.min(i, queue.length - 1)] ?? { data: null, error: null }
  }
  function fromImpl(schemaName: string, table: string) {
    const key = `${schemaName}.${table}`
    rec.fromTables.push(key)
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((s?: string) => { if (s) rec.selects.push(s); return builder })
    builder.eq = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.is = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.order = vi.fn(() => builder)
    builder.single = vi.fn(() => Promise.resolve(nextResult(key)))
    builder.maybeSingle = vi.fn(() => Promise.resolve(nextResult(key)))
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(nextResult(key)).then(resolve)
    return builder
  }
  return {
    schema: vi.fn((schemaName: string) => ({
      from: vi.fn((table: string) => fromImpl(schemaName, table)),
      rpc: vi.fn((name: string, args: unknown) => {
        rec.rpcs.push([name, args])
        return Promise.resolve(nextResult(`rpc.${name}`))
      }),
    })),
  }
}

function mockSupabase(responses: Record<string, Result[]>, rec: Recorder) {
  const client = makeClient(responses, rec)
  schemaMock.mockImplementation((name: string) => client.schema(name) as never)
}

beforeEach(() => vi.clearAllMocks())

const WORK_LINE_ID = '00000000-0000-0000-0000-00000000c001'
const TEAM_ID = '00000000-0000-0000-0000-00000000t001'

// ── startRun (B2, AC-620) ────────────────────────────────────────────────────
describe('startRun', () => {
  it('AC-620: calls mos.spawn_process_run with the RPC args and returns the parsed SpawnResult', async () => {
    const rec = freshRec()
    const rpcResult = { run_id: 'run-1', created: 2, pending: 1, idempotent: false }
    mockSupabase({ 'rpc.spawn_process_run': [{ data: rpcResult, error: null }] }, rec)

    const result = await startRun(WORK_LINE_ID, TEAM_ID, '2026-07-17')

    expect(rec.rpcs).toContainEqual([
      'spawn_process_run',
      { p_work_line_id: WORK_LINE_ID, p_owning_team_id: TEAM_ID, p_target_date: '2026-07-17' },
    ])
    expect(result).toEqual(rpcResult)
  })

  it('AC-620: re-throws when the RPC returns an error', async () => {
    const rec = freshRec()
    mockSupabase({ 'rpc.spawn_process_run': [{ data: null, error: { message: 'not authorized' } }] }, rec)

    await expect(startRun(WORK_LINE_ID, TEAM_ID, '2026-07-17')).rejects.toThrow(/not authorized/)
  })
})

// ── listDueRuns (B2) ──────────────────────────────────────────────────────────
describe('listDueRuns', () => {
  it('calls mos.due_process_runs and returns DueProcessRun rows', async () => {
    const rec = freshRec()
    const dueRow: DueProcessRun = {
      work_line_id: WORK_LINE_ID, process_name: 'Café Opening',
      owning_team_id: TEAM_ID, team_name: 'Own Team',
      period_key: '2026-07-17', scheduled_date: '2026-07-17',
    }
    mockSupabase({ 'rpc.due_process_runs': [{ data: [dueRow], error: null }] }, rec)

    const rows = await listDueRuns()

    expect(rec.rpcs).toContainEqual(['due_process_runs', undefined])
    expect(rows).toEqual([dueRow])
  })

  it('re-throws when the RPC returns an error', async () => {
    const rec = freshRec()
    mockSupabase({ 'rpc.due_process_runs': [{ data: null, error: { message: 'boom' } }] }, rec)

    await expect(listDueRuns()).rejects.toThrow(/boom/)
  })
})

// ── listPendingTasks / resolvePendingTask (B3, AC-621) ───────────────────────
const RUN_ID = '00000000-0000-0000-0000-00000000r001'
const PENDING_ID = '00000000-0000-0000-0000-00000000p001'
const PIC_ID = '00000000-0000-0000-0000-00000000f002'

describe('listPendingTasks', () => {
  it('AC-621: selects unresolved process_run_pending_tasks for the run', async () => {
    const rec = freshRec()
    const pendingRow: PendingTaskRow = {
      id: PENDING_ID, process_run_id: RUN_ID, task_def_id: 'def-1',
      candidate_person_ids: [PIC_ID, 'f003'], reason: 'multiple', resolved_at: null,
    }
    mockSupabase({ 'mos.process_run_pending_tasks': [{ data: [pendingRow], error: null }] }, rec)

    const rows = await listPendingTasks(RUN_ID)

    expect(rec.fromTables).toContain('mos.process_run_pending_tasks')
    expect(rec.eqs).toContainEqual(['resolved_at', null])
    expect(rec.eqs).toContainEqual(['process_run_id', RUN_ID])
    expect(rows).toEqual([pendingRow])
  })

  it('re-throws when the read errors', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.process_run_pending_tasks': [{ data: null, error: { message: 'read failed' } }] }, rec)

    await expect(listPendingTasks(RUN_ID)).rejects.toThrow(/read failed/)
  })
})

describe('resolvePendingTask', () => {
  it('AC-621: calls mos.resolve_pending_task with the RPC args and returns the new task id', async () => {
    const rec = freshRec()
    mockSupabase({ 'rpc.resolve_pending_task': [{ data: 'task-9', error: null }] }, rec)

    const taskId = await resolvePendingTask(PENDING_ID, PIC_ID)

    expect(rec.rpcs).toContainEqual([
      'resolve_pending_task',
      { p_pending_id: PENDING_ID, p_pic_person_id: PIC_ID },
    ])
    expect(taskId).toBe('task-9')
  })

  it('re-throws when the RPC returns an error', async () => {
    const rec = freshRec()
    mockSupabase({ 'rpc.resolve_pending_task': [{ data: null, error: { message: 'already resolved' } }] }, rec)

    await expect(resolvePendingTask(PENDING_ID, PIC_ID)).rejects.toThrow(/already resolved/)
  })
})
