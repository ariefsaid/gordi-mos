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
// - Status badges via Tag (green=posted, neutral=pending/in_flight, amber=failed
//   [retryable], red=dead_letter [terminal system failure, census FLAG-A]). target_env
//   shown as its humanized ESB name (GOO staging / GKID prod / Dry run — census FLAG-E).
// - Dead-letter rows: destructive/7% fill + 2px destructive left rule (the owner-
//   approved side-stripe exception, DESIGN.md "Ops Log tokens" — hue corrected to
//   match this row's own destructive status Tag; the warning/amber version of that
//   exception is reserved for the Signals archive's warning-severity rows).
// - All states: loading / empty / error+retry / forbidden / populated.
//
// v4 layout/distill pass (impeccable): rows sort severity-first (dead_letter →
// failed → in_flight → pending → posted) so the surface answers "what's stuck"
// without scrolling past healthy rows (layout.md reading-order). The header
// meta gains a "Dead letter N / Failed N" breakdown, shown only when >0. Phone
// gets a purpose-built renderCard (batch+status head, one muted meta line,
// error block only when present) instead of the generic 8-row <dl> card.

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { useT, type Translate } from '@/i18n/use-t'
import { Tag } from '@/components/ui/tag'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { listEsbPushes } from '@/lib/db/kitchen-pushes'
import type { EsbPushRow, EsbPushStatus, EsbTargetEnv } from '@/lib/db/kitchen-pushes'
import type { MessageKey } from '@/i18n/messages'
import { canReviewCafe } from '@/lib/kitchen-gates'
import './kitchen-pushes-page.css'

// ── Status tag configuration (Tinted-Status pattern — dot + text, never color-alone) ──
// Labels flow through i18n (census FLAG-E — humanized, both locales), resolved at render.
// census FLAG-A: dead_letter is TERMINAL (system failure, manual escalation) → destructive
// red, distinct from the retryable amber `failed`. Amber = attention; red = system error.

type StatusTagConfig = { color: 'green' | 'gray' | 'amber' | 'red'; labelKey: MessageKey }

function statusConfig(status: EsbPushStatus): StatusTagConfig {
  switch (status) {
    case 'posted':    return { color: 'green', labelKey: 'kitchen.push.status.posted' }
    case 'pending':   return { color: 'gray',  labelKey: 'kitchen.push.status.pending' }
    case 'in_flight': return { color: 'gray',  labelKey: 'kitchen.push.status.in_flight' }
    case 'failed':    return { color: 'amber', labelKey: 'kitchen.push.status.failed' }
    case 'dead_letter': return { color: 'red', labelKey: 'kitchen.push.status.dead_letter' }
  }
}

// ── target_env tag configuration ──
// gkid = calm blue (live target — not an alarm, OQ-6 owner choice: calm blue chosen).
// goo / dry_run = neutral gray. Labels are the proper ESB target names (docs/reference/
// esb-goo-integration.md: GKID = production Core API, GOO = staging branch/SAE), i18n'd.

type EnvTagConfig = { color: 'blue' | 'gray'; labelKey: MessageKey }

