import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: vi.fn() },
}))

import { supabase } from '@/lib/supabase'
import { listProcessCollectionFacts } from './work-records'

const schemaMock = vi.mocked(supabase.schema)

type Run = {
  id: string
  work_line_id: string
  period_key: string
  scheduled_date: string
  status: 'open' | 'completed' | 'cancelled'
}

type Cadence = {
  work_line_id: string
  cadence_kind: 'manual' | 'daily' | 'weekly' | 'monthly'
  active: boolean
  anchor_date: string | null
}

type Rollup = {
  process_run_id: string
  scheduled_date: string
  status: 'open' | 'completed' | 'cancelled'
  done: number
  total: number
  pending_unresolved: number
}

type Result = { data: unknown; error: { message: string } | null }

interface Recorder {
  selects: string[]
  ins: Array<{ table: string; column: string; values: unknown[] }>
}

function mockSupabase({ cadences, runs, rollups, rollupError = null }: {
  cadences: Cadence[]
  runs: Run[]
  rollups: Rollup[]
  rollupError?: { message: string } | null
}): Recorder {
  const recorder: Recorder = { selects: [], ins: [] }
  const responses: Record<string, Result> = {
    'mos.process_cadences': { data: cadences, error: null },
    'mos.process_runs': { data: runs, error: null },
    'mos.process_run_rollup': { data: rollups, error: rollupError },
  }

  schemaMock.mockImplementation((schemaName: string) => ({
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {}
      const response = responses[`${schemaName}.${table}`] ?? { data: [], error: null }
      builder.select = vi.fn((value: string) => {
        recorder.selects.push(`${table}:${value}`)
        return builder
      })
      builder.in = vi.fn((column: string, values: unknown[]) => {
        recorder.ins.push({ table, column, values })
        return builder
      })
      builder.order = vi.fn(() => builder)
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve)
      return builder
    }),
  }) as never)

  return recorder
}

const WORK_LINE_ID = 'wl-process'
const TODAY = '2026-09-09'

function dailyCadence(): Cadence {
  return { work_line_id: WORK_LINE_ID, cadence_kind: 'daily', active: true, anchor_date: null }
}

function run(overrides: Partial<Run> & Pick<Run, 'id'>): Run {
  return {
    work_line_id: WORK_LINE_ID,
    period_key: TODAY,
    scheduled_date: TODAY,
    status: 'open',
    ...overrides,
  }
}

function rollup(processRunId: string, overrides: Partial<Rollup> = {}): Rollup {
  return {
    process_run_id: processRunId,
    scheduled_date: TODAY,
    status: 'open',
    done: 0,
    total: 0,
    pending_unresolved: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-09T05:00:00Z'))
  vi.clearAllMocks()
})

afterEach(() => vi.useRealTimers())

describe('listProcessCollectionFacts', () => {
  it('aggregates every current-period Team run and retains the contributing run ids', async () => {
    const recorder = mockSupabase({
      cadences: [dailyCadence()],
      runs: [
        run({ id: 'run-team-a' }),
        run({ id: 'run-team-b' }),
        run({ id: 'run-yesterday', period_key: '2026-09-08', scheduled_date: '2026-09-08', status: 'completed' }),
      ],
      rollups: [
        rollup('run-team-a', { done: 1, total: 2, pending_unresolved: 1 }),
        rollup('run-team-b', { done: 2, total: 3 }),
      ],
    })

    const [fact] = await listProcessCollectionFacts([WORK_LINE_ID])

    expect(fact.current_occurrence).toEqual({
      run_ids: ['run-team-a', 'run-team-b'],
      scheduled_date: TODAY,
      status: 'open',
      done: 3,
      total: 5,
      pending_unresolved: 1,
    })
    expect(recorder.ins.find((entry) => entry.table === 'process_run_rollup')).toEqual({
      table: 'process_run_rollup',
      column: 'process_run_id',
      values: ['run-team-a', 'run-team-b'],
    })
  })

  it('keeps a started zero-task occurrence with unresolved assignments distinct from not started', async () => {
    mockSupabase({
      cadences: [dailyCadence()],
      runs: [run({ id: 'run-pending' })],
      rollups: [rollup('run-pending', { pending_unresolved: 1 })],
    })

    const [fact] = await listProcessCollectionFacts([WORK_LINE_ID])

    expect(fact.current_occurrence).toMatchObject({
      run_ids: ['run-pending'],
      done: 0,
      total: 0,
      pending_unresolved: 1,
    })
    expect(fact.current_occurrence).not.toBeNull()
  })

  it('keeps open manual occurrences from prior dates in the on-demand progress roll-up', async () => {
    const manual: Cadence = { ...dailyCadence(), cadence_kind: 'manual' }
    mockSupabase({
      cadences: [manual],
      runs: [
        run({ id: 'run-yesterday-open', period_key: '2026-09-08', scheduled_date: '2026-09-08' }),
        run({ id: 'run-today-closed', status: 'completed' }),
        run({ id: 'run-old-cancelled', period_key: '2026-09-07', scheduled_date: '2026-09-07', status: 'cancelled' }),
      ],
      rollups: [rollup('run-yesterday-open', { scheduled_date: '2026-09-08', done: 1, total: 2 })],
    })

    const [fact] = await listProcessCollectionFacts([WORK_LINE_ID])

    expect(fact.current_occurrence).toMatchObject({
      run_ids: ['run-yesterday-open'],
      scheduled_date: '2026-09-08',
      done: 1,
      total: 2,
    })
  })

  it('fails when a matching current occurrence has no authoritative roll-up', async () => {
    mockSupabase({
      cadences: [dailyCadence()],
      runs: [run({ id: 'run-without-rollup' })],
      rollups: [],
    })

    await expect(listProcessCollectionFacts([WORK_LINE_ID])).rejects.toThrow(/missing rollup.*run-without-rollup/i)
  })

  it('surfaces an authoritative current roll-up read failure', async () => {
    mockSupabase({
      cadences: [dailyCadence()],
      runs: [run({ id: 'run-rollup-error' })],
      rollups: [],
      rollupError: { message: 'rollup unavailable' },
    })

    await expect(listProcessCollectionFacts([WORK_LINE_ID])).rejects.toThrow(/rollups failed.*rollup unavailable/i)
  })
})
