// Typed Signal archive TABLE presentation (Issue 6, plan Task 13). Reuses the existing generic
// DataTable<SignalRow> primitive — NOT a Twenty table clone. Its columns are Signal-specific:
// message with provenance subline, Team, occurred-at, and attention. A retracted Signal renders an explicit
// tombstone (message + reason), and it is present in the projection only when the typed query asks
// for it. Signals have NO PIC, Supervisor, or Task Status columns — the adapter never invents them.
import { useT } from '@/i18n/use-t'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useOptionalOverlayHost } from '@/shell/overlay-host'
import { useCollectionKeyboard } from '@/components/record-collection/use-collection-keyboard'
import { formatWibDateTime } from '@/lib/wib-time'
import { attentionSlug, SIGNAL_CATEGORIES, type Attention, type SignalCategory, type SignalRow } from '@/lib/db/signals.types'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import type { SignalCollectionContext, SignalCollectionQuery, SignalRenderGroup } from './signal-collection-adapter'
import { useSignalCollectionActions } from './signal-collection-actions'
import { attentionLabel } from './signal-attention-label'
import { signalCategoryLabel } from './signal-labels'
import './signal-table-presentation.css'
import '@/components/collection-grammar.css'

type SignalTableProps = CollectionPresentationProps<
  SignalRow,
  SignalCollectionQuery,
  CollectionProjection<SignalRow, SignalRenderGroup>,
  SignalCollectionContext,
  string
>

function isSignalCategory(value: string): value is SignalCategory {
  return (SIGNAL_CATEGORIES as readonly string[]).includes(value)
}

function isAttention(value: string): value is Attention {
  return value === 'FYI' || value === 'Needs attention' || value === 'Urgent'
}

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

  // GAP-9 (OD-REDESIGN-91 #14): the Signal table inherits the shared j/k row cursor from the
  // collection engine. Cursor walks the visible rows in display order (grouped rows flattened
  // group-by-group so j/k tracks what the eye sees); Enter/o opens the cursor row; the shared
  // Escape-gating (overlay host owns Esc while a session is live) carries over verbatim.
  const overlayHost = useOptionalOverlayHost()
  const overlayActive = (overlayHost?.session?.frames.length ?? 0) > 0
  const flatRows: SignalRow[] = projection.groups && projection.groups.length > 0
    ? projection.groups.flatMap((group) => [...group.rows])
    : [...projection.visibleRecords]
  const keyboard = useCollectionKeyboard({
    rowCount: flatRows.length,
    enabled: isDesktop,
    overlayActive,
    onOpen: (index) => { const signal = flatRows[index]; if (signal) onOpenRecord(signal) },
  })
  const cursorId = keyboard.cursor >= 0 ? flatRows[keyboard.cursor]?.id ?? null : null

  // AC-027 (#770): the ratified column order is Message (category subline) · Team · Attention ·
  // Occurred — a weekly review scans who/what, then how loud, then how long ago.
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
          <div className="signal-table-title-cell">
            <button
              type="button"
              className="signal-table-message collection-grammar-title"
              onClick={() => onOpenRecord(signal)}
            >
              {signal.body}
            </button>
            <span className="signal-table-message-meta collection-grammar-meta">
              <span>{context.authorNamesById.get(signal.author_id) ?? t('signals.card.unknownAuthor')}</span>
              {signal.category ? <><span aria-hidden="true"> · </span><span>{signalCategoryLabel(t, signal.category)}</span></> : null}
            </span>
          </div>
        ),
    },
    {
      key: 'team',
      header: t('signals.table.team'),
      render: (signal) => signal.owning_team_id ? (context.teamNamesById.get(signal.owning_team_id) ?? '') : '',
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
            {attentionLabel(t, signal.attention)}
          </span>
        ),
    },
    {
      key: 'occurredAt',
      header: t('signals.table.occurredAt'),
      sortable: Boolean(actions.onSort),
      render: (signal) => formatWibDateTime(signal.occurred_at),
    },
  ]

  // Convert SignalRenderGroup to DataTableGroup
  const groups = projection.groups?.map((group) => ({
    key: group.key,
    label:
      group.label && query.groupBy === 'category'
        ? group.label === 'Uncategorized'
          ? t('signals.archive.groupUncategorized')
          : isSignalCategory(group.label)
            ? signalCategoryLabel(t, group.label)
            : group.label
        : group.label && query.groupBy === 'attention' && isAttention(group.label)
          ? attentionLabel(t, group.label)
          : group.label,
    count: group.rows.length,
    rows: [...group.rows], // convert readonly to mutable
  })) ?? []

  return (
    <div className="signal-collection-presentation">
      <DataTable
        tableClassName="record-collection-table collection-grammar-table signal-collection-table"
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
          [
            // GAP-9: the shared j/k cursor row lights up with the collection-grammar `kfocus` rule.
            signal.id === cursorId ? 'kfocus' : undefined,
            signal.retracted_at ? 'signal-table-row--retracted' : undefined,
            // F3 (OD-REDESIGN-91 #18): amber row-fill is URGENT ONLY — the warning/7% fill + 2px
            // warning left rule reads as "act now", so it is reserved for the top tier. Needs
            // attention keeps its amber pill on a CALM row (the pill cell still carries the state,
            // WCAG 1.4.1), so the fill escalates Urgent above it. Both /work/signals presentations
            // read the state identically (the Feed applies the same urgent-only rule).
            !signal.retracted_at && signal.attention === 'Urgent' ? 'signal-table-row--urgent' : undefined,
          ]
            .filter(Boolean)
            .join(' ') || undefined
        }
      />
    </div>
  )
}
