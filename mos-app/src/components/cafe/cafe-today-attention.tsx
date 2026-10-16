// CafeTodayAttention — "Waiting for you": what a lead has to act on, in one list on Café home.
// Every row is a count another Café page already reads, shown only to the roles that can open that page;
// rows at zero are hidden, and when every row is zero the list says nothing is waiting.
import { ArrowRightIcon } from '@/shell/icons'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { LoadingShell } from '@/components/ui/state-kit'
import { Button } from '@/components/ui/button'
import { useCafeWaiting, type WaitingKey } from '@/lib/use-cafe-waiting'
import { reviewQueuePath } from '@/lib/cafe-review-queues'
import './cafe-today-attention.css'

export function CafeTodayAttention() {
  const t = useT()
  const { admitted, viewerId, keys, queues, load } = useCafeWaiting()
  if (!admitted || !viewerId) return null

  const labels: Record<WaitingKey, { href: string; label: string }> = {
    logs: { href: reviewQueuePath('logs'), label: t('cafe.today.queue.logs') },
    counts: { href: reviewQueuePath('counts'), label: t('cafe.today.queue.counts') },
    receipts: { href: reviewQueuePath('receipts'), label: t('cafe.today.queue.receipts') },
    requests: { href: reviewQueuePath('requests'), label: t('cafe.today.queue.requests') },
    issues: { href: '/cafe/receive/issues', label: t('cafe.today.queue.issues') },
    failed: { href: reviewQueuePath('failed-sends'), label: t('cafe.today.queue.failed') },
  }
  const loading = keys.some(key => queues[key].status === 'loading')
  const hasWaiting = keys.some(key => queues[key].status === 'error' || (queues[key].status === 'ready' && (queues[key] as { count: number }).count > 0))

  return <section className="cafe-today-attention" aria-labelledby="cafe-today-attention-title">
    <h2 id="cafe-today-attention-title">{t('cafe.today.waiting.title')}</h2>
    <ul>
      {!hasWaiting && !loading && <li><p className="cafe-today-attention__none">{t('cafe.today.noneWaiting')}</p></li>}
      {keys.map(key => {
        const state = queues[key]
        const { href, label } = labels[key]
        if (state.status === 'ready' && state.count === 0) return null
        return <li key={key}>
          {state.status === 'loading' ? <div className="cafe-today-attention__loading"><span>{label}</span><LoadingShell count={1} /></div>
            : state.status === 'error' ? <div className="cafe-today-attention__unavailable">
              <span>{label}</span><span>{t('cafe.today.statusUnavailable')}</span>
              <Button variant="ghost" onClick={() => load(key)}>{t('common.retry')}</Button>
            </div>
              : <Link to={href}>
                <span>{label}</span>
                <span className="cafe-today-attention__count">{state.bounded ? t('cafe.today.loaded50Plus') : state.count}</span>
                <ArrowRightIcon />
              </Link>}
        </li>
      })}
    </ul>
  </section>
}
