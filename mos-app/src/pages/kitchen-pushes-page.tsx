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
// - Status badges via Tag (green=posted, neutral=pending/in_flight,
//   amber=failed/dead_letter). target_env shown prominently (dry_run vs goo/gkid).
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
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { listEsbPushes } from '@/lib/db/kitchen-pushes'
import type { EsbPushRow, EsbPushStatus, EsbTargetEnv } from '@/lib/db/kitchen-pushes'
import './kitchen-pushes-page.css'

// ── Status tag configuration (Tinted-Status pattern — dot + text, never color-alone) ──

type StatusTagConfig = { color: 'green' | 'gray' | 'amber' | 'red'; label: string }

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

function statusConfig(status: EsbPushStatus): StatusTagConfig {
  switch (status) {
    case 'posted':    return { color: 'green',  label: 'posted' }
    case 'pending':   return { color: 'gray',   label: 'pending' }
    case 'in_flight': return { color: 'gray',   label: 'in_flight' }
    case 'failed':    return { color: 'amber',  label: 'failed' }
    case 'dead_letter': return { color: 'amber', label: 'dead_letter' }
  }
}

// ── target_env tag configuration ──
// gkid = calm blue (live target — not an alarm, OQ-6 owner choice: calm blue chosen).
// goo / dry_run = neutral gray.

type EnvTagConfig = { color: 'blue' | 'gray'; label: string }

function envConfig(env: EsbTargetEnv): EnvTagConfig {
  switch (env) {
    case 'gkid':    return { color: 'blue', label: 'gkid' }
    case 'goo':     return { color: 'gray', label: 'goo' }
    case 'dry_run': return { color: 'gray', label: 'dry_run' }
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

function pushColumns(t: ReturnType<typeof useT>): DataTableColumn<EsbPushRow>[] {
  return [
    {
      key: 'source_ref',
      header: t('kitchen.pushes.col.batch'),
      cardLabel: '',
      render: row => <span className="mono">{row.source_ref}</span>,
    },
    {
      key: 'endpoint',
      header: t('kitchen.pushes.col.endpoint'),
      render: row => <span className="kpu-cell-muted">{row.endpoint}</span>,
    },
    {
      key: 'target_env',
      header: t('kitchen.pushes.col.target'),
      render: row => {
        const cfg = envConfig(row.target_env)
        return <Tag color={cfg.color} weight="medium">{cfg.label}</Tag>
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
        const cfg = statusConfig(row.status)
        return <Tag color={cfg.color} weight="medium">{cfg.label}</Tag>
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
        ? <span className="mono">{row.esb_doc_num}</span>
        : isHeld(row)
          ? <span className="kpu-cell-muted">{t('kitchen.pushes.noErpDoc')}</span>
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

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      jobSentence={t('job.cafe')}
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

      {load.kind === 'ready' && rows.length > 0 && (
        <DataTable
          columns={pushColumns(t)}
          rows={rows}
          isDesktop={isDesktop}
          rowClassName={row => row.status === 'dead_letter' ? 'kpu-row-dead-letter' : undefined}
          caption={t('kitchen.pushes.caption')}
        />
      )}
    </PageFamilyFrame>
  )
}
