// Typed catalog presentation for Projects & Processes and Objectives.
//
// A catalog row is a record door. Mutations live on the record's overflow/action area, so the
// collection stays scannable: one primary identity, a few facts, and one activation target. The
// same DOM reflows from a dense desktop table into a phone card without inventing a second IA.
import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Tag } from '@/components/ui/tag'
import { PersonCell } from '@/components/tasks/pic-cell'
import { useT } from '@/i18n/use-t'
import { formatWibDateTime } from '@/lib/format/date'
import { readPersistedLocale } from '@/i18n/I18nProvider'
import type { CountRollup } from '@/lib/cascade/count-rollup'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import type {
  CatalogCollectionContext,
  CatalogCollectionQuery,
  CatalogRenderGroup,
  CatalogRow,
} from './catalog-collection-adapter'
import { CATALOG_COLUMN_DEFS, type CatalogColumnId } from './catalog-columns'
import '@/components/collection-grammar.css'
import './catalog-collection.css'

type CatalogListProps = CollectionPresentationProps<
  CatalogRow,
  CatalogCollectionQuery,
  CollectionProjection<CatalogRow, CatalogRenderGroup>,
  CatalogCollectionContext,
  string
>

function recordPath(row: CatalogRow): string {
  return row.type ? `/work/projects/${row.id}` : `/work/objectives/${row.id}`
}


function progressText(
  done: number,
  total: number,
  t: ReturnType<typeof useT>,
): string {
  return total > 0
    ? t('catalog.relations.progress', { done: String(done), total: String(total) })
    : t('catalog.noTasks')
}

function rowProgressText(
  row: CatalogRow,
  progress: CountRollup | undefined,
  t: ReturnType<typeof useT>,
): string {
  if (row.type !== 'process') {
    if (!progress) return t('catalog.noTasks')
    return row.type === undefined
      ? t('catalog.objectives.taskProgress', { done: String(progress.done), total: String(progress.total) })
      : progressText(progress.done, progress.total, t)
  }

  // A Process is a repeatable definition, so its catalog progress is about today's/current
  // occurrence. Lifetime linked Tasks belong to the cascade relation and must not masquerade as
  // the current run's progress on this row.
  if (row.cadenceActive !== true || !row.cadenceKind) return t('catalog.process.noSchedule')
  if (row.cadenceKind === 'manual' && !row.currentOccurrence) return t('catalog.process.onDemand')
  if (!row.currentOccurrence) return t('catalog.process.notStarted')
  if (row.currentOccurrence.pending_unresolved > 0) {
    const pending = t('catalog.process.awaitingAssignment', {
      count: String(row.currentOccurrence.pending_unresolved),
    })
    return row.currentOccurrence.total > 0
      ? `${progressText(row.currentOccurrence.done, row.currentOccurrence.total, t)} · ${pending}`
      : pending
  }
  if (row.currentOccurrence.total === 0) return t('catalog.process.startedNoTasks')
  return progressText(row.currentOccurrence.done, row.currentOccurrence.total, t)
}

function latestActivity(
  context: CatalogCollectionContext,
  row: CatalogRow,
  t: ReturnType<typeof useT>,
): string {
  const value = context.lastActivityById?.get(row.id)
  return value ? formatWibDateTime(value) : t('catalog.noActivity')
}

function directoryName(
  id: string | null | undefined,
  names: ReadonlyMap<string, string> | undefined,
  t: ReturnType<typeof useT>,
): string {
  if (!id) return t('catalog.notSet')
  return names?.get(id) ?? t('catalog.notAvailable')
}

function ownerCellValue(
  id: string | null | undefined,
  names: ReadonlyMap<string, string> | undefined,
  t: ReturnType<typeof useT>,
) {
  const fullName = id ? names?.get(id) : undefined
  const displayName = fullName ?? directoryName(id, names, t)
  return fullName ? <PersonCell fullName={fullName} /> : (
    <span className="catalog-collection__cell-value catalog-collection__cell-value--muted" aria-hidden="true">
      {displayName}
    </span>
  )
}

