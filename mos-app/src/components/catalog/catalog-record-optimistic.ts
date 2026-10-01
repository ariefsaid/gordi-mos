// Optimistic edits of a loaded Objective record: the linked-work list shows a link the moment it is
// chosen, and the same function pair takes it back out when the write fails.
import type { CatalogRelationGroup } from './catalog-collection-adapter'
import type { CatalogRecordData, CatalogWorkLineFact } from './catalog-record-loader'

/** `data` with `workLine` listed as linked to `objectiveId`; a re-link of the same id replaces its row. */
export function withLinkedWorkLine(data: CatalogRecordData, objectiveId: string, workLine: CatalogWorkLineFact): CatalogRecordData {
  const relations = data.context.relationsById.get(objectiveId)
  const group: CatalogRelationGroup = {
    id: workLine.id, name: workLine.name, relationship: 'direct', entity: 'work-line',
    objectiveId, workLineId: workLine.id, taskCount: 0, done: 0, total: 0,
  }
  const relationsById = new Map(data.context.relationsById)
  relationsById.set(objectiveId, {
    groups: [...(relations?.groups ?? []).filter((existing) => existing.id !== workLine.id), group],
    tasks: relations?.tasks ?? [],
  })
  return {
    ...data,
    context: { ...data.context, relationsById },
    workLinesById: new Map(data.workLinesById).set(workLine.id, { ...workLine, objectiveId }),
  }
}

/** `data` without the linked-work row for `workLineId`. */
export function withoutLinkedWorkLine(data: CatalogRecordData, objectiveId: string, workLineId: string): CatalogRecordData {
  const relations = data.context.relationsById.get(objectiveId)
  if (!relations) return data
  const relationsById = new Map(data.context.relationsById)
  relationsById.set(objectiveId, { ...relations, groups: relations.groups.filter((group) => group.id !== workLineId) })
  const workLinesById = new Map(data.workLinesById)
  workLinesById.delete(workLineId)
  return { ...data, context: { ...data.context, relationsById }, workLinesById }
}
