import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import type { StreamBand, StreamBandKind, StreamItem } from '@/lib/home-stream'
import type { MessageKey } from '@/i18n/messages'
import { StreamRow } from './stream-row'
import type { ReasonStyle } from './stream-reason'
import './home-stream.css'

// HomeStream — the Home "consequence-ranked stream" (owner redirect 2026-07-22: "Home = ONE
// consequence-ranked stream", replacing the ported three-section E7 layout). Presentation-only;
// HomePage does the fetching + selection and passes ranked items in as props.
//
// It renders a SINGLE flow of uniform record rows, ranked across record types. Quiet band dividers
// mark the rank bands (they are dividers in one stream, never boxed sections). Each row carries a
// reason chip ("Overdue · 9d", "Due today", …) that makes the ranking legible at a glance.
//
// The stream has two GROUPS — the attention bands (overdue → due-today → blocked → failed-checks →
// mentions) and the "my work today" band. Attention always leads (OD-V4-10 retired the OD-18 order
// toggle: with a Home layout preference, a second Home setting that means nothing in two of three
// layouts is a dead affordance).
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
const OTHER_BAND_LABEL: Record<'signals' | 'failed-checks' | 'mentions', MessageKey> = {
  signals: 'home.stream.band.signals',
  'failed-checks': 'home.stream.band.failedChecks',
  mentions: 'home.stream.band.mentions',
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
  /** Signals band (attention-worthy Urgent / Needs-attention Signals) — leads the attention group
   *  as band 0 (E7 exception-first). Its own independent fetch state (the shared signal feed). */
  signals: StreamBand
  /** Failed-checks band (café rejected logs) — its own independent fetch state. */
  failedChecks: StreamBand
  /** Mentions band (unread @-mentions / asks) — its own independent fetch state. */
  mentions: StreamBand
  /** Anchor id on the attention group so the personal-first header summary can jump to it. */
  attentionAnchorId?: string
}

const BAND_REASON_STYLE: Record<StreamBandKind | 'my-work', ReasonStyle> = {
  signals: 'chip',
  overdue: 'text',
  'due-today': 'none',
  blocked: 'none',
  'failed-checks': 'none',
  mentions: 'none',
  'my-work': 'chip',
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
        {items.map(item => <StreamRow key={item.id} item={item} reasonStyle={BAND_REASON_STYLE[kind]} />)}
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
  signals, failedChecks, mentions, attentionAnchorId,
}: HomeStreamProps) {
  const t = useT()
  const titleId = useId()

  // All-clear: the shared tasks fetch succeeded with no attention-worthy task, AND every independent
  // band is ready+empty. The group persists — never a silent void.
  const attentionEmpty =
    taskState === 'ready' && overdue.length === 0 && dueToday.length === 0 && blocked.length === 0 &&
    signals.state === 'ready' && signals.items.length === 0 &&
    failedChecks.state === 'ready' && failedChecks.items.length === 0 &&
    mentions.state === 'ready' && mentions.items.length === 0

  const attentionGroup = (
    <div key="attention" id={attentionAnchorId} className="stream-group stream-group--attention" data-testid="attention-group">
      {/* Band 0 — attention-worthy Signals lead (E7 exception-first). Own fetch state; the FYI
          remainder is the ambient SignalFeedSection tail below the stream. */}
      {!attentionEmpty && <IndependentBand band={signals} label={t(OTHER_BAND_LABEL.signals)} />}
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
              {myWork.map(item => (
                <StreamRow key={item.id} item={item} hidePic reasonStyle={BAND_REASON_STYLE['my-work']} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )

  return (
    <section role="region" aria-labelledby={titleId} className="home-stream">
      <h2 id={titleId} className="stream-heading">{t('home.stream.title')}</h2>
      {attentionGroup}
      {myWorkGroup}
    </section>
  )
}
