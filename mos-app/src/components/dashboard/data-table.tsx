// DataTable — the general sortable, reflowing table primitive (design-plan §2.3).
// Generalises the app's dense-table grammar (kitchen-table.css .kt-* namespace) with
// a formal sort + 768px card-reflow prop-shape. Single-renders exactly one branch
// (caller passes useIsDesktop()) — no aria-hidden twin (OD-W4-4).
import type { ReactNode } from 'react'
import './data-table.css'

export interface DataTableColumn<Row> {
  key: string
  /** Overline uppercase thead label */
  header: string
  align?: 'left' | 'right'
  /** applies .tabular + right align + negative -> --status-lost-text */
  numeric?: boolean
  sortable?: boolean
  render?: (row: Row) => ReactNode
  /** <dl> label used in the phone card ('' -> title line, omitted -> header used) */
  cardLabel?: string
}

export interface DataTableSort {
  key: string
  dir: 'asc' | 'desc'
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowClassName?: (row: Row, index: number) => string | undefined
  sort?: DataTableSort
  onSortChange?: (sort: DataTableSort) => void
  /** totals row */
  footer?: ReactNode
  /** caller passes useIsDesktop() — single-render, exactly one branch in the DOM */
  isDesktop: boolean
  state?: 'ready' | 'loading' | 'empty' | 'error'
  emptyLabel?: string
  onRetry?: () => void
  /** <caption> / aria — a11y table name */
  caption: string
}

function cellValue<Row>(row: Row, column: DataTableColumn<Row>): ReactNode {
  if (column.render) return column.render(row)
  return (row as Record<string, unknown>)[column.key] as ReactNode
}

function isNegative(value: ReactNode): boolean {
  return typeof value === 'number' && value < 0
}

export function DataTable<Row extends object>({
  columns,
  rows,
  rowClassName,
  sort,
  onSortChange,
  footer,
  isDesktop,
  state = 'ready',
  emptyLabel = 'No rows to show.',
  onRetry,
  caption,
}: DataTableProps<Row>) {
  if (state === 'error') {
    return (
      <div className="dt-error" role="alert">
        <p className="dt-error-text">Couldn&apos;t load this table. Try again.</p>
        {onRetry && (
          <button type="button" className="dt-retry" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    )
  }

  return isDesktop
    ? (
        <DesktopTable
          columns={columns}
          rows={rows}
          rowClassName={rowClassName}
          sort={sort}
          onSortChange={onSortChange}
          footer={footer}
          state={state}
          emptyLabel={emptyLabel}
          caption={caption}
        />
      )
    : (
        <PhoneCards
          columns={columns}
          rows={rows}
          rowClassName={rowClassName}
          state={state}
          emptyLabel={emptyLabel}
          caption={caption}
        />
      )
}

interface DesktopTableProps<Row> {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowClassName?: (row: Row, index: number) => string | undefined
  sort?: DataTableSort
  onSortChange?: (sort: DataTableSort) => void
  footer?: ReactNode
  state: 'ready' | 'loading' | 'empty'
  emptyLabel: string
  caption: string
}

function DesktopTable<Row>({
  columns,
  rows,
  rowClassName,
  sort,
  onSortChange,
  footer,
  state,
  emptyLabel,
  caption,
}: DesktopTableProps<Row>) {
  return (
    <table className="dt-table" aria-label={caption}>
      <caption className="dt-caption">{caption}</caption>
      <thead>
        <tr>
          {columns.map(column => {
            const isNumeric = column.numeric || column.align === 'right'
            const isSorted = sort?.key === column.key
            const ariaSort = column.sortable
              ? isSorted
                ? sort!.dir === 'asc' ? 'ascending' : 'descending'
                : 'none'
              : undefined

            return (
              <th
                key={column.key}
                scope="col"
                className={isNumeric ? 'dt-th-num' : undefined}
                aria-sort={ariaSort}
              >
                {column.sortable
                  ? (
                      <button
                        type="button"
                        className="dt-sort-button"
                        onClick={() => {
                          const nextDir = isSorted && sort!.dir === 'asc' ? 'desc' : 'asc'
                          onSortChange?.({ key: column.key, dir: nextDir })
                        }}
                      >
                        {column.header}
                      </button>
                    )
                  : (
                      column.header
                    )}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {state === 'loading' && (
          <SkeletonRows columnCount={columns.length} />
        )}
        {state === 'empty' && (
          <tr>
            <td className="dt-empty" colSpan={columns.length}>
              {emptyLabel}
            </td>
          </tr>
        )}
        {state === 'ready' && rows.map((row, rowIndex) => (
          <tr
            key={(row as { id?: string | number }).id ?? rowIndex}
            className={rowClassName?.(row, rowIndex)}
          >
            {columns.map(column => {
              const value = cellValue(row, column)
              const isNumeric = column.numeric || column.align === 'right'
              const negative = column.numeric && isNegative(value)
              return (
                <td
                  key={column.key}
                  className={isNumeric ? `dt-num tabular${negative ? ' dt-neg' : ''}` : undefined}
                >
                  {value as ReactNode}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
      {footer && state === 'ready' && <tfoot>{footer}</tfoot>}
    </table>
  )
}

function SkeletonRows({ columnCount }: { columnCount: number }) {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <tr key={i} className="dt-skeleton-row">
          {Array.from({ length: columnCount }, (_, j) => (
            <td key={j}><span className="dt-skeleton-block" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

interface PhoneCardsProps<Row> {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowClassName?: (row: Row, index: number) => string | undefined
  state: 'ready' | 'loading' | 'empty'
  emptyLabel: string
  caption: string
}

function PhoneCards<Row>({ columns, rows, rowClassName, state, emptyLabel, caption }: PhoneCardsProps<Row>) {
  if (state === 'loading') {
    return (
      <div className="dt-cards" aria-label={caption}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="dt-skeleton-card" />
        ))}
      </div>
    )
  }

  if (state === 'empty') {
    return (
      <div className="dt-cards" aria-label={caption}>
        <div className="dt-empty" role="status">{emptyLabel}</div>
      </div>
    )
  }

  const [titleColumn, ...detailColumns] = columns

  return (
    <div className="dt-cards" aria-label={caption}>
      {rows.map((row, rowIndex) => (
        <div
          key={(row as { id?: string | number }).id ?? rowIndex}
          className={['dt-card', rowClassName?.(row, rowIndex)].filter(Boolean).join(' ')}
          data-touch-target="true"
        >
          <div className="dt-card-title">{cellValue(row, titleColumn)}</div>
          <dl className="dt-card-detail">
            {detailColumns.map(column => {
              const value = cellValue(row, column)
              const negative = column.numeric && isNegative(value)
              return (
                <div key={column.key} className="dt-card-detail-row">
                  <dt>{column.cardLabel ?? column.header}</dt>
                  <dd className={column.numeric ? `tabular${negative ? ' dt-neg' : ''}` : undefined}>
                    {value as ReactNode}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      ))}
    </div>
  )
}
