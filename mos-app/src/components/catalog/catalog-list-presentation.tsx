// Typed catalog presentation for Projects & Processes and Objectives.
//
// A catalog row is a record door. Mutations live on the record's overflow/action area, so the
// collection stays scannable: one primary identity, a few facts, and one activation target. The
// same DOM reflows from a dense desktop table into a phone card without inventing a second IA.
import { Link } from 'react-router-dom'
import { TextInput } from '@/components/ui/text-input'
import { Picker } from '@/components/ui/picker'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { PersonCell } from '@/components/tasks/pic-cell'
import { useT } from '@/i18n/use-t'
import { formatWibDateTime } from '@/lib/wib-time'
import { readPersistedLocale } from '@/i18n/I18nProvider'
import type { CountRollup } from '@/lib/cascade/count-rollup'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import type {
  CatalogCollectionContext,
  CatalogCollectionQuery,
  CatalogRenderGroup,
  CatalogRow,
} from './catalog-collection-adapter'
import { useCatalogCollectionActions } from './catalog-collection-actions'
import type { CatalogCreateDraft } from './catalog-collection-actions'
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

function DraftRow({ draft }: { draft: CatalogCreateDraft }) {
  const t = useT()
  const label = draft.kind === 'objective' ? t('catalog.objectives.add') : t('catalog.projects.add')
  return (
    <div className="catalog-collection__draft-row">
      <form
        className="catalog-collection__draft"
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          if (!draft.adding) draft.onCancel()
        }}
        onSubmit={(event) => {
          event.preventDefault()
          draft.onSubmit()
        }}
      >
        <TextInput
          label={t('catalog.nameLabel')}
          value={draft.name}
          onChange={(event) => draft.onNameChange(event.target.value)}
          error={Boolean(draft.error)}
          autoFocus
          fullWidth
          disabled={draft.adding}
          placeholder={t('catalog.namePlaceholder')}
        />
        {draft.kind === 'work-line' && draft.type && draft.onTypeChange ? (
          <Picker
            label={t('catalog.filter.type')}
            value={draft.type}
            options={[
              { value: 'project', label: t('catalog.tag.project') },
              { value: 'process', label: t('catalog.tag.process') },
            ]}
            onChange={(value) => draft.onTypeChange?.(value as 'project' | 'process')}
            disabled={draft.adding}
          />
        ) : null}
        {draft.kind === 'work-line' && draft.objectiveOptions && draft.onObjectiveChange ? (
          <Picker
            label={t('catalog.record.objective')}
            value={draft.objectiveId ?? ''}
            placeholder={t('catalog.notSet')}
            options={[{ value: '', label: t('catalog.notSet') }, ...draft.objectiveOptions]}
            onChange={(value) => draft.onObjectiveChange?.(value || null)}
            disabled={draft.adding}
          />
        ) : null}
        {draft.businessUnitOptions && draft.onBusinessUnitChange ? (
          <Picker
            label={t('catalog.record.businessUnit')}
            value={draft.businessUnitId ?? ''}
            placeholder={draft.businessUnitRequired ? undefined : t('catalog.notSet')}
            options={draft.businessUnitRequired ? draft.businessUnitOptions : [{ value: '', label: t('catalog.notSet') }, ...draft.businessUnitOptions]}
            onChange={(value) => draft.onBusinessUnitChange?.(value || null)}
            required={draft.businessUnitRequired}
            disabled={draft.adding}
          />
        ) : null}
        <span className="catalog-collection__draft-actions">
          <Button type="submit" variant="primary" disabled={draft.adding} aria-busy={draft.adding}>
            {draft.adding ? t(draft.kind === 'objective' ? 'catalog.objectives.adding' : 'catalog.projects.adding') : t('common.save')}
          </Button>
          <Button type="button" variant="ghost" disabled={draft.adding} onClick={draft.onCancel}>
            {t('common.cancel')}
          </Button>
        </span>
        {draft.error ? <p className="catalog-collection__error" role="alert">{draft.error}</p> : null}
      </form>
    </div>
  )
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
    return progress ? progressText(progress.done, progress.total, t) : t('catalog.noTasks')
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
      {displayName === t('catalog.notSet') ? t('catalog.owner.unassigned') : displayName}
    </span>
  )
}

function visualCellValue(value: string, missing: boolean): string {
  return missing ? '–' : value
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
  return context.relationsById.get(row.id)?.groups.find((group) => !group.synthetic)
}

