import type { TaskListRow } from './tasks.types'
import { listObjectives, type ObjectiveRow } from './objectives'
import { listWorkLines, type WorkLineRow } from './work-lines'
import { buildCascadeGroups, rollUpCounts, type ObjectiveInput, type WorkLineInput } from '@/lib/cascade/count-rollup'

export interface HomeObjectiveProgress {
  id: string
  name: string
  done: number
  total: number
}

export interface HomeObjectiveProgressInput {
  objectives: readonly ObjectiveRow[]
  workLines: readonly Pick<WorkLineRow, 'id' | 'name' | 'type' | 'objective_id'>[]
  tasks: readonly TaskListRow[]
}

/** Build the Home roll-up from the same Objective → Work line → Task projection as Work. */
export function buildHomeObjectiveProgress(input: HomeObjectiveProgressInput): HomeObjectiveProgress[] {
  const objectives: ObjectiveInput[] = input.objectives.map(({ id, name }) => ({ id, name }))
  const workLines: WorkLineInput[] = input.workLines.map(({ id, name, type, objective_id }) => ({
    id, name, type, objective_id,
  }))
  const groups = buildCascadeGroups({
    objectives,
    workLines,
    tasks: input.tasks,
    includeEmptyWorkLines: true,
  })
  return rollUpCounts(groups, { objectives, workLines }).objectives
}

/** Read only the catalog edges Home needs; tasks are passed from Home's shared task projection. */
export async function loadHomeObjectiveProgress(tasks: readonly TaskListRow[]): Promise<HomeObjectiveProgress[]> {
  const [objectives, workLines] = await Promise.all([listObjectives(), listWorkLines()])
  return buildHomeObjectiveProgress({ objectives, workLines, tasks: [...tasks] })
}
