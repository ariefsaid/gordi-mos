import { translateFor } from '@/i18n/use-t'
import { readPersistedLocale } from '@/i18n/I18nProvider'
import { supabase } from '@/lib/supabase'
import { listObjectivesAll, readObjective, type ObjectiveRecord } from '@/lib/db/objectives'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { readWorkLine, type WorkLineRecord, type WorkLineAdminRow } from '@/lib/db/work-lines'
import { loadProcessRecordData, type ProcessRecordData } from '@/lib/db/work-records'
import type {
  CatalogCollectionContext,
  CatalogRelationGroup,
  CatalogRelationTask,
  CatalogRelations,
  CatalogRow,
} from './catalog-collection-adapter'

const mos = () => supabase.schema('mos')
const shared = () => supabase.schema('shared')
type SchemaClient = ReturnType<typeof mos>

const WORK_LINE_COLUMNS =
  'id,name,type,objective_id,business_unit_id,accountable_person_id,responsible_person_id,archived_at'
const TASK_COLUMNS =
  'id,title,status,last_activity_at,archived_at,objective_id,work_line_id,responsible_person_id,accountable_person_id,business_unit_id'

type RelatedWorkLine = Pick<WorkLineAdminRow, 'id' | 'name' | 'type' | 'objective_id' | 'archived_at' | 'business_unit_id' | 'accountable_person_id' | 'responsible_person_id'>
type RelatedTask = {
  id: string
  title: string
  status: string
  last_activity_at: string
  archived_at: string | null
  objective_id: string | null
  work_line_id: string | null
  responsible_person_id: string | null
  accountable_person_id: string | null
  business_unit_id: string | null
}

type DefinitionTeamBinding = {
  id: string
  pic_team_id: string | null
  supervisor_team_id: string | null
}

export interface CatalogRecordData {
  row: CatalogRow
  context: CatalogCollectionContext
  process: ProcessRecordData | null
  peopleById: ReadonlyMap<string, string>
  roleNamesById: ReadonlyMap<string, string>
  /** `${definitionId}:pic|supervisor` -> authoritative Team name, or null when unbound. */
  owningTeams: ReadonlyMap<string, string | null>
}

export interface CatalogRecordEditDirectory {
  businessUnitsById: ReadonlyMap<string, string>
  peopleById: ReadonlyMap<string, string>
  objectiveOptions: readonly { value: string; label: string }[]
}

function asRows<T>(data: unknown): T[] {
  return (data ?? []) as T[]
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function rowForObjective(row: ObjectiveRecord): CatalogRow {
  return {
    id: row.id,
    name: row.name,
    archived_at: row.archived_at,
    businessUnitId: row.business_unit_id,
    accountablePersonId: row.accountable_person_id,
    periodYear: row.period_year,
  }
}

function rowForWorkLine(row: WorkLineRecord): CatalogRow {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    archived_at: row.archived_at,
    objectiveId: row.objective_id,
    businessUnitId: row.business_unit_id,
    accountablePersonId: row.accountable_person_id,
    responsiblePersonId: row.responsible_person_id,
  }
}

function relationTask(task: RelatedTask): CatalogRelationTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status as CatalogRelationTask['status'],
    lastActivityAt: task.last_activity_at,
  }
}

function countTasks(tasks: readonly RelatedTask[]) {
  return {
    total: tasks.length,
    done: tasks.filter((task) => task.status === 'Done').length,
  }
}

function latestActivity(tasks: readonly RelatedTask[]): string | null {
  return tasks.reduce<string | null>((latest, task) => (
    !latest || task.last_activity_at > latest ? task.last_activity_at : latest
  ), null)
}

function dedupeTasks(tasks: readonly RelatedTask[]): RelatedTask[] {
  const byId = new Map<string, RelatedTask>()
  for (const task of tasks) byId.set(task.id, task)
  return [...byId.values()]
}

/**
 * Load the option sets used only after a manageable record is ready to edit. Keeping this out of
 * the primary record read preserves the id-scoped document path while retaining the existing
 * editor choices for Business Unit, people, and parent Objective.
 */
export async function loadCatalogRecordEditDirectory(
  kind: 'objective' | 'work-line',
): Promise<CatalogRecordEditDirectory> {
  const [businessUnits, people, objectives] = await Promise.all([
    getBusinessUnits(),
    getPeople(),
    kind === 'work-line' ? listObjectivesAll() : Promise.resolve([]),
  ])
  return {
    businessUnitsById: new Map(businessUnits.map((unit) => [unit.id, unit.name])),
    peopleById: new Map(people.map((person) => [person.id, person.full_name])),
    objectiveOptions: objectives.map((objective) => ({ value: objective.id, label: objective.name })),
  }
}

