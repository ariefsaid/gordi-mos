// The three readings of Café Records — Summary, Entries, Day summary — over the shared DataTable
// (band header, 12px cells, 48px rows, phone cards). Columns follow the spec order; quantities are
// right-aligned tabular; a unit is always shown with its number. No chart, no KPI card.
import type { ReactNode } from 'react'
import { DataTable, type DataTableColumn, type DataTableGroup } from '@/components/dashboard/data-table'
import type { Translate } from '@/i18n/use-t'
import type { DayColumn, DayGroup, DayRow, Movement, PagedGroup, RecordEntry, StatusBasis, SummaryRow } from '@/lib/cafe-records/model'
import type { Question, SortDir, SortKey } from '@/lib/cafe-records/url-state'
import { EntryStatus, Quantity } from './records-format'
import { MOVEMENT_LABEL, dateText, quantityText, statusLabel, unitText } from './records-labels'

/** Names the page resolves once (streams, destinations, people) so every reading says the same words. */
export interface RecordsText {
  t: Translate
  stream: (streamKey: string) => string
  destination: (streamKey: string, key: string | null) => string
  /** A Location's name by id; null when unknown. */
  place: (id: string | null) => string | null
  person: (entry: RecordEntry) => string
  personById: (id: string) => string
}

interface Open {
  onOpenHistory: (itemKey: string) => void
  onOpenEntry: (entryKey: string) => void
  selectedHistory: string
  selectedEntry: string
}

function ItemButton({ name, itemKey, onOpen, label }: { name: string; itemKey: string; onOpen: (itemKey: string) => void; label: string }) {
  return (
    <button type="button" className="rec-item" data-rec-focus={`history:${itemKey}`} aria-label={label} onClick={() => onOpen(itemKey)}>
      {name || '—'}
    </button>
  )
}

function groupLabel(t: Translate, question: Question, movement: Movement, status: StatusBasis): string {
  const word = movement === 'wasted' && status === 'approved' ? t('records.group.approvedWaste') : statusLabel(t, movement, status)
  return question === 'everything' ? `${t(MOVEMENT_LABEL[movement])} · ${word}` : word
}

// ── Summary ───────────────────────────────────────────────────────────────────────────────────────

