// BranchTable — Money's one table: the company total, then the branches (sorted by TanStack from the
// URL's sort), then B2B invoices in their own row group. The company and B2B rows are pinned; only
// branches reorder. Margin columns exist only when the rows carry margin figures, so a viewer below
// the margin tier gets no margin header, cell or note.
//
// One DOM for every width: at phone width each row reflows into a stacked card and a "Sort by"
// control stands in for the header buttons (branch-table.css).
import { useId, useMemo, type ReactNode } from 'react'
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
import { useT, type Translate } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { formatIDRCompact, signedChange } from '@/lib/sales-dashboard'
import { sparklinePoints } from '@/lib/money-branch-table'
import { formatPercent, formatSignedPoints } from '@/lib/format/percent'
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

function Delta({ value, t }: { value: number | null; t: Translate }) {
  if (value === null) return <Muted>{t('money.delta.noComparison')}</Muted>
  const { text, tone } = signedChange(value)
  return <Pill tone={tone} dot={false} className="money-table__delta tabular"><span aria-hidden="true">{value > 0 ? '↗' : value < 0 ? '↘' : '→'}</span> {text}</Pill>
}

function Money({ value }: { value: number }) {
  return <span className="tabular">{formatIDRCompact(value)}</span>
}

/** A margin figure: blank on a B2B row (margin covers POS only), "not received" when the branch
 *  sent no cost for the period. */
function marginCell(pick: (m: NonNullable<Figures['margin']>) => number | null, show: (v: number, t: Translate) => string) {
  return (row: Figures, t: Translate) => {
    if (row.margin === null || row.margin === undefined) return null
    const value = pick(row.margin)
    return value === null ? <Muted>{t('money.table.notReceived')}</Muted> : <span className="tabular">{show(value, t)}</span>
  }
}

const COLUMN_META: Record<MoneyColumn, ColumnMeta> = {
  branch: { labelKey: 'money.table.col.branch', cell: () => null },
  revenue: { labelKey: 'money.table.col.revenue', cell: (row) => <Money value={row.revenue} /> },
  'vs-previous': { labelKey: 'money.table.col.vsPrevious', cell: (row, t) => <Delta value={row.vsPrevious} t={t} /> },
  'latest-day': {
    labelKey: 'money.table.col.latestDay',
    cell: (row, t) => row.latestDay === null
      ? <Pill tone="warning" dot={false}>{t('money.table.notReceived')}</Pill>
      : <Money value={row.latestDay} />,
  },
  'vs-weekday': { labelKey: 'money.table.col.vsWeekday', cell: (row, t) => <Delta value={row.vsWeekday} t={t} /> },
  margin: { labelKey: 'money.table.col.margin', cell: marginCell((m) => m.pct, (v) => formatPercent(v, 1)) },
  'cogs-vs-budget': {
    labelKey: 'money.table.col.cogsVsBudget',
    cell: marginCell((m) => m.cogsVsBudget, (v, t) => t('money.table.points', { value: formatSignedPoints(v) })),
  },
  coverage: { labelKey: 'money.table.col.coverage', cell: marginCell((m) => m.coverage, (v) => formatPercent(v, 0)) },
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

  const figureCells = (row: Figures, summary?: ReactNode) => leafColumns.slice(1).map((column) => {
    const id = column.id as MoneyColumn
    return (
      <td key={id} className={`money-table__cell money-table__cell--${id}`}>
        <span className="money-table__cell-label">{t(COLUMN_META[id].labelKey)}</span>
        <span className="money-table__cell-value">{COLUMN_META[id].cell(row, t)}</span>
        {id === 'margin' && summary}
      </td>
    )
  })
  const trendCell = (row: Figures) => {
    const trend = sparklinePoints(row.trend)
    return <td className="money-table__cell money-table__cell--trend text-center col-span-full"><span className="money-table__cell-label">{t('money.table.col.trend')}</span><span className="money-table__cell-value">{trend && <svg aria-hidden="true" viewBox="0 0 64 24" width="64" height="24"><polyline points={trend.points} fill="none" stroke="var(--text-light)" strokeWidth="2" /><circle cx={trend.end.x} cy={trend.end.y} r="5" fill="var(--primary)" stroke="var(--surface-primary)" strokeWidth="2" /></svg>}</span></td>}

  // Phone: the company's three margin figures read as one line (branch-table.css shows it <768px).
  const companyMargin = data.company.margin
  const companySummary = companyMargin ? (
    <span className="money-table__company-margin tabular">
      {t('money.table.companyMargin', {
        margin: companyMargin.pct === null ? t('money.table.notReceived') : formatPercent(companyMargin.pct, 1),
        budget: companyMargin.cogsVsBudget === null
          ? t('money.table.notReceived')
          : t('money.table.points', { value: formatSignedPoints(companyMargin.cogsVsBudget) }),
        coverage: companyMargin.coverage === null ? t('money.table.notReceived') : formatPercent(companyMargin.coverage, 0),
      })}
    </span>
  ) : undefined

  const linkedRow = (row: BranchRow, name: string) => {
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
        {figureCells(row)}
        {trendCell(row)}
      </tr>
    )
  }

  const b2bName = (row: BranchRow) => data.b2b.length === 1 ? t('money.table.b2b') : t('money.table.b2bNamed', { name: row.name })
  const sortLabel = (column: MoneyColumn, desc: boolean) => column === 'branch'
    ? t(desc ? 'money.sort.za' : 'money.sort.az')
    : t(desc ? 'money.sort.highFirst' : 'money.sort.lowFirst')

  return (
    <MoneyTableShell
      className="branch-money-table"
      tableClassName={withMargin ? 'money-table--margin' : undefined}
      beforeTable={(
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
      )}
      afterTable={withMargin && (
        <p className="money-table__basis">
          <span>{t('money.note.interim')}</span>
          {data.b2b.length > 0 && <span>{t('money.note.b2b')}</span>}
        </p>
      )}
    >
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
                      <span className="collection-grammar-sort-indicator" aria-hidden="true">
                        {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : ''}
                      </span>
                    </button>
                  </th>
                )
              })}
              <th scope="col" className="money-table__head money-table__cell--trend text-center">{t('money.table.col.trend')}</th>
            </tr>
          </thead>
          {!selection.branchCode && <tbody className="money-table__group money-table__group--company">
            <tr className="money-table__row money-table__row--company">
              <th scope="row" className="money-table__cell money-table__cell--branch">
                <span className="money-table__name">{t('money.table.company')}</span>
                {data.company.missingLatest > 0 && (
                  <span className="money-table__note">
                    {data.company.missingLatest === 1
                      ? t('money.table.missing.one')
                      : t('money.table.missing.other', { count: String(data.company.missingLatest) })}
                  </span>
                )}
              </th>
              {figureCells(data.company, companySummary)}
              {trendCell(data.company)}
            </tr>
          </tbody>}
          <tbody className="money-table__group">
            {table.getRowModel().rows.map((row) => linkedRow(row.original, row.original.name))}
          </tbody>
          {data.b2b.length > 0 && (
            <tbody className="money-table__group money-table__group--b2b">
              {data.b2b.map((row) => linkedRow(row, b2bName(row)))}
            </tbody>
          )}
    </MoneyTableShell>
  )
}
