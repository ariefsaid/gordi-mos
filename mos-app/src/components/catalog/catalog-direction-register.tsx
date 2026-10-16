import { StatusBadge } from '@/components/ui/status-badge'
import { Link } from 'react-router-dom'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { DataTable, type DataTableColumn, type DataTableGroup } from '@/components/dashboard/data-table'
import { useCatalogCollectionActions } from './catalog-collection-actions'
import type {
  CatalogCollectionContext, CatalogCollectionQuery, CatalogRenderGroup, CatalogRow, CatalogRelationGroup, CatalogSort,
} from './catalog-collection-adapter'
import './catalog-direction-register.css'

type Props = CollectionPresentationProps<CatalogRow, CatalogCollectionQuery, CollectionProjection<CatalogRow, CatalogRenderGroup>, CatalogCollectionContext, string>

/**
 * Objectives and Projects & Processes as sortable registers: identity first, then status (only when
 * archived rows are in view), owners, the period or cadence, and the task progress last, right-aligned
 * and tabular. Groups carry a count and a real collapse button. Phone rows keep one muted meta line.
 */
export function CatalogDirectionRegister({ query, projection, context, onOpenRecord, isGroupCollapsed, onToggleGroup }: Props) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const actions = useCatalogCollectionActions()
  const records = projection.visibleRecords
  const objectives = context.relationsKind === 'objective'
  const showStatus = query.view !== 'active'

  // `long` adds the unit (phone meta line); the desktop column header carries it instead.
  // Progress is numerals; a state word ("Not started", "No schedule", "1 awaiting assignment") is a note on the
  // row's name, never a number's neighbour. The phone meta line joins them in one sentence.
  const progressParts = (row: CatalogRow, long = false): { fraction: string | null; note: string | null } => {
    const fraction = (done: number, total: number) => long ? t('catalog.progress.tasksDone', { done: String(done), total: String(total) }) : `${done} / ${total}`
    if (row.type === 'process') {
      if (row.cadenceActive !== true || !row.cadenceKind) return { fraction: null, note: t('catalog.process.noSchedule') }
      if (row.cadenceKind === 'manual' && !row.currentOccurrence) return { fraction: null, note: t('catalog.process.onDemand') }
      if (!row.currentOccurrence) return { fraction: null, note: t('catalog.process.notStarted') }
      if (row.currentOccurrence.pending_unresolved > 0) {
        const waiting = t('catalog.process.awaitingAssignment', { count: String(row.currentOccurrence.pending_unresolved) })
        return { fraction: row.currentOccurrence.total > 0 ? fraction(row.currentOccurrence.done, row.currentOccurrence.total) : null, note: waiting }
      }
      if (row.currentOccurrence.total === 0) return { fraction: null, note: t('catalog.process.startedNoTasks') }
      return { fraction: fraction(row.currentOccurrence.done, row.currentOccurrence.total), note: null }
    }
    const value = context.progressById.get(row.id)
    return value?.total ? { fraction: fraction(value.done, value.total), note: null } : { fraction: null, note: t('catalog.noTasks') }
  }
  const progressCell = (row: CatalogRow, long = false): string => {
    const { fraction, note } = progressParts(row, long)
    return fraction && note ? `${fraction} · ${note}` : fraction ?? note ?? ''
  }
  const destination = (row: CatalogRow) => objectives ? `/work/objectives/${row.id}` : `/work/projects/${row.id}`
  const relatedOf = (row: CatalogRow): CatalogRelationGroup[] => {
    const relations = (context.relationsById.get(row.id)?.groups ?? []).filter((group) => !group.synthetic)
    return objectives ? relations.filter((group) => group.entity === 'work-line') : relations.filter((group) => group.entity === 'objective')
  }
  const relationshipLinks = (groups: readonly CatalogRelationGroup[]) => groups.map((relation) => (
    <Link key={`${relation.relationship}-${relation.id}`} className="direction-register__link" to={relation.entity === 'objective' ? `/work/objectives/${relation.objectiveId ?? relation.id}` : `/work/projects/${relation.workLineId ?? relation.id}`}>
      {relation.name}{relation.relationship === 'contribution' ? <>{' '}<span>· {t('catalog.record.viaTasks')}</span></> : null}
    </Link>
  ))
  const periodOf = (row: CatalogRow): string | null => {
    if (row.periodYear == null) return null
    const quarter = row.periodQuarter ? [t('catalog.period.q1'), t('catalog.period.q2'), t('catalog.period.q3'), t('catalog.period.q4')][row.periodQuarter - 1] : null
    return `${row.periodYear}${quarter ? ` · ${quarter}` : ''}`
  }
  const cadenceOf = (row: CatalogRow): string | null => row.cadenceKind
    ? { manual: t('catalog.record.cadence.manual'), daily: t('catalog.record.cadence.daily'), weekly: t('catalog.record.cadence.weekly'), monthly: t('catalog.record.cadence.monthly') }[row.cadenceKind]
    : null
  const nameOf = (id: string | null | undefined) => (id ? context.peopleById?.get(id) : undefined) ?? null
  const missingOf = (row: CatalogRow): string[] => {
    const process = row.type === 'process'
    return [
      ...(!nameOf(row.accountablePersonId) ? [t('catalog.column.accountable')] : []),
      ...(!objectives && !nameOf(row.responsiblePersonId) ? [t('catalog.record.responsible')] : []),
      ...(objectives && periodOf(row) === null ? [t('catalog.record.period')] : []),
      ...(!objectives && process && !cadenceOf(row) ? [t('catalog.record.cadence')] : []),
      ...(!objectives && !process && relatedOf(row).length === 0 ? [t('catalog.record.objective')] : []),
    ]
  }

  const identity = (row: CatalogRow) => {
    const missing = missingOf(row)
    return (
      <div className="direction-register__identity">
        <Link
          to={destination(row)}
          className="direction-register__name"
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            onOpenRecord(row)
          }}
        >
          {row.name}
        </Link>
        {missing.length ? (
          <details className="direction-register__setup">
            <summary>{t('catalog.setup.missing', { count: missing.length })}</summary>
            <p>{t('catalog.setup.fields', { fields: missing.join(', ') })}</p>
            <Link to={destination(row)}>{t('catalog.setup.open')}</Link>
          </details>
        ) : null}
      </div>
    )
  }
  const statusCell = (row: CatalogRow) => (
    <StatusBadge status={row.archived_at ? 'archived' : 'active'} />
  )
  // A missing fact is a blank cell; the words are for assistive tech only.
  const dash = <span className="sr-only">{t('catalog.notSet')}</span>
  const linksCell = (row: CatalogRow, empty: React.ReactNode) => {
    const related = relatedOf(row)
    return related.length ? <div className="direction-register__links">{relationshipLinks(related)}</div> : empty
  }

  const sortable = Boolean(actions.onSort)
  const columnsFor = (kind: 'objective' | 'project' | 'process'): DataTableColumn<CatalogRow>[] => [
    { key: 'name', className: 'dr-col-name', header: t('catalog.column.name'), sortable, render: (row) => {
      const { note } = progressParts(row)
      return <>{identity(row)}{note ? <span className="direction-register__note">{note}</span> : null}</>
    } },
    ...(showStatus ? [{ key: 'status', className: 'dr-col-status', header: t('tasks.filter.status'), render: statusCell }] : []),
    ...(kind !== 'objective' ? [{ key: 'responsible', className: 'dr-col-owner', header: t('catalog.record.responsible'), render: (row: CatalogRow) => nameOf(row.responsiblePersonId) ?? dash }] : []),
    { key: 'accountable', className: 'dr-col-owner', header: t('catalog.column.accountable'), sortable, render: (row) => nameOf(row.accountablePersonId) ?? dash },
    ...(kind === 'objective'
      ? [{ key: 'period', className: 'dr-col-period', header: t('catalog.record.period'), sortable, render: (row: CatalogRow) => periodOf(row) ?? dash },
        { key: 'work', className: 'dr-col-links', header: t('catalog.column.work'), render: (row: CatalogRow) => linksCell(row, <span className="direction-register__muted">{t('catalog.objectives.noTasksLinked')}</span>) }]
      : kind === 'process'
        ? [{ key: 'cadence', className: 'dr-col-period', header: t('catalog.record.cadence'), render: (row: CatalogRow) => cadenceOf(row) ?? dash },
          { key: 'objective', className: 'dr-col-links', header: t('catalog.record.objective'), render: (row: CatalogRow) => linksCell(row, dash) }]
        : [{ key: 'objective', className: 'dr-col-links', header: t('catalog.record.objective'), render: (row: CatalogRow) => linksCell(row, dash) }]),
    { key: 'progress', className: 'dr-col-progress', header: t('catalog.column.progressTasks'), sortable, numeric: true, render: (row) => progressParts(row).fraction ?? dash },
  ]

  // Phone: name, one muted meta line (owner · period or cadence · progress), then the related links.
  const renderCard = (row: CatalogRow) => {
    const accountable = nameOf(row.accountablePersonId)
    const meta = [
      accountable ? `${t('catalog.column.accountable')} ${accountable}` : null,
      objectives ? periodOf(row) : cadenceOf(row),
      progressCell(row, true),
    ].filter(Boolean)
    return (
      <div className="direction-register__card">
        {identity(row)}
        {showStatus ? statusCell(row) : null}
        <p className="direction-register__meta">{meta.join(' · ')}</p>
        {linksCell(row, null)}
      </div>
    )
  }

  const sort = { key: query.sort, dir: query.direction === 'ascending' ? 'asc' as const : 'desc' as const }
  const onSortChange = (next: { key: string; dir: 'asc' | 'desc' }) =>
    actions.onSort?.(next.key as CatalogSort, next.dir === 'asc' ? 'ascending' : 'descending')

  // One table per page: its columns and header are shared by every group, so values never shift
  // between groups (Projects, Processes; one group per Business Unit on Objectives).
  const table = (sections: { key: string; label: string; rows: CatalogRow[] }[], kind: 'objective' | 'project' | 'process', caption: string) => {
    const groups: DataTableGroup<CatalogRow>[] = sections.map(({ key, label, rows }) => ({ key, label, count: rows.length, rows }))
    return (
      <div className="direction-register__section">
        <DataTable
          tableClassName="direction-register__table"
          columns={columnsFor(kind)}
          rows={[]}
          groups={groups}
          collapsedGroupKeys={new Set(groups.filter((group) => isGroupCollapsed(group.key)).map((group) => group.key))}
          onToggleGroup={onToggleGroup}
          isDesktop={isDesktop}
          renderCard={renderCard}
          sort={sort}
          onSortChange={onSortChange}
          caption={caption}
        />
      </div>
    )
  }

  if (objectives) {
    const buckets = new Map<string, CatalogRow[]>()
    for (const item of records) {
      const key = item.isCompanyWide ? t('catalog.companyWide') : item.businessUnitId ? context.businessUnitsById?.get(item.businessUnitId) ?? t('catalog.notAvailable') : t('catalog.group.noBusinessUnit')
      buckets.set(key, [...(buckets.get(key) ?? []), item])
    }
    return (
      <div className="direction-register" role="region" aria-label={t('nav.work.objectives')}>
        {table([...buckets].map(([name, rows]) => ({ key: `bu:${name}`, label: name, rows })), 'objective', t('nav.work.objectives'))}
      </div>
    )
  }
  const projects = records.filter((item) => item.type === 'project')
  const processes = records.filter((item) => item.type === 'process')
  const sections = [
    ...(query.type !== 'process' && projects.length > 0 ? [{ key: 'project', label: t('catalog.type.project'), rows: projects }] : []),
    ...(query.type !== 'project' && processes.length > 0 ? [{ key: 'process', label: t('catalog.type.process'), rows: processes }] : []),
  ]
  return (
    <div className="direction-register" role="region" aria-label={t('nav.work.projects')}>
      {sections.length ? table(sections, sections.some((section) => section.key === 'process') ? 'process' : 'project', t('nav.work.projects')) : null}
    </div>
  )
}
