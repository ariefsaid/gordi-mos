// Typed Signal archive TABLE presentation (Issue 6, plan Task 13). Reuses the existing generic
// DataTable<SignalRow> primitive — NOT a Twenty table clone. Its columns are Signal-specific:
// message, author, Team, occurred-at, attention, and category. A retracted Signal renders an explicit
// tombstone (message + reason), and it is present in the projection only when the typed query asks
// for it. Signals have NO PIC, Supervisor, or Task Status columns — the adapter never invents them.
import { useT } from '@/i18n/use-t'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { formatWibDateTime } from '@/lib/wib-time'
import { attentionSlug, type SignalRow } from '@/lib/db/signals.types'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import type { SignalCollectionContext, SignalCollectionQuery, SignalRenderGroup } from './signal-collection-adapter'
import { useSignalCollectionActions } from './signal-collection-actions'
import './signal-table-presentation.css'

type SignalTableProps = CollectionPresentationProps<
  SignalRow,
  SignalCollectionQuery,
  CollectionProjection<SignalRow, SignalRenderGroup>,
  SignalCollectionContext,
  string
>

export function SignalTablePresentation({
  query,
  projection,
  context,
  onOpenRecord,
  onToggleGroup,
  isGroupCollapsed,
}: SignalTableProps) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const actions = useSignalCollectionActions()

  const columns: DataTableColumn<SignalRow>[] = [
    {
      key: 'message',
      header: t('signals.table.message'),
      cardLabel: '',
      render: (signal) =>
        signal.retracted_at ? (
          <span className="signal-table-tombstone">
            {t('signals.retracted')}
            {signal.retract_reason ? <span className="signal-table-reason"> {signal.retract_reason}</span> : null}
          </span>
        ) : (
          <button
            type="button"
            className="signal-table-message"
            onClick={() => onOpenRecord(signal)}
          >
            {signal.body}
          </button>
        ),
    },
    {
      key: 'author',
      header: t('signals.table.author'),
      render: (signal) => context.authorNamesById.get(signal.author_id) ?? t('signals.card.unknownAuthor'),
    },
    {
      key: 'team',
      header: t('signals.table.team'),
      render: (signal) => context.teamNamesById.get(signal.owning_team_id) ?? '',
    },
    {
      key: 'occurredAt',
      header: t('signals.table.occurredAt'),
      sortable: Boolean(actions.onSort),
      render: (signal) => formatWibDateTime(signal.occurred_at),
    },
    {
      key: 'attention',
      header: t('signals.table.attention'),
      sortable: Boolean(actions.onSort),
      render: (signal) =>
        signal.retracted_at ? (
          <span aria-hidden="true">—</span>
        ) : (
          <span className={`signal-table-attention signal-table-attention--${attentionSlug(signal.attention)}`}>
            {signal.attention}
          </span>
        ),
    },
    {
      key: 'category',
      header: t('signals.table.category'),
      render: (signal) => signal.category ?? <span aria-hidden="true">—</span>,
    },
  ]

  // Convert SignalRenderGroup to DataTableGroup
  const groups = projection.groups?.map((group) => ({
    key: group.key,
    label: group.label,
    count: group.rows.length,
    rows: [...group.rows], // convert readonly to mutable
  })) ?? []

  return (
      <DataTable
        tableClassName="record-collection-table signal-collection-table"
        columns={columns}
        rows={[]}
        groups={groups.length > 0 ? groups : undefined}
        collapsedGroupKeys={new Set(groups.filter((group) => isGroupCollapsed(group.key)).map((group) => group.key))}
        onToggleGroup={onToggleGroup}
        isDesktop={isDesktop}
        state={projection.visibleRecords.length === 0 ? 'empty' : 'ready'}
        emptyLabel={t('signals.table.empty')}
        caption={t('signals.table.caption')}
        sort={{
          key: query.sort,
          dir: query.direction === 'ascending' ? 'asc' : 'desc',
        }}
        onSortChange={(next) => {
          if (next.key !== 'occurredAt' && next.key !== 'attention') return
          actions.onSort?.(next.key, next.dir === 'asc' ? 'ascending' : 'descending')
        }}
        rowClassName={(signal) =>
          [signal.retracted_at ? 'signal-table-row--retracted' : undefined]
            .filter(Boolean)
            .join(' ') || undefined
        }
      />
  )
}
