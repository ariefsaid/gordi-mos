// Optimistic edits of a loaded Objective record: the linked-work list shows a link the moment it is
// chosen, and `withPriorWorkLine` restores what was listed when the write fails.
import type { CatalogRelationGroup } from './catalog-collection-adapter'
import type { CatalogRecordData, CatalogWorkLineFact } from './catalog-record-loader'

// `data` with `workLine` listed as linked to `objectiveId`; a re-link of the same id replaces its row.
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

// What the record listed for one work line before an optimistic link, so a failed write can put it back.
export type PriorWorkLine = { groups: readonly CatalogRelationGroup[]; fact: CatalogWorkLineFact | undefined }

export function priorWorkLine(data: CatalogRecordData, objectiveId: string, workLineId: string): PriorWorkLine {
  return {
    groups: (data.context.relationsById.get(objectiveId)?.groups ?? []).filter((group) => group.id === workLineId),
    fact: data.workLinesById.get(workLineId),
  }
}

// `data` with the work line's listing put back to `prior` (a row it did not have before is removed).
export function withPriorWorkLine(data: CatalogRecordData, objectiveId: string, workLineId: string, prior: PriorWorkLine): CatalogRecordData {
  const relations = data.context.relationsById.get(objectiveId)
  if (!relations) return data
  const relationsById = new Map(data.context.relationsById)
  relationsById.set(objectiveId, { ...relations, groups: [...relations.groups.filter((group) => group.id !== workLineId), ...prior.groups] })
  const workLinesById = new Map(data.workLinesById)
  if (prior.fact) workLinesById.set(workLineId, prior.fact)
  else workLinesById.delete(workLineId)
  return { ...data, context: { ...data.context, relationsById }, workLinesById }
}
