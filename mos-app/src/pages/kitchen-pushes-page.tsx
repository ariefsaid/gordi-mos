// KitchenPushesPage — /mos/kitchen/pushes — S5 outbox / dead-letter monitoring.
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

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { Tag } from '@/components/ui/tag'
import type { TagColor } from '@/components/ui/tag'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { listEsbPushes, sortPushRows } from '@/lib/db/kitchen-pushes'
import type { EsbPushRow, EsbPushStatus, EsbTargetEnv, EsbEndpoint } from '@/lib/db/kitchen-pushes'
import type { MessageKey } from '@/i18n/messages'
import './kitchen-pushes-page.css'

// ── Status tag configuration (Tinted-Status pattern — dot + text, never color-alone) ──

type StatusTagConfig = { color: TagColor; key: MessageKey; textVar?: string }

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

// #402: labels come from the catalog — never the database's word. dead_letter is the
// RED tag on the AMBER row (OD-WAY-74 #4); its text uses the ratified AA-darkened red
// (--status-lost-text — same fix as StatusPill 'Blocked'), not the kit's tag-text-red.
const STATUS_TAG: Record<EsbPushStatus, StatusTagConfig> = {
  posted:      { color: 'green', key: 'kitchen.pushes.status.posted' },
  pending:     { color: 'gray',  key: 'kitchen.pushes.status.pending' },
  in_flight:   { color: 'gray',  key: 'kitchen.pushes.status.inFlight' },
  failed:      { color: 'amber', key: 'kitchen.pushes.status.failed' },
  dead_letter: { color: 'red',   key: 'kitchen.pushes.status.deadLetter', textVar: 'var(--status-lost-text)' },
}

// ── target_env tag configuration ──
// gkid = calm blue (live target — not an alarm, OQ-6 owner choice: calm blue chosen).
// goo / dry_run = neutral gray. Company codes render uppercased — how people write them.
type EnvTagConfig = { color: 'blue' | 'gray'; key: MessageKey }

const ENV_TAG: Record<EsbTargetEnv, EnvTagConfig> = {
  gkid:    { color: 'blue', key: 'kitchen.pushes.env.gkid' },
  goo:     { color: 'gray', key: 'kitchen.pushes.env.goo' },
  dry_run: { color: 'gray', key: 'kitchen.pushes.env.dryRun' },
}

// #402: endpoint is a person word too — 'assembly-actual' is not something a lead says.
// noop → None for held AND failed noop rows: "held" belongs to the status column, and a
// failed noop row must never be re-described as held (FR-052 ruling preserved).
const ENDPOINT_LABEL: Record<EsbEndpoint, MessageKey> = {
  'assembly-actual': 'kitchen.pushes.endpoint.assembly',
  'simple-transfer': 'kitchen.pushes.endpoint.transfer',
  'noop': 'kitchen.pushes.endpoint.noop',
}

// ── Time formatting (WIB-aware display, tabular digits) ──

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return '—'
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Jakarta',
    }) + ' ' + formatTime(iso)
  } catch {
    return '—'
  }
}

// ── Load state ──

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' }