function envConfig(env: EsbTargetEnv): EnvTagConfig {
  switch (env) {
    case 'gkid':    return { color: 'blue', labelKey: 'kitchen.push.env.gkid' }
    case 'goo':     return { color: 'gray', labelKey: 'kitchen.push.env.goo' }
    case 'dry_run': return { color: 'gray', labelKey: 'kitchen.push.env.dry_run' }
  }
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

// ── Severity-first ordering (layout pass, v4) ──
// The query already returns created_at-desc (kitchen-pushes.ts); Array.sort is
// stable, so this reorders by severity while keeping recency as the tiebreak
// within each status. dead_letter (terminal, needs escalation) leads; posted
// (already succeeded) trails — matching the surface's own JTBD ordering.
const PUSH_SEVERITY: Record<EsbPushStatus, number> = {
  dead_letter: 0,
  failed: 1,
  in_flight: 2,
  pending: 3,
  posted: 4,
}

function sortPushesBySeverity(rows: EsbPushRow[]): EsbPushRow[] {
  return [...rows].sort((a, b) => PUSH_SEVERITY[a.status] - PUSH_SEVERITY[b.status])
}

// ── Error / escalate content — shared by the desktop column and the phone
// card so the two branches can never drift on what counts as "showing an
// error" (a single-render primitive per row.status, DRY across both). ──
function renderPushError(row: EsbPushRow, t: Translate) {
  const isDeadLetter = row.status === 'dead_letter'
  const showError = row.status === 'failed' || isDeadLetter
  if (!showError || !row.last_error) return null
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
}

// Column factory (mirrors kitchen-stock-page's stockColumns(t)) so the Target/Status tag
// labels resolve through the i18n seam (census FLAG-E). BATCH + ENDPOINT carry nowrap
// classes so the 81 batch IDs stop wrapping 2–3 lines (census DEFECT-3).
function pushColumns(t: ReturnType<typeof useT>): DataTableColumn<EsbPushRow>[] {
 return [
  {
    key: 'source_ref',
    header: t('kitchen.pushes.col.batch'),
    cardLabel: '',
    render: row => <span className="mono kpu-batch">{row.source_ref}</span>,
  },
  {
    key: 'endpoint',
    header: t('kitchen.pushes.col.endpoint'),
    render: row => <span className="kpu-cell-muted kpu-endpoint">{row.endpoint}</span>,
  },
  {
    key: 'target_env',
    header: t('kitchen.pushes.col.target'),
    render: row => {
      const cfg = envConfig(row.target_env)
      return <Tag color={cfg.color} weight="medium">{t(cfg.labelKey)}</Tag>
    },
  },
  {
    key: 'status',
    header: t('kitchen.pushes.col.status'),
    render: row => {
      const cfg = statusConfig(row.status)
      return <Tag color={cfg.color} weight="medium">{t(cfg.labelKey)}</Tag>
    },
  },
  { key: 'retry_count', header: t('kitchen.pushes.col.retries'), numeric: true },
  {
    key: 'last_error',
    header: t('kitchen.pushes.col.error'),
    render: row => renderPushError(row, t) ?? <span className="kpu-dash">—</span>,
  },
  {
    key: 'esb_doc_num',
    header: t('kitchen.pushes.col.esbDoc'),
    render: row => row.esb_doc_num
      ? <span className="mono">{row.esb_doc_num}</span>
      : <span className="kpu-dash">—</span>,
  },
  {
    key: 'created_at',
    header: t('kitchen.pushes.col.created'),
    render: row => <span className="kpu-time tabular">{formatDate(row.created_at)}</span>,
  },
  {
    key: 'posted_at',
    header: t('kitchen.pushes.col.posted'),
    render: row => <span className="kpu-time tabular">{formatTime(row.posted_at)}</span>,
  },
 ]
}

/**
 * v4 — the phone card (DataTable's renderCard seam, the same mechanism as
 * Café · Log's compact capture row). The generic <dl> card stacked all 8
 * remaining columns as labelled rows (~8 lines) per push — right for reading
 * one record, wrong for running down a long outbox during triage. Batch +
 * status lead (the one thing worth acting on); target/endpoint/retries/
 * timestamps sit on one muted wrapped meta line; the error/escalate block
 * renders only when the row actually has one (DD-6/DD-9 "only when it has
 * something to say" — a healthy row stays a two-line card).
 */
function pushCardRenderer(t: ReturnType<typeof useT>) {
  return function renderPushCard(row: EsbPushRow) {
    const statusCfg = statusConfig(row.status)
    const envCfg = envConfig(row.target_env)
    const errorContent = renderPushError(row, t)
    return (
      <div className="kpu-card">
        <div className="kpu-card-head">
          <span className="mono kpu-card-batch">{row.source_ref}</span>
          <Tag color={statusCfg.color} weight="medium">{t(statusCfg.labelKey)}</Tag>
        </div>
        <div className="kpu-card-meta">
          <Tag color={envCfg.color} weight="medium">{t(envCfg.labelKey)}</Tag>
          <span className="kpu-endpoint">{row.endpoint}</span>
          {row.retry_count > 0 && (
            <span className="tabular">
              {row.retry_count} {row.retry_count === 1 ? 'retry' : 'retries'}
            </span>
          )}
          <span className="tabular">{formatDate(row.created_at)}</span>
          {row.posted_at && <span className="tabular">→ {formatTime(row.posted_at)}</span>}
          {row.esb_doc_num && <span className="mono">{row.esb_doc_num}</span>}
        </div>
        {errorContent && <div className="kpu-card-error">{errorContent}</div>}
      </div>
    )
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function KitchenPushesPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('doc.cafePushes') }))
  const auth = useAuth()
  const isDesktop = useIsDesktop()
  // I18N sweep: reuse the existing nav.cafe.* family instead of a literal "Café · Pushes".
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.pushes')}`

  // ── Role gate (FR-074 / AC-007) — ops_lead/admin only ──────────────────────
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const allowed = canReviewCafe(accessRoles)

  const [rows, setRows] = useState<EsbPushRow[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)

  const fetchPushes = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const data = await listEsbPushes()
      setRows(data)
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
          <p className="kpu-forbidden-msg">You need to sign in to view Café pushes.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  // ── Forbidden (non-lead) — intent is clear, NOT an empty table ─────────────
  if (!allowed) {
    return (
      <PageFamilyFrame family="workspace" title={pageTitle} jobSentence={t('job.cafe')} state="permission">
        <div className="kpu-block kpu-forbidden" role="region" aria-label={t('kitchen.pushes.forbidden.region')}>
          <p className="kpu-forbidden-title">{t('kitchen.pushes.forbidden.title')}</p>
          <p className="kpu-forbidden-msg">
            {t('kitchen.pushes.forbidden.copy')}
          </p>
          <Link to="/cafe/log" className="btn btn-outline">Back to Log</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  // Severity breakdown for the header meta + the row sort below — reads once
  // per render off the fetched rows, no extra state.
  const deadLetterCount = rows.filter(r => r.status === 'dead_letter').length
  const failedCount = rows.filter(r => r.status === 'failed').length
  const sortedRows = sortPushesBySeverity(rows)

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      jobSentence={t('job.cafe')}
      meta={
        // census FLAG-D: labeled meta sentence, not a naked count chip ("N in outbox").
        // v4: a severity breakdown rides beside the total (page-head's own documented
        // idiom — "N tasks · N blocked") so the JTBD ("what's stuck, why") is answered
        // before opening the table. Zero counts are omitted — a healthy outbox states
        // only its total, same as before.
        load.kind === 'ready'
          ? (
            <span className="kpu-meta-line">
              <span className="kpu-meta-total">{t('kitchen.pushes.meta.total', { count: rows.length })}</span>
              {/* "· " chains each figure onto the total — the same dot-joined idiom
                  page-head.tsx documents for this slot ("11 tasks · 2 blocked"). It
                  also keeps each figure's own text distinct from the row Tag's exact
                  "Dead letter"/"Failed" label so the two don't read as one repeated
                  value. */}
              {deadLetterCount > 0 && (
                <span className="kpu-meta-figure kpu-meta-figure--destructive">
                  · {t('kitchen.push.status.dead_letter')} <strong className="tabular">{deadLetterCount}</strong>
                </span>
              )}
              {failedCount > 0 && (
                <span className="kpu-meta-figure kpu-meta-figure--warning">
                  · {t('kitchen.push.status.failed')} <strong className="tabular">{failedCount}</strong>
                </span>
              )}
            </span>
            )
          : undefined
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : rows.length === 0 ? 'empty' : 'default'}
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
            {t('kitchen.refresh')}
          </button>
        </EmptyState>
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <DataTable
          columns={pushColumns(t)}
          rows={sortedRows}
          renderCard={pushCardRenderer(t)}
          isDesktop={isDesktop}
          rowClassName={row => row.status === 'dead_letter' ? 'kpu-row-dead-letter' : undefined}
          caption={t('kitchen.pushes.caption')}
        />
      )}
    </PageFamilyFrame>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
