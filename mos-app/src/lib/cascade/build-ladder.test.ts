import { describe, it, expect } from 'vitest'
import { buildLadder } from './build-ladder'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { ObjectiveRow } from '@/lib/db/objectives'
import type { WorkLineRow } from '@/lib/db/work-lines'

const VIEWER_ID = 'viewer-1'
const OTHER_ID = 'other-1'

const objectives: ObjectiveRow[] = [
  { id: 'obj-1', name: 'Objective 1' },
  { id: 'obj-2', name: 'Objective 2' },
]

const workLines: WorkLineRow[] = [
  { id: 'wl-1', name: 'Alpha project', type: 'project' },
  { id: 'wl-2', name: 'Beta process', type: 'process' },
]

function makeTask(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: overrides.id ?? 'task-1',
    org_id: 'org-1',
    title: overrides.title ?? 'Task',
    business_unit_id: 'bu-1',
    status: 'Open',
    responsible_person_id: overrides.responsible_person_id ?? OTHER_ID,
    accountable_person_id: overrides.accountable_person_id ?? OTHER_ID,
    consulted_person_ids: overrides.consulted_person_ids ?? [],
    informed_person_ids: overrides.informed_person_ids ?? [],
    description: null,
    due_date: null,
    objective_id: 'objective_id' in overrides ? overrides.objective_id ?? null : 'obj-1',
    work_line_id: 'work_line_id' in overrides ? overrides.work_line_id ?? null : 'wl-1',
    last_activity_at: '2026-07-06T00:00:00Z',
    archived_at: null,
    created_by: 'creator-1',
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z',
  }
}

const labels = {
  unlinked: '(Unlinked)',
  noWorkLine: 'No Project/Process',
  untitledObjective: 'Untitled objective',
  untitledWorkLine: 'Untitled project/process',
}

