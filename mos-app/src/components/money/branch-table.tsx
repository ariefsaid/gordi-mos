// BranchTable — Money's one table: the company total, then the branches (sorted by TanStack from the
// URL's sort), then B2B invoices in their own row group. The company and B2B rows are pinned; only
// branches reorder. Margin columns exist only when the rows carry margin figures, so a viewer below
// the margin tier gets no margin header, cell or note.
//
// One DOM for every width: at phone width each row reflows into a stacked card and a "Sort by"
// control stands in for the header buttons (branch-table.css).
import { SortIndicator } from '@/components/ui/sort-indicator'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { MoneyTableShell } from '@/components/money/money-table-shell'
import { Pill } from '@/components/ui/pill'
import { Select } from '@/components/ui/select'
import { GroupHeader } from '@/components/ui/group-header'
import { MoneyDelta, MoneyPoints } from '@/components/money/money-delta'
import { MoneySpark } from '@/components/money/money-spark'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useT, type Translate } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { formatIDR } from '@/lib/format/money'
import { formatPercent } from '@/lib/format/percent'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import {
  MARGIN_COLUMNS,
  REVENUE_COLUMNS,
  type BranchRow,
  type BranchTable as BranchTableData,
  type CompanyRow,
  type MoneyColumn,
  moneyBranchHref,
  type MoneySelection,
  type MoneySort,
} from '@/lib/money-branch-table'
import '@/components/collection-grammar.css'
import './branch-table.css'

type Figures = BranchRow | CompanyRow

interface ColumnMeta {
  labelKey: MessageKey
  cell: (row: Figures, t: Translate) => ReactNode
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="money-table__muted">{children}</span>
}

function Money({ value }: { value: number }) {
  return <span className="tabular">{formatIDR(value)}</span>
}

/** A margin figure: "not received" when the branch sent no cost for the period. B2B rows carry no
 *  margin at all; they get one cell that says so (see `b2bUnavailable`). */
function marginCell(pick: (m: NonNullable<Figures['margin']>) => number | null, show: (v: number, t: Translate) => ReactNode) {
  return (row: Figures, t: Translate) => {
    if (row.margin === null || row.margin === undefined) return null
    const value = pick(row.margin)
    if (value === null) return <Muted>{t('money.table.notReceived')}</Muted>
    return show(value, t)
  }
}

const COLUMN_META: Record<MoneyColumn, ColumnMeta> = {
  branch: { labelKey: 'money.table.col.branch', cell: () => null },
  revenue: { labelKey: 'money.table.col.revenue', cell: (row, t) => <>{<Money value={row.revenue} />}{row.partial && <Muted>{t('money.table.partial')}</Muted>}</> },
  'vs-previous': { labelKey: 'money.table.col.vsPrevious', cell: (row, t) => <MoneyDelta value={row.vsPrevious} t={t} /> },
  'latest-day': {
    labelKey: 'money.table.col.latestDay',
    cell: (row, t) => row.latestDay === null
      ? <Pill tone="warning" dot={false}>{t('money.table.notReceived')}</Pill>
      : <Money value={row.latestDay} />,
  },
  'vs-weekday': { labelKey: 'money.table.col.vsWeekday', cell: (row, t) => <MoneyDelta value={row.vsWeekday} t={t} /> },
  margin: { labelKey: 'money.table.col.margin', cell: marginCell((m) => m.pct, (v) => <span className="tabular">{formatPercent(v, 1)}</span>) },
  'cogs-vs-budget': {
    labelKey: 'money.table.col.cogsVsBudget',
    cell: marginCell((m) => m.cogsVsBudget, (v, t) => <MoneyPoints value={v} t={t} overIsBad />),
  },
  coverage: { labelKey: 'money.table.col.coverage', cell: marginCell((m) => m.coverage, (v) => <span className="tabular">{formatPercent(v, 1)}</span>) },
}

