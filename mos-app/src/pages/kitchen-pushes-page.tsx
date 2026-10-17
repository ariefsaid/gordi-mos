// KitchenPushesPage — /cafe/pushes — S5 outbox / dead-letter monitoring.
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S5.
//
// JTBD: ops_lead — "a push failed; what's stuck, why, and what do I do?"
// This is the human seam for FR-074's dead-letter surfacing (the worker dead-
// letters after MAX_RETRY; an ops_lead must see it to escalate).
//
// - Role-gated: ops_lead/admin only (member → forbidden panel, no read call).
//   RLS is the authority; the UI gate is a courtesy (design-plan §0).
// - READ-ONLY v1: no retry/resend/reset actions. Dead-letter manual retry is
//   DEFERRED. The surface reads + shows status so the lead can escalate.
// - Status badges via Tag, every state a person word from the i18n catalog — no raw
//   database enum reaches the screen (#402). green=Posted, neutral=Queued/Sending,
//   amber=Failed·retrying, RED=Failed·stopped (#402 / OD-WAY-74 #4: red tag, amber
//   row — red on the whole row would read "this data is wrong"; the row is fine,
//   its delivery failed). target_env shown prominently (Dry run vs GOO/GKID).
// - Rows are READ severity-first (dead_letter > failed > healthy), newest within a tier
//   (#402/#416): a stuck batch must never hide below healthy ones — and since a stuck
//   batch is usually an OLD one, the rank happens in SQL, before the row window is cut.
//   sortPushRows is only the presentation tie-break on top of that read.
// - Dead-letter rows: warning/7% fill + 2px warning left rule (the owner-approved
//   side-stripe exception, DESIGN.md "Ops Log tokens").
// - All states: loading / empty / error+retry / forbidden / populated.

import { StatusBadge, STATUS_MAP } from '@/components/ui/status-badge'
import { ENV_TAG, PUSH_STATUS, formatPushDate as formatDate, formatPushTime as formatTime } from '@/lib/kitchen-push-display'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { Panel } from '@/components/cafe/redesign/worksheet'
import { CafeCloseReviewWorkspace } from '@/components/cafe/redesign/cafe-close-review-workspace'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { CafeQueueEmpty } from '@/components/cafe/redesign/cafe-queue-empty'
import { ESB_PUSHES_WINDOW_MAX_ROWS, listEsbPushes, sortPushRows } from '@/lib/db/kitchen-pushes'
import type { EsbPushRow, EsbEndpoint } from '@/lib/db/kitchen-pushes'
import type { MessageKey } from '@/i18n/messages'
import './kitchen-pushes-page.css'

// ── Status tag configuration (Tinted-Status pattern — dot + text, never color-alone) ──


/**
 * HELD — the intra-branch arm, made visible (FR-050/052).
 *
 * `noop` is the endpoint an approved movement gets when its destination branch IS its origin
 * branch: the movement is logged and approved, but the ERP already books that branch as
 * holding the WIP, so there is no document for it and — per FR-053 — there never will be. The
 * production master-data lookup found no per-activity locations, so no ERP counterpart exists
 * to post to; the hold is the permanent model, not a queue that will drain later.
 *
 * Which is exactly why it needs its own word here. Read as a bare status, a held row says
 * `pending` and keeps saying it, so the one thing a lead needs from this screen — is anything
 * actually stuck? — is answered wrongly, and the more intra-branch movements the bar streams
 * capture, the more convincing the wrong answer gets.
 *
 * A held row that genuinely failed keeps its failure: `failed`/`dead_letter` describe the
 * dispatch attempt, and hiding one behind "held" would bury the only rows on this screen that
 * do want a human.
 */
function isHeld(row: EsbPushRow): boolean {
  return row.endpoint === 'noop' && row.status !== 'failed' && row.status !== 'dead_letter'
}

function pushTally(t: ReturnType<typeof useT>, count: number, queued: number): string {
  const pushKey = `kitchen.pushes.tally.push.${count === 1 ? 'one' : 'other'}` as MessageKey
  const queuedKey = `kitchen.pushes.tally.queued.${queued === 1 ? 'one' : 'other'}` as MessageKey
  return `${t(pushKey, { count })} · ${t(queuedKey, { count: queued })}`
}

// #402: endpoint is a person word too — 'assembly-actual' is not something a lead says.
// noop → None for held AND failed noop rows: "held" belongs to the status column, and a
// failed noop row must never be re-described as held (FR-052 ruling preserved).
const ENDPOINT_LABEL: Record<EsbEndpoint, MessageKey> = {
  'assembly-actual': 'kitchen.pushes.endpoint.assembly',
  'simple-transfer': 'kitchen.pushes.endpoint.transfer',
  'noop': 'kitchen.pushes.endpoint.noop',
}

