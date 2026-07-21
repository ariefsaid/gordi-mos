// Typed Signal archive TABLE presentation (Issue 6, plan Task 13). Reuses the existing generic
// DataTable<SignalRow> primitive — NOT a Twenty table clone. Its columns are Signal-specific:
// message, author, Team, occurred-at, attention, and category. A retracted Signal renders an explicit
// tombstone (message + reason), and it is present in the projection only when the typed query asks
// for it. Signals have NO PIC, Supervisor, or Task Status columns — the adapter never invents them.
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { formatWibDateTime } from '@/lib/wib-time'
import { attentionSlug, type SignalRow } from '@/lib/db/signals.types'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import type { SignalCollectionContext, SignalCollectionQuery, SignalRenderGroup } from './signal-collection-adapter'
import './signal-table-presentation.css'

type SignalTableProps = CollectionPresentationProps<
  SignalRow,
  SignalCollectionQuery,
  CollectionProjection<SignalRow, SignalRenderGroup>,
  SignalCollectionContext,
  string
>

/** The canonical in-list panel URL for a Signal (`?record=<id>`) — the existing FR-416 seam. */
function recordHref(signalId: string): string {
  return `/work/signals?record=${signalId}`
}

export function SignalTablePresentation({
  projection,
  context,
  selectedIds,
  onToggleSelected,
}: SignalTableProps) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const rows = projection.visibleRecords

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
          <Link className="signal-table-message" to={recordHref(signal.id)} data-canonical={recordHref(signal.id)}>
            {signal.body}
          </Link>
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
      render: (signal) => formatWibDateTime(signal.occurred_at),
    },
    {
      key: 'attention',
      header: t('signals.table.attention'),
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
    {
      key: 'select',
      header: t('signals.table.select'),
      render: (signal) => (
        <label className="signal-table-select">
          <input
            type="checkbox"
            checked={selectedIds.has(signal.id)}
            onChange={() => onToggleSelected(signal.id)}
            aria-label={t('signals.table.selectRow', { body: signal.body })}
          />
        </label>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={[...rows]}
      isDesktop={isDesktop}
      state={rows.length === 0 ? 'empty' : 'ready'}
      emptyLabel={t('signals.table.empty')}
      caption={t('signals.table.caption')}
      rowClassName={(signal) =>
        [signal.retracted_at ? 'signal-table-row--retracted' : undefined, selectedIds.has(signal.id) ? 'signal-table-row--selected' : undefined]
          .filter(Boolean)
          .join(' ') || undefined
      }
    />
  )
}
