// KitchenLogPage — /mos/kitchen/log — S1 Kitchen Log capture (phone-first).
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S1.
// FR-020/021/022/023/024; AC-020/021/022/030/090/091.
// - Phone-first (≤640px): pinned 44px submit bar, full-width steppers.
// - Desktop (≥768px): centered ~720px, un-pinned submit at form foot.
// - Online-only writes (NFR-008): offline banner + Submit disabled when offline.
// - Confirmed-only (NOT optimistic): spinner → confirmed toast.
// - Validation inline-on-attempt: variance-note gate revealed per line.
// - NEVER sends status / org_id / submitted_by (server-stamped, NFR-003).

import { useState, useEffect, useCallback } from 'react'
import { PageFrame } from '@/shell/page-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useAuth } from '@/auth/use-auth'
import { listActiveWipItems, fetchPlanMap, insertKitchenLogBatch } from '@/lib/db/kitchen-logs'
import type { WipItemOption, KitchenActionType, KitchenLogLine, PlanMap } from '@/lib/db/kitchen-logs.types'
import { ActionTypeSeg } from '@/components/kitchen/action-type-seg'
import { WipItemStepper } from '@/components/kitchen/wip-item-stepper'

// WIB "today" as YYYY-MM-DD (fixed +7h offset, NFR-007)
function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

// Build fresh per-item line state from loaded items + plan map + action_type
function buildLines(
  items: WipItemOption[],
  planMap: PlanMap,
  actionType: KitchenActionType,
): Record<string, KitchenLogLine> {
  const lines: Record<string, KitchenLogLine> = {}
  for (const item of items) {
    lines[item.id] = {
      wip_item_id: item.id,
      qty_porsi: 0,
      notes: '',
      plan_qty: planMap[item.id]?.[actionType] ?? 0,
      dirty: false,
      error: '',
    }
  }
  return lines
}

// Validate a line: returns error string or '' if valid
function validateLine(line: KitchenLogLine): string {
  if (line.qty_porsi <= 0) return '' // not staged — skip validation
  const planQty = line.plan_qty
  const deviatesFromPlan = planQty === 0 || line.qty_porsi !== planQty
  if (deviatesFromPlan && !line.notes.trim()) {
    return 'note required'
  }
  return ''
}

// Kitchen BU id — uses the viewer's first role BU (mirrors ops-add-form.tsx pattern).
// Owner-decision default (per task brief): flagged as open Q — the real deployment
// may use a fixed Kitchen and Bar BU id fetched from shared.business_units.
// RolesRow.business_unit_id is string | null — null-safe here.
function getBuId(viewer: { roles: { business_unit_id: string | null }[] }): string {
  return viewer.roles[0]?.business_unit_id ?? ''
}

type PageStatus =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' }
  | { kind: 'submitting' }
  | { kind: 'success'; count: number }

