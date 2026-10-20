import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useFollowUpQueue } from '@/components/follow-ups/use-follow-up-queue'
import { FollowUpQueueTable } from '@/components/follow-ups/follow-up-queue-table'
import { FollowUpRecordHost } from '@/components/follow-ups/follow-up-record-host'
import { RecordPanelHost } from '@/shell/record-panel-host'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsRecordSplit } from '@/shell/use-is-split-width'
import { isOverdue, type FollowUpRow, type FollowUpState, type FollowUpTransition } from '@/lib/db/follow-ups'
import { StatusPill, type TaskStatus } from '@/components/tasks/status-pill'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'
import { DateField } from '@/components/ui/date-field'
import { ErrorState, EmptyState, SkeletonRows } from '@/components/ui/state-kit'
import { formatIDR } from '@/lib/format/money'
import type { MessageKey } from '@/i18n/messages'
import './follow-ups-page.css'

function nextActions(row: FollowUpRow, canConfirm: boolean, canChase: boolean): FollowUpTransition[] {
  if (row.state === 'settled') return canConfirm ? ['confirm'] : []
  if (row.state === 'confirmed' || !canChase) return []
  return ['chase', 'promise', 'partial', 'settle']
}

const FOLLOW_UP_STATE_KEY: Record<FollowUpState, MessageKey> = {
  open: 'moneyB.followups.state.open',
  chased: 'moneyB.followups.state.chased',
  promised: 'moneyB.followups.state.promised',
  partial: 'moneyB.followups.state.partial',
  settled: 'moneyB.followups.state.settled',
  confirmed: 'moneyB.followups.state.confirmed',
}

function stateTone(state: FollowUpState): TaskStatus {
  if (state === 'open') return 'Open'
  if (state === 'confirmed') return 'Done'
  return 'In Progress'
}