// ── Load state ──

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' }

// ── Page ─────────────────────────────────────────────────────────────────────

export function KitchenPushesPage() {
  const t = useT()
  const auth = useAuth()
  const isDesktop = useIsDesktop()
  // ── Role gate (FR-074 / AC-007) — ops_lead/admin only ──────────────────────
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const allowed = accessRoles.includes('ops_lead') || accessRoles.includes('admin')

  const [rows, setRows] = useState<EsbPushRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [selectedParam, setSelectedParam] = useSearchParamState('push', '')
  const selectedId = selectedParam || null
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const setSelectedId = useCallback((next: string | null) => {
    selectedIdRef.current = next
    setSelectedParam(next ?? '')
  }, [setSelectedParam])

  const fetchPushes = useCallback(async () => {
    setLoad({ kind: 'loading' })
    setHasMore(false)
    try {
      const data = await listEsbPushes(undefined, ESB_PUSHES_WINDOW_MAX_ROWS + 1)
      const sorted = sortPushRows(data.slice(0, ESB_PUSHES_WINDOW_MAX_ROWS))
      setRows(sorted)
      setHasMore(data.length > ESB_PUSHES_WINDOW_MAX_ROWS)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [])

  // Only trigger the read when allowed (a member never triggers the outbox read).
  useEffect(() => {
    if (auth.status !== 'authenticated' || !allowed) return
    fetchPushes()
  }, [auth.status, allowed, fetchPushes, retryKey])
  useEffect(() => {
    if (load.kind !== 'ready') return
    const currentSelection = selectedIdRef.current
    if (currentSelection && rows.some(row => row.id === currentSelection)) return
    const defaultSelection = isDesktop ? rows[0]?.id ?? null : null
    if (currentSelection !== defaultSelection) setSelectedId(defaultSelection)
  }, [isDesktop, load.kind, rows, selectedId, setSelectedId])

  // ── Auth loading ────────────────────────────────────────────────────────────
  if (auth.status === 'loading') {
    return (
      <CafePageFrame page="pushes" streamBar={{ options: [], stream: null, allStreams: true }} state="loading">
        <LoadingShell count={3} />
      </CafePageFrame>
    )
  }

  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <CafePageFrame page="pushes" streamBar={{ options: [], stream: null, allStreams: true }} state="permission">
        <div className="kpu-block kpu-forbidden">
          <p className="kpu-forbidden-msg">{t('kitchen.pushes.signInMsg')}</p>
          <Link to="/login" className="btn btn-primary">{t('common.signIn')}</Link>
        </div>
      </CafePageFrame>
    )
  }

  // ── Forbidden (non-lead) — intent is clear, NOT an empty table ─────────────
  if (!allowed) {
    return (
      <CafePageFrame page="pushes" streamBar={{ options: [], stream: null, allStreams: true }} state="permission">
        <div className="kpu-block kpu-forbidden" role="region" aria-label={t('kitchen.pushes.restrictedAria')}>
          <p className="kpu-forbidden-title">{t('kitchen.pushes.leadsOnly')}</p>
          <p className="kpu-forbidden-msg">{t('kitchen.pushes.leadsOnlyMsg')}</p>
          <Link to="/cafe" className="btn btn-outline">{t('kitchen.review.backToLog')}</Link>
        </div>
      </CafePageFrame>
    )
  }

  // #422: the page head answers "what is stuck", not only "how many" — the counts a
  // lead triages by, rendered only when non-zero so a healthy outbox head stays quiet.
  const selected = rows.find(row => row.id === selectedId) ?? null
  const problems = rows.filter(row => row.status === 'dead_letter' || row.status === 'failed')
  const healthy = rows.filter(row => row.status !== 'dead_letter' && row.status !== 'failed')
  const deadLetterCount = rows.filter(r => r.status === 'dead_letter').length
  const failedCount = rows.filter(r => r.status === 'failed').length
  const queuedCount = rows.filter(r => r.status === 'pending' && !isHeld(r)).length
  const headMeta = (deadLetterCount > 0 || failedCount > 0)
    ? (
        <span className="kpu-meta-line">
          {deadLetterCount > 0 && <span className="kpu-meta-dead">{t('kitchen.pushes.meta.deadLetter', { count: String(deadLetterCount) })}</span>}
          {failedCount > 0 && <span className="kpu-meta-failed">{t('kitchen.pushes.meta.failed', { count: String(failedCount) })}</span>}
        </span>
      )
    : undefined

  return (
    <CafePageFrame
      page="pushes"
      streamBar={{ options: [], stream: null, allStreams: true }}
      meta={headMeta}
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : rows.length === 0 ? 'empty' : 'read-only'}
    >
      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.pushes') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && rows.length === 0 && (
        <CafeQueueEmpty title={t('kitchen.pushes.empty.title')} action={<button type="button" className="btn btn-outline btn-touch" onClick={() => setRetryKey(k => k + 1)}>{t('kitchen.review.refresh')}</button>}>
          {t('kitchen.pushes.empty.copy')}
        </CafeQueueEmpty>
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <CafeCloseReviewWorkspace
          label={t('kitchen.pushes.caption')}
          selected={selected !== null}
          onBack={() => setSelectedId(null)}
          backLabel={t('kitchen.pushes.detail.back')}
          master={<div className="kpu-master">
            <header className="kpu-master__head">
              <p className="kpu-tally">{pushTally(t, rows.length, queuedCount)}</p>
              {hasMore && <p className="kpu-window-more">{t('kitchen.pushes.windowMore', { count: ESB_PUSHES_WINDOW_MAX_ROWS })}</p>}
            </header>
            {problems.length > 0 && <section className="kpu-group" aria-labelledby="kpu-problems-title">
              <h2 id="kpu-problems-title">{t('kitchen.pushes.section.problems')} <span>{problems.length}</span></h2>
              <ul>{problems.map(row => <li key={row.id}><button type="button" className={`kpu-master-row${row.status === 'dead_letter' ? ' kpu-master-row--stopped' : ''}`} aria-pressed={row.id === selectedId} onClick={() => setSelectedId(row.id)}>
                <code className="kpu-ref mono">{row.source_ref}</code><StatusBadge status={PUSH_STATUS[row.status]} />
                <small>{t(ENV_TAG[row.target_env].key)} · {formatDate(row.created_at)}</small>
              </button></li>)}</ul>
            </section>}
            {healthy.length > 0 && <section className="kpu-group" aria-labelledby="kpu-healthy-title">
              <h2 id="kpu-healthy-title">{t('kitchen.pushes.section.healthy')} <span>{healthy.length}</span></h2>
              <ul>{healthy.map(row => <li key={row.id}><button type="button" className="kpu-master-row" aria-pressed={row.id === selectedId} onClick={() => setSelectedId(row.id)}>
                <code className="kpu-ref mono">{row.source_ref}</code>{isHeld(row) ? <StatusBadge status="held" /> : <StatusBadge status={PUSH_STATUS[row.status]} />}
                <small>{t(ENV_TAG[row.target_env].key)} · {formatDate(row.created_at)}</small>
              </button></li>)}</ul>
            </section>}
          </div>}
          detail={<section className="kpu-detail" aria-label={t('kitchen.pushes.detail.title')}>
            {selected ? <>
              <Panel title={t('kitchen.pushes.detail.title')} open>
              <dl>
                <div><dt>{t('kitchen.pushes.col.batch')}</dt><dd><code className="kpu-ref mono">{selected.source_ref}</code></dd></div>
                <div><dt>{t('kitchen.pushes.col.status')}</dt><dd>{isHeld(selected) ? t('kitchen.pushes.status.held') : t(STATUS_MAP[PUSH_STATUS[selected.status]].label)}</dd></div>
                <div><dt>{t('kitchen.pushes.col.endpoint')}</dt><dd>{t(ENDPOINT_LABEL[selected.endpoint])}</dd></div>
                <div><dt>{t('kitchen.pushes.col.target')}</dt><dd>{t(ENV_TAG[selected.target_env].key)}</dd></div>
                <div><dt>{t('kitchen.pushes.col.retries')}</dt><dd>{selected.retry_count}</dd></div>
                <div><dt>{t('kitchen.pushes.col.created')}</dt><dd>{formatDate(selected.created_at)}</dd></div>
                <div><dt>{t('kitchen.pushes.col.posted')}</dt><dd>{formatTime(selected.posted_at)}</dd></div>
                <div><dt>{t('kitchen.pushes.col.esbDoc')}</dt><dd>{selected.esb_doc_num ? <code className="kpu-ref mono">{selected.esb_doc_num}</code> : isHeld(selected) ? t('kitchen.pushes.noErpDoc') : '—'}</dd></div>
              </dl>
              {(selected.status === 'failed' || selected.status === 'dead_letter') && selected.last_error && <div className="kpu-diagnostic"><h3>{t('kitchen.pushes.col.error')}</h3><p>{selected.last_error}</p>{selected.status === 'dead_letter' && <span className="kpu-escalate-hint" aria-label={t('kitchen.pushes.escalateAria')}>{t('kitchen.pushes.escalate')}</span>}</div>}
              </Panel>
            </> : <p>{t('kitchen.pushes.detail.choose')}</p>}
          </section>}
        />
      )}
    </CafePageFrame>
  )
}
