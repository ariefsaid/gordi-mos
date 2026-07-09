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
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { Tag } from '@/components/ui/tag'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { listEsbPushes } from '@/lib/db/kitchen-pushes'
import type { EsbPushRow, EsbPushStatus, EsbTargetEnv } from '@/lib/db/kitchen-pushes'
import './kitchen-pushes-page.css'

// ── Status tag configuration (Tinted-Status pattern — dot + text, never color-alone) ──

type StatusTagConfig = { color: 'green' | 'gray' | 'amber' | 'red'; label: string }

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

const pushColumns: DataTableColumn<EsbPushRow>[] = [
  {
    key: 'source_ref',
    header: 'Batch',
    cardLabel: '',
    render: row => <span className="mono">{row.source_ref}</span>,
  },
  {
    key: 'endpoint',
    header: 'Endpoint',
    render: row => <span className="kpu-cell-muted">{row.endpoint}</span>,
  },
  {
    key: 'target_env',
    header: 'Target',
    render: row => {
      const cfg = envConfig(row.target_env)
      return <Tag color={cfg.color} weight="medium">{cfg.label}</Tag>
    },
  },
  {
    key: 'status',
    header: 'Status',
    render: row => {
      const cfg = statusConfig(row.status)
      return <Tag color={cfg.color} weight="medium">{cfg.label}</Tag>
    },
  },
  { key: 'retry_count', header: 'Retries', numeric: true },
  {
    key: 'last_error',
    header: 'Error',
    render: row => {
      const isDeadLetter = row.status === 'dead_letter'
      const showError = row.status === 'failed' || isDeadLetter
      if (!showError || !row.last_error) return <span className="kpu-dash">—</span>
      return (
        <>
          <span className="kpu-cell-muted">{row.last_error}</span>
          {isDeadLetter && (
            <span className="kpu-escalate-hint" aria-label="Manual intervention required">
              Escalate to platform
            </span>
          )}
        </>
      )
    },
  },
  {
    key: 'esb_doc_num',
    header: 'ESB Doc',
    render: row => row.esb_doc_num
      ? <span className="mono">{row.esb_doc_num}</span>
      : <span className="kpu-dash">—</span>,
  },
  {
    key: 'created_at',
    header: 'Created',
    render: row => <span className="kpu-time tabular">{formatDate(row.created_at)}</span>,
  },
  {
    key: 'posted_at',
    header: 'Posted',
    render: row => <span className="kpu-time tabular">{formatTime(row.posted_at)}</span>,
  },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export function KitchenPushesPage() {
  useDocumentTitle('Kitchen Pushes — Gordi MOS')
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
      <PageFrame>
        <LoadingState />
      </PageFrame>
    )
  }

  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFrame>
        <div className="kpu-block kpu-forbidden">
          <p className="kpu-forbidden-msg">You need to sign in to view kitchen pushes.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </PageFrame>
    )
  }

  // ── Forbidden (non-lead) — intent is clear, NOT an empty table ─────────────
  if (!allowed) {
    return (
      <PageFrame>
        <PageHead variant="content" title="Kitchen · Pushes" count={null} />
        <div className="kpu-block kpu-forbidden" role="region" aria-label="Access restricted">
          <p className="kpu-forbidden-title">Pushes is available to ops leads only.</p>
          <p className="kpu-forbidden-msg">
            The ESB outbox is visible to ops leads and admins.
          </p>
          <Link to="/kitchen/log" className="btn btn-outline">Back to Log</Link>
        </div>
      </PageFrame>
    )
  }

  return (
    <PageFrame variant="data">
      <PageHead
        variant="content"
        title="Kitchen · Pushes"
        count={load.kind === 'ready' ? rows.length : null}
      />

      {load.kind === 'loading' && <LoadingState />}

      {load.kind === 'error' && (
        <ErrorState
          message="Couldn't load pushes — check your connection."
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && rows.length === 0 && (
        <EmptyState
          variant="awaiting"
          title="No pushes yet"
          copy="The ESB outbox is empty right now."
          note="Pull again to check for new push activity."
        >
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setRetryKey(k => k + 1)}
          >
            Refresh
          </button>
        </EmptyState>
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <DataTable
          columns={pushColumns}
          rows={rows}
          isDesktop={isDesktop}
          rowClassName={row => row.status === 'dead_letter' ? 'kpu-row-dead-letter' : undefined}
          caption="Kitchen ESB push outbox"
        />
      )}
    </PageFrame>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="kpu-block">
      <SkeletonRows count={3} />
    </div>
  )
}
