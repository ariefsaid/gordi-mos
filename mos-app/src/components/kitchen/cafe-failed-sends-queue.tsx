import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '@/components/ui/status-badge'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { CafeQueueEmpty } from '@/components/cafe/redesign/cafe-queue-empty'
import { ArrowRightIcon } from '@/shell/icons'
import { useT } from '@/i18n/use-t'
import { listEsbPushes, sortPushRows, type EsbPushRow } from '@/lib/db/kitchen-pushes'
import { ENV_TAG, PUSH_STATUS, formatPushDate } from '@/lib/kitchen-push-display'
import './cafe-failed-sends-queue.css'

const WINDOW = 50

/**
 * Review's Failed ESB sends queue: the pushes that failed or stopped, newest first, each one a way into its
 * record on Sent to ESB. A summary of the failed subset, not a second copy of the history: the full
 * history and the record itself stay on Sent to ESB, and approval never implies a successful send.
 * Ops lead and admin only (the route and the queue selector both leave it out for a supervisor).
 */
export function CafeFailedSendsQueue() {
  const t = useT()
  const [rows, setRows] = useState<EsbPushRow[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)

  const load = useCallback(() => {
    setState('loading')
    Promise.all([listEsbPushes({ status: 'dead_letter' }, WINDOW), listEsbPushes({ status: 'failed' }, WINDOW)])
      .then(([stopped, retrying]) => { setRows(sortPushRows([...stopped, ...retrying])); setState('ready') })
      .catch(() => setState('error'))
  }, [])
  useEffect(() => { load() }, [load, retry])

  if (state === 'loading') return <LoadingShell count={3} />
  if (state === 'error') {
    return <ErrorState message={t('common.loadFailed', { what: t('common.what.pushes') })} onRetry={() => setRetry((n) => n + 1)} />
  }
  if (rows.length === 0) {
    return (
      <CafeQueueEmpty
        title={t('cafe.review.failed.empty')}
        action={<Link className="btn btn-outline" to="/cafe/pushes">{t('cafe.review.failed.all')}</Link>}
      >
        {t('cafe.review.failed.emptyCopy')}
      </CafeQueueEmpty>
    )
  }
  return (
    <section className="cafe-failed-sends" aria-label={t('cafe.review.queue.failed')}>
      <header className="cafe-failed-sends__head">
        <p>{t('cafe.review.failed.intro', { count: rows.length })}</p>
        <Link to="/cafe/pushes" className="cafe-failed-sends__all">{t('cafe.review.failed.all')}<ArrowRightIcon /></Link>
      </header>
      <ul className="cafe-failed-sends__list">
        {rows.map((row) => (
          <li key={row.id}>
            <Link to={`/cafe/pushes?push=${row.id}`} className={`cafe-failed-sends__row${row.status === 'dead_letter' ? ' cafe-failed-sends__row--stopped' : ''}`}>
              <code className="cafe-failed-sends__ref">{row.source_ref}</code>
              <StatusBadge status={PUSH_STATUS[row.status]} />
              <small>{t(ENV_TAG[row.target_env].key)} · {formatPushDate(row.created_at)}</small>
              {row.last_error && <span className="cafe-failed-sends__error">{row.last_error}</span>}
              <span className="cafe-failed-sends__open">{t('cafe.review.failed.open')}<ArrowRightIcon /></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