export function CatalogListPresentation({ query, projection, context, onOpenRecord }: CatalogListProps) {
  const t = useT()
  const actions = useCatalogCollectionActions()
  const archived = query.view === 'archived'
  const viewLabel = t(query.view === 'archived' ? 'catalog.view.archived' : query.view === 'all' ? 'catalog.view.all' : 'catalog.view.active')
  const draft = actions.createDraft?.open ? actions.createDraft : null

  return (
    <div
      className={`catalog-collection__table catalog-collection__table--${context.relationsKind}`}
      role="table"
      aria-label={viewLabel}
    >
      <div className="catalog-collection__header" role="row">
        <span role="columnheader">{t('catalog.column.name')}</span>
        <span role="columnheader">{context.relationsKind === 'objective' ? t('catalog.column.businessUnit') : t('catalog.column.objective')}</span>
        <span role="columnheader">{t('catalog.column.owner')}</span>
        <span role="columnheader">{context.relationsKind === 'objective' ? t('catalog.column.work') : t('catalog.column.cadenceDue')}</span>
        <span role="columnheader">{t('catalog.column.progress')}</span>
        <span role="columnheader">{t('catalog.column.activity')}</span>
      </div>
      {draft ? <DraftRow draft={draft} /> : null}
      <ul className="catalog-collection__list" aria-label={viewLabel}>
        {projection.visibleRecords.map((row) => {
          const relation = primaryRelation(context, row)
          const progress = context.progressById.get(row.id)
          const relationLabel = relation?.name ?? t('catalog.notSet')
          const progressLabel = rowProgressText(row, progress, t)
          const activityLabel = latestActivity(context, row, t)
          // One word for one fact: what a reader sees in the cell is what a screen reader hears.
          const ownerLabel = row.accountablePersonId
            ? directoryName(row.accountablePersonId, context.peopleById, t)
            : t('catalog.owner.unassigned')
          const businessUnitLabel = directoryName(row.businessUnitId, context.businessUnitsById, t)
          const cadenceDue = dueValue(row, t)
          const cadenceDueLabel = cadenceDue.label
          const typeTag = row.type ? (
            <Tag color={row.type === 'project' ? 'blue' : 'sand'}>
              {t(row.type === 'project' ? 'catalog.tag.project' : 'catalog.tag.process')}
            </Tag>
          ) : null

          return (
            <li
              key={row.id}
              className={`catalog-collection__row${archived ? ' catalog-collection__row--archived' : ''}`}
              role="row"
              data-catalog-row-id={row.id}
            >
              <Link
                className="catalog-collection__row-link"
                to={recordPath(row)}
                aria-label={row.name}
                role="link"
                onClick={(event) => {
                  // Keep the canonical href for refresh/new-tab semantics, while letting the
                  // collection host promote an in-app click into the shared Work record panel.
                  if (!onOpenRecord || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                  event.preventDefault()
                  onOpenRecord(row)
                }}
              >
                <span className="catalog-collection__identity" role="cell">
                  <span className="catalog-collection__name">{row.name}</span>
                  {typeTag}
                </span>
                <span
                  className="catalog-collection__cell catalog-collection__cell--relation"
                  role="cell"
                  aria-label={`${context.relationsKind === 'objective' ? t('catalog.column.businessUnit') : t('catalog.column.objective')}: ${context.relationsKind === 'objective' ? businessUnitLabel : relationLabel}`}
                >
                  <span className="catalog-collection__cell-label">{context.relationsKind === 'objective' ? t('catalog.column.businessUnit') : t('catalog.column.objective')}</span>
                  <span className={context.relationsKind === 'objective' ? (!row.businessUnitId ? 'catalog-collection__cell-value catalog-collection__cell-value--muted' : 'catalog-collection__cell-value') : (relation ? 'catalog-collection__cell-value' : 'catalog-collection__cell-value catalog-collection__cell-value--muted')}>
                    {visualCellValue(context.relationsKind === 'objective' ? businessUnitLabel : relationLabel, context.relationsKind === 'objective' ? !row.businessUnitId : !relation)}
                  </span>
                  {context.relationsKind === 'objective' && row.periodYear != null ? (
                    <span className="catalog-collection__cell-note">{row.periodYear}</span>
                  ) : null}
                </span>
                <div
                  className="catalog-collection__cell catalog-collection__cell--owner"
                  role="cell"
                  aria-label={`${t('catalog.column.owner')}: ${ownerLabel}`}
                  title={ownerLabel}
                >
                  <span className="catalog-collection__cell-label">{t('catalog.column.owner')}</span>
                  {ownerCellValue(row.accountablePersonId, context.peopleById, t)}
                </div>
                <span
                  className="catalog-collection__cell catalog-collection__cell--cadence"
                  role="cell"
                  aria-label={`${context.relationsKind === 'objective' ? t('catalog.column.work') : t('catalog.column.cadenceDue')}: ${context.relationsKind === 'objective' ? relationLabel : cadenceDueLabel}`}
                >
                  <span className="catalog-collection__cell-label">{context.relationsKind === 'objective' ? t('catalog.column.work') : t('catalog.column.cadenceDue')}</span>
                  <span className={(context.relationsKind === 'objective' ? !relation : cadenceDue.missing) ? 'catalog-collection__cell-value catalog-collection__cell-value--muted' : 'catalog-collection__cell-value'}>
                    {visualCellValue(context.relationsKind === 'objective' ? relationLabel : cadenceDueLabel, context.relationsKind === 'objective' ? !relation : cadenceDue.missing)}
                  </span>
                  {context.relationsKind === 'objective' ? (
                    <span className="catalog-collection__cell-note">
                      {t('catalog.childCount', { count: String(context.relationsById.get(row.id)?.groups.filter((group) => !group.synthetic).length ?? 0) })}
                    </span>
                  ) : null}
                </span>
                <span className="catalog-collection__cell catalog-collection__cell--progress" role="cell">
                  <span className="catalog-collection__cell-label">{t('catalog.column.progress')}</span>
                  <span className="catalog-collection__cell-value tabular-nums" data-testid="catalog-progress">{progressLabel}</span>
                </span>
                <span className="catalog-collection__cell catalog-collection__cell--activity" role="cell">
                  <span className="catalog-collection__cell-label">{t('catalog.column.activity')}</span>
                  <span className="catalog-collection__cell-value">{activityLabel}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
