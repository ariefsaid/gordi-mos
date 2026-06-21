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
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useAuth } from '@/auth/use-auth'
import { Tag } from '@/components/ui/tag'
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

// ── Page ─────────────────────────────────────────────────────────────────────

export function KitchenPushesPage() {
  useDocumentTitle('Kitchen Pushes — Gordi MOS')
  const auth = useAuth()

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
          <a href="/login" className="btn btn-primary">Sign in</a>
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
          <a href="/mos/kitchen/log" className="btn btn-outline">Back to Log</a>
        </div>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <PageHead
        variant="content"
        title="Kitchen · Pushes"
        count={load.kind === 'ready' ? rows.length : null}
      />

      {load.kind === 'loading' && <LoadingState />}

      {load.kind === 'error' && (
        <div className="kpu-block kpu-error" role="alert">
          <p className="kpu-error-msg">Couldn't load pushes — check your connection.</p>
          <button
            type="button"
            className="btn btn-outline"
            aria-label="Retry loading pushes"
            onClick={() => setRetryKey(k => k + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {load.kind === 'ready' && rows.length === 0 && (
        <div className="kpu-block kpu-empty">
          No pushes yet — ESB outbox is empty.
        </div>
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <div className="kpu-block kpu-tablewrap">
          <table className="kpu-table">
            <caption className="sr-only">Kitchen ESB push outbox</caption>
            <thead>
              <tr>
                <th scope="col">Batch</th>
                <th scope="col">Endpoint</th>
                <th scope="col">Target</th>
                <th scope="col">Status</th>
                <th scope="col">Retries</th>
                <th scope="col">Error</th>
                <th scope="col">ESB Doc</th>
                <th scope="col">Created</th>
                <th scope="col">Posted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <PushRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageFrame>
  )
}

// ── Push row ─────────────────────────────────────────────────────────────────

function PushRow({ row }: { row: EsbPushRow }) {
  const isDeadLetter = row.status === 'dead_letter'
  const showError = row.status === 'failed' || row.status === 'dead_letter'
  const sCfg = statusConfig(row.status)
  const eCfg = envConfig(row.target_env)

  return (
    <tr className={isDeadLetter ? 'kpu-row-dead-letter' : undefined}>
      {/* Batch ID (batch_id / source_ref) — mono, as per Mono-For-IDs rule */}
      <td>
        <span className="mono">{row.source_ref}</span>
      </td>

      {/* Endpoint */}
      <td className="kpu-cell-muted">{row.endpoint}</td>

      {/* target_env — shown prominently (dry_run vs real target) */}
      <td>
        <Tag color={eCfg.color} weight="medium">
          {eCfg.label}
        </Tag>
      </td>

      {/* Status — Tinted-Status pattern (text label, not color-alone) */}
      <td>
        <Tag color={sCfg.color} weight="medium">
          {sCfg.label}
        </Tag>
      </td>

      {/* retry_count — tabular digits */}
      <td className="tabular">{row.retry_count}</td>

      {/* last_error — shown for failed/dead_letter; escalate hint on dead_letter */}
      <td>
        {showError && row.last_error ? (
          <>
            <span className="kpu-cell-muted">{row.last_error}</span>
            {isDeadLetter && (
              <span className="kpu-escalate-hint" aria-label="Manual intervention required">
                Escalate to platform
              </span>
            )}
          </>
        ) : (
          <span className="kpu-dash">—</span>
        )}
      </td>

      {/* esb_doc_num — mono when present, dash otherwise */}
      <td>
        {row.esb_doc_num ? (
          <span className="mono">{row.esb_doc_num}</span>
        ) : (
          <span className="kpu-dash">—</span>
        )}
      </td>

      {/* created_at — WIB-formatted, tabular */}
      <td className="kpu-time tabular">{formatDate(row.created_at)}</td>

      {/* posted_at — WIB-formatted, tabular; only present on posted rows */}
      <td className="kpu-time tabular">{formatTime(row.posted_at)}</td>
    </tr>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="kpu-loading kpu-block">
      {[1, 2, 3].map(i => (
        <div key={i} className="kpu-skeleton" />
      ))}
    </div>
  )
}
