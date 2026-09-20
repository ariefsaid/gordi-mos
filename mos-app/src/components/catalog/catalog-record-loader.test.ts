import { beforeEach, describe, expect, it, vi } from 'vitest'

const schemaMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase', () => ({ supabase: { schema: schemaMock } }))
vi.mock('@/lib/db/objectives', () => ({ readObjective: vi.fn(), listObjectivesAll: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn(), getPeople: vi.fn() }))
vi.mock('@/lib/db/work-lines', () => ({ readWorkLine: vi.fn() }))
vi.mock('@/lib/db/work-records', () => ({ loadProcessRecordData: vi.fn() }))

import { listObjectivesAll, readObjective } from '@/lib/db/objectives'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { readWorkLine } from '@/lib/db/work-lines'
import { loadProcessRecordData } from '@/lib/db/work-records'
import { loadCatalogRecordData, loadCatalogRecordEditDirectory } from './catalog-record-loader'

type QueryRecord = {
  schema: string
  table: string
  select?: string
  filters: Array<[string, string, unknown]>
}

function makeSchema(
  schema: string,
  responses: Record<string, unknown | unknown[]>,
  queries: QueryRecord[],
) {
  const queues = new Map<string, unknown[]>()
  return {
    from(table: string) {
      const key = `${schema}.${table}`
      if (!queues.has(key)) {
        const configured = responses[key]
        queues.set(key, Array.isArray(configured) ? [...configured] : configured === undefined ? [] : [configured])
      }
      const responseQueue = queues.get(key)!
      const query: QueryRecord = { schema, table, filters: [] }
      queries.push(query)
      const builder: Record<string, unknown> = {}
      builder.select = vi.fn((columns: string) => { query.select = columns; return builder })
      builder.eq = vi.fn((column: string, value: unknown) => { query.filters.push(['eq', column, value]); return builder })
      builder.in = vi.fn((column: string, values: unknown[]) => { query.filters.push(['in', column, values]); return builder })
      builder.is = vi.fn((column: string, value: unknown) => { query.filters.push(['is', column, value]); return builder })
      builder.order = vi.fn(() => builder)
      builder.maybeSingle = vi.fn(() => builder)
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(responseQueue.shift() ?? { data: [], error: null }).then(resolve)
      return builder
    },
  }
}

const objective = {
  id: 'obj-1', name: 'Grow revenue', archived_at: null,
  business_unit_id: 'bu-1', accountable_person_id: 'person-a', period_year: 2026,
  updated_at: '2026-08-01T00:00:00Z',
}

const workLine = {
  id: 'wl-1', name: 'Menu launch', type: 'project' as const, objective_id: 'obj-1',
  business_unit_id: 'bu-1', accountable_person_id: 'person-a', responsible_person_id: 'person-b',
  archived_at: null, updated_at: '2026-08-01T00:00:00Z',
}

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1', title: 'Print the menus', status: 'Done', last_activity_at: '2026-08-02T00:00:00Z',
  archived_at: null, objective_id: null, work_line_id: 'wl-1',
  responsible_person_id: 'person-b', accountable_person_id: 'person-a', business_unit_id: 'bu-1',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readObjective).mockResolvedValue(objective)
  vi.mocked(readWorkLine).mockResolvedValue(workLine)
  vi.mocked(loadProcessRecordData).mockResolvedValue({ cadence: null, steps: [], occurrences: [] })
  vi.mocked(listObjectivesAll).mockResolvedValue([])
  vi.mocked(getBusinessUnits).mockResolvedValue([])
  vi.mocked(getPeople).mockResolvedValue([])
})

