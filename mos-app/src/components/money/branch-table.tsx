// BranchTable — Money's one table: the company total, then the branches (sorted by TanStack from the
// URL's sort), then B2B invoices in their own row group. The company and B2B rows are pinned; only
// branches reorder. Margin columns exist only when the rows carry margin figures, so a viewer below
// the margin tier gets no margin header, cell or note.
//
// One DOM for every width: at phone width each row reflows into a stacked card and a "Sort by"
// control stands in for the header buttons (branch-table.css).
import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { Pill } from '@/components/ui/pill'
import { Select } from '@/components/ui/select'
import { useT, type Translate } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { formatIDRCompact } from '@/lib/sales-dashboard'
import { formatPercent, formatSignedPercent, formatSignedPoints } from '@/lib/format/percent'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import {
  MARGIN_COLUMNS,
  REVENUE_COLUMNS,
  type BranchRow,
  type BranchTable as BranchTableData,
  type CompanyRow,
  type MoneyColumn,
  type MoneyPeriod,
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
  const text = formatSignedPercent(value)
  const tone = text.startsWith('+') ? 'success' : text.startsWith('−') ? 'destructive' : 'neutral'
  return <Pill tone={tone} dot={false} className="money-table__delta tabular">{text}</Pill>
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

function branchHref(code: string, period: MoneyPeriod): string {
  return `/money/branch/${encodeURIComponent(code)}?period=${period}`
}

export interface BranchTableProps {
  data: BranchTableData
  period: MoneyPeriod
  sort: MoneySort
  onSortChange: (sort: MoneySort) => void
}

export function BranchTable({ data, period, sort, onSortChange }: BranchTableProps) {
  const t = useT()
  const navigate = useNavigate()
  const withMargin = 'margin' in data.company
  const ids: readonly MoneyColumn[] = withMargin ? [...REVENUE_COLUMNS, ...MARGIN_COLUMNS] : REVENUE_COLUMNS
  const columns = useMemo(() => columnDefs(ids), [ids.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const sorting: SortingState = [{ id: sort.column, desc: sort.desc }]
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
    enableMultiSort: false,
    getRowId: (row) => row.code,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const leafColumns = table.getVisibleLeafColumns()

  const figureCells = (row: Figures) => leafColumns.slice(1).map((column) => {
    const id = column.id as MoneyColumn
    return (
      <td key={id} className={`money-table__cell money-table__cell--${id}`}>
        <span className="money-table__cell-label">{t(COLUMN_META[id].labelKey)}</span>
        <span className="money-table__cell-value">{COLUMN_META[id].cell(row, t)}</span>
      </td>
    )
  })

  const linkedRow = (row: BranchRow, name: string) => {
    const href = branchHref(row.code, period)
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
      </tr>
    )
  }

  const b2bName = (row: BranchRow) => data.b2b.length === 1 ? t('money.table.b2b') : t('money.table.b2bNamed', { name: row.name })
  const sortLabel = (column: MoneyColumn, desc: boolean) => column === 'branch'
    ? t(desc ? 'money.sort.za' : 'money.sort.az')
    : t(desc ? 'money.sort.highFirst' : 'money.sort.lowFirst')

  return (
    <div className="money-table-block">
      <div className="money-table__phone-sort">
        <Select
          label={t('money.sort.label')}
          value={sort.column}
          onChange={(event) => onSortChange({ column: event.target.value as MoneyColumn, desc: event.target.value !== 'branch' })}
        >
          {ids.map((id) => <option key={id} value={id}>{t(COLUMN_META[id].labelKey)}</option>)}
        </Select>
        <button
          type="button"
          className="money-table__direction"
          onClick={() => onSortChange({ column: sort.column, desc: !sort.desc })}
        >
          {sortLabel(sort.column, sort.desc)}
        </button>
      </div>
      <div className="money-table-scroll">
        <table className={`money-table${withMargin ? ' money-table--margin' : ''}`}>
          <caption className="sr-only">
            {t('money.table.caption', { days: String(period), date: formatWeekdayDayMonth(data.latestDate) })}
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
            </tr>
          </thead>
          <tbody className="money-table__group money-table__group--company">
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
              {figureCells(data.company)}
            </tr>
          </tbody>
          <tbody className="money-table__group">
            {table.getRowModel().rows.map((row) => linkedRow(row.original, row.original.name))}
          </tbody>
          {data.b2b.length > 0 && (
            <tbody className="money-table__group money-table__group--b2b">
              {data.b2b.map((row) => linkedRow(row, b2bName(row)))}
            </tbody>
          )}
        </table>
      </div>
      {withMargin && (
        <p className="money-table__basis">
          <span>{t('money.note.interim')}</span>
          {data.b2b.length > 0 && <span>{t('money.note.b2b')}</span>}
        </p>
      )}
    </div>
  )
}