export function SummaryReading({ text, question, groups, sort, dir, onSort, showDestination, isDesktop, incomplete, ...open }: Open & {
  /** Movements whose source did not load completely: their totals read "—", never a smaller number. */
  incomplete: ReadonlySet<Movement>
  text: RecordsText
  question: Question
  groups: readonly PagedGroup[]
  sort: SortKey
  dir: SortDir
  onSort: (sort: SortKey, dir: SortDir) => void
  showDestination: boolean
  isDesktop: boolean
}) {
  const { t } = text
  const counted = question === 'counted'
  const opener = (row: SummaryRow) => t('records.history.open', { item: row.itemName })
  const columns: DataTableColumn<SummaryRow>[] = [
    { key: 'item', header: t('kitchen.log.col.item'), sortable: true, className: 'rec-col-item',
      render: row => <ItemButton name={row.itemName} itemKey={row.itemKey} onOpen={open.onOpenHistory} label={opener(row)} /> },
    { key: 'stream', header: t('records.col.stream'), sortable: true, render: row => text.stream(row.streamKey) },
    ...(showDestination ? [{ key: 'destination', header: t('records.col.destination'), sortable: true,
      render: (row: SummaryRow) => row.destinationKey ? text.destination(row.streamKey, row.destinationKey) : '' }] : []),
    { key: 'unit', header: t('records.col.unit'), render: row => <span className={row.unit.name ? undefined : 'rec-qty__unit--missing'}>{unitText(t, row.unit)}</span> },
    { key: 'quantity', header: counted ? t('records.col.latestCount') : t('records.col.quantity'), numeric: true, sortable: true,
      render: row => <>{incomplete.has(row.movement) ? <>—<span className="sr-only"> ({t('records.day.sourceUnavailable')})</span></> : quantityText(row.qty)}{row.latestDate ? <span className="rec-meta-line">{dateText(row.latestDate)}</span> : null}</> },
    // HANDOVER: R/handover/records-gaps.md §1. Waste value in rupiah — Records shows waste as a quantity only; no value column until a certified basis exists.
    // HANDOVER: R/handover/records-gaps.md §2. Ingredient use / waste rate — no rate column; a rate needs matched actual ingredient consumption.
    { key: 'entries', header: t('records.col.entries'), numeric: true, sortable: true, render: row => row.entries },
  ]
  const tableGroups: DataTableGroup<SummaryRow>[] = groups.map(group => ({
    key: group.key, label: groupLabel(t, question, group.movement, group.status), count: group.total,
    hint: group.continued ? t('records.continued') : undefined, rows: group.rows,
  }))
  return (
    <DataTable<SummaryRow>
      columns={columns}
      rows={[]}
      groups={tableGroups}
      isDesktop={isDesktop}
      caption={t('records.table.summary')}
      tableClassName="rec-table rec-table--summary"
      sort={{ key: sort, dir }}
      onSortChange={next => onSort(next.key as SortKey, next.dir)}
      rowClassName={row => (open.selectedHistory === row.itemKey ? 'rec-row is-selected' : 'rec-row')}
      renderCard={row => (
        <button type="button" className="rec-card" data-rec-focus={`history:${row.itemKey}`} onClick={() => open.onOpenHistory(row.itemKey)}>
          <span className="rec-card__main">
            <span className="rec-card__title">{row.itemName || '—'}</span>
            <span className="rec-card__meta">
              {[text.stream(row.streamKey), row.destinationKey ? text.destination(row.streamKey, row.destinationKey) : null,
                t(row.entries === 1 ? 'records.entries.one' : 'records.entries.other', { count: row.entries }),
                row.latestDate ? dateText(row.latestDate) : null].filter(Boolean).join(' · ')}
            </span>
          </span>
          <Quantity t={t} qty={incomplete.has(row.movement) ? null : row.qty} unit={row.unit} className="rec-card__qty" />
          <span className="sr-only">{t('records.history.hint')}</span>
        </button>
      )}
    />
  )
}

// ── Entries ───────────────────────────────────────────────────────────────────────────────────────

interface EntryRow { id: string; entry: RecordEntry }