describe('loadCatalogRecordData query boundaries', () => {
  it('loads an Objective directly and scopes child work-line/task facts to that id', async () => {
    const queries: QueryRecord[] = []
    schemaMock
      .mockReturnValueOnce(makeSchema('mos', {
        'mos.work_lines': { data: [workLine], error: null },
        'mos.tasks': [
          { data: [task({ id: 'task-direct', work_line_id: null, objective_id: 'obj-1' })], error: null },
          { data: [task()], error: null },
        ],
      }, queries))
      .mockReturnValueOnce(makeSchema('shared', {
        'shared.business_units': { data: [{ id: 'bu-1', name: 'Retail Ops' }], error: null },
        'shared.people': { data: [{ id: 'person-a', full_name: 'Accountable A' }], error: null },
      }, queries))

    const result = await loadCatalogRecordData('objective', 'obj-1')

    expect(readObjective).toHaveBeenCalledWith('obj-1')
    expect(readWorkLine).not.toHaveBeenCalled()
    expect(queries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        schema: 'mos', table: 'work_lines',
        filters: [['eq', 'objective_id', 'obj-1']],
      }),
      expect.objectContaining({
        schema: 'mos', table: 'tasks',
        filters: expect.arrayContaining([['eq', 'objective_id', 'obj-1'], ['is', 'archived_at', null]]),
      }),
      expect.objectContaining({
        schema: 'mos', table: 'tasks',
        filters: expect.arrayContaining([['in', 'work_line_id', ['wl-1']], ['is', 'archived_at', null]]),
      }),
    ]))
    expect(result?.row).toMatchObject({ id: 'obj-1', name: 'Grow revenue', periodYear: 2026 })
    const objectiveRelations = result?.context.relationsById.get('obj-1')
    expect(objectiveRelations?.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'wl-1', name: 'Menu launch', total: 1, done: 1 }),
    ]))
    expect(objectiveRelations?.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'task-direct' }),
      expect.objectContaining({ id: 'task-1' }),
    ]))
  })

  it('lists a Project that reaches the Objective only through the Objective\'s Tasks', async () => {
    const queries: QueryRecord[] = []
    const viaTask = { ...workLine, id: 'wl-2', name: 'Brand refresh', objective_id: null }
    schemaMock
      .mockReturnValueOnce(makeSchema('mos', {
        'mos.work_lines': [
          { data: [], error: null },
          { data: [viaTask], error: null },
        ],
        'mos.tasks': { data: [task({ id: 'task-2', objective_id: 'obj-1', work_line_id: 'wl-2' })], error: null },
      }, queries))
      .mockReturnValueOnce(makeSchema('shared', {}, queries))

    const result = await loadCatalogRecordData('objective', 'obj-1')

    expect(queries).toEqual(expect.arrayContaining([
      expect.objectContaining({ schema: 'mos', table: 'work_lines', filters: [['in', 'id', ['wl-2']]] }),
    ]))
    expect(result?.context.relationsById.get('obj-1')?.groups).toEqual([
      expect.objectContaining({ id: 'wl-2', name: 'Brand refresh', total: 1, done: 1 }),
    ])
  })

  it('loads a Process WorkLine and its definition-level Teams, never occurrence ownership', async () => {
    const queries: QueryRecord[] = []
    vi.mocked(readWorkLine).mockResolvedValue({ ...workLine, type: 'process' })
    vi.mocked(readObjective).mockResolvedValue(objective)
    vi.mocked(loadProcessRecordData).mockResolvedValue({
      cadence: null,
      steps: [{
        id: 'def-1', work_line_id: 'wl-1', title: 'Open', description: null, position: 1,
        due_offset_days: 0, pic_person_id: 'person-a', pic_role_id: 'role-a',
        supervisor_person_id: null, supervisor_role_id: null, archived_at: null,
      }],
      occurrences: [{
        id: 'run-1', work_line_id: 'wl-1', owning_team_id: 'occurrence-team', period_key: '2026-08-01',
        caption: 'August', scheduled_date: '2026-08-01', status: 'open', definition_version: 1,
        started_by: null, completed_at: null, completed_by: null,
      }],
    })
    schemaMock
      .mockReturnValueOnce(makeSchema('mos', {
        'mos.tasks': [{ data: [task()], error: null }],
        'mos.process_task_defs': [{ data: [{ id: 'def-1', pic_team_id: 'definition-team', supervisor_team_id: null }], error: null }],
      }, queries))
      .mockReturnValueOnce(makeSchema('shared', {
        'shared.business_units': { data: [{ id: 'bu-1', name: 'Retail Ops' }], error: null },
        'shared.people': { data: [{ id: 'person-a', full_name: 'Accountable A' }], error: null },
        'shared.teams': { data: [{ id: 'definition-team', name: 'Definition Team' }], error: null },
      }, queries))

    const result = await loadCatalogRecordData('work-line', 'wl-1')

    expect(readWorkLine).toHaveBeenCalledWith('wl-1')
    expect(readObjective).toHaveBeenCalledWith('obj-1')
    expect(loadProcessRecordData).toHaveBeenCalledWith('wl-1')
    expect(queries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        schema: 'mos', table: 'process_task_defs',
        filters: expect.arrayContaining([['eq', 'work_line_id', 'wl-1'], ['is', 'archived_at', null]]),
      }),
    ]))
    expect(result?.owningTeams).toEqual(new Map([
      ['def-1:pic', 'Definition Team'],
      ['def-1:supervisor', null],
    ]))
    expect(result?.owningTeams.has('occurrence-team')).toBe(false)
    expect(listObjectivesAll).not.toHaveBeenCalled()
    expect(getBusinessUnits).not.toHaveBeenCalled()
    expect(getPeople).not.toHaveBeenCalled()
  })

  it('keeps editor-wide choices in a deferred load separate from the primary record read', async () => {
    vi.mocked(listObjectivesAll).mockResolvedValue([
      { id: 'obj-1', name: 'Grow revenue', archived_at: null },
      { id: 'obj-2', name: 'Improve margin', archived_at: null },
    ])
    vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Retail Ops' }])
    vi.mocked(getPeople).mockResolvedValue([{ id: 'person-a', full_name: 'Accountable A' }])

    await expect(loadCatalogRecordEditDirectory('work-line')).resolves.toEqual({
      businessUnitsById: new Map([['bu-1', 'Retail Ops']]),
      peopleById: new Map([['person-a', 'Accountable A']]),
      objectiveOptions: [
        { value: 'obj-1', label: 'Grow revenue' },
        { value: 'obj-2', label: 'Improve margin' },
      ],
    })
    expect(listObjectivesAll).toHaveBeenCalledTimes(1)
    expect(getBusinessUnits).toHaveBeenCalledTimes(1)
    expect(getPeople).toHaveBeenCalledTimes(1)
  })

  it('does not load Process data for a Project record and returns null for an invisible row', async () => {
    vi.mocked(readWorkLine).mockResolvedValue({ ...workLine, type: 'project' })
    const queries: QueryRecord[] = []
    schemaMock.mockReturnValue(makeSchema('mos', {
      'mos.tasks': [{ data: [], error: null }],
    }, queries))
    await expect(loadCatalogRecordData('work-line', 'wl-1')).resolves.toMatchObject({ row: { type: 'project' } })
    expect(loadProcessRecordData).not.toHaveBeenCalled()

    const queryCount = queries.length
    vi.mocked(readWorkLine).mockResolvedValue(null)
    await expect(loadCatalogRecordData('work-line', 'missing')).resolves.toBeNull()
    expect(queries).toHaveLength(queryCount)
  })
})
