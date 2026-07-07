import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { getBusinessUnits } from '@/lib/db/directory'
import { canWorkAnyLane } from '@/lib/follow-up-lanes'
import { listFollowUps, transitionFollowUp, isOverdue, type FollowUpRow, type FollowUpTransition } from '@/lib/db/follow-ups'
import './follow-ups-page.css'

type FetchState = 'loading' | 'ready' | 'error'

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

function nextActions(row: FollowUpRow, canConfirm: boolean, canChase: boolean): FollowUpTransition[] {
  if (row.state === 'settled') return canConfirm ? ['confirm'] : []
  if (row.state === 'confirmed') return []
  if (!canChase) return []
  const basic: FollowUpTransition[] = ['chase', 'promise', 'partial', 'settle']
  return basic
}

export function FollowUpsPage() {
  useDocumentTitle('Follow-up queue — Gordi MOS')
  const t = useT()
  const auth = useAuth()
  const [params] = useSearchParams()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const accessRoles = useMemo(() => viewer?.accessRoles ?? [], [viewer])
  const canConfirm = accessRoles.includes('finance') || accessRoles.includes('admin')
  const [canChase, setCanChase] = useState(accessRoles.includes('admin'))
  const [rows, setRows] = useState<FollowUpRow[]>([])
  const [state, setState] = useState<FetchState>('loading')
  const [active, setActive] = useState<{ id: string; verb: FollowUpTransition } | null>(null)
  const [form, setForm] = useState({ amount: '', cash_in_date: '', evidence: '', promise_date: '', note: '' })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setState('loading')
    setError(null)
    listFollowUps({ overdue: params.get('filter') === 'overdue' })
      .then((data) => { if (!cancelled) { setRows(data); setState('ready') } })
      .catch((err: unknown) => { if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setState('error') } })
    return () => { cancelled = true }
  }, [params])

  useEffect(() => load(), [load])

  useEffect(() => {
    if (!viewer) return
    let cancelled = false
    getBusinessUnits()
      .then((bus) => {
        if (!cancelled) setCanChase(canWorkAnyLane(viewer.roles, bus, accessRoles))
      })
      .catch(() => setCanChase(accessRoles.includes('admin')))
    return () => { cancelled = true }
  }, [accessRoles, viewer])

  const overdueCount = useMemo(() => rows.filter((row) => isOverdue(row)).length, [rows])

  async function run(row: FollowUpRow, verb: FollowUpTransition) {
    if (verb === 'partial' || verb === 'settle' || verb === 'promise') {
      setActive({ id: row.id, verb })
      setForm({ amount: verb === 'settle' ? String(row.running_balance) : '', cash_in_date: '', evidence: '', promise_date: '', note: '' })
      return
    }
    await transitionFollowUp(row.id, verb, {})
    load()
  }

  async function submit(row: FollowUpRow, verb: FollowUpTransition) {
    const payload = verb === 'promise'
      ? { promise_date: form.promise_date, note: form.note }
      : { amount: Number(form.amount || row.running_balance), cash_in_date: form.cash_in_date, evidence: form.evidence, note: form.note }
    await transitionFollowUp(row.id, verb, payload)
    setActive(null)
    load()
  }

  return (
    <PageFrame variant="data">
      <PageHead title={t('followUps.title')} subtitle={t('followUps.subtitle')} />
      <p className="follow-ups-summary">{t('followUps.overdue')}: {overdueCount}</p>
      {state === 'loading' && <p>{t('followUps.loading')}</p>}
      {state === 'error' && <p role="alert">{error ?? t('followUps.error')}</p>}
      {state === 'ready' && rows.length === 0 && <p>{t('followUps.empty')}</p>}
      {state === 'ready' && rows.length > 0 && (
        <div className="follow-ups-table-wrap">
          <table className="follow-ups-table">
            <thead><tr><th>{t('followUps.counterparty')}</th><th>{t('followUps.amount')}</th><th>{t('followUps.balance')}</th><th>{t('followUps.state')}</th><th>{t('followUps.due')}</th><th>{t('followUps.actions')}</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const actions = nextActions(row, canConfirm, canChase)
                const activeForRow = active?.id === row.id ? active.verb : null
                const formReady = activeForRow === 'promise' ? !!form.promise_date : !!form.cash_in_date && !!form.evidence && !!form.amount
                return (
                  <tr key={row.id}>
                    <td><strong>{row.counterparty}</strong><br /><Link to={`/work/follow-ups/${row.id}`} aria-label={`Read-only source ${row.source_invoice_ref ?? row.id}`}>{row.source_invoice_ref ?? row.kind}</Link></td>
                    <td>{money.format(row.original_amount)}</td>
                    <td>{money.format(row.running_balance)}</td>
                    <td><span className={`follow-ups-pill is-${row.state}`}>{row.state}</span></td>
                    <td>{row.due_date ?? '—'} {isOverdue(row) ? `· ${t('followUps.overdue')}` : ''}</td>
                    <td>
                      <div className="follow-ups-actions">
                        {actions.map((verb) => <button key={verb} type="button" onClick={() => void run(row, verb)}>{t(`followUps.action.${verb}`)}</button>)}
                      </div>
                      {activeForRow && activeForRow !== 'chase' && activeForRow !== 'confirm' && (
                        <div className="follow-ups-form">
                          {activeForRow === 'promise' ? <input aria-label={t('followUps.promiseDate')} type="date" value={form.promise_date} onChange={(e) => setForm({ ...form, promise_date: e.target.value })} /> : <>
                            <input aria-label={t('followUps.amountInput')} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                            <input aria-label={t('followUps.cashInDate')} type="date" value={form.cash_in_date} onChange={(e) => setForm({ ...form, cash_in_date: e.target.value })} />
                            <input aria-label={t('followUps.evidence')} placeholder={t('followUps.evidence')} value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
                          </>}
                          <button type="button" disabled={!formReady} onClick={() => void submit(row, activeForRow)}>{t('followUps.submit')}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageFrame>
  )
}