describe('buildLadder', () => {
  it('AC-301: nests tasks under objective then work-line groups', () => {
    const ladder = buildLadder({
      objectives,
      workLines,
      tasks: [
        makeTask({ id: 't-1', title: 'Project task', work_line_id: 'wl-1' }),
        makeTask({ id: 't-2', title: 'Process task', work_line_id: 'wl-2' }),
      ],
      viewerId: VIEWER_ID,
      mine: false,
      labels,
    })

    expect(ladder).toHaveLength(1)
    expect(ladder[0].label).toBe('Objective 1')
    expect(ladder[0].workLines.map((group) => group.label)).toEqual(['Alpha project', 'Beta process'])
    expect(ladder[0].workLines[0].tasks.map((task) => task.title)).toEqual(['Project task'])
    expect(ladder[0].workLines[1].tasks.map((task) => task.title)).toEqual(['Process task'])
  })

  it('AC-301: Mine narrows to the viewer-owned branch and drops empty branches', () => {
    const ladder = buildLadder({
      objectives,
      workLines,
      tasks: [
        makeTask({ id: 't-1', title: 'Mine', work_line_id: 'wl-1', responsible_person_id: VIEWER_ID }),
        makeTask({ id: 't-2', title: 'Not mine', work_line_id: 'wl-2' }),
        makeTask({ id: 't-3', title: 'Other objective', objective_id: 'obj-2', work_line_id: 'wl-1' }),
      ],
      viewerId: VIEWER_ID,
      mine: true,
      labels,
    })

    expect(ladder).toHaveLength(1)
    expect(ladder[0].label).toBe('Objective 1')
    expect(ladder[0].workLines).toHaveLength(1)
    expect(ladder[0].workLines[0].label).toBe('Alpha project')
    expect(ladder[0].workLines[0].tasks.map((task) => task.title)).toEqual(['Mine'])
  })

  it('AC-301: puts objective-less tasks under the Unlinked objective branch', () => {
    const ladder = buildLadder({
      objectives,
      workLines,
      tasks: [makeTask({ id: 't-1', title: 'Unlinked task', objective_id: null, work_line_id: 'wl-2' })],
      viewerId: VIEWER_ID,
      mine: false,
      labels,
    })

    expect(ladder).toHaveLength(1)
    expect(ladder[0]).toMatchObject({ key: '__unlinked__', label: '(Unlinked)', isUnlinked: true })
    expect(ladder[0].workLines[0].label).toBe('Beta process')
    expect(ladder[0].workLines[0].tasks.map((task) => task.title)).toEqual(['Unlinked task'])
  })

  it('AC-301: puts work-line-less tasks under the No Project/Process subgroup', () => {
    const ladder = buildLadder({
      objectives,
      workLines,
      tasks: [
        makeTask({ id: 't-1', title: 'No work line', objective_id: 'obj-1', work_line_id: null }),
        makeTask({ id: 't-2', title: 'No links', objective_id: null, work_line_id: null }),
      ],
      viewerId: VIEWER_ID,
      mine: false,
      labels,
    })

    expect(ladder).toHaveLength(2)
    expect(ladder[0].workLines[0]).toMatchObject({
      key: '__no_workline__',
      label: 'No Project/Process',
      type: null,
      isNoWorkLine: true,
    })
    expect(ladder[0].workLines[0].tasks.map((task) => task.title)).toEqual(['No work line'])
    expect(ladder[1]).toMatchObject({ key: '__unlinked__', label: '(Unlinked)' })
    expect(ladder[1].workLines[0].tasks.map((task) => task.title)).toEqual(['No links'])
  })

  it('AC-301: returns an empty ladder when there are no tasks', () => {
    expect(buildLadder({ objectives, workLines, tasks: [], viewerId: VIEWER_ID, mine: false, labels })).toEqual([])
  })

  it('review-fix #4: never drops a task when the objective/work_line catalogs are empty — renders fallback groups', () => {
    // Catalogs empty/late/failed (useCascadeCatalogs non-blocking contract): tasks reference ids
    // the catalog doesn't know. They must STILL render under fallback labels — never vanish.
    const ladder = buildLadder({
      objectives: [],
      workLines: [],
      tasks: [
        makeTask({ id: 't-1', title: 'Linked task', objective_id: 'obj-9', work_line_id: 'wl-9' }),
        makeTask({ id: 't-2', title: 'No work line', objective_id: 'obj-9', work_line_id: null }),
        makeTask({ id: 't-3', title: 'Unlinked task', objective_id: null, work_line_id: 'wl-9' }),
      ],
      viewerId: VIEWER_ID,
      mine: false,
      labels,
    })

    // Objective obj-9 (not in catalog) renders under the fallback label, with its two work_line
    // branches (wl-9 fallback + the No Project/Process synthetic group).
    expect(ladder).toHaveLength(2)
    expect(ladder[0]).toMatchObject({ key: 'obj-9', label: 'Untitled objective', isUnlinked: false })
    expect(ladder[0].workLines.map((g) => g.label)).toEqual(['Untitled project/process', 'No Project/Process'])
    expect(ladder[0].workLines[0]).toMatchObject({ key: 'wl-9', type: null, isNoWorkLine: false })
    expect(ladder[0].workLines[0].tasks.map((t) => t.title)).toEqual(['Linked task'])
    expect(ladder[0].workLines[1].tasks.map((t) => t.title)).toEqual(['No work line'])
    // Unlinked objective branch keeps its task too.
    expect(ladder[1]).toMatchObject({ key: '__unlinked__', label: '(Unlinked)', isUnlinked: true })
    expect(ladder[1].workLines[0].label).toBe('Untitled project/process')
    expect(ladder[1].workLines[0].tasks.map((t) => t.title)).toEqual(['Unlinked task'])
  })

  it('review-fix #4: a partial catalog (only objectives loaded) still renders work_line fallbacks', () => {
    const ladder = buildLadder({
      objectives: [{ id: 'obj-1', name: 'Objective 1' }],
      workLines: [],
      tasks: [makeTask({ id: 't-1', title: 'Task', objective_id: 'obj-1', work_line_id: 'wl-7' })],
      viewerId: VIEWER_ID,
      mine: false,
      labels,
    })

    expect(ladder).toHaveLength(1)
    expect(ladder[0].label).toBe('Objective 1')
    expect(ladder[0].workLines[0]).toMatchObject({ key: 'wl-7', label: 'Untitled project/process', type: null })
    expect(ladder[0].workLines[0].tasks.map((t) => t.title)).toEqual(['Task'])
  })
})
