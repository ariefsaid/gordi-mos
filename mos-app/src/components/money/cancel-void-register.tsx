import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { formatIDR } from '@/lib/format/money'
import { formatDayMonthYear, formatWibWeekdayTime } from '@/lib/format/date'
import { getPeople, type PersonOption } from '@/lib/db/directory'
import { listCancelVoidRegister, type CancelVoidData, type CancelVoidRow, type CancelVoidReview, type CancelVoidReason } from '@/lib/db/cancel-void'
import { CancelVoidReviewForm } from './cancel-void-review-form'
import { CANCEL_VOID_ACTION_LABELS, CANCEL_VOID_BASIS_LABELS, CANCEL_VOID_REASON_LABELS } from './cancel-void-labels'
import './cancel-void-register.css'

type CancelVoidRegisterProps = { branch: string; start: string; end: string }
const caseKey = (row: { esb_code: string; case_id: string }) => `${row.esb_code}:${row.case_id}`

export function CancelVoidRegister({ branch, start, end }: CancelVoidRegisterProps) {
  const t = useT()
  const { locale } = useI18n()
  const [params, setParams] = useSearchParams()
  const selectionKey = `${branch}:${start}:${end}`
  const [registerState, setRegisterState] = useState<{
    key: string
    data: CancelVoidData | null
    status: 'loading' | 'ready' | 'error'
  }>({
    key: selectionKey,
    data: null,
    status: 'loading',
  })
  const [people, setPeople] = useState<PersonOption[]>([])
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<CancelVoidRow | null>(null)

  const isCurrent = registerState.key === selectionKey
  const status = isCurrent ? registerState.status : 'loading'
  const data = isCurrent && status === 'ready' ? registerState.data : null
  const currentSelected = isCurrent ? selected : null

  useEffect(() => { setSelected(null) }, [branch, start, end])
  useEffect(() => {
    let live = true
    setRegisterState(prev => (prev.key === selectionKey && prev.status === 'error' ? prev : { key: selectionKey, data: null, status: 'loading' }))
    Promise.all([listCancelVoidRegister(branch, start, end), getPeople()]).then(
      ([result, directory]) => {
        if (live) {
          setPeople(directory)
          setRegisterState({ key: selectionKey, data: result, status: 'ready' })
        }
      },
      () => {
        if (live) setRegisterState({ key: selectionKey, data: null, status: 'error' })
      },
    )
    return () => { live = false }
  }, [branch, start, end, selectionKey, attempt])
  const personName = (id: string) => people.find(person => person.id === id)?.full_name ?? t('money.cancelVoid.personUnavailable')
  const latestReviews = new Map<string, CancelVoidReview>()
  const history = [...(data?.reviews ?? [])].sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
  for (const review of history) if (!latestReviews.has(caseKey(review))) latestReviews.set(caseKey(review), review)
  const cases = data?.rows.filter(row => row.is_case) ?? []
  const unreviewed = params.get('cv_unreviewed') === '1'
  const visible = cases.filter(row => !unreviewed || !latestReviews.has(caseKey(row)))
  const sourceReason = (row: CancelVoidRow) => row.reason_text ?? t(row.reason_scope === 'sale_reason_not_exposed' ? 'money.cancelVoid.saleReasonMissing' : 'money.cancelVoid.lineReasonMissing')
  const summary = (by: 'reason' | 'person') => {
    const groups = new Map<string, CancelVoidRow[]>()
    for (const row of cases) {
      const review = latestReviews.get(caseKey(row))
      if (!review) continue
      const key = by === 'reason' ? review.reason : review.person_id
      const group = groups.get(key) ?? []
      groups.set(key, [...group, row])
    }
    const title = by === 'reason' ? 'money.cancelVoid.totals.reason' : 'money.cancelVoid.totals.person'
    return <section aria-label={t(title)}>
      <h4>{t(title)}</h4>
      {groups.size === 0 ? <p>{t('money.cancelVoid.noReviews')}</p> : <ul>{[...groups].map(([key, rows]) => <li key={key}>
        <strong>{by === 'reason' ? t(CANCEL_VOID_REASON_LABELS[key as CancelVoidReason]) : personName(key)}</strong> · {t('money.cancelVoid.count', { count: rows.length })}
        {(['sale_grand_total', 'raw_menu_total'] as const).map(basis => {
          const amounts = rows.filter(row => row.review_value_basis === basis)
          const supplied = amounts.filter(row => row.review_value_idr !== null)
          return amounts.length > 0 && <p key={basis}>{t(CANCEL_VOID_BASIS_LABELS[basis])}: {supplied.length ? formatIDR(supplied.reduce((total, row) => total + row.review_value_idr!, 0)) : t('money.cancelVoid.amountMissing')}
            {supplied.length > 0 && supplied.length < amounts.length && ` · ${t('money.cancelVoid.amountMissing')}`}</p>
        })}
      </li>)}</ul>}
    </section>
  }
  return <section className="money-branch__panel cancel-void" aria-label={t('money.cancelVoid.title')}>
    <h3 className="money-branch__h2">{t('money.cancelVoid.title')}</h3>
    <p>{t('money.cancelVoid.context')}</p>
    <label className="cancel-void__filter"><input type="checkbox" checked={unreviewed} disabled={currentSelected !== null} onChange={event => {
      const next = new URLSearchParams(params)
      if (event.target.checked) next.set('cv_unreviewed', '1'); else next.delete('cv_unreviewed')
      setParams(next)
    }} />{t('money.cancelVoid.unreviewed')}</label>
    {status === 'loading' && <p role="status">{t('common.loading')}</p>}
    {status === 'error' && <ErrorState message={t('money.cancelVoid.loadError')} onRetry={() => setAttempt(value => value + 1)} />}
    {data && <div className="money-results">
      {data.rows[0] && <p>{t('money.cancelVoid.received', { date: formatWibWeekdayTime(data.rows.reduce((latest, row) => row.snapshot_as_of > latest ? row.snapshot_as_of : latest, ''), locale) })}</p>}
      {visible.length === 0 && <p>{t(unreviewed && cases.length ? 'money.cancelVoid.allReviewed' : 'money.cancelVoid.empty')}</p>}
      <ul className="cancel-void__cases" aria-label={t('money.cancelVoid.cases')}>
        {visible.map(row => {
          const review = latestReviews.get(caseKey(row))
          const reviews = history.filter(item => caseKey(item) === caseKey(row))
          const details = data.rows.filter(item => !item.is_case && caseKey(item) === caseKey(row))
          return <li key={caseKey(row)} className="cancel-void__case">
            <h4>{t(CANCEL_VOID_ACTION_LABELS[row.action_kind])} · {row.sales_num}</h4>
            <p>{formatDayMonthYear(row.sales_date, locale)}{row.menu_name && ` · ${row.menu_name}`}</p>
            <p>{row.review_value_idr === null ? t('money.cancelVoid.amountMissing') : formatIDR(row.review_value_idr)} · {t(CANCEL_VOID_BASIS_LABELS[row.review_value_basis])}</p>
            <p>{t('money.cancelVoid.accounts', { creator: row.creator_account ?? t('money.cancelVoid.unknown'), editor: row.last_editor_account ?? t('money.cancelVoid.unknown') })}</p>
            <p>{row.minutes_to_last_edit === null ? t('money.cancelVoid.timeMissing') : t('money.cancelVoid.delay', { minutes: String(row.minutes_to_last_edit) })}</p>
            <p>{sourceReason(row)}</p>
            {details.length > 0 && <details><summary>{t('money.cancelVoid.lines')}</summary>{details.map(detail => <p key={detail.row_id}>{detail.menu_name ?? detail.node_kind} · {detail.line_total === null ? t('money.cancelVoid.amountMissing') : formatIDR(detail.line_total)} · {sourceReason(detail)}</p>)}</details>}
            {review && <p>{t('money.cancelVoid.reviewed', { person: personName(review.person_id), reason: t(CANCEL_VOID_REASON_LABELS[review.reason]) })}</p>}
            {reviews.length > 0 && <details open><summary>{t('money.cancelVoid.history')}</summary>{reviews.map(item => <p key={item.id}>{personName(item.person_id)} · {t(CANCEL_VOID_REASON_LABELS[item.reason])} · {item.note} · {t('money.cancelVoid.reviewAuthor', { person: personName(item.reviewed_by), date: formatWibWeekdayTime(item.created_at, locale) })}{item.source_evidence_hash !== row.source_evidence_hash && ` · ${t('money.cancelVoid.sourceChanged')}`}</p>)}</details>}
            <Button variant="outline" disabled={currentSelected !== null || status !== 'ready'} onClick={() => setSelected(row)}>{t('money.cancelVoid.review')}</Button>
            {currentSelected && caseKey(currentSelected) === caseKey(row) && <CancelVoidReviewForm row={currentSelected} people={people} onClose={() => setSelected(null)} onSaved={review => {
              setRegisterState(current => current && current.data ? { ...current, data: { ...current.data, reviews: [review, ...current.data.reviews] } } : current)
              setSelected(null)
            }} />}
          </li>
        })}
      </ul>
      <p>{t('money.cancelVoid.summaryBasis')}</p>
      <div className="cancel-void__totals">{summary('reason')}{summary('person')}</div>
    </div>}
  </section>
}