function pushColumns(t: ReturnType<typeof useT>): DataTableColumn<EsbPushRow>[] {
  return [
    {
      key: 'source_ref',
      header: t('kitchen.pushes.col.batch'),
      cardLabel: '',
      // #402: the one string a lead pastes into a support conversation — mono, one
      // line (scrolls if ever longer than the cell), select-all on one click.
      render: row => <code className="kpu-ref mono">{row.source_ref}</code>,
    },
    {
      key: 'endpoint',
      header: t('kitchen.pushes.col.endpoint'),
      render: row => <span className="kpu-cell-muted">{t(ENDPOINT_LABEL[row.endpoint])}</span>,
    },
    {
      key: 'target_env',
      header: t('kitchen.pushes.col.target'),
      render: row => {
        const cfg = ENV_TAG[row.target_env]
        return <Tag color={cfg.color} weight="medium">{t(cfg.key)}</Tag>
      },
    },
    {
      key: 'status',
      header: t('kitchen.pushes.col.status'),
      render: row => {
        // FR-052: held is its own word, in the same column as posted — the distinction is in
        // the text, not the tint alone (WCAG 1.4.1, and the tints here already carry env).
        if (isHeld(row)) {
          return <Tag color="sand" weight="medium">{t('kitchen.pushes.status.held')}</Tag>
        }
        const cfg = STATUS_TAG[row.status]
        return (
          <Tag
            color={cfg.color}
            weight="medium"
            style={cfg.textVar ? { color: cfg.textVar } : undefined}
          >
            {t(cfg.key)}
          </Tag>
        )
      },
    },
    { key: 'retry_count', header: t('kitchen.pushes.col.retries'), numeric: true },
    {
      key: 'last_error',
      header: t('kitchen.pushes.col.error'),
      render: row => {
        const isDeadLetter = row.status === 'dead_letter'
        const showError = row.status === 'failed' || isDeadLetter
        if (!showError || !row.last_error) return <span className="kpu-dash">—</span>
        return (
          <>
            <span className="kpu-cell-muted">{row.last_error}</span>
            {isDeadLetter && (
              <span className="kpu-escalate-hint" aria-label={t('kitchen.pushes.escalateAria')}>
                {t('kitchen.pushes.escalate')}
              </span>
            )}
          </>
        )
      },
    },
    {
      key: 'esb_doc_num',
      header: t('kitchen.pushes.col.esbDoc'),
      // A posted row's proof is its document number. A held row's is that it has none and is
      // not waiting for one — an em dash would read as "not yet", which is the misreading
      // FR-053 exists to close.
      render: row => row.esb_doc_num
        ? <code className="kpu-ref mono">{row.esb_doc_num}</code>
        : isHeld(row)
          ? <span className="kpu-cell-muted">{t('kitchen.pushes.noErpDoc')}</span>
          : <span className="kpu-dash">—</span>,
    },
    {
      key: 'created_at',
      header: t('kitchen.pushes.col.created'),
      // #416: date and clock are two unbreakable parts. The intermediate band gives this
      // column ~96px, and a cell allowed to wrap freely breaks "2026-08-21" at its own
      // hyphen — which reads as two numbers, not a date. The only break the cell has is
      // the space between the parts.
      render: row => {
        const [date, time] = formatDate(row.created_at).split(' ')
        return (
          <span className="kpu-time tabular">
            <span className="kpu-nb">{date}</span>
            {time ? <> <span className="kpu-nb">{time}</span></> : null}
          </span>
        )
      },
    },
    {
      key: 'posted_at',
      header: t('kitchen.pushes.col.posted'),
      render: row => <span className="kpu-time tabular">{formatTime(row.posted_at)}</span>,
    },
  ]
}

