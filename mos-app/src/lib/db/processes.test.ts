import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the supabase module: the processes data layer reaches mos via
// supabase.schema('mos').from(...)/.rpc(...) — mirrors signals.test.ts/tasks.ts.
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import {
  startRun, listDueRuns, listPendingTasks, resolvePendingTask,
  getRunRollup, listRunTasks, completeRun, listRunRollups,
} from './processes'
import { supabase } from '@/lib/supabase'
import type { DueProcessRun, PendingTaskRow, ProcessRunRollup, ProcessRunRow } from './processes.types'
import type { TaskListRow } from './tasks.types'

const schemaMock = vi.mocked(supabase.schema)

// ── Mock harness (mirrors signals.test.ts) ──────────────────────────────────
interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  ins: Array<[string, unknown]>
  rpcs: Array<[string, unknown]>
}

type Result = { data: unknown; error: unknown }

function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], ins: [], rpcs: [] }
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
    builder.in = vi.fn((c: string, v: unknown) => { rec.ins.push([c, v]); return builder })
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

// ── getRunRollup / listRunTasks / completeRun (B4) ───────────────────────────
describe('getRunRollup', () => {
  it('reads mos.process_run_rollup filtered by process_run_id', async () => {
    const rec = freshRec()
    const rollup: ProcessRunRollup = {
      process_run_id: RUN_ID, caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
      status: 'open', total: 1, open: 1, in_progress: 0, blocked: 0, done: 0,
      overdue: 0, pending_unresolved: 2, completion_pct: 0,
    }
    mockSupabase({ 'mos.process_run_rollup': [{ data: rollup, error: null }] }, rec)

    const result = await getRunRollup(RUN_ID)

    expect(rec.fromTables).toContain('mos.process_run_rollup')
    expect(rec.eqs).toContainEqual(['process_run_id', RUN_ID])
    expect(result).toEqual(rollup)
  })

  it('re-throws when the read errors', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.process_run_rollup': [{ data: null, error: { message: 'not found' } }] }, rec)

    await expect(getRunRollup(RUN_ID)).rejects.toThrow(/not found/)
  })
})

describe('listRunTasks', () => {
  it('reads mos.tasks filtered by process_run_id (reuses TaskListRow, no re-implemented fetch)', async () => {
    const rec = freshRec()
    const taskRow = { id: 'task-1', title: 'Open the café' } as unknown as TaskListRow
    mockSupabase({ 'mos.tasks': [{ data: [taskRow], error: null }] }, rec)

    const rows = await listRunTasks(RUN_ID)

    expect(rec.fromTables).toContain('mos.tasks')
    expect(rec.eqs).toContainEqual(['process_run_id', RUN_ID])
    expect(rows).toEqual([taskRow])
  })

  it('re-throws when the read errors', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.tasks': [{ data: null, error: { message: 'read failed' } }] }, rec)

    await expect(listRunTasks(RUN_ID)).rejects.toThrow(/read failed/)
  })
})

// ── listRunRollups (Track C wiring — batched roll-up read backing the Occurrence
// group-by in /work/tasks, C1). Reuses mos.process_run_rollup (ADR D9); a single
// `.in('process_run_id', runIds)` read instead of N getRunRollup calls per group. ─
describe('listRunRollups', () => {
  it('reads mos.process_run_rollup filtered by process_run_id IN the given run ids', async () => {
    const rec = freshRec()
    const runId2 = '00000000-0000-0000-0000-00000000r002'
    const rollups: ProcessRunRollup[] = [
      {
        process_run_id: RUN_ID, caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
        status: 'open', total: 1, open: 1, in_progress: 0, blocked: 0, done: 0,
        overdue: 0, pending_unresolved: 2, completion_pct: 0,
      },
      {
        process_run_id: runId2, caption: 'Café Closing · 17 Jul 2026', scheduled_date: '2026-07-17',
        status: 'open', total: 2, open: 1, in_progress: 0, blocked: 0, done: 1,
        overdue: 0, pending_unresolved: 0, completion_pct: 50,
      },
    ]
    mockSupabase({ 'mos.process_run_rollup': [{ data: rollups, error: null }] }, rec)

    const rows = await listRunRollups([RUN_ID, runId2])

    expect(rec.fromTables).toContain('mos.process_run_rollup')
    expect(rec.ins).toContainEqual(['process_run_id', [RUN_ID, runId2]])
    expect(rows).toEqual(rollups)
  })

  it('returns [] without a read when given an empty run-id list (no needless network call)', async () => {
    const rec = freshRec()
    mockSupabase({}, rec)

    const rows = await listRunRollups([])

    expect(rec.fromTables).toEqual([])
    expect(rows).toEqual([])
  })

  it('re-throws when the read errors', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.process_run_rollup': [{ data: null, error: { message: 'read failed' } }] }, rec)

    await expect(listRunRollups([RUN_ID])).rejects.toThrow(/read failed/)
  })
})

describe('completeRun', () => {
  it('calls mos.complete_process_run and returns the updated run', async () => {
    const rec = freshRec()
    const runRow: ProcessRunRow = {
      id: RUN_ID, work_line_id: WORK_LINE_ID, owning_team_id: TEAM_ID, period_key: '2026-07-17',
      caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17', status: 'completed',
      definition_version: 1,
    }
    mockSupabase({ 'rpc.complete_process_run': [{ data: runRow, error: null }] }, rec)

    const result = await completeRun(RUN_ID)

    expect(rec.rpcs).toContainEqual(['complete_process_run', { p_run_id: RUN_ID }])
    expect(result).toEqual(runRow)
  })

  it('re-throws when the RPC returns an error', async () => {
    const rec = freshRec()
    mockSupabase({ 'rpc.complete_process_run': [{ data: null, error: { message: 'not authorized' } }] }, rec)

    await expect(completeRun(RUN_ID)).rejects.toThrow(/not authorized/)
  })
})
