import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Café DAL (Step 7 / cafe-retrofit.spec.md). Reaches mos via supabase.schema('mos') on the SAME
// client processes.ts uses — mirrors processes.test.ts's mock harness so getTodayOpeningForTeam's
// internal getRunRollup() call (from ./processes) is exercised through the same mock, not a second
// module mock.
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import {
  wibToday, getCafeOpeningProcessId, getTodayOpeningForTeam,
  startTodayOpening, listStartableCafeTeams,
} from './cafe-opening'
import { supabase } from '@/lib/supabase'
import type { DueProcessRun, ProcessRunRollup, SpawnResult } from './processes.types'

const schemaMock = vi.mocked(supabase.schema)

// ── Mock harness (mirrors processes.test.ts) ────────────────────────────────
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
    builder.limit = vi.fn(() => builder)
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

const PROCESS_ID = '00000000-0000-0000-0000-00000000c001'
const TEAM_ID = '00000000-0000-0000-0000-000000005b01'
const RUN_ID = '00000000-0000-0000-0000-00000000r001'

// ── wibToday (B1) ─────────────────────────────────────────────────────────────
describe('wibToday', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns the WIB (+7h) calendar date as YYYY-MM-DD, rolling over past UTC midnight', () => {
    // 2026-07-17T18:00:00Z + 7h = 2026-07-18T01:00 WIB — the WIB date has already rolled to the 18th.
    vi.setSystemTime(new Date('2026-07-17T18:00:00Z'))
    expect(wibToday()).toBe('2026-07-18')
  })

  it('stays on the same UTC date when the +7h shift does not cross midnight', () => {
    vi.setSystemTime(new Date('2026-07-17T01:00:00Z')) // 08:00 WIB, same date
    expect(wibToday()).toBe('2026-07-17')
  })
})

// ── getCafeOpeningProcessId (B1, RATIFY-7F) ───────────────────────────────────
describe('getCafeOpeningProcessId', () => {
  it('resolves the id of the type=process work_line named "Café Opening"', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.work_lines': [{ data: { id: PROCESS_ID }, error: null }] }, rec)

    const id = await getCafeOpeningProcessId()

    expect(rec.fromTables).toContain('mos.work_lines')
    expect(rec.eqs).toContainEqual(['type', 'process'])
    expect(rec.eqs).toContainEqual(['name', 'Café Opening'])
    expect(id).toBe(PROCESS_ID)
  })

  it('returns null when no Café Opening process is configured (RATIFY-7C: bare org)', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.work_lines': [{ data: null, error: null }] }, rec)

    expect(await getCafeOpeningProcessId()).toBeNull()
  })

  it('re-throws when the read errors', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.work_lines': [{ data: null, error: { message: 'boom' } }] }, rec)

    await expect(getCafeOpeningProcessId()).rejects.toThrow(/boom/)
  })
})

// ── getTodayOpeningForTeam (B1, AC-710) ───────────────────────────────────────
describe('getTodayOpeningForTeam', () => {
  it('AC-710: when a run exists, reads process_run_rollup for it and returns started:true + rollup', async () => {
    const rec = freshRec()
    const rollup: ProcessRunRollup = {
      process_run_id: RUN_ID, caption: 'Café Opening · 17 Jul 2026', scheduled_date: '2026-07-17',
      status: 'open', total: 3, open: 1, in_progress: 0, blocked: 0, done: 2,
      overdue: 0, pending_unresolved: 1, completion_pct: 66.7,
    }
    mockSupabase({
      'mos.process_runs': [{ data: { id: RUN_ID }, error: null }],
      'mos.process_run_rollup': [{ data: rollup, error: null }],
    }, rec)

    const result = await getTodayOpeningForTeam(PROCESS_ID, TEAM_ID)

    expect(rec.fromTables).toContain('mos.process_runs')
    expect(rec.eqs).toContainEqual(['work_line_id', PROCESS_ID])
    expect(rec.eqs).toContainEqual(['owning_team_id', TEAM_ID])
    expect(result).toEqual({ started: true, runId: RUN_ID, rollup })
  })

  it('returns started:false with a null runId/rollup when no run exists for today', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.process_runs': [{ data: null, error: null }] }, rec)

    const result = await getTodayOpeningForTeam(PROCESS_ID, TEAM_ID)

    expect(result).toEqual({ started: false, runId: null, rollup: null })
  })

  it('re-throws when the run read errors', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.process_runs': [{ data: null, error: { message: 'read failed' } }] }, rec)

    await expect(getTodayOpeningForTeam(PROCESS_ID, TEAM_ID)).rejects.toThrow(/read failed/)
  })
})

// ── startTodayOpening / listStartableCafeTeams (B2, AC-711) ──────────────────
describe('startTodayOpening', () => {
  it('AC-711: calls Step-6 startRun(processId, teamId, wibToday()) and returns the SpawnResult', async () => {
    const rec = freshRec()
    const spawnResult: SpawnResult = { run_id: RUN_ID, created: 2, pending: 1, idempotent: false }
    mockSupabase({ 'rpc.spawn_process_run': [{ data: spawnResult, error: null }] }, rec)

    const result = await startTodayOpening(PROCESS_ID, TEAM_ID)

    expect(rec.rpcs).toContainEqual([
      'spawn_process_run',
      { p_work_line_id: PROCESS_ID, p_owning_team_id: TEAM_ID, p_target_date: wibToday() },
    ])
    expect(result).toEqual(spawnResult)
  })

  it('re-throws when the RPC errors', async () => {
    const rec = freshRec()
    mockSupabase({ 'rpc.spawn_process_run': [{ data: null, error: { message: 'not authorized' } }] }, rec)

    await expect(startTodayOpening(PROCESS_ID, TEAM_ID)).rejects.toThrow(/not authorized/)
  })
})

describe('listStartableCafeTeams', () => {
  it('calls listDueRuns and returns only the rows whose work_line_id matches processId', async () => {
    const rec = freshRec()
    const dueRows: DueProcessRun[] = [
      { work_line_id: PROCESS_ID, process_name: 'Café Opening', owning_team_id: TEAM_ID, team_name: 'Radiant', period_key: '2026-07-17', scheduled_date: '2026-07-17' },
      { work_line_id: 'other-process', process_name: 'Café Closing', owning_team_id: TEAM_ID, team_name: 'Radiant', period_key: '2026-07-17', scheduled_date: '2026-07-17' },
    ]
    mockSupabase({ 'rpc.due_process_runs': [{ data: dueRows, error: null }] }, rec)

    const rows = await listStartableCafeTeams(PROCESS_ID)

    expect(rows).toEqual([dueRows[0]])
  })
})
