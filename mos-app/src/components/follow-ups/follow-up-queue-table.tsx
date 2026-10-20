// FollowUpQueueTable — the shared Follow-up queue renderer (table + lifecycle actions + detail
// aside). Presentational only — all data/behavior lives in useFollowUpQueue.
// Money-inbox-alignment (Step 9, FR-905/AC-906/AC-907).
//
// INTENDED to be the one renderer; NOT YET the one renderer. Exactly one door uses it today: the
// Work Tasks saved-view embed (FollowUpQueueEmbed). The Money page (FollowUpsPage, at
// /money/follow-ups — the Work spelling is deleted, DD-WAY-36) imports this component zero times
// and carries its own bespoke table and detail aside instead. #428 owns the cutover; the rebuild
// is deferred (OD-WAY-34).
import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { ListPaging } from '@/components/ui/list-paging'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'
import { DateField } from '@/components/ui/date-field'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { StatusPill, type TaskStatus } from '@/components/tasks/status-pill'
import { isOverdue, type FollowUpRow, type FollowUpState, type FollowUpTransition } from '@/lib/db/follow-ups'
import { formatIDR } from '@/lib/format/money'
import type { MessageKey } from '@/i18n/messages'
import './follow-up-queue-table.css'

const FOLLOW_UP_STATE_KEY: Record<FollowUpState, MessageKey> = {
  open: 'moneyB.followups.state.open',
  chased: 'moneyB.followups.state.chased',
  promised: 'moneyB.followups.state.promised',
  partial: 'moneyB.followups.state.partial',
  settled: 'moneyB.followups.state.settled',
  confirmed: 'moneyB.followups.state.confirmed',
}
const FOLLOW_UP_KIND_KEY: Record<FollowUpRow['kind'], MessageKey> = {
  b2b_ar: 'moneyB.followups.kind.b2b_ar',
  retail_pending: 'moneyB.followups.kind.retail_pending',
}
import type { FollowUpQueueState } from './use-follow-up-queue'

function nextActions(row: FollowUpRow, canConfirm: boolean, canChase: boolean): FollowUpTransition[] {
  if (row.state === 'settled') return canConfirm ? ['confirm'] : []
  if (row.state === 'confirmed') return []
  if (!canChase) return []
  return ['chase', 'promise', 'partial', 'settle']
}

function followUpStatusTone(state: FollowUpState): TaskStatus {
  if (state === 'open') return 'Open'
  if (state === 'confirmed') return 'Done'
  return 'In Progress'
}

