// DataTable — the general sortable, reflowing table primitive (design-plan §2.3).
// Generalises the app's dense-table grammar (kitchen-table.css .kt-* namespace) with
// a formal sort + 768px card-reflow prop-shape. Single-renders exactly one branch
// (caller passes useIsDesktop()) — no aria-hidden twin (OD-W4-4).
//
// Optional row GROUPING (OD-P3-6 group-header row): when `groups` is provided the
// table renders grouped mode — a hairline group-header row (caret toggle + 13px/700
// navy label + muted tabular count) per non-null group, with internal collapse state.
// Flat `rows` mode is 100% unchanged when `groups` is absent; if both are given,
// `groups` wins. Callers pass exactly one of `rows` (flat) / `groups` (grouped).
import { Fragment, useState, type ReactNode } from 'react'
import { Chevron } from '@/shell/icons'
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

export interface DataTableGroup<Row> {
  key: string
  /** null = uncategorised bucket: render its rows inline with NO header row */
  label: string | null
  /** header count; defaults to rows.length */
  count?: number
  /** optional muted hint rendered after the count (e.g. "log as produced") */
  hint?: string
  rows: Row[]
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  /** grouped mode (OD-P3-6 group-header row). When provided, `groups` wins over `rows`. */
  groups?: DataTableGroup<Row>[]
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

/** stable row key — prefers row.id, falls back to the local index */
function rowKey<Row>(row: Row, fallback: number): string | number {
  return (row as { id?: string | number }).id ?? fallback
}

export function DataTable<Row extends object>({
  columns,
  rows,
  groups,
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
  // Collapse state lives at the top so it is shared by both branches — a re-render
  // with a different isDesktop keeps the same groups open/closed. All-expanded by
  // default. INTERNAL: callers do not control it. (useState is called before the
  // error early-return to satisfy the rules-of-hooks order invariant.)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const toggleGroup = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
          groups={groups}
          rowClassName={rowClassName}
          sort={sort}
          onSortChange={onSortChange}
          footer={footer}
          state={state}
          emptyLabel={emptyLabel}
          caption={caption}
          collapsed={collapsed}
          onToggleGroup={toggleGroup}
        />
      )
    : (
        <PhoneCards
          columns={columns}
          rows={rows}
          groups={groups}
          rowClassName={rowClassName}
          state={state}
          emptyLabel={emptyLabel}
          caption={caption}
          collapsed={collapsed}
          onToggleGroup={toggleGroup}
        />
      )
}

interface DesktopTableProps<Row> {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  groups?: DataTableGroup<Row>[]
  rowClassName?: (row: Row, index: number) => string | undefined
  sort?: DataTableSort
  onSortChange?: (sort: DataTableSort) => void
  footer?: ReactNode
  state: 'ready' | 'loading' | 'empty'
  emptyLabel: string
  caption: string
  collapsed: Set<string>
  onToggleGroup: (key: string) => void
}

/** ONE desktop data row — shared by flat + grouped tbody (reuse, do not duplicate). */
function DesktopRow<Row>({
  row,
  rowIndex,
  columns,
  rowClassName,
}: {
  row: Row
  rowIndex: number
  columns: DataTableColumn<Row>[]
  rowClassName?: (row: Row, index: number) => string | undefined
}) {
  return (
    <tr className={rowClassName?.(row, rowIndex)}>
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
  )
}

/** Group-header row (OD-P3-6): hairline full-width th — caret toggle + navy label + muted count. */
function GroupHeaderRow<Row>({
  group,
  columnCount,
  collapsed,
  onToggle,
}: {
  group: DataTableGroup<Row>
  columnCount: number
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <tr className="dt-group-row">
      <th scope="colgroup" colSpan={columnCount} className="dt-group-cell">
        <div className="dt-group-bar">
          <button
            type="button"
            className="dt-group-toggle"
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
            onClick={onToggle}
          >
            <Chevron className={`dt-group-chev${collapsed ? ' dt-group-chev-collapsed' : ''}`} />
          </button>
          <span className="dt-group-label">{group.label}</span>
          <span className="dt-group-count">{group.count ?? group.rows.length}</span>
          {group.hint && <span className="dt-group-hint">{group.hint}</span>}
        </div>
      </th>
    </tr>
  )
}

function DesktopTable<Row>({
  columns,
  rows,
  groups,
  rowClassName,
  sort,
  onSortChange,
  footer,
  state,
  emptyLabel,
  caption,
  collapsed,
  onToggleGroup,
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
        {state === 'ready' && !groups && rows.map((row, rowIndex) => (
          <DesktopRow
            key={rowKey(row, rowIndex)}
            row={row}
            rowIndex={rowIndex}
            columns={columns}
            rowClassName={rowClassName}
          />
        ))}
        {state === 'ready' && groups && groups.map(group => (
          <Fragment key={group.key}>
            {group.label !== null && (
              <GroupHeaderRow
                group={group}
                columnCount={columns.length}
                collapsed={collapsed.has(group.key)}
                onToggle={() => onToggleGroup(group.key)}
              />
            )}
            {!collapsed.has(group.key) && group.rows.map((row, rowIndex) => (
              <DesktopRow
                key={`${group.key}:${rowKey(row, rowIndex)}`}
                row={row}
                rowIndex={rowIndex}
                columns={columns}
                rowClassName={rowClassName}
              />
            ))}
          </Fragment>
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
  groups?: DataTableGroup<Row>[]
  rowClassName?: (row: Row, index: number) => string | undefined
  state: 'ready' | 'loading' | 'empty'
  emptyLabel: string
  caption: string
  collapsed: Set<string>
  onToggleGroup: (key: string) => void
}

/** ONE phone card — shared by flat + grouped card lists (reuse, do not duplicate). */
function PhoneCard<Row>({
  row,
  rowIndex,
  titleColumn,
  detailColumns,
  rowClassName,
}: {
  row: Row
  rowIndex: number
  titleColumn: DataTableColumn<Row>
  detailColumns: DataTableColumn<Row>[]
  rowClassName?: (row: Row, index: number) => string | undefined
}) {
  return (
    <div
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
  )
}

function PhoneCards<Row>({
  columns,
  rows,
  groups,
  rowClassName,
  state,
  emptyLabel,
  caption,
  collapsed,
  onToggleGroup,
}: PhoneCardsProps<Row>) {
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
      {!groups && rows.map((row, rowIndex) => (
        <PhoneCard
          key={rowKey(row, rowIndex)}
          row={row}
          rowIndex={rowIndex}
          titleColumn={titleColumn}
          detailColumns={detailColumns}
          rowClassName={rowClassName}
        />
      ))}
      {groups && groups.map(group => (
        <Fragment key={group.key}>
          {group.label !== null && (
            <div className="dt-cards-group">
              <button
                type="button"
                className="dt-cards-group-toggle"
                aria-expanded={!collapsed.has(group.key)}
                aria-label={collapsed.has(group.key) ? `Expand ${group.label}` : `Collapse ${group.label}`}
                onClick={() => onToggleGroup(group.key)}
              >
                <Chevron className={`dt-cards-group-chev${collapsed.has(group.key) ? ' dt-cards-group-chev-collapsed' : ''}`} />
              </button>
              <span className="dt-cards-group-label">{group.label}</span>
              <span className="dt-cards-group-count">{group.count ?? group.rows.length}</span>
              {group.hint && <span className="dt-cards-group-hint">{group.hint}</span>}
            </div>
          )}
          {!collapsed.has(group.key) && group.rows.map((row, rowIndex) => (
            <PhoneCard
              key={`${group.key}:${rowKey(row, rowIndex)}`}
              row={row}
              rowIndex={rowIndex}
              titleColumn={titleColumn}
              detailColumns={detailColumns}
              rowClassName={rowClassName}
            />
          ))}
        </Fragment>
      ))}
    </div>
  )
}
