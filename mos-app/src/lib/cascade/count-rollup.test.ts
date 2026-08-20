import { describe, expect, it } from 'vitest'
import {
  buildCountRollup,
  buildObjectiveBranches,
  branchKey,
  formatCountRollup,
  resolveTaskObjectiveId,
  NO_WORK_LINE_KEY,
  UNLINKED_OBJECTIVE_KEY,
  type BranchTask,
} from './count-rollup'

const MINE = 'person-mine'
const OTHER = 'person-other'

const task = (over: Partial<BranchTask> & { id: string }): BranchTask => ({
  status: 'Open',
  archived_at: null,
  objective_id: null,
  work_line_id: null,
  responsible_person_id: OTHER,
  accountable_person_id: OTHER,
  ...over,
})

/** Two Objectives, three Project/Process lines, one of them parentless. */
const OBJECTIVES = [{ id: 'o1', name: 'Grow revenue' }, { id: 'o2', name: 'Cut waste' }]
const WORK_LINES = [
  { id: 'w1', name: 'Launch', type: 'project' as const, objective_id: 'o1' },
  { id: 'w2', name: 'Weekly close', type: 'process' as const, objective_id: 'o2' },
  { id: 'w3', name: 'Loose ends', type: 'process' as const, objective_id: null },
]

describe('count roll-up', () => {
  it('counts active Done/total tasks through direct objective and work-line edges', () => {
    const result = buildCountRollup({
      objectives: [{ id: 'o1', name: 'Grow' }],
      workLines: [{ id: 'w1', name: 'Launch', type: 'project', objective_id: 'o1' }],
      tasks: [
        task({ id: 'done', status: 'Done', objective_id: 'o1', work_line_id: 'w1' }),
        task({ id: 'open', objective_id: 'o1', work_line_id: 'w1' }),
        task({ id: 'archived', status: 'Done', archived_at: '2026-01-01', objective_id: 'o1', work_line_id: 'w1' }),
      ],
    })
    expect(result.objectives[0]).toMatchObject({ id: 'o1', done: 1, total: 2 })
    expect(result.workLines[0]).toMatchObject({ id: 'w1', done: 1, total: 2 })
    expect(formatCountRollup(result.objectives[0])).toBe('1 / 2 done')
  })

  it('is a count roll-up only — no measure, no target, no percentage (OD-WAY-32)', () => {
    const result = buildCountRollup({ objectives: OBJECTIVES, workLines: WORK_LINES, tasks: [
      task({ id: 't1', status: 'Done', work_line_id: 'w1' }),
    ] })
    const shapes = [...result.objectives, ...result.workLines, ...result.branches]
    for (const row of shapes) {
      expect(Object.keys(row)).toEqual(expect.arrayContaining(['done', 'total']))
      expect(row).not.toHaveProperty('target')
      expect(row).not.toHaveProperty('measure')
      expect(row).not.toHaveProperty('percentage')
    }
  })

  it('counts a work-line-only task under its direct Objective edge', () => {
    const result = buildCountRollup({
      objectives: [{ id: 'o1', name: 'Grow' }],
      workLines: WORK_LINES,
      tasks: [
        task({ id: 'work-line-only', objective_id: null, work_line_id: 'w1' }),
        task({ id: 'objective-only', status: 'Done', objective_id: 'o1', work_line_id: null }),
      ],
    })
    // The work-line-only task carries no objective_id of its own, so it can only reach o1 through
    // w1's direct edge. That is the whole point of the edge.
    expect(result.objectives.find((row) => row.id === 'o1')).toMatchObject({ done: 1, total: 2 })
    expect(result.workLines.find((row) => row.id === 'w1')).toMatchObject({ done: 0, total: 1 })
  })

  it('resolves the Objective through the work-line edge before the legacy Task field', () => {
    const workLines = new Map([['w1', { objective_id: 'o1' }]])
    expect(resolveTaskObjectiveId({ objective_id: 'o-stale', work_line_id: 'w1' }, workLines)).toBe('o1')
    expect(resolveTaskObjectiveId({ objective_id: 'o-stale', work_line_id: null }, workLines)).toBe('o-stale')
    expect(resolveTaskObjectiveId({ objective_id: null, work_line_id: null }, workLines)).toBeNull()
  })

  it('groups branches under their Objective, and the unlinked ones under their own key', () => {
    const result = buildCountRollup({
      objectives: OBJECTIVES,
      workLines: WORK_LINES,
      tasks: [
        task({ id: 'a', work_line_id: 'w1' }),
        task({ id: 'b', objective_id: 'o1', work_line_id: null }),
        task({ id: 'c', work_line_id: 'w3' }),
        task({ id: 'd', objective_id: null, work_line_id: null }),
      ],
    })
    expect(result.groupsByObjective.get('o1')?.map((b) => b.key)).toEqual([
      branchKey('o1', 'w1'), branchKey('o1', null),
    ])
    // Work nobody linked to anything still has a home, and it is not silently folded into a real
    // Objective — that is how untracked work goes missing.
    expect(result.groupsByObjective.get(UNLINKED_OBJECTIVE_KEY)?.map((b) => b.key)).toEqual([
      branchKey(null, 'w3'), branchKey(null, null),
    ])
  })
})