export function EntriesReading({ text, entries, sort, dir, onSort, showDestination, isDesktop, ...open }: Open & {
  text: RecordsText
  entries: readonly RecordEntry[]
  sort: SortKey
  dir: SortDir
  onSort: (sort: SortKey, dir: SortDir) => void
  showDestination: boolean
  isDesktop: boolean
}) {
  const { t } = text
  const rows: EntryRow[] = entries.map(entry => ({ id: entry.key, entry }))
  const personCell = (entry: RecordEntry): ReactNode => {
    const name = text.person(entry)
    return name
  }
  const openEntry = (entry: RecordEntry) => t('records.entry.open', { item: entry.itemName, date: dateText(entry.date) })
  const columns: DataTableColumn<EntryRow>[] = [
    { key: 'item', header: t('kitchen.log.col.item'), sortable: true, className: 'rec-col-item',
      render: ({ entry }) => <ItemButton name={entry.itemName} itemKey={entry.itemKey} onOpen={open.onOpenHistory} label={t('records.history.open', { item: entry.itemName })} /> },
    { key: 'movement', header: t('records.col.movement'), render: ({ entry }) => t(MOVEMENT_LABEL[entry.movement]) },
    { key: 'stream', header: t('records.col.stream'), render: ({ entry }) => text.stream(entry.streamKey) },
    ...(showDestination ? [{ key: 'destination', header: t('records.col.destination'),
      render: ({ entry }: EntryRow) => entry.destinationKey ? text.destination(entry.streamKey, entry.destinationKey) : '' }] : []),
    { key: 'status', header: t('kitchen.log.col.status'), render: ({ entry }) => <EntryStatus t={t} entry={entry} /> },
    { key: 'by', header: t('records.col.by'), render: ({ entry }) => personCell(entry) },
    { key: 'date', header: t('records.col.date'), sortable: true,
      render: ({ entry }) => (
        <button type="button" className="rec-link" data-rec-focus={`entry:${entry.key}`} aria-label={openEntry(entry)} onClick={() => open.onOpenEntry(entry.key)}>{dateText(entry.date)}</button>
      ) },
    { key: 'quantity', header: t('records.col.amount'), numeric: true, sortable: true,
      render: ({ entry }) => <Quantity t={t} qty={entry.entered?.quantity ?? entry.qty} unit={entry.unit} /> },
  ]
  return (
    <DataTable<EntryRow>
      columns={columns}
      rows={rows}
      isDesktop={isDesktop}
      caption={t('records.table.entries')}
      tableClassName="rec-table rec-table--entries"
      sort={{ key: sort, dir }}
      onSortChange={next => onSort(next.key as SortKey, next.dir)}
      onRowClick={({ entry }) => open.onOpenEntry(entry.key)}
      rowClassName={({ entry }) => (open.selectedEntry === entry.key ? 'rec-row rec-row--click is-selected' : 'rec-row rec-row--click')}
      renderCard={({ entry }) => (
        <div className="rec-entry-card">
          <div className="rec-entry-card__top">
            <ItemButton name={entry.itemName} itemKey={entry.itemKey} onOpen={open.onOpenHistory} label={t('records.history.open', { item: entry.itemName })} />
            <EntryStatus t={t} entry={entry} />
          </div>
          <button type="button" className="rec-entry-card__body" data-rec-focus={`entry:${entry.key}`} onClick={() => open.onOpenEntry(entry.key)}>
            <span className="rec-card__meta">
              {[dateText(entry.date), text.stream(entry.streamKey), entry.destinationKey ? text.destination(entry.streamKey, entry.destinationKey) : null, text.person(entry)].filter(Boolean).join(' · ')}
            </span>
            <Quantity t={t} qty={entry.entered?.quantity ?? entry.qty} unit={entry.unit} className="rec-card__qty" />
            <span className="sr-only">{t('records.entry.hint')}</span>
          </button>
        </div>
      )}
    />
  )
}

// ── Day summary ───────────────────────────────────────────────────────────────────────────────────

const DAY_COLUMNS: readonly DayColumn[] = ['made', 'transferred', 'sent', 'wasted', 'counted']

function dayCellText(t: Translate, row: DayRow, column: DayColumn): { value: string; reason: string | null } {
  const cell = row.cells[column]
  if (cell.value === null) return { value: '—', reason: cell.reason === 'source' ? t('records.day.sourceUnavailable') : column === 'counted' ? t('records.day.noCount') : null }
  return { value: quantityText(cell.value), reason: null }
}