async function loadObjectiveWorkLines(db: SchemaClient, objectiveId: string): Promise<RelatedWorkLine[]> {
  const { data, error } = await db.from('work_lines')
    .select(WORK_LINE_COLUMNS)
    .eq('objective_id', objectiveId)
    .order('name')
  if (error) throw new Error(`loadCatalogRecordData work lines failed — ${error.message}`)
  return asRows<RelatedWorkLine>(data)
}

// An Objective's work is linked two ways: a Project/Process can point at the Objective directly, or
// the Objective's Tasks can sit under a Project/Process. The collection list counts both, so the
// record loads both — work lines named only by the Objective's Tasks are fetched by id.
async function loadTaskWorkLines(
  db: SchemaClient,
  tasks: readonly RelatedTask[],
  known: readonly RelatedWorkLine[],
): Promise<RelatedWorkLine[]> {
  const knownIds = new Set(known.map((workLine) => workLine.id))
  const missing = unique(tasks.map((task) => task.work_line_id)).filter((id) => !knownIds.has(id))
  if (missing.length === 0) return []
  const { data, error } = await db.from('work_lines').select(WORK_LINE_COLUMNS).in('id', missing).order('name')
  if (error) throw new Error(`loadCatalogRecordData task work lines failed — ${error.message}`)
  return asRows<RelatedWorkLine>(data)
}

async function loadObjectiveTasks(
  db: SchemaClient,
  objectiveId: string,
  workLineIds: readonly string[],
): Promise<RelatedTask[]> {
  const directQuery = db.from('tasks')
    .select(TASK_COLUMNS)
    .eq('objective_id', objectiveId)
    .is('archived_at', null)
  const linkedQuery = workLineIds.length > 0
    ? db.from('tasks')
      .select(TASK_COLUMNS)
      .in('work_line_id', workLineIds)
      .is('archived_at', null)
    : null
  const [directResult, linkedResult] = await Promise.all([
    directQuery,
    linkedQuery ?? Promise.resolve({ data: [], error: null }),
  ])
  if (directResult.error) throw new Error(`loadCatalogRecordData objective tasks failed — ${directResult.error.message}`)
  if (linkedResult.error) throw new Error(`loadCatalogRecordData work-line tasks failed — ${linkedResult.error.message}`)
  return dedupeTasks([
    ...asRows<RelatedTask>(directResult.data),
    ...asRows<RelatedTask>(linkedResult.data),
  ].filter((task) => task.archived_at === null))
}

async function loadWorkLineTasks(db: SchemaClient, workLineId: string): Promise<RelatedTask[]> {
  const { data, error } = await db.from('tasks')
    .select(TASK_COLUMNS)
    .eq('work_line_id', workLineId)
    .is('archived_at', null)
  if (error) throw new Error(`loadCatalogRecordData work-line tasks failed — ${error.message}`)
  return dedupeTasks(asRows<RelatedTask>(data).filter((task) => task.archived_at === null))
}

async function loadDefinitionTeamBindings(db: SchemaClient, workLineId: string): Promise<DefinitionTeamBinding[]> {
  const { data, error } = await db.from('process_task_defs')
    .select('id,pic_team_id,supervisor_team_id')
    .eq('work_line_id', workLineId)
    .is('archived_at', null)
  if (error) throw new Error(`loadCatalogRecordData Process owning Teams failed — ${error.message}`)
  return asRows<DefinitionTeamBinding>(data)
}