describe('buildObjectiveBranches — the ONE shared projection', () => {
  const tasks = [
    task({ id: 'w1-done', status: 'Done', work_line_id: 'w1', responsible_person_id: MINE }),
    task({ id: 'w1-open', work_line_id: 'w1' }),
    task({ id: 'o1-direct', objective_id: 'o1', work_line_id: null, accountable_person_id: MINE }),
    task({ id: 'w3-loose', work_line_id: 'w3' }),
    task({ id: 'nowhere', responsible_person_id: MINE }),
    task({ id: 'archived', status: 'Done', archived_at: '2026-02-02', work_line_id: 'w1' }),
  ]

  it('renders BOTH synthetic branches rather than hiding their tasks', () => {
    const branches = buildObjectiveBranches({ objectives: OBJECTIVES, workLines: WORK_LINES, tasks })

    const noWorkLine = branches.find((b) => b.key === branchKey('o1', null))!
    expect(noWorkLine).toMatchObject({
      objectiveId: 'o1', objectiveName: 'Grow revenue',
      workLineName: 'No Project/Process', syntheticWorkLine: true, syntheticObjective: false,
      done: 0, total: 1,
    })
    expect(noWorkLine.tasks.map((t) => t.id)).toEqual(['o1-direct'])

    const unlinked = branches.find((b) => b.key === branchKey(null, null))!
    expect(unlinked).toMatchObject({
      objectiveId: null, objectiveName: '(Unlinked)',
      workLineName: 'No Project/Process', syntheticObjective: true, syntheticWorkLine: true,
      done: 0, total: 1,
    })
    expect(unlinked.tasks.map((t) => t.id)).toEqual(['nowhere'])

    // A real Project/Process with no parent Objective is half-synthetic and keeps its own name.
    expect(branches.find((b) => b.key === branchKey(null, 'w3'))).toMatchObject({
      objectiveName: '(Unlinked)', workLineName: 'Loose ends',
      syntheticObjective: true, syntheticWorkLine: false, total: 1,
    })
  })

  it('drops archived tasks from the branch counts', () => {
    const branches = buildObjectiveBranches({ objectives: OBJECTIVES, workLines: WORK_LINES, tasks })
    const w1 = branches.find((b) => b.key === branchKey('o1', 'w1'))!
    expect(w1).toMatchObject({ done: 1, total: 2 })
    expect(w1.tasks.map((t) => t.id)).toEqual(['w1-done', 'w1-open'])
  })

  it('Mine keeps only the tasks this person is Responsible or Accountable for', () => {
    const branches = buildObjectiveBranches({
      objectives: OBJECTIVES, workLines: WORK_LINES, tasks, minePersonId: MINE,
    })
    expect(branches.flatMap((b) => b.tasks.map((t) => t.id)).sort())
      .toEqual(['nowhere', 'o1-direct', 'w1-done'])
    // Mine narrows the counts too — a roll-up that ignored the filter would claim work the viewer
    // cannot see on the same screen.
    expect(branches.find((b) => b.key === branchKey('o1', 'w1'))).toMatchObject({ done: 1, total: 1 })
    // …and both synthetic branches survive the filter, which is exactly when they matter most.
    expect(branches.find((b) => b.key === branchKey('o1', null))?.total).toBe(1)
    expect(branches.find((b) => b.key === branchKey(null, null))?.total).toBe(1)
  })

  it('orders real work before the synthetic leftovers, at both levels', () => {
    const branches = buildObjectiveBranches({ objectives: OBJECTIVES, workLines: WORK_LINES, tasks })
    expect(branches.map((b) => b.key)).toEqual([
      branchKey('o1', 'w1'),   // Grow revenue → Launch
      branchKey('o1', null),   // Grow revenue → No Project/Process
      branchKey(null, 'w3'),   // (Unlinked) → Loose ends
      branchKey(null, null),   // (Unlinked) → No Project/Process
    ])
  })

  it('keeps a childless real work line only when the caller asks for it', () => {
    const args = { objectives: OBJECTIVES, workLines: WORK_LINES, tasks: [] }
    // A catalog row shows a child that holds no work yet…
    expect(buildObjectiveBranches({ ...args, includeEmptyWorkLines: true }).map((b) => b.key))
      .toEqual([branchKey('o2', 'w2'), branchKey('o1', 'w1'), branchKey(null, 'w3')])
    // …a list of tasks does not.
    expect(buildObjectiveBranches(args)).toEqual([])
  })

  it('takes localized synthetic copy from the caller', () => {
    const branches = buildObjectiveBranches({
      objectives: OBJECTIVES, workLines: WORK_LINES,
      tasks: [task({ id: 'nowhere' })],
      labels: { unlinked: '(Tidak terhubung)', noWorkLine: 'Tanpa Proyek/Proses' },
    })
    expect(branches[0]).toMatchObject({
      objectiveName: '(Tidak terhubung)', workLineName: 'Tanpa Proyek/Proses',
    })
  })

  it('spells its keys so a consumer can recognise a synthetic branch without re-deriving it', () => {
    expect(branchKey('o1', 'w1')).toBe('o1:w1')
    expect(branchKey('o1', null)).toBe(`o1:${NO_WORK_LINE_KEY}`)
    expect(branchKey(null, 'w1')).toBe(`${UNLINKED_OBJECTIVE_KEY}:w1`)
  })
})
