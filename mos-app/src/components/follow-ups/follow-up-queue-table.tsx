// FollowUpQueueTable — the ONE canonical Follow-up record renderer (table +
// lifecycle actions + detail aside). Reused by every door: the canonical page
// (FollowUpsPage, at /money/follow-ups — the Work spelling is deleted, DD-WAY-36) and the Work
// Tasks saved-view embed (FollowUpQueueEmbed). Money-inbox-alignment (Step 9,
// FR-905/AC-906/AC-907). Presentational only — all data/behavior lives in
// useFollowUpQueue.
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { StatusPill, type TaskStatus } from '@/components/tasks/status-pill'
import { isOverdue, type FollowUpRow, type FollowUpState, type FollowUpTransition } from '@/lib/db/follow-ups'
import { formatIDR } from '@/lib/format/money'
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
}: {
  queue: FollowUpQueueState
  // WHY: no-host embeds render plain text because the retired Work record route has no page left
  // to link; an overlay host still provides the panel-only record door (DD-WAY-36).
  onOpenRecord?: (row: FollowUpRow) => void
}) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const { rows, state, error, canConfirm, canChase, active, form, detailRow, setForm, load, run, submit } = queue

  function renderTransitionForm(row: FollowUpRow, verb: FollowUpTransition) {
    if (verb === 'chase' || verb === 'confirm') return null
    const formReady = verb === 'promise'
      ? !!form.promise_date
      : !!form.cash_in_date && !!form.evidence && !!form.amount

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {verb === 'promise' ? (
          <TextInput
            label={t('followUps.promiseDate')}
            type="date"
            value={form.promise_date}
            onChange={(e) => setForm({ ...form, promise_date: e.target.value })}
          />
        ) : (
          <>
            <TextInput
              label={t('followUps.amountInput')}
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <TextInput
              label={t('followUps.cashInDate')}
              type="date"
              value={form.cash_in_date}
              onChange={(e) => setForm({ ...form, cash_in_date: e.target.value })}
            />
            <TextInput
              label={t('followUps.evidence')}
              placeholder={t('followUps.evidence')}
              value={form.evidence}
              onChange={(e) => setForm({ ...form, evidence: e.target.value })}
            />
          </>
        )}
        <Button variant="primary" disabled={!formReady} onClick={() => void submit(row, verb)}>
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
              {row.source_invoice_ref ?? row.kind}
            </button>
          ) : (
            row.source_invoice_ref ?? row.kind
          )}
        </div>
      ),
    },
    {
      key: 'original_amount',
      header: t('followUps.amount'),
      numeric: true,
      render: (row) => formatIDR(row.original_amount),
    },
    {
      key: 'running_balance',
      header: t('followUps.balance'),
      numeric: true,
      render: (row) => formatIDR(row.running_balance),
    },
    {
      key: 'state',
      header: t('followUps.state'),
      render: (row) => <StatusPill status={followUpStatusTone(row.state)} label={row.state} />,
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
    {
      key: 'actions',
      header: t('followUps.actions'),
      render: (row) => {
        const actions = nextActions(row, canConfirm, canChase)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
    },
  ]

  return (
    <>
      {state === 'loading' && <LoadingShell count={5} label={t('followUps.loading')} />}
      {state === 'error' && (
        <ErrorState message={error ?? t('followUps.error')} onRetry={() => { load() }} />
      )}
      {state === 'ready' && rows.length === 0 && <EmptyState title={t('followUps.empty')} />}
      {state === 'ready' && rows.length > 0 && (
        <DataTable columns={columns} rows={rows} isDesktop={isDesktop} caption={t('followUps.title')} />
      )}
      {state === 'ready' && detailRow && (
        <aside
          role="complementary"
          aria-label="AR Follow-up detail"
          style={{
            marginTop: 16,
            padding: 16,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-rest)',
          }}
        >
          <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>{detailRow.counterparty}</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 12px', margin: '0 0 12px' }}>
            <dt style={{ color: 'var(--muted-foreground)' }}>Source</dt>
            <dd style={{ margin: 0 }}>{detailRow.source_invoice_ref ?? detailRow.kind}</dd>
            <dt style={{ color: 'var(--muted-foreground)' }}>State</dt>
            <dd style={{ margin: 0 }}>
              <StatusPill status={followUpStatusTone(detailRow.state)} label={detailRow.state} />
            </dd>
            <dt style={{ color: 'var(--muted-foreground)' }}>Running balance</dt>
            <dd className="tabular" style={{ margin: 0 }}>{formatIDR(detailRow.running_balance)}</dd>
          </dl>
          {active?.id === detailRow.id && renderTransitionForm(detailRow, active.verb)}
        </aside>
      )}
    </>
  )
}