export function KitchenLogPage() {
  useDocumentTitle('Kitchen Log — Gordi MOS')
  const auth = useAuth()

  const [actionType, setActionType] = useState<KitchenActionType>('Production')
  const [logDate] = useState(wibToday) // today WIB; owner-decision: allow past dates flagged
  const [wipItems, setWipItems] = useState<WipItemOption[]>([])
  const [planMap, setPlanMap] = useState<PlanMap>({})
  const [lines, setLines] = useState<Record<string, KitchenLogLine>>({})
  const [status, setStatus] = useState<PageStatus>({ kind: 'loading' })
  const [submitError, setSubmitError] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [retryKey, setRetryKey] = useState(0)

  // Online/offline detection (NFR-008)
  useEffect(() => {
    function handleOnline() { setIsOnline(true) }
    function handleOffline() { setIsOnline(false) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load WIP items + plan map
  const loadData = useCallback(async () => {
    setStatus({ kind: 'loading' })
    try {
      const [items, plan] = await Promise.all([
        listActiveWipItems(),
        fetchPlanMap(logDate),
      ])
      setWipItems(items)
      setPlanMap(plan)
      setLines(buildLines(items, plan, actionType))
      setStatus({ kind: 'ready' })
    } catch {
      setStatus({ kind: 'error', message: "Couldn't load items — check your connection." })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDate, retryKey])

  useEffect(() => {
    if (auth.status !== 'authenticated') return
    loadData()
  }, [auth.status, loadData])

  // Rebuild plan_qty per line when action_type changes
  useEffect(() => {
    if (wipItems.length === 0) return
    setLines(prev => {
      const next = { ...prev }
      for (const item of wipItems) {
        next[item.id] = {
          ...next[item.id],
          plan_qty: planMap[item.id]?.[actionType] ?? 0,
          error: '', // clear errors on action_type switch
        }
      }
      return next
    })
  }, [actionType, wipItems, planMap])

  function handleActionTypeChange(at: KitchenActionType) {
    setActionType(at)
  }

  function handleQtyChange(itemId: string, qty: number) {
    setLines(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        qty_porsi: qty,
        dirty: qty > 0,
        error: '', // clear error on edit
      },
    }))
  }

  function handleNotesChange(itemId: string, note: string) {
    setLines(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], notes: note, error: '' },
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isOnline) return

    // Validate all dirty lines
    const staged = Object.values(lines).filter(l => l.qty_porsi > 0)
    if (staged.length === 0) return

    let hasErrors = false
    const validated = { ...lines }
    for (const line of staged) {
      const err = validateLine(line)
      if (err) {
        validated[line.wip_item_id] = { ...line, dirty: true, error: err }
        hasErrors = true
      }
    }
    if (hasErrors) {
      setLines(validated)
      return
    }

    const buId = auth.status === 'authenticated' ? getBuId(auth.viewer) : ''
    if (!buId) {
      setSubmitError('Cannot determine your business unit. Please contact an admin.')
      return
    }

    setStatus({ kind: 'submitting' })
    setSubmitError('')
    try {
      await insertKitchenLogBatch(
        staged.map(line => ({
          business_unit_id: buId,
          log_date: logDate,
          action_type: actionType,
          wip_item_id: line.wip_item_id,
          qty_porsi: line.qty_porsi,
          notes: line.notes.trim() || null,
          // status NOT sent — DB defaults to 'Submitted'
          // org_id NOT sent — server-stamped
          // submitted_by NOT sent — server-stamped
        })),
      )
      // Confirmed: show success and reset lines
      setStatus({ kind: 'success', count: staged.length })
      setLines(buildLines(wipItems, planMap, actionType))
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStatus({ kind: 'ready' })
    }
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
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
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: 'var(--muted-foreground)', marginBottom: '16px' }}>
            You need to sign in to use Kitchen Log.
          </p>
          <a href="/login" className="btn btn-primary">Sign in</a>
        </div>
      </PageFrame>
    )
  }

  // ── Data loading state ─────────────────────────────────────────────────────
  if (status.kind === 'loading') {
    return (
      <PageFrame>
        <LoadingState />
      </PageFrame>
    )
  }

  if (status.kind === 'error') {
    return (
      <PageFrame>
        <div style={{ padding: '24px 0' }}>
          <p
            style={{ color: 'var(--status-lost-text)', marginBottom: '12px', fontSize: '14px' }}
          >
            {status.message}
          </p>
          <button
            type="button"
            className="btn btn-outline"
            aria-label="Retry loading items"
            onClick={() => setRetryKey(k => k + 1)}
          >
            Retry
          </button>
        </div>
      </PageFrame>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (wipItems.length === 0) {
    return (
      <PageFrame>
        <ContentHeader title="Kitchen · Log" logDate={logDate} />
        <div style={{ padding: '32px 0', color: 'var(--muted-foreground)', fontSize: '14px' }}>
          No active WIP items configured — ask an ops lead to add items.
        </div>
      </PageFrame>
    )
  }

  // ── Submitting state spinner guard ─────────────────────────────────────────
  const isSubmitting = status.kind === 'submitting'
  const stagedCount = Object.values(lines).filter(l => l.qty_porsi > 0).length

  return (
    <PageFrame>
      {/* Offline banner (NFR-008) */}
      {!isOnline && (
        <div
          role="alert"
          aria-label="Offline"
          style={{
            background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '13px',
            color: 'var(--warning-foreground)',
          }}
        >
          You're offline — logging needs a connection. Your entries are kept on screen; reconnect to submit.
        </div>
      )}

      <ContentHeader title="Kitchen · Log" logDate={logDate} />

      {/* Action type seg */}
      <div style={{ marginBottom: '20px' }}>
        <ActionTypeSeg
          value={actionType}
          onChange={handleActionTypeChange}
          disabled={isSubmitting}
        />
      </div>

      {/* Submit error banner */}
      {submitError && (
        <div
          role="alert"
          style={{
            background: 'color-mix(in srgb, var(--destructive) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--destructive) 25%, transparent)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '13px',
            color: 'var(--status-lost-text)',
          }}
        >
          {submitError}
        </div>
      )}

      {/* Success toast (live region) */}
      {status.kind === 'success' && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: 'color-mix(in srgb, var(--success) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '13px',
            color: 'var(--status-won-text)',
          }}
        >
          {status.count} {status.count === 1 ? 'line' : 'lines'} submitted — pending review.
        </div>
      )}

      {/* Overline */}
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          marginBottom: '10px',
        }}
      >
        Active WIP Items
      </div>

      {/* Form */}
      <form
        id="kitchen-log-form"
        onSubmit={handleSubmit}
        noValidate
        aria-label="Kitchen log capture"
        style={{ paddingBottom: '80px' }} // space for pinned submit on phone
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          {wipItems.map(item => (
            <WipItemStepper
              key={item.id}
              itemName={item.name}
              line={lines[item.id] ?? {
                wip_item_id: item.id,
                qty_porsi: 0,
                notes: '',
                plan_qty: 0,
                dirty: false,
                error: '',
              }}
              onQtyChange={qty => handleQtyChange(item.id, qty)}
              onNotesChange={note => handleNotesChange(item.id, note)}
              disabled={isSubmitting}
            />
          ))}
        </div>

        {/* Desktop: un-pinned submit at form foot */}
        <div className="kl-submit-desktop">
          <SubmitButton
            stagedCount={stagedCount}
            isSubmitting={isSubmitting}
            isOnline={isOnline}
          />
        </div>
      </form>

      {/* Phone: pinned submit bar — outside the form but uses form= attribute */}
      <div className="kl-submit-phone">
        <SubmitButton
          stagedCount={stagedCount}
          isSubmitting={isSubmitting}
          isOnline={isOnline}
          formId="kitchen-log-form"
        />
      </div>

      {/* ── Inline CSS — DESIGN.md tokens only ── */}
      <style>{`
        /* Phone-first: pinned submit bar (≤640px) */
        .kl-submit-phone {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          padding: 12px 16px;
          padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
          background: var(--background);
          border-top: 1px solid var(--border);
          z-index: 10;
        }
        .kl-submit-desktop { display: none; }

        /* Desktop (≥768px): un-pin submit, center form */
        @media (min-width: 768px) {
          .kl-submit-phone { display: none; }
          .kl-submit-desktop { display: block; }
          /* also widen the form column */
          main > div { max-width: 720px !important; }
        }
      `}</style>
    </PageFrame>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ContentHeader({ title, logDate }: { title: string; logDate: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '8px',
      }}
    >
      <h1
        style={{
          fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
          fontSize: '20px',
          fontWeight: 600,
          letterSpacing: '0px',
          color: 'var(--foreground)',
          margin: 0,
        }}
      >
        {title}
      </h1>
      <span
        style={{
          fontSize: '13px',
          color: 'var(--muted-foreground)',
          fontVariantNumeric: 'tabular-nums',
          background: 'var(--muted)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        {logDate}
      </span>
    </div>
  )
}

function SubmitButton({
  stagedCount,
  isSubmitting,
  isOnline,
  formId,
}: {
  stagedCount: number
  isSubmitting: boolean
  isOnline: boolean
  formId?: string
}) {
  const disabled = isSubmitting || !isOnline || stagedCount === 0
  return (
    <button
      type="submit"
      form={formId}
      className="btn btn-primary btn-touch"
      disabled={disabled}
      aria-busy={isSubmitting}
      style={{
        boxShadow: 'var(--shadow-brand-button)',
      }}
    >
      {isSubmitting
        ? 'Submitting…'
        : stagedCount > 0
          ? `Submit ${stagedCount} ${stagedCount === 1 ? 'line' : 'lines'}`
          : 'Submit'}
    </button>
  )
}

function LoadingState() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '24px 0' }}
    >
      {[1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            height: '76px',
            background: 'var(--muted)',
            borderRadius: 'var(--radius-md)',
            opacity: 0.6,
            animation: 'kl-skeleton-pulse 1.5s ease-in-out infinite',
          }}
        />
      ))}
      <style>{`
        @keyframes kl-skeleton-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