async function loadDirectoryNames(
  db: ReturnType<typeof shared>,
  ids: {
    businessUnitIds: readonly string[]
    personIds: readonly string[]
    roleIds: readonly string[]
    teamIds: readonly string[]
  },
): Promise<{
  businessUnitsById: Map<string, string>
  peopleById: Map<string, string>
  roleNamesById: Map<string, string>
  teamNamesById: Map<string, string>
}> {
  const [businessUnitsResult, peopleResult, rolesResult, teamsResult] = await Promise.all([
    ids.businessUnitIds.length > 0
      ? db.from('business_units').select('id,name').in('id', ids.businessUnitIds)
      : Promise.resolve({ data: [], error: null }),
    ids.personIds.length > 0
      ? db.from('people').select('id,full_name').in('id', ids.personIds).is('archived_at', null)
      : Promise.resolve({ data: [], error: null }),
    ids.roleIds.length > 0
      ? db.from('roles').select('id,name').in('id', ids.roleIds)
      : Promise.resolve({ data: [], error: null }),
    ids.teamIds.length > 0
      ? db.from('teams').select('id,name').in('id', ids.teamIds).is('archived_at', null)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (businessUnitsResult.error) throw new Error(`loadCatalogRecordData business units failed — ${businessUnitsResult.error.message}`)
  if (peopleResult.error) throw new Error(`loadCatalogRecordData people failed — ${peopleResult.error.message}`)
  if (rolesResult.error) throw new Error(`loadCatalogRecordData roles failed — ${rolesResult.error.message}`)
  if (teamsResult.error) throw new Error(`loadCatalogRecordData Teams failed — ${teamsResult.error.message}`)
  return {
    businessUnitsById: new Map(asRows<{ id: string; name: string }>(businessUnitsResult.data).map((row) => [row.id, row.name])),
    peopleById: new Map(asRows<{ id: string; full_name: string }>(peopleResult.data).map((row) => [row.id, row.full_name])),
    roleNamesById: new Map(asRows<{ id: string; name: string }>(rolesResult.data).map((row) => [row.id, row.name])),
    teamNamesById: new Map(asRows<{ id: string; name: string }>(teamsResult.data).map((row) => [row.id, row.name])),
  }
}

function relationContext(
  row: CatalogRow,
  relations: CatalogRelations,
  progress: { done: number; total: number },
  latest: string | null,
  relationsKind: 'objective' | 'work_line',
  directory: Pick<Awaited<ReturnType<typeof loadDirectoryNames>>, 'businessUnitsById' | 'peopleById'>,
  objectiveOptions: readonly { value: string; label: string }[],
): CatalogCollectionContext {
  return {
    traceById: new Map(),
    relationsById: new Map([[row.id, relations]]),
    relationsKind,
    progressById: new Map([[row.id, progress]]),
    lastActivityById: new Map([[row.id, latest]]),
    businessUnitsById: directory.businessUnitsById,
    peopleById: directory.peopleById,
    objectiveOptions,
  }
}

function objectiveRelations(
  workLines: readonly RelatedWorkLine[],
  tasks: readonly RelatedTask[],
): { relations: CatalogRelations; progress: { done: number; total: number } } {
  const labels = translateFor(readPersistedLocale())
  const groups: CatalogRelationGroup[] = []
  const relationTasks: RelatedTask[] = []
  for (const workLine of workLines) {
    const childTasks = tasks.filter((task) => task.work_line_id === workLine.id)
    const count = countTasks(childTasks)
    relationTasks.push(...childTasks)
    groups.push({
      id: workLine.id,
      name: workLine.name,
      taskCount: count.total,
      done: count.done,
      total: count.total,
      tasks: childTasks.map(relationTask),
    })
  }
  const unassignedTasks = tasks.filter((task) => task.work_line_id === null)
  if (unassignedTasks.length > 0) {
    const count = countTasks(unassignedTasks)
    relationTasks.push(...unassignedTasks)
    groups.push({
      id: '__no_work_line__',
      name: labels('rollup.group.noWorkLine'),
      taskCount: count.total,
      done: count.done,
      total: count.total,
      synthetic: 'no-work-line',
      tasks: unassignedTasks.map(relationTask),
    })
  }
  const allTasks = dedupeTasks([...relationTasks, ...tasks])
  const progress = countTasks(allTasks)
  return {
    relations: { groups, tasks: allTasks.map(relationTask) },
    progress,
  }
}

function workLineRelations(
  parent: ObjectiveRecord | null,
  tasks: readonly RelatedTask[],
): { relations: CatalogRelations; progress: { done: number; total: number } } {
  const labels = translateFor(readPersistedLocale())
  const count = countTasks(tasks)
  const groups: CatalogRelationGroup[] = []
  if (parent) {
    groups.push({
      id: parent.id,
      name: parent.name,
      taskCount: count.total,
      done: count.done,
      total: count.total,
      tasks: tasks.map(relationTask),
    })
  } else if (tasks.length > 0) {
    groups.push({
      id: '__unlinked__',
      name: labels('rollup.group.unlinked'),
      taskCount: count.total,
      done: count.done,
      total: count.total,
      synthetic: 'unlinked',
      tasks: tasks.map(relationTask),
    })
  }
  return { relations: { groups, tasks: tasks.map(relationTask) }, progress: count }
}

/** Load one catalog record and only the facts that can appear on that record. */
export async function loadCatalogRecordData(
  kind: 'objective' | 'work-line',
  id: string,
  _viewerId?: string | null,
): Promise<CatalogRecordData | null> {
  // Row visibility and related facts are enforced by the authenticated Supabase client/RLS.
  void _viewerId
  const source = kind === 'objective' ? await readObjective(id) : await readWorkLine(id)
  if (!source) return null
  const objectiveSource = kind === 'objective' ? source as ObjectiveRecord : null
  const workLineSource = kind === 'work-line' ? source as WorkLineRecord : null

  const db = mos()
  const parentPromise = workLineSource?.objective_id
    ? readObjective(workLineSource.objective_id)
    : Promise.resolve(null)
  const processPromise = workLineSource?.type === 'process'
    ? loadProcessRecordData(id)
    : Promise.resolve(null)
  const definitionTeamBindingsPromise = workLineSource?.type === 'process'
    ? loadDefinitionTeamBindings(db, id)
    : Promise.resolve([] as DefinitionTeamBinding[])
  const relatedPromise = kind === 'objective'
    ? loadObjectiveWorkLines(db, id).then(async (direct) => {
      const tasks = await loadObjectiveTasks(db, id, direct.map((workLine) => workLine.id))
      const viaTasks = await loadTaskWorkLines(db, tasks, direct)
      const workLines = [...direct, ...viaTasks].sort((a, b) => a.name.localeCompare(b.name))
      return { workLines, tasks }
    })
    : loadWorkLineTasks(db, id).then((tasks) => ({ workLines: [] as RelatedWorkLine[], tasks }))

  const [parent, process, definitionTeamBindings, related] = await Promise.all([
    parentPromise,
    processPromise,
    definitionTeamBindingsPromise,
    relatedPromise,
  ])

  const sourceRow = objectiveSource ? rowForObjective(objectiveSource) : rowForWorkLine(workLineSource!)
  const personIds = kind === 'objective'
    ? unique([objectiveSource!.accountable_person_id])
    : unique([workLineSource!.accountable_person_id, workLineSource!.responsible_person_id])
  const processPersonIds = process?.steps.flatMap((step) => [step.pic_person_id, step.supervisor_person_id]) ?? []
  const processRoleIds = process?.steps.flatMap((step) => [step.pic_role_id, step.supervisor_role_id]) ?? []
  const definitionTeamIds = unique(definitionTeamBindings.flatMap((binding) => [binding.pic_team_id, binding.supervisor_team_id]))
  const sharedClient = unique([
    ...personIds,
    ...processPersonIds,
  ]).length > 0 || definitionTeamIds.length > 0 || processRoleIds.length > 0 || Boolean(sourceRow.businessUnitId)
    ? shared()
    : null
  const directory = sharedClient
    ? await loadDirectoryNames(sharedClient, {
      businessUnitIds: unique([objectiveSource?.business_unit_id ?? workLineSource?.business_unit_id]),
      personIds: unique([...personIds, ...processPersonIds]),
      roleIds: unique(processRoleIds),
      teamIds: definitionTeamIds,
    })
    : {
      businessUnitsById: new Map<string, string>(),
      peopleById: new Map<string, string>(),
      roleNamesById: new Map<string, string>(),
      teamNamesById: new Map<string, string>(),
    }

  const owningTeams = new Map<string, string | null>()
  for (const binding of definitionTeamBindings) {
    owningTeams.set(`${binding.id}:pic`, binding.pic_team_id ? directory.teamNamesById.get(binding.pic_team_id) ?? null : null)
    owningTeams.set(`${binding.id}:supervisor`, binding.supervisor_team_id ? directory.teamNamesById.get(binding.supervisor_team_id) ?? null : null)
  }

  const built = kind === 'objective'
    ? objectiveRelations(related.workLines, related.tasks)
    : workLineRelations(parent, related.tasks)
  const context = relationContext(
    sourceRow,
    built.relations,
    built.progress,
    latestActivity(related.tasks),
    kind === 'objective' ? 'objective' : 'work_line',
    directory,
    parent ? [{ value: parent.id, label: parent.name }] : [],
  )
  return {
    row: sourceRow,
    context,
    process,
    peopleById: directory.peopleById,
    roleNamesById: directory.roleNamesById,
    owningTeams,
  }
}