// Nulls sort last in both directions (TanStack's `sortUndefined: 'last'`).
const SORT_VALUE: Record<MoneyColumn, (row: BranchRow) => string | number | undefined> = {
  branch: (r) => r.name,
  revenue: (r) => r.revenue,
  'vs-previous': (r) => r.vsPrevious ?? undefined,
  'latest-day': (r) => r.latestDay ?? undefined,
  'vs-weekday': (r) => r.vsWeekday ?? undefined,
  margin: (r) => r.margin?.pct ?? undefined,
  'cogs-vs-budget': (r) => r.margin?.cogsVsBudget ?? undefined,
  coverage: (r) => r.margin?.coverage ?? undefined,
}

function columnDefs(ids: readonly MoneyColumn[]): ColumnDef<BranchRow>[] {
  return ids.map((id) => ({
    id,
    accessorFn: SORT_VALUE[id],
    sortUndefined: 'last' as const,
    sortDescFirst: id !== 'branch',
    sortingFn: id === 'branch' ? 'text' : 'basic',
  }))
}

const ALL_COLUMNS: readonly MoneyColumn[] = [...REVENUE_COLUMNS, ...MARGIN_COLUMNS]

export interface BranchTableProps {
  data: BranchTableData
  selection: MoneySelection
  sort: MoneySort
  onSortChange: (sort: MoneySort) => void
}

