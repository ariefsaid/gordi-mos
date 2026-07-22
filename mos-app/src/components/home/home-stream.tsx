import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { StatusPill } from '@/components/tasks/status-pill'
import type { HomeRegionOrder } from '@/lib/home-region-order'
import type { StreamBand, StreamBandKind, StreamItem, StreamReason } from '@/lib/home-stream'
import type { MessageKey } from '@/i18n/messages'
import './home-stream.css'

// HomeStream — the Home "consequence-ranked stream" (owner redirect 2026-07-22: "Home = ONE
// consequence-ranked stream", replacing the ported three-section E7 layout). Presentation-only;
// HomePage does the fetching + selection and passes ranked items in as props.
//
// It renders a SINGLE flow of uniform record rows, ranked across record types. Quiet band dividers
// mark the rank bands (they are dividers in one stream, never boxed sections). Each row carries a
// reason chip ("Overdue · 9d", "Due today", …) that makes the ranking legible at a glance.
//
// The stream has two ordered GROUPS — the attention bands (overdue → due-today → blocked →
// failed-checks → mentions) and the "my work today" band — reordered by the OD-18 order preference.
// Signals are NOT here (A12 attention-vs-ambient boundary): HomePage renders them as an ambient tail.
//
// The overdue/due-today/blocked/my-work bands ALL derive from the ONE tasks projection, so their
// loading/error is a SINGLE consolidated grammar (one skeleton, one retriable error) — never one
// duplicate spinner/error per band. Failed-checks + mentions keep their own independent fetch state.

const TASK_BAND_LABEL: Record<'overdue' | 'due-today' | 'blocked', MessageKey> = {
  overdue: 'home.stream.band.overdue',
  'due-today': 'home.stream.band.dueToday',
  blocked: 'home.stream.band.blocked',
}
const OTHER_BAND_LABEL: Record<'failed-checks' | 'mentions', MessageKey> = {
  'failed-checks': 'home.stream.band.failedChecks',
  mentions: 'home.stream.band.mentions',
}

const REASON_KEY: Record<StreamReason['tone'], MessageKey> = {
  overdue: 'home.stream.reason.overdue',
  due: 'home.stream.reason.dueToday',
  blocked: 'home.stream.reason.blocked',
  check: 'home.stream.reason.failedCheck',
  mention: 'home.stream.reason.mention',
}

export type TaskProjectionState = 'loading' | 'ready' | 'error'

export interface HomeStreamProps {
  /** State of the ONE tasks fetch behind overdue/due-today/blocked/my-work (one loader, one error). */
  taskState: TaskProjectionState
  /** Retry the tasks fetch (idempotent; shared by every task-derived band). */
  onRetryTasks?: () => void
  /** Ranked task items (meaningful when taskState === 'ready'). */
  overdue: StreamItem[]
  dueToday: StreamItem[]
  blocked: StreamItem[]
  /** The capped "my work today" items (owned open work not already surfaced above). */
  myWork: StreamItem[]
  /** The viewer's full open-task count — the "All tasks · N →" figure. */
  openCount: number
  /** Failed-checks band (café rejected logs) — its own independent fetch state. */
  failedChecks: StreamBand
  /** Mentions band (unread @-mentions / asks) — its own independent fetch state. */
  mentions: StreamBand
  /** OD-18 order preference: reorders the two GROUPS within the one stream (never removes a band). */
  order: HomeRegionOrder
  /** Anchor id on the attention group so the personal-first header summary can jump to it. */
  attentionAnchorId?: string
}

function ReasonChip({ reason }: { reason: StreamReason }) {
  const t = useT()
  const label = reason.tone === 'overdue'
    ? t('home.stream.reason.overdue', { days: reason.days ?? 0 })
    : t(REASON_KEY[reason.tone])
  return <span className={`stream-reason stream-reason--${reason.tone}`}>{label}</span>
}