export function FollowUpQueueTable({
  queue,
  onOpenRecord,
  masterDetail = false,
  selectedId,
}: {
  queue: FollowUpQueueState
  // No-host embeds render plain text because the retired Work record route has no page left.
  onOpenRecord?: (row: FollowUpRow) => void
  /** Money page composition: keep the queue identity-led and put lifecycle actions in the selected record. */
  masterDetail?: boolean
  selectedId?: string | null
}) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const { rows, state, hasMore, loadingMore, moreError, loadMore, canConfirm, canChase, active, form, detailRow, setForm, load, run, submit } = queue
  // Typed date text that is not a usable date: Submit stays off rather than sending the old date.
  const [dateInvalid, setDateInvalid] = useState(false)

  function renderTransitionForm(row: FollowUpRow, verb: FollowUpTransition) {
    if (verb === 'chase' || verb === 'confirm') return null
    const formReady = verb === 'promise'
      ? !!form.promise_date
      : !!form.cash_in_date && !!form.evidence && !!form.amount

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--mos-inline-gap)' }}>
        {verb === 'promise' ? (
          <DateField
            label={t('followUps.promiseDate')}
            value={form.promise_date}
            onChange={(promise_date) => setForm({ ...form, promise_date })}
            onValidityChange={setDateInvalid}
          />
        ) : (
          <>
            <TextInput
              label={t('followUps.amountInput')}
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <DateField
              label={t('followUps.cashInDate')}
              value={form.cash_in_date}
              onChange={(cash_in_date) => setForm({ ...form, cash_in_date })}
              onValidityChange={setDateInvalid}
            />
            <TextInput
              label={t('followUps.evidence')}
              placeholder={t('followUps.evidence')}
              value={form.evidence}
              onChange={(e) => setForm({ ...form, evidence: e.target.value })}
            />
          </>
        )}
        <Button variant="primary" disabled={!formReady || dateInvalid} onClick={() => void submit(row, verb)}>
          {t('followUps.submit')}
        </Button>
      </div>
    )
  }

  const columns: DataTableColumn<FollowUpRow>[] = [
    {
      key: 'counterparty',
      header: t('followUps.counterparty'),
      cardLabel: '',
      render: (row) => (
        <div>
          <strong>{row.counterparty}</strong>
          <br />
          {onOpenRecord ? (
            <button
              type="button"
              className="follow-up-queue-table__open-record"
              onClick={() => onOpenRecord(row)}
              aria-label={`Open follow-up ${row.source_invoice_ref ?? row.id}`}
            >
              {row.source_invoice_ref ?? t(FOLLOW_UP_KIND_KEY[row.kind])}
            </button>
          ) : (
            row.source_invoice_ref ?? t(FOLLOW_UP_KIND_KEY[row.kind])
          )}
        </div>
      ),
    },
    ...(!masterDetail ? [{
      key: 'original_amount',
      header: t('followUps.amount'),
      numeric: true,
      render: (row: FollowUpRow) => formatIDR(row.original_amount),
    }] : []),
    {
      key: 'running_balance',
      header: t('followUps.balance'),
      numeric: true,
      render: (row) => row.running_balance === null ? '—' : formatIDR(row.running_balance),
    },
    {
      key: 'state',
      header: t('followUps.state'),
      render: (row) => <StatusPill status={followUpStatusTone(row.state)} label={t(FOLLOW_UP_STATE_KEY[row.state])} />,
    },
    {
      key: 'due_date',
      header: t('followUps.due'),
      render: (row) => (
        <>
          {row.due_date ?? '—'}
          {isOverdue(row) ? ` · ${t('followUps.overdue')}` : ''}
        </>
      ),
    },
    ...(!masterDetail ? [{
      key: 'actions',
      header: t('followUps.actions'),
      render: (row: FollowUpRow) => {
        const actions = nextActions(row, canConfirm, canChase)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--mos-inline-gap)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--mos-inline-gap)' }}>
              {actions.length === 0 && <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
              {actions.map((verb) => (
                <Button key={verb} variant="outline" onClick={() => void run(row, verb)}>
                  {t(`followUps.action.${verb}`)}
                </Button>
              ))}
            </div>
          </div>
        )
      },
    }] : []),
  ]

  return (
    <>
      {state === 'loading' && <LoadingShell count={5} label={t('followUps.loading')} />}
      {state === 'error' && (
        <ErrorState message={t('followUps.error')} onRetry={() => { load() }} />
      )}
      {state === 'ready' && rows.length === 0 && <EmptyState title={t('followUps.empty')} />}
      {state === 'ready' && rows.length > 0 && (
        <>
          <DataTable columns={columns} rows={rows} isDesktop={isDesktop} caption={t('followUps.title')} tableClassName={masterDetail ? 'follow-up-queue-table--master-detail' : undefined} rowClassName={masterDetail ? (row) => row.id === selectedId ? 'follow-up-queue-row is-selected' : 'follow-up-queue-row' : undefined} renderCard={masterDetail ? (row: FollowUpRow) => <div className="follow-up-queue-card">
            <div className="follow-up-queue-card__top"><button type="button" className="follow-up-queue-table__open-record" onClick={() => onOpenRecord?.(row)} aria-label={`Open follow-up ${row.source_invoice_ref ?? row.id}`}><strong>{row.counterparty}</strong><span>{row.running_balance === null ? '—' : formatIDR(row.running_balance)}</span></button></div>
            <button type="button" className="follow-up-queue-card__identity" onClick={() => onOpenRecord?.(row)}>{row.source_invoice_ref ?? t(FOLLOW_UP_KIND_KEY[row.kind])} · {row.due_date ?? '—'} · {t(FOLLOW_UP_STATE_KEY[row.state])}{isOverdue(row) ? ` · ${t('followUps.overdue')}` : ''}</button>
          </div> : undefined} />
          <ListPaging count={rows.length} hasMore={hasMore} loading={loadingMore}
            error={moreError} onLoadMore={() => { void loadMore() }} />
        </>
      )}
      {!masterDetail && state === 'ready' && detailRow && (
        <aside
          role="complementary"
          aria-label="AR Follow-up detail"
          style={{
            marginTop: 'var(--mos-field-gap)',
            padding: 'var(--mos-panel-pad)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-rest)',
          }}
        >
          <h2 style={{ margin: '0 0 var(--mos-inline-gap)', fontSize: 'var(--mos-size-3)' }}>{detailRow.counterparty}</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: 'var(--mos-label-gap) var(--mos-row-gap)', margin: '0 0 var(--mos-toolbar-gap)' }}>
            <dt style={{ color: 'var(--muted-foreground)' }}>Source</dt>
            <dd style={{ margin: 0 }}>{detailRow.source_invoice_ref ?? detailRow.kind}</dd>
            <dt style={{ color: 'var(--muted-foreground)' }}>State</dt>
            <dd style={{ margin: 0 }}>
              <StatusPill status={followUpStatusTone(detailRow.state)} label={detailRow.state} />
            </dd>
            <dt style={{ color: 'var(--muted-foreground)' }}>Running balance</dt>
            <dd className="tabular" style={{ margin: 0 }}>{detailRow.running_balance === null ? '—' : formatIDR(detailRow.running_balance)}</dd>
          </dl>
          {active?.id === detailRow.id && renderTransitionForm(detailRow, active.verb)}
        </aside>
      )}
    </>
  )
}