export function BranchTable({ data, selection, sort, onSortChange }: BranchTableProps) {
  const t = useT()
  const navigate = useNavigate()
  const sortId = useId()
  const isDesktop = useIsDesktop()
  const [b2bOpen, setB2bOpen] = useState(true)
  const b2bId = `${sortId}-b2b`
  const withMargin = 'margin' in data.company
  const ids: readonly MoneyColumn[] = withMargin ? ALL_COLUMNS : REVENUE_COLUMNS
  const columns = useMemo(() => columnDefs(withMargin ? ALL_COLUMNS : REVENUE_COLUMNS), [withMargin])
  // A stable sorting array, and no page-index reset (there is no pagination): TanStack recomputes
  // the sorted rows when `sorting` changes identity and queues a reset each time, so a fresh array
  // per render re-rendered the table forever once the URL changed.
  const sorting: SortingState = useMemo(() => [{ id: sort.column, desc: sort.desc }], [sort.column, sort.desc])
  const onSortingChange = (updater: Updater<SortingState>) => {
    const [next] = typeof updater === 'function' ? updater(sorting) : updater
    if (next) onSortChange({ column: next.id as MoneyColumn, desc: next.desc })
  }
  const table = useReactTable({
    data: data.branches,
    columns,
    state: { sorting },
    onSortingChange,
    enableSortingRemoval: false,
    autoResetPageIndex: false,
    enableMultiSort: false,
    getRowId: (row) => row.code,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const leafColumns = table.getVisibleLeafColumns()
  const figureColumns = leafColumns.slice(1)

  const figureCells = (row: Figures, isB2B = false) => {
    const cells: ReactNode[] = []
    let skippedMargin = false
    for (const column of figureColumns) {
      const id = column.id as MoneyColumn
      const unavailable = isB2B && withMargin && (MARGIN_COLUMNS as readonly string[]).includes(id)
      if (unavailable) {
        if (!skippedMargin) {
          skippedMargin = true
          cells.push(<td key="b2b-unavailable" colSpan={MARGIN_COLUMNS.length} className="money-table__cell money-table__cell--unavailable">{t('money.table.b2bUnavailable')}</td>)
        }
        continue
      }
      cells.push(<td key={id} className={`money-table__cell money-table__cell--${id}`}>{COLUMN_META[id].cell(row, t)}</td>)
    }
    return cells
  }
  const trendCell = (row: Figures) => <td className="money-table__cell money-table__cell--trend"><MoneySpark values={row.trend} /></td>

  const linkedRow = (row: BranchRow, name: string, isB2B = false) => {
    const href = moneyBranchHref(row.code, { ...selection, sort })
    return (
      <tr
        key={row.code}
        className="money-table__row money-table__row--link"
        onClick={(event) => {
          if ((event.target as Element).closest('a, button')) return
          navigate(href)
        }}
      >
        <th scope="row" className="money-table__cell money-table__cell--branch">
          <Link to={href} className="money-table__name">{name}</Link>
        </th>
        {figureCells(row, isB2B)}
        {trendCell(row)}
      </tr>
    )
  }

  const b2bName = (row: BranchRow) => data.b2b.length === 1 ? t('money.table.b2b') : t('money.table.b2bNamed', { name: row.name })
  const sortLabel = (column: MoneyColumn, desc: boolean) => column === 'branch'
    ? t(desc ? 'money.sort.za' : 'money.sort.az')
    : t(desc ? 'money.sort.highFirst' : 'money.sort.lowFirst')
  const missingNote = data.company.missingLatest > 0
    ? (data.company.missingLatest === 1 ? t('money.table.missing.one') : t('money.table.missing.other', { count: String(data.company.missingLatest) }))
    : null

  const basisNote = withMargin && (
    <p className="money-table__basis">
      <span>{t('money.note.interim')}</span>
      {data.b2b.length > 0 && <span>{t('money.note.b2b')}</span>}
    </p>
  )

  if (!isDesktop) {
    // Phone: one card per row: name and revenue, trend and change, then two muted lines. The labels are short because
    // the sort control above already names every column.
    const card = (row: Figures, { key, name, href, company = false, b2b = false }: { key: string; name: ReactNode; href?: string; company?: boolean; b2b?: boolean }) => (
      <li
        key={key}
        className={`branch-card${company ? ' branch-card--company' : ''}`}
        onClick={href ? (event) => { if (!(event.target as Element).closest('a, button')) navigate(href) } : undefined}
      >
        <div className="branch-card__head">
          {href ? <Link to={href} className="money-table__name">{name}</Link> : <span className="money-table__name">{name}</span>}
          <span className="branch-card__revenue tabular">{formatIDR(row.revenue)}{row.partial && <> <Muted>{t('money.table.partial')}</Muted></>}</span>
        </div>
        {company && missingNote && <p className="money-table__note">{missingNote}</p>}
        <div className="branch-card__trend">
          <MoneySpark values={row.trend} />
          <span className="branch-card__previous">{t('money.short.vsPrevious')} <MoneyDelta value={row.vsPrevious} t={t} /></span>
        </div>
        <p className="branch-card__meta">
          <span>{t('money.short.latest')} {row.latestDay === null ? <Pill tone="warning" dot={false}>{t('money.table.notReceived')}</Pill> : <><span className="tabular">{formatIDR(row.latestDay)}</span> <MoneyDelta value={row.vsWeekday} t={t} /> {t('money.short.vsWeekday')}</>}</span>
        </p>
        {withMargin && (b2b
          ? <p className="branch-card__meta"><span>{t('money.table.b2bUnavailable')}</span></p>
          : row.margin && <p className="branch-card__meta">
            <span>{t('money.short.margin')} {row.margin.pct === null ? <Muted>{t('money.table.notReceived')}</Muted> : <span className="tabular">{formatPercent(row.margin.pct, 1)}</span>}</span>
            <span>{t('money.short.cogs')} {row.margin.cogsVsBudget === null ? <Muted>{t('money.table.notReceived')}</Muted> : <MoneyPoints value={row.margin.cogsVsBudget} t={t} overIsBad />}</span>
            <span>{t('money.short.coverage')} {row.margin.coverage === null ? <Muted>{t('money.table.notReceived')}</Muted> : <span className="tabular">{formatPercent(row.margin.coverage, 1)}</span>}</span>
          </p>)}
      </li>
    )
    return (
      <div className="money-table-block branch-money-table">
        <div className="money-table__phone-sort">
          <label className="money-table__phone-sort-label" htmlFor={sortId}>{t('money.sort.label')}</label>
          <Select
            id={sortId}
            value={sort.column}
            onChange={(event) => onSortChange({ column: event.target.value as MoneyColumn, desc: event.target.value !== 'branch' })}
          >
            {ids.map((id) => <option key={id} value={id}>{t(COLUMN_META[id].labelKey)}</option>)}
          </Select>
          <button
            type="button"
            className="money-table__direction"
            aria-label={t('money.sort.order', { order: sortLabel(sort.column, sort.desc) })}
            onClick={() => onSortChange({ column: sort.column, desc: !sort.desc })}
          >
            {sortLabel(sort.column, sort.desc)}
          </button>
        </div>
        <ul className="branch-cards" aria-label={t('money.table.caption', { days: String(data.daysCount), date: formatWeekdayDayMonth(data.latestDate) })}>
          {table.getRowModel().rows.map((r) => card(r.original, { key: r.original.code, name: r.original.name, href: moneyBranchHref(r.original.code, { ...selection, sort }) }))}
          {!selection.branchCode && card(data.company, { key: '__company', name: t('money.table.company'), company: true })}
        </ul>
        {data.b2b.length > 0 && <>
          <GroupHeader className="branch-cards__group" level={3} label={t('money.table.b2b')} count={data.b2b.length} open={b2bOpen} onToggle={() => setB2bOpen((open) => !open)} controlsId={b2bId} />
          {b2bOpen && <ul id={b2bId} className="branch-cards" aria-label={t('money.table.b2b')}>
            {data.b2b.map((row) => card(row, { key: row.code, name: b2bName(row), href: moneyBranchHref(row.code, { ...selection, sort }), b2b: true }))}
          </ul>}
        </>}
        {basisNote}
      </div>
    )
  }

  return (
    <MoneyTableShell className="branch-money-table" tableClassName={withMargin ? 'money-table--margin' : undefined} afterTable={basisNote}>
      <caption className="sr-only">
        {t('money.table.caption', { days: String(data.daysCount), date: formatWeekdayDayMonth(data.latestDate) })}
      </caption>
      <thead>
        <tr>
          {table.getHeaderGroups()[0].headers.map((header) => {
            const id = header.column.id as MoneyColumn
            const sorted = header.column.getIsSorted()
            return (
              <th
                key={header.id}
                scope="col"
                className={`money-table__head money-table__cell--${id}`}
                aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
              >
                <button
                  type="button"
                  className="money-table__sort collection-grammar-sort-button"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {t(COLUMN_META[id].labelKey)}
                  <SortIndicator dir={sorted || null} />
                </button>
              </th>
            )
          })}
          <th scope="col" className="money-table__head money-table__cell--trend">{t('money.table.col.trend')}</th>
        </tr>
      </thead>
      <tbody className="money-table__group money-table__group--branches">
        {table.getRowModel().rows.map((row) => linkedRow(row.original, row.original.name))}
      </tbody>
      {!selection.branchCode && <tbody className="money-table__group money-table__group--company">
        <tr className="money-table__row money-table__row--company">
          <th scope="row" className="money-table__cell money-table__cell--branch">
            <span className="money-table__name">{t('money.table.company')}</span>
            {missingNote && <span className="money-table__note">{missingNote}</span>}
          </th>
          {figureCells(data.company)}
          {trendCell(data.company)}
        </tr>
      </tbody>}
      {data.b2b.length > 0 && (
        <tbody id={b2bId} className="money-table__group money-table__group--b2b">
          <tr className="money-table__group-heading"><th scope="rowgroup" colSpan={ids.length + 1}><GroupHeader level={3} label={t('money.table.b2b')} count={data.b2b.length} open={b2bOpen} onToggle={() => setB2bOpen((open) => !open)} controlsId={b2bId} /></th></tr>
          {b2bOpen && data.b2b.map((row) => linkedRow(row, b2bName(row), true))}
        </tbody>
      )}
    </MoneyTableShell>
  )
}