function StreamRow({ item }: { item: StreamItem }) {
  // Compact decision-context subline = PIC (avatar + name) · owning Team/BU · due date, so "what
  // should I do next" is answerable without opening the record (Luna J01/J02). Each segment is its
  // own span (dot separators decorative, aria-hidden) so caption + due stay addressable.
  const segments = [
    item.caption && <span key="caption" className="stream-row-tail-seg">{item.caption}</span>,
    item.meta && <span key="due" className="stream-row-tail-seg">{item.meta}</span>,
  ].filter(Boolean)
  const hasMeta = item.pic != null || segments.length > 0

  return (
    <li className="stream-row">
      <Link to={item.route} className="stream-row-link">
        <span className="stream-row-body">
          <span className="stream-row-title">{item.title}</span>
          {hasMeta && (
            <span className="stream-row-meta">
              {item.pic && (
                <span className="stream-row-pic">
                  <span className="stream-row-avatar" aria-hidden="true">{item.pic.initials}</span>
                  <span className="stream-row-pic-name">{item.pic.name}</span>
                </span>
              )}
              {segments.map((seg, i) => (
                <span key={i} className="stream-row-seg">
                  {(item.pic != null || i > 0) && <span className="stream-row-sep" aria-hidden="true">·</span>}
                  {seg}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="stream-row-tail">
          {item.reason && <ReasonChip reason={item.reason} />}
          {item.status && <StatusPill status={item.status} />}
        </span>
      </Link>
    </li>
  )
}

/** A quiet rank divider + its rows. Rendered only when there are items to show. */
function BandRows({ kind, label, items }: { kind: StreamBandKind; label: string; items: StreamItem[] }) {
  const t = useT()
  if (items.length === 0) return null
  return (
    <div className="stream-band" data-band={kind}>
      <div className="stream-band-head">
        <h3 className="stream-band-label">{t('home.attention.laneTitleCount', { title: label, count: items.length })}</h3>
      </div>
      <ul className="stream-band-list">
        {items.map(item => <StreamRow key={item.id} item={item} />)}
      </ul>
    </div>
  )
}

/** An independent-fetch band (failed-checks / mentions): own loading / error / ready grammar. */
function IndependentBand({ band, label }: { band: StreamBand; label: string }) {
  const t = useT()
  if (band.state === 'loading') {
    return (
      <div className="stream-band" data-band={band.kind}>
        <div className="stream-band-head"><h3 className="stream-band-label">{label}</h3></div>
        <LoadingShell count={2} label={label} />
      </div>
    )
  }
  if (band.state === 'error') {
    return (
      <div className="stream-band" data-band={band.kind}>
        <div className="stream-band-head"><h3 className="stream-band-label">{label}</h3></div>
        <ErrorState message={t('home.attention.laneError')} onRetry={band.onRetry} retryLabel={t('home.attention.retry')} />
      </div>
    )
  }
  return <BandRows kind={band.kind} label={label} items={band.items} />
}

export function HomeStream({
  taskState, onRetryTasks, overdue, dueToday, blocked, myWork, openCount,
  failedChecks, mentions, order, attentionAnchorId,
}: HomeStreamProps) {
  const t = useT()
  const titleId = useId()

  // All-clear: the shared tasks fetch succeeded with no attention-worthy task, AND both independent
  // bands are ready+empty. The group persists — never a silent void.
  const attentionEmpty =
    taskState === 'ready' && overdue.length === 0 && dueToday.length === 0 && blocked.length === 0 &&
    failedChecks.state === 'ready' && failedChecks.items.length === 0 &&
    mentions.state === 'ready' && mentions.items.length === 0

  const attentionGroup = (
    <div key="attention" id={attentionAnchorId} className="stream-group stream-group--attention" data-testid="attention-group">
      {taskState === 'loading' && (
        <div className="stream-band" data-band="tasks-loading">
          <div className="stream-band-head"><h3 className="stream-band-label">{t('home.stream.title')}</h3></div>
          <LoadingShell count={3} label={t('home.stream.title')} />
        </div>
      )}
      {taskState === 'error' && (
        // ONE retriable error for the whole task projection (overdue/due-today/blocked/my-work all
        // read it) — never one duplicate error per band. Retry refreshes them all.
        <div className="stream-band" data-band="tasks-error">
          <ErrorState message={t('home.attention.laneError')} onRetry={onRetryTasks} retryLabel={t('home.attention.retry')} />
        </div>
      )}
      {attentionEmpty ? (
        <EmptyState title={t('home.attention.allClear')} variant="quiet" className="stream-all-clear" />
      ) : (
        <>
          {taskState === 'ready' && <>
            <BandRows kind="overdue" label={t(TASK_BAND_LABEL.overdue)} items={overdue} />
            <BandRows kind="due-today" label={t(TASK_BAND_LABEL['due-today'])} items={dueToday} />
            <BandRows kind="blocked" label={t(TASK_BAND_LABEL.blocked)} items={blocked} />
          </>}
          <IndependentBand band={failedChecks} label={t(OTHER_BAND_LABEL['failed-checks'])} />
          <IndependentBand band={mentions} label={t(OTHER_BAND_LABEL.mentions)} />
        </>
      )}
    </div>
  )

  const myWorkLink = (
    <Link to="/work/tasks?view=my-work" className="stream-band-link">
      {t('home.stream.allTasks', { count: openCount })}
    </Link>
  )
  const myWorkGroup = (
    <div key="my-work" className="stream-group stream-group--my-work" data-testid="my-work-group">
      {taskState === 'ready' && (
        <div className="stream-band" data-band="my-work">
          <div className="stream-band-head">
            <h3 className="stream-band-label">{t('home.stream.band.myWork')}</h3>
            {myWorkLink}
          </div>
          {myWork.length === 0 ? (
            <p className="stream-band-empty">{t('home.stream.myWorkEmpty')}</p>
          ) : (
            <ul className="stream-band-list">
              {myWork.map(item => <StreamRow key={item.id} item={item} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  )

  return (
    <section role="region" aria-labelledby={titleId} className="home-stream" data-region-order={order}>
      <h2 id={titleId} className="stream-heading">{t('home.stream.title')}</h2>
      {order === 'attention-first' ? [attentionGroup, myWorkGroup] : [myWorkGroup, attentionGroup]}
    </section>
  )
}