export function FollowUpsPage() {
  const t = useT()
  const tx = (key: string) => t(key as MessageKey)
  const wide = useIsRecordSplit()
  const [params, setParams] = useSearchParams()
  const route = useParams<{ id?: string }>()
  const [selectedId, setSelectedId] = useState<string | null>(route.id ?? null)
  const [dateInvalid, setDateInvalid] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const queue = useFollowUpQueue({ detailId: selectedId ?? undefined })
  useDocumentTitle(`${t('followUps.title')} — Gordi MOS`)

  useEffect(() => setSelectedId(route.id ?? null), [route.id])
  const selected = queue.detailRow
  const filterOverdue = params.get('filter') === 'overdue'
  const loadedCopy = t('moneyB.followups.loaded' as MessageKey, { count: `${queue.rows.length}${queue.hasMore ? '+' : ''}` })
  const overdueCopy = t('moneyB.followups.overdue' as MessageKey, { count: `${queue.overdueCount}${queue.hasMore ? '+' : ''}` })
  const frameState = queue.state === 'loading' ? 'loading' : queue.state === 'error' ? 'error' : queue.rows.length === 0 ? 'empty' : 'default'

  const changeFilter = (overdue: boolean) => {
    const next = new URLSearchParams(params)
    if (overdue) next.set('filter', 'overdue')
    else next.delete('filter')
    setParams(next)
    queue.cancelAction()
    setSelectedId(null)
  }
  const openRecord = (row: FollowUpRow) => {
    queue.cancelAction()
    setActionError(null)
    setSelectedId(row.id)
  }
  const runAction = async (row: FollowUpRow, verb: FollowUpTransition) => {
    setActionError(null)
    try {
      await queue.run(row, verb)
      setSelectedId(row.id)
    } catch {
      setActionError(t('followUps.error'))
    }
  }
  const submit = async (row: FollowUpRow, verb: FollowUpTransition) => {
    setActionError(null)
    try {
      await queue.submit(row, verb)
    } catch {
      setActionError(t('followUps.error'))
    }
  }
  const cancelForm = () => {
    queue.cancelAction()
    setDateInvalid(false)
    setActionError(null)
  }
  const transitionForm = selected && queue.active?.id === selected.id && queue.active.verb !== 'chase' && queue.active.verb !== 'confirm'
    ? (() => {
        const verb = queue.active!.verb
        const isPromise = verb === 'promise'
        const ready = isPromise ? Boolean(queue.form.promise_date) : Boolean(queue.form.cash_in_date && queue.form.evidence && queue.form.amount)
        return <form className="follow-ups-form" onSubmit={(event) => { event.preventDefault(); void submit(selected, verb) }}>
          <h3>{t(`followUps.action.${verb}`)}</h3>
          {isPromise ? <DateField label={t('followUps.promiseDate')} required value={queue.form.promise_date} onChange={(value) => queue.setForm({ ...queue.form, promise_date: value })} onValidityChange={setDateInvalid} /> : <>
            <TextInput label={tx('moneyB.followups.amountRp')} required type="number" inputMode="decimal" value={queue.form.amount} onChange={(event) => queue.setForm({ ...queue.form, amount: event.target.value })} />
            <DateField label={t('followUps.cashInDate')} required value={queue.form.cash_in_date} onChange={(value) => queue.setForm({ ...queue.form, cash_in_date: value })} onValidityChange={setDateInvalid} />
            <TextInput label={t('followUps.evidence')} required value={queue.form.evidence} onChange={(event) => queue.setForm({ ...queue.form, evidence: event.target.value })} />
          </>}
          <TextInput label={tx('moneyB.followups.note')} value={queue.form.note} onChange={(event) => queue.setForm({ ...queue.form, note: event.target.value })} />
          {actionError && <p className="follow-ups-error" role="alert">{actionError}</p>}
          <div className="follow-ups-form__actions"><Button type="button" variant="outline" onClick={cancelForm}>{t('common.cancel')}</Button><Button type="submit" disabled={!ready || dateInvalid}>{t('followUps.submit')}</Button></div>
        </form>
      })()
    : null

  const selectedActions = selected ? nextActions(selected, queue.canConfirm, queue.canChase) : []
  const startAction = (row: FollowUpRow, verb: FollowUpTransition) => {
    openRecord(row)
    void runAction(row, verb)
  }
  const closeRecord = () => {
    queue.cancelAction()
    setSelectedId(null)
    setActionError(null)
  }
  const recordContent = selected ? <div className="follow-ups-record-workbench">
    <section className="follow-ups-record-summary">
      <h2>{selected.counterparty}</h2>
      <dl>
        <div><dt>{tx('moneyB.followups.source')}</dt><dd>{selected.source_invoice_ref ?? selected.kind}</dd></div>
        <div><dt>{tx('moneyB.followups.originalAmount')}</dt><dd className="tabular">{formatIDR(selected.original_amount)}</dd></div>
        <div><dt>{tx('moneyB.followups.balance')}</dt><dd className="tabular">{selected.running_balance === null ? '—' : formatIDR(selected.running_balance)}</dd></div>
        <div><dt>{tx('moneyB.followups.due')}</dt><dd>{selected.due_date ?? '—'}{isOverdue(selected) ? ` · ${t('followUps.overdue')}` : ''}</dd></div>
        <div><dt>{t('followUps.state')}</dt><dd><StatusPill status={stateTone(selected.state)} label={t(FOLLOW_UP_STATE_KEY[selected.state])} /></dd></div>
        {selected.promise_date && <div><dt>{t('followUps.promiseDate')}</dt><dd>{selected.promise_date}</dd></div>}
      </dl>
    </section>
    <section className="follow-ups-record-actions" aria-label={t('followUps.actions')}>
      <h3>{t('followUps.actions')}</h3>
      {selectedActions.length ? <div className="follow-ups-action-list">{selectedActions.map((verb) => <Button key={verb} variant={verb === 'confirm' ? 'primary' : 'outline'} onClick={() => startAction(selected, verb)}>{t(`followUps.action.${verb}`)}</Button>)}</div> : <p>{tx('moneyB.followups.noActions')}</p>}
      {transitionForm}
      {actionError && !transitionForm && <p className="follow-ups-error" role="alert">{actionError}</p>}
    </section>
    <section className="follow-ups-evidence"><h3>{tx('moneyB.followups.recordDetails')}</h3><FollowUpRecordHost followUpId={selected.id} mode="panel" /></section>
  </div> : <p className="follow-ups-select-instruction">{tx('moneyB.followups.recordSelect')}</p>

  return <PageFamilyFrame family="workspace" title={t('followUps.title')} jobSentence={t('job.money')} state={frameState} meta={queue.state === 'ready' ? <span>{loadedCopy} · {overdueCopy}</span> : null}>
    <div className="follow-ups-page">
      <div className="follow-ups-filter-row" role="group" aria-label={tx('moneyB.followups.queueFilter')}>
        <Button type="button" variant={!filterOverdue ? 'primary' : 'outline'} aria-pressed={!filterOverdue} onClick={() => changeFilter(false)}>{tx('moneyB.followups.all')}</Button>
        <Button type="button" variant={filterOverdue ? 'primary' : 'outline'} aria-pressed={filterOverdue} onClick={() => changeFilter(true)}>{tx('moneyB.followups.filterOverdue')}</Button>
        <span className="follow-ups-scope-note">{tx('moneyB.followups.serverScope')}</span>
      </div>
      {queue.state === 'loading' && <SkeletonRows count={5} />}
      {queue.state === 'error' && <ErrorState message={t('followUps.error')} onRetry={() => queue.load()} />}
      {queue.state === 'ready' && queue.rows.length === 0 && <EmptyState title={filterOverdue ? tx('moneyB.followups.filteredEmpty') : t('followUps.empty')}>
        {filterOverdue && <Button type="button" variant="outline" onClick={() => changeFilter(false)}>{tx('moneyB.followups.all')}</Button>}
      </EmptyState>}
      {queue.state === 'ready' && queue.rows.length > 0 && <div className={`follow-ups-workspace${wide ? ' follow-ups-workspace--split' : ''}`}>
        <section className="follow-ups-queue" aria-label={tx('moneyB.followups.queue')}>
          <h2>{tx('moneyB.followups.queue')}</h2>
          <FollowUpQueueTable queue={queue} masterDetail selectedId={selected?.id} onOpenRecord={openRecord} />
        </section>
        {wide ? <aside className="follow-ups-detail-pane" aria-label={tx('moneyB.followups.recordDetails')}>{recordContent}</aside> : null}
      </div>}
    </div>
    {!wide && selected && <RecordPanelHost label={`${t('followUps.title')}: ${selected.counterparty}`} title={selected.source_invoice_ref ?? selected.counterparty} closeLabel={t('record.close')} focusKey={selected.id} onClose={closeRecord}>{recordContent}</RecordPanelHost>}
  </PageFamilyFrame>
}