// ── #422: the phone card ──────────────────────────────────────────────────────
// The generic <dl> card stacked all ten columns as labelled rows (~10 lines) per
// push — right for reading one record, wrong for running down a long outbox during
// triage. Head line: batch ref + status; ONE muted meta line: env, endpoint,
// retries, created/posted; the error + escalate block ONLY when the row carries one.
function pushCardRenderer(t: ReturnType<typeof useT>) {
  return function renderPushCard(row: EsbPushRow) {
    const isDeadLetter = row.status === 'dead_letter'
    const showError = (row.status === 'failed' || isDeadLetter) && row.last_error
    const statusTag = isHeld(row)
      ? <Tag color="sand" weight="medium">{t('kitchen.pushes.status.held')}</Tag>
      : (() => {
          const cfg = STATUS_TAG[row.status]
          return (
            <Tag color={cfg.color} weight="medium" style={cfg.textVar ? { color: cfg.textVar } : undefined}>
              {t(cfg.key)}
            </Tag>
          )
        })()
    return (
      <div className="kpu-card">
        <div className="kpu-card-head">
          <code className="kpu-ref mono">{row.source_ref}</code>
          {statusTag}
        </div>
        <div className="kpu-card-meta">
          <span>{t(ENV_TAG[row.target_env].key)}</span>
          <span>{t(ENDPOINT_LABEL[row.endpoint])}</span>
          {row.retry_count > 0 && <span className="tabular">{t('kitchen.pushes.col.retries')} {row.retry_count}</span>}
          <span className="tabular">{formatDate(row.created_at)}</span>
          {row.esb_doc_num && <code className="kpu-ref mono">{row.esb_doc_num}</code>}
        </div>
        {showError && (
          <div className="kpu-card-error">
            <span className="kpu-cell-muted">{row.last_error}</span>
            {isDeadLetter && (
              <span className="kpu-escalate-hint" aria-label={t('kitchen.pushes.escalateAria')}>
                {t('kitchen.pushes.escalate')}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function KitchenPushesPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('nav.kitchen.pushes') }))
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.pushes')}`
  const auth = useAuth()
  const isDesktop = useIsDesktop()

  // ── Role gate (FR-074 / AC-007) — ops_lead/admin only ──────────────────────
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const allowed = accessRoles.includes('ops_lead') || accessRoles.includes('admin')

  const [rows, setRows] = useState<EsbPushRow[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)

  const fetchPushes = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const data = await listEsbPushes()
      setRows(sortPushRows(data))
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

  // ── Auth loading ────────────────────────────────────────────────────────────
  if (auth.status === 'loading') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="loading">
        <LoadingShell count={3} />
      </PageFamilyFrame>
    )
  }

  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="permission">
        <div className="kpu-block kpu-forbidden">
          <p className="kpu-forbidden-msg">{t('kitchen.pushes.signInMsg')}</p>
          <Link to="/login" className="btn btn-primary">{t('common.signIn')}</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  // ── Forbidden (non-lead) — intent is clear, NOT an empty table ─────────────
  if (!allowed) {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="permission">
        <div className="kpu-block kpu-forbidden" role="region" aria-label={t('kitchen.pushes.restrictedAria')}>
          <p className="kpu-forbidden-title">{t('kitchen.pushes.leadsOnly')}</p>
          <p className="kpu-forbidden-msg">{t('kitchen.pushes.leadsOnlyMsg')}</p>
          <Link to="/cafe/log" className="btn btn-outline">{t('kitchen.review.backToLog')}</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  // #422: the page head answers "what is stuck", not only "how many" — the two counts a
  // lead triages by, rendered only when non-zero so a healthy outbox head stays quiet.
  const deadLetterCount = rows.filter(r => r.status === 'dead_letter').length
  const failedCount = rows.filter(r => r.status === 'failed').length
  const headMeta = (deadLetterCount > 0 || failedCount > 0)
    ? (
        <span className="kpu-meta-line">
          {deadLetterCount > 0 && <span className="kpu-meta-dead">{t('kitchen.pushes.meta.deadLetter', { count: String(deadLetterCount) })}</span>}
          {failedCount > 0 && <span className="kpu-meta-failed">{t('kitchen.pushes.meta.failed', { count: String(failedCount) })}</span>}
        </span>
      )
    : undefined

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      jobSentence={t('job.cafe')}
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
        <EmptyState
          variant="awaiting"
          title={t('kitchen.pushes.empty.title')}
          copy={t('kitchen.pushes.empty.copy')}
          note={t('kitchen.pushes.empty.note')}
        >
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setRetryKey(k => k + 1)}
          >
            {t('kitchen.review.refresh')}
          </button>
        </EmptyState>
      )}

      {/* #416: the table adapts to the FRAME it is in, not to the viewport — available
          content width is not monotonic in the viewport here (the rail is 0 / 72 / 232px
          across 768→1280, DESIGN.md § Layout "The Container-Query Rule"), so a viewport
          media query switches the column set at the wrong moments. This host is the
          container the column rules query. */}
      {load.kind === 'ready' && rows.length > 0 && (
        <div className="kpu-cols-host">
          <DataTable
            columns={pushColumns(t)}
            rows={rows}
            isDesktop={isDesktop}
            renderCard={pushCardRenderer(t)}
            // #416: fixed-layout column widths — the table fits its frame instead of
            // pushing Created/Posted off screen behind a page-wide scrollbar.
            tableClassName="kpu-cols"
            rowClassName={row => row.status === 'dead_letter' ? 'kpu-row-dead-letter' : undefined}
            caption={t('kitchen.pushes.caption')}
          />
        </div>
      )}
    </PageFamilyFrame>
  )
}