function dueValue(row: CatalogRow, t: ReturnType<typeof useT>): { label: string; missing: boolean } {
  if (row.type !== 'process') return { label: t('catalog.notSet'), missing: true }
  const cadenceLabels = {
    manual: t('catalog.record.cadence.manual'),
    daily: t('catalog.record.cadence.daily'),
    weekly: t('catalog.record.cadence.weekly'),
    monthly: t('catalog.record.cadence.monthly'),
  }
  const cadence = row.cadenceKind ? cadenceLabels[row.cadenceKind] : t('catalog.notSet')
  if (!row.nextDueDate) return { label: cadence, missing: !row.cadenceKind }
  const locale = readPersistedLocale() === 'id' ? 'id-ID' : 'en-GB'
  const due = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${row.nextDueDate}T00:00:00Z`))
  return { label: `${cadence} · ${due}`, missing: false }
}

function primaryRelation(context: CatalogCollectionContext, row: CatalogRow) {
  const groups = context.relationsById.get(row.id)?.groups ?? []
  const direct = groups.find((group) => group.relationship === 'direct' && !group.synthetic)
  if (context.relationsKind === 'work_line') return direct
  return direct ?? groups.find((group) => group.relationship === 'contribution' && !group.synthetic)
}

export function CatalogListPresentation({ query, projection, context, onOpenRecord }: CatalogListProps) {
  const t = useT()
  const viewLabel = t(query.view === 'archived' ? 'catalog.view.archived' : query.view === 'all' ? 'catalog.view.all' : 'catalog.view.active')
  const isObjective = context.relationsKind === 'objective'

  // A fact that is empty on every visible row is left out (header and cells) instead of printing
  // "–" / "Not set" down the list. With no rows the headers stay so the empty list keeps its shape.
  const rows = projection.visibleRecords
  const shows = (present: (row: CatalogRow) => boolean) => rows.length === 0 || rows.some(present)
  const showRelation = shows((row) => isObjective
    ? row.businessUnitId != null || row.isCompanyWide === true || row.periodYear != null
    : primaryRelation(context, row) != null || (context.relationsById.get(row.id)?.groups ?? []).some((group) => group.relationship === 'contribution' && !group.synthetic))
  const showOwner = shows((row) => row.accountablePersonId != null)
  const showCadence = shows((row) => {
    const groups = context.relationsById.get(row.id)?.groups ?? []
    if (isObjective) return primaryRelation(context, row) != null || groups.some((group) => group.entity === 'work-line')
    return !dueValue(row, t).missing
  })
  const hiddenClasses = [
    showRelation ? '' : ' catalog-collection__table--no-relation',
    showOwner ? '' : ' catalog-collection__table--no-owner',
    showCadence ? '' : ' catalog-collection__table--no-cadence',
  ].join('')

  const table = useReactTable({
    data: rows as CatalogRow[],
    columns: CATALOG_COLUMN_DEFS,
    state: { columnVisibility: { relation: showRelation, owner: showOwner, cadence: showCadence } },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  })
  const metadataColumns = table.getVisibleLeafColumns().filter((column) => column.id !== 'name')

  return (
    <div
      className={`catalog-collection__table catalog-collection__table--${context.relationsKind}${hiddenClasses}`}
      role="table"
      aria-label={viewLabel}
    >
      <div className="catalog-collection__header" role="row">
        {table.getHeaderGroups()[0]?.headers.map((header) => {
          const meta = header.column.columnDef.meta!
          const labelKey = isObjective && meta.objectiveLabelKey ? meta.objectiveLabelKey : meta.labelKey
          return (
            <span key={header.id} role="columnheader" className={meta.thClass || undefined}>
              {t(labelKey)}
            </span>
          )
        })}
      </div>
      <ul className="catalog-collection__list" role="rowgroup">
        {rows.map((row) => {
          const rowArchived = row.archived_at !== null
          const relation = primaryRelation(context, row)
          const relationGroups = context.relationsById.get(row.id)?.groups ?? []
          const contributions = relationGroups.filter((group) => group.relationship === 'contribution' && !group.synthetic)
          const directWork = relationGroups.filter((group) => group.relationship === 'direct' && group.entity === 'work-line' && !group.synthetic)
          const workLabel = directWork.length > 0 ? directWork.map((group) => group.name).join(', ') : t('catalog.notSet')
          const workViaTasksNote = contributions.length > 0
            ? t(directWork.length > 0 ? 'catalog.relations.workAlsoViaTasks' : 'catalog.relations.workViaTasks', { names: contributions.map((group) => group.name).join(', ') })
            : null
          const objectiveContributionNote = contributions.length > 0
            ? t(relation ? 'catalog.relations.alsoContributes' : 'catalog.relations.taskContributions', { names: contributions.map((group) => group.name).join(', ') })
            : null
          const progress = context.progressById.get(row.id)
          const relationLabel = relation
            ? relation.relationship === 'contribution'
              ? t('catalog.relations.contributesTo', { name: relation.name })
              : relation.name
            : t('catalog.notSet')
          const progressLabel = rowProgressText(row, progress, t)
          const activityLabel = latestActivity(context, row, t)
          // One word for one fact: what a reader sees in the cell is what a screen reader hears,
          // and the same word the Accountable field on the record itself uses for the same gap.
          const ownerLabel = directoryName(row.accountablePersonId, context.peopleById, t)
          const businessUnitMissing = !row.businessUnitId && !row.isCompanyWide
          const businessUnitLabel = row.isCompanyWide ? t('catalog.companyWide') : directoryName(row.businessUnitId, context.businessUnitsById, t)
          const quarterLabels = [t('catalog.period.q1'), t('catalog.period.q2'), t('catalog.period.q3'), t('catalog.period.q4')]
          const periodNote = row.periodYear == null ? null : row.periodQuarter ? `${row.periodYear} · ${quarterLabels[row.periodQuarter - 1]}` : String(row.periodYear)
          const cadenceDue = dueValue(row, t)
          const cadenceDueLabel = cadenceDue.label
          const objectiveRelationName = [relationLabel, objectiveContributionNote].filter(Boolean).join('. ')
          const typeTag = row.type ? (
            <Tag color={row.type === 'project' ? 'blue' : 'sand'}>
              {t(row.type === 'project' ? 'catalog.tag.project' : 'catalog.tag.process')}
            </Tag>
          ) : null

          const cells: Record<Exclude<CatalogColumnId, 'name'>, ReactNode> = {
            relation: (
              <span key="relation"
                className="catalog-collection__cell catalog-collection__cell--relation"
                role="cell"
                aria-label={`${context.relationsKind === 'objective' ? t('catalog.column.businessUnit') : t('catalog.column.objective')}: ${context.relationsKind === 'objective' ? businessUnitLabel : objectiveRelationName}`}
              >
                <span className="catalog-collection__cell-label">{context.relationsKind === 'objective' ? t('catalog.column.businessUnit') : t('catalog.column.objective')}</span>
                <span className={context.relationsKind === 'objective' ? (businessUnitMissing ? 'catalog-collection__cell-value catalog-collection__cell-value--muted' : 'catalog-collection__cell-value') : (relation ? 'catalog-collection__cell-value' : 'catalog-collection__cell-value catalog-collection__cell-value--muted')}>
                  {context.relationsKind === 'objective' ? businessUnitLabel : relationLabel}
                </span>
                {context.relationsKind === 'objective' && periodNote ? (
                  <span className="catalog-collection__cell-note">{periodNote}</span>
                ) : null}
                {context.relationsKind === 'work_line' && objectiveContributionNote ? (
                  <span className="catalog-collection__cell-note">{objectiveContributionNote}</span>
                ) : null}
              </span>
            ),
            owner: (
              <div key="owner"
                className="catalog-collection__cell catalog-collection__cell--owner"
                role="cell"
                aria-label={`${t('catalog.column.accountable')}: ${ownerLabel}`}
                title={ownerLabel}
              >
                <span className="catalog-collection__cell-label">{t('catalog.column.accountable')}</span>
                {ownerCellValue(row.accountablePersonId, context.peopleById, t)}
              </div>
            ),
            cadence: (
              <span key="cadence"
                className="catalog-collection__cell catalog-collection__cell--cadence"
                role="cell"
                aria-label={`${context.relationsKind === 'objective' ? t('catalog.column.work') : t('catalog.column.cadenceDue')}: ${context.relationsKind === 'objective' ? [workLabel, workViaTasksNote].filter(Boolean).join('. ') : cadenceDueLabel}`}
              >
                <span className="catalog-collection__cell-label">{context.relationsKind === 'objective' ? t('catalog.column.work') : t('catalog.column.cadenceDue')}</span>
                <span className={(context.relationsKind === 'objective' ? directWork.length === 0 : cadenceDue.missing) ? 'catalog-collection__cell-value catalog-collection__cell-value--muted' : 'catalog-collection__cell-value'}>
                  {context.relationsKind === 'objective' ? workLabel : cadenceDueLabel}
                </span>
                {context.relationsKind === 'objective' && workViaTasksNote ? (
                  <span className="catalog-collection__cell-note">{workViaTasksNote}</span>
                ) : null}
              </span>
            ),
            progress: (
              <span key="progress" className="catalog-collection__cell catalog-collection__cell--progress" role="cell">
                <span className="catalog-collection__cell-label">{t('catalog.column.progress')}</span>
                <span className="catalog-collection__cell-value tabular-nums" data-testid="catalog-progress" title={progressLabel}>{progressLabel}</span>
              </span>
            ),
            activity: (
              <span key="activity" className="catalog-collection__cell catalog-collection__cell--activity" role="cell">
                <span className="catalog-collection__cell-label">{t('catalog.column.activity')}</span>
                <span className="catalog-collection__cell-value">{activityLabel}</span>
              </span>
            ),
          }

          return (
            <li
              key={row.id}
              className={`catalog-collection__row${rowArchived ? ' catalog-collection__row--archived' : ''}`}
              role="row"
              data-catalog-row-id={row.id}
              onClick={(event: MouseEvent<HTMLLIElement>) => {
                if (!onOpenRecord || (event.target instanceof Element && event.target.closest('a, button, [role="button"]'))) return
                onOpenRecord(row)
              }}
            >
              <span className="catalog-collection__identity" role="cell">
                <Link
                  className="catalog-collection__row-link"
                  to={recordPath(row)}
                  aria-label={row.name}
                  onClick={(event) => {
                    // Keep the canonical href for refresh/new-tab semantics, while letting the
                    // collection host promote an in-app click into the shared Work record panel.
                    if (!onOpenRecord || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                    event.preventDefault()
                    onOpenRecord(row)
                  }}
                >
                  <span className="catalog-collection__name">{row.name}</span>
                </Link>
                {typeTag}
                <span className="catalog-collection__row-state">
                  {t(rowArchived ? 'catalog.view.archived' : 'catalog.view.active')}
                </span>
              </span>
              <span className="catalog-collection__primary-action" aria-hidden="true">
                {t('common.view')}
              </span>
              <div className="catalog-collection__metadata" role="presentation">
                {metadataColumns.map((column) => cells[column.id as Exclude<CatalogColumnId, 'name'>])}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