export function DayReading({ text, groups, dir, onSort, isDesktop, ...open }: Open & {
  text: RecordsText
  groups: readonly DayGroup[]
  dir: SortDir
  onSort: (sort: SortKey, dir: SortDir) => void
  isDesktop: boolean
}) {
  const { t } = text
  const heads: Record<DayColumn, string> = {
    sent: t('records.movement.sent'), made: t('records.day.made'), transferred: t('records.day.transferred'), wasted: t('records.day.wasted'), counted: t('records.day.counted'),
  }
  const short: Record<DayColumn, string> = { sent: t('records.movement.sent'), made: t('records.day.made'), transferred: t('records.day.out'), wasted: t('records.day.waste'), counted: t('records.day.count') }
  const cell = (row: DayRow, column: DayColumn): ReactNode => {
    const { value, reason } = dayCellText(t, row, column)
    return <>{value}{reason ? <span className="sr-only"> ({reason})</span> : null}</>
  }
  const columns: DataTableColumn<DayRow>[] = [
    { key: 'item', header: t('kitchen.log.col.item'), sortable: true, className: 'rec-col-item',
      render: row => <ItemButton name={row.itemName} itemKey={row.itemKey} onOpen={open.onOpenHistory} label={t('records.history.open', { item: row.itemName })} /> },
    { key: 'stream', header: t('records.col.stream'), render: row => text.stream(row.streamKey) },
    { key: 'unit', header: t('records.col.unit'), render: row => <span className={row.unit.name ? undefined : 'rec-qty__unit--missing'}>{unitText(t, row.unit)}</span> },
    ...DAY_COLUMNS.map(column => ({ key: column, header: heads[column], numeric: true, render: (row: DayRow) => cell(row, column) })),
  ]
  const tableGroups: DataTableGroup<DayRow>[] = groups.map(group => ({
    key: group.date, label: dateText(group.date), count: group.total, hint: group.continued ? t('records.continued') : undefined, rows: group.rows,
  }))
  const label = (row: DayRow) => `${row.itemName}, ${unitText(t, row.unit)}: ${DAY_COLUMNS.map(column => {
    const { value, reason } = dayCellText(t, row, column)
    return `${heads[column]} ${value}${reason ? ` (${reason})` : ''}`
  }).join(', ')}`
  return (
    <>
      {!isDesktop && (
        <div className="rec-day-head" aria-hidden="true">
          <span>{t('kitchen.log.col.item')}</span>
          <span className="rec-day-head__values">{DAY_COLUMNS.map(column => <span key={column}>{short[column]}</span>)}</span>
        </div>
      )}
      <DataTable<DayRow>
        columns={columns}
        rows={[]}
        groups={tableGroups}
        isDesktop={isDesktop}
        caption={t('records.table.day')}
        tableClassName="rec-table rec-table--day"
        sort={{ key: 'item', dir }}
        onSortChange={next => onSort('item', next.dir)}
        rowClassName={row => (open.selectedHistory === row.itemKey ? 'rec-row is-selected' : 'rec-row')}
        renderCard={row => (
          <button type="button" className="rec-card rec-card--day" data-rec-focus={`history:${row.itemKey}`} aria-label={label(row)} onClick={() => open.onOpenHistory(row.itemKey)}>
            <span className="rec-card__main" aria-hidden="true">
              <span className="rec-card__title">{row.itemName || '—'}</span>
              <span className="rec-card__meta">{[text.stream(row.streamKey), unitText(t, row.unit)].join(' · ')}</span>
            </span>
            <span className="rec-day-values" aria-hidden="true">
              {DAY_COLUMNS.map(column => <span key={column} className="rec-day-values__cell">{dayCellText(t, row, column).value}</span>)}
            </span>
          </button>
        )}
      />
    </>
  )
}

// ── Loading ───────────────────────────────────────────────────────────────────────────────────────

/** The reading's own header and row rhythm with placeholder rows, so nothing jumps when the data lands. */
export function ReadingSkeleton({ t, reading, isDesktop }: { t: Translate; reading: 'summary' | 'entries' | 'day'; isDesktop: boolean }) {
  const head = (key: string, header: string, numeric = false): DataTableColumn<{ id: string }> => ({ key, header, numeric })
  const columns = reading === 'summary'
    ? [head('item', t('kitchen.log.col.item')), head('stream', t('records.col.stream')), head('unit', t('records.col.unit')), head('quantity', t('records.col.quantity'), true), head('entries', t('records.col.entries'), true)]
    : reading === 'entries'
      ? [head('item', t('kitchen.log.col.item')), head('movement', t('records.col.movement')), head('stream', t('records.col.stream')), head('status', t('kitchen.log.col.status')),
        head('by', t('records.col.by')), head('date', t('records.col.date')), head('quantity', t('records.col.amount'), true)]
      : [head('item', t('kitchen.log.col.item')), head('stream', t('records.col.stream')), head('unit', t('records.col.unit')), head('made', t('records.day.made'), true),
        head('transferred', t('records.day.transferred'), true), head('wasted', t('records.day.wasted'), true), head('counted', t('records.day.counted'), true)]
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="sr-only" role="status">{t('common.loading')}</p>
      <DataTable<{ id: string }> columns={columns} rows={[]} state="loading" isDesktop={isDesktop} caption={t('common.loading')} tableClassName="rec-table" />
    </div>
  )
}
