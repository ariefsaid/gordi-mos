// CafeTodayNext — Café home's "Next up": one row per job, in shift order, each saying where that job
// stands for the stream in view and linking to it. Reads come from useCafeTodayJobs; this only presents.
import { Link } from 'react-router-dom'
import { ArrowRightIcon } from '@/shell/icons'
import { useT, type Translate } from '@/i18n/use-t'
import { useOptionalSignalComposer } from '@/shell/signal-composer-host'
import { Button } from '@/components/ui/button'
import { LoadingShell } from '@/components/ui/state-kit'
import { Notice } from '@/components/ui/notice'
import { formatWeekdayDayMonth, formatWibDateTime, wibToday } from '@/lib/format/date'
import type { TodayJobs } from '@/lib/use-cafe-today-jobs'
import type { CafeCaptureForm } from '@/lib/cafe-capture-storage'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { recordsHref, type Question } from '@/lib/cafe-records/url-state'
import './cafe-today-next.css'

interface Row { key: string; to: string; name: string; state: string; /** The question this job's Records link opens. */ records: Question; /** Unsent entries are waiting here. */ unsent?: string; continuing?: boolean }

function wibDate(iso: string): string {
  return wibToday(new Date(iso))
}

function requestState(t: Translate, request: TodayJobs['lastRequest']): string {
  if (request === undefined) return t('cafe.today.statusUnavailable')
  if (request === null) return t('cafe.today.next.request.none')
  const key = request.status === 'Approved' ? 'cafe.today.next.request.approved'
    : request.status === 'Rejected' ? 'cafe.today.next.request.rejected' : 'cafe.today.next.request.submitted'
  return t(key, { date: formatWeekdayDayMonth(wibDate(request.reviewed_at ?? request.requested_at)) })
}

export function CafeTodayNext({ jobs, stream, setupHref }: { jobs: TodayJobs; stream: ProductionStream; setupHref: string }) {
  const t = useT()
  const composer = useOptionalSignalComposer()
  if (jobs.state === 'loading') return <LoadingShell count={3} />
  if (jobs.state === 'error') {
    return <div className="cafe-today-next__unavailable">
      <span>{t('cafe.today.statusUnavailable')}</span>
      <Button variant="ghost" onClick={jobs.retry}>{t('common.retry')}</Button>
    </div>
  }
  const noItems = jobs.itemsReady === false
  const itemsNote = t('cafe.today.next.noItems')
  const draftLabel = (form: CafeCaptureForm) => jobs.drafts[form]
    ? t('cafe.today.next.draft', { time: formatWibDateTime(jobs.drafts[form]!) })
    : undefined
  const rows: Row[] = []
  if (jobs.producing) {
    rows.push({
      key: 'production', records: 'made', to: '/cafe/production', name: t('nav.cafe.production'), unsent: draftLabel('production'), continuing: Boolean(jobs.drafts.production),
      state: noItems ? itemsNote : t(jobs.planned > 0 ? 'cafe.today.next.production' : 'cafe.today.next.production.none', { planned: jobs.planned, made: jobs.made }),
    })
    if (jobs.transfers.length > 0) {
      const withPlan = jobs.transfers.filter(move => move.planned > 0)
      const destination = (move: (typeof jobs.transfers)[number]) => move.name || t('kitchen.actionType.transferTo.fallback')
      rows.push({
        key: 'transfer', records: 'transferred', to: '/cafe/transfer', name: t('nav.cafe.transfer'), unsent: draftLabel('transfer'), continuing: Boolean(jobs.drafts.transfer),
        state: noItems ? itemsNote : withPlan.length > 0
          ? withPlan.map(move => t('cafe.today.next.transfer', { count: move.planned, destination: destination(move) })).join(' · ')
          : t('cafe.today.next.transfer.none'),
      })
    }
  }
  rows.push({
    key: 'waste', records: 'wasted', to: '/cafe/waste', name: t('nav.cafe.waste'), unsent: draftLabel('waste'), continuing: Boolean(jobs.drafts.waste),
    state: noItems ? itemsNote : jobs.wasteLogged > 0 ? t('cafe.today.next.waste.count', { count: jobs.wasteLogged }) : t('cafe.today.next.waste.none'),
  })
  rows.push({ key: 'count', records: 'counted', to: '/cafe/count', name: t('nav.cafe.count'), state: noItems ? itemsNote : t('cafe.today.next.count') })
  rows.push({
    key: 'receive', records: 'received', to: '/cafe/receive', name: t('nav.cafe.receive'),
    state: jobs.lockedReceipts > 0
      ? t(jobs.lockedReceipts === 1 ? 'cafe.today.next.receive.locked.one' : 'cafe.today.next.receive.locked.other', { count: jobs.lockedReceipts })
      : t('cafe.today.next.receive.none'),
    continuing: jobs.lockedReceipts > 0,
  })
  rows.push({ key: 'request', records: 'requested', to: '/cafe/request', name: t('cafe.request.title'), state: requestState(t, jobs.lastRequest) })

  return <>
    {noItems && <Notice tone="attention" action={jobs.canSetUpItems
      ? <Link className="btn btn-primary btn-touch" to={setupHref}>{t('cafe.itemsEmpty.action')}</Link>
      : composer && composer.canPost !== false ? <button type="button" className="btn btn-outline btn-touch" onClick={() => composer.open()}>{t('signals.action.share')}</button> : undefined}>
      {jobs.canSetUpItems
        ? t('cafe.today.next.noItems.manage')
        : t(stream.activity === 'bar' ? 'cafe.itemsEmpty.setup.ask.bar' : 'cafe.itemsEmpty.setup.ask.kitchen')}
    </Notice>}
    <ul className="cafe-today-next__list">
      {rows.map(row => <li key={row.key}>
        <Link to={row.to} className="cafe-today-next__job">
          <span className="cafe-today-next__name">{row.name}</span>
          <span className="cafe-today-next__state">{row.unsent ? `${row.state} · ${row.unsent}` : row.state}</span>
          <span className="cafe-today-next__end">
            {row.continuing && <span className="cafe-today-next__continue">{t('cafe.today.next.continue')}</span>}
            <ArrowRightIcon />
          </span>
        </Link>
        <Link className="cafe-today-next__records" aria-label={`${t('records.viewRecords')}: ${row.name}`}
          to={recordsHref({ question: row.records, reading: 'entries', stream: { branchId: stream.branch.id, activity: stream.activity }, today: wibToday() })}>
          {t('nav.cafe.records')}
        </Link>
      </li>)}
    </ul>
  </>
}
