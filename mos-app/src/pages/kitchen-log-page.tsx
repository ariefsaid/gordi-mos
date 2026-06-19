// KitchenLogPage — /mos/kitchen/log — S1 Kitchen Log capture (phone-first).
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S1.
// Proves (unit layer): AC-020/021 (variance-note gate), AC-022 (transfer-availability
// cap), AC-030 (increment-semantics submit payload — no status/org_id/submitted_by).
// (AC-090/091 are the e2e cross-stack journeys — owned at the Playwright layer, not here.)
// - Phone-first (≤640px): pinned 44px submit bar, full-width steppers.
// - Desktop (≥768px): centered ~720px, un-pinned submit at form foot.
// - Online-only writes (NFR-008): offline indicator surfaced in EVERY state.
// - Confirmed-only (NOT optimistic): spinner → confirmed toast.
// - Validation inline-on-change: variance-note gate revealed as soon as qty ≠ target.
// - NEVER sends status / org_id / submitted_by (server-stamped, NFR-003).

import { useState, useEffect, useCallback } from 'react'
import { PageFrame } from '@/shell/page-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useAuth } from '@/auth/use-auth'
import {
  listActiveWipItems,
  fetchPlanMap,
  fetchStockMap,
  resolveKitchenBuId,
  insertKitchenLogBatch,
} from '@/lib/db/kitchen-logs'
import type {
  WipItemOption,
  KitchenActionType,
  KitchenLogLine,
  PlanMap,
  StockMap,
} from '@/lib/db/kitchen-logs.types'
import {
  needsVarianceNote,
  transferExceedsAvailable,
  cappedTransferQty,
  VARIANCE_NOTE_CUE,
  TRANSFER_SHORT_CUE,
} from '@/lib/kitchen-gates'
import { ActionTypeSeg } from '@/components/kitchen/action-type-seg'
import { WipItemStepper } from '@/components/kitchen/wip-item-stepper'
import './kitchen-log-page.css'

// WIB "today" as YYYY-MM-DD (fixed +7h offset, NFR-007)
function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

// Build fresh per-item line state from loaded items + plan + stock for an action_type.
function buildLines(
  items: WipItemOption[],
  planMap: PlanMap,
  stockMap: StockMap,
  actionType: KitchenActionType,
): Record<string, KitchenLogLine> {
  const lines: Record<string, KitchenLogLine> = {}
  for (const item of items) {
    const stock = stockMap[item.id]
    lines[item.id] = {
      wip_item_id: item.id,
      qty_porsi: 0,
      notes: '',
      plan_qty: planMap[item.id]?.[actionType] ?? 0,
      stok: stock?.stok ?? 0,
      tersedia: stock?.tersedia ?? 0,
      dirty: false,
      error: '',
      capError: '',
    }
  }
  return lines
}

// Recompute a line's gate state (note + cap) against its qty / action_type.
// FR-022: note required when qty != effective target (max(plan − stok, 0) for transfers).
// FR-023: transfer cue when qty > tersedia.
function gateLine(line: KitchenLogLine, actionType: KitchenActionType): KitchenLogLine {
  if (line.qty_porsi <= 0) return { ...line, error: '', capError: '' }
  const error = needsVarianceNote(line, actionType) && !line.notes.trim() ? VARIANCE_NOTE_CUE : ''
  const capError = transferExceedsAvailable(line, actionType) ? TRANSFER_SHORT_CUE : ''
  return { ...line, error, capError }
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
  const [stockMap, setStockMap] = useState<StockMap>({})
  const [buId, setBuId] = useState('')
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

  // Load WIP items + plan + stock + the Kitchen-and-Bar BU id (resolved by name, #3).
  const loadData = useCallback(async () => {
    setStatus({ kind: 'loading' })
    try {
      const [items, plan, stock, bu] = await Promise.all([
        listActiveWipItems(),
        fetchPlanMap(logDate),
        fetchStockMap(logDate),
        resolveKitchenBuId(),
      ])
      setWipItems(items)
      setPlanMap(plan)
      setStockMap(stock)
      setBuId(bu)
      setLines(buildLines(items, plan, stock, actionType))
      setStatus({ kind: 'ready' })
    } catch {
      // Can't resolve items/stock/BU — render an error state rather than stamping a wrong BU.
      setStatus({ kind: 'error', message: "Couldn't load items — check your connection." })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDate, retryKey])

  useEffect(() => {
    if (auth.status !== 'authenticated') return
    loadData()
  }, [auth.status, loadData])

  // Rebuild plan_qty / stock / gate state per line when action_type changes.
  useEffect(() => {
    if (wipItems.length === 0) return
    setLines(prev => {
      const next = { ...prev }
      for (const item of wipItems) {
        const base: KitchenLogLine = {
          ...next[item.id],
          plan_qty: planMap[item.id]?.[actionType] ?? 0,
          stok: stockMap[item.id]?.stok ?? 0,
          tersedia: stockMap[item.id]?.tersedia ?? 0,
        }
        next[item.id] = gateLine(base, actionType)
      }
      return next
    })
  }, [actionType, wipItems, planMap, stockMap])

  function handleActionTypeChange(at: KitchenActionType) {
    setActionType(at)
  }

  function handleQtyChange(itemId: string, qty: number) {
    setLines(prev => {
      const cur = prev[itemId]
      // FR-023 / AC-022: cap a transfer line at the available total (multi-line safe).
      const capped = cappedTransferQty(qty, cur.tersedia, actionType)
      // The requested qty hit the availability ceiling — surface "produce first" even
      // though the value is now capped (the cue explains WHY they can't go higher).
      const hitCap = capped < qty
      const staged = capped > 0
      const gated = gateLine({ ...cur, qty_porsi: capped, dirty: staged }, actionType)
      return { ...prev, [itemId]: { ...gated, capError: hitCap ? TRANSFER_SHORT_CUE : gated.capError } }
    })
  }

  function handleNotesChange(itemId: string, note: string) {
    setLines(prev => {
      const next: KitchenLogLine = { ...prev[itemId], notes: note }
      return { ...prev, [itemId]: gateLine(next, actionType) }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isOnline) return

    const staged = Object.values(lines).filter(l => l.qty_porsi > 0)
    if (staged.length === 0) return

    // Re-gate all staged lines; block on any note-required or cap violation.
    let hasErrors = false
    const validated = { ...lines }
    for (const line of staged) {
      const gated = gateLine({ ...line, dirty: true }, actionType)
      if (gated.error || gated.capError) {
        validated[line.wip_item_id] = gated
        hasErrors = true
      }
    }
    if (hasErrors) {
      setLines(validated)
      return
    }

    if (!buId) {
      setSubmitError('Cannot determine the kitchen business unit. Please contact an admin.')
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
          // status / org_id / submitted_by NOT sent — server-stamped (NFR-003)
        })),
      )
      setStatus({ kind: 'success', count: staged.length })
      setLines(buildLines(wipItems, planMap, stockMap, actionType))
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStatus({ kind: 'ready' })
    }
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (auth.status === 'loading') {
    return (
      <PageFrame>
        <div className="kl-page">
          <OfflineBanner show={!isOnline} />
          <LoadingState />
        </div>
      </PageFrame>
    )
  }

  if (auth.status === 'unauthenticated' || auth.status === 'orphan') {
    return (
      <PageFrame>
        <div className="kl-page kl-unauth kl-block">
          <p className="kl-unauth-msg">You need to sign in to use Kitchen Log.</p>
          <a href="/login" className="btn btn-primary btn-touch kl-touch">Sign in</a>
        </div>
      </PageFrame>
    )
  }

  // ── Data loading state — offline indicator surfaced here too (#2, RI-2) ──────
  if (status.kind === 'loading') {
    return (
      <PageFrame>
        <div className="kl-page">
          <OfflineBanner show={!isOnline} />
          <LoadingState />
        </div>
      </PageFrame>
    )
  }

  // ── Error state — never a bare Retry loop when offline (#2, RI-2) ────────────
  if (status.kind === 'error') {
    return (
      <PageFrame>
        <div className="kl-page kl-error kl-block">
          <OfflineBanner show={!isOnline} />
          <p className="kl-error-msg" role="alert">
            {!isOnline
              ? "You're offline — logging needs a connection. Reconnect and retry."
              : status.message}
          </p>
          <button
            type="button"
            className="btn btn-outline btn-touch kl-touch"
            aria-label="Retry loading items"
            onClick={() => setRetryKey(k => k + 1)}
          >
            Retry
          </button>
        </div>
      </PageFrame>
    )
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (wipItems.length === 0) {
    return (
      <PageFrame>
        <div className="kl-page">
          <OfflineBanner show={!isOnline} />
          <ContentHeader title="Kitchen · Log" logDate={logDate} />
          <div className="kl-empty kl-block">
            No active WIP items configured — ask an ops lead to add items.
          </div>
        </div>
      </PageFrame>
    )
  }

  const isSubmitting = status.kind === 'submitting'
  const stagedCount = Object.values(lines).filter(l => l.qty_porsi > 0).length

  return (
    <PageFrame>
      <div className="kl-page">
        <OfflineBanner show={!isOnline} />

        <ContentHeader title="Kitchen · Log" logDate={logDate} />

        <div className="kl-seg-wrap kl-block">
          <ActionTypeSeg
            value={actionType}
            onChange={handleActionTypeChange}
            disabled={isSubmitting}
          />
        </div>

        {submitError && (
          <div role="alert" className="kl-banner kl-banner-error kl-block">
            {submitError}
          </div>
        )}

        {status.kind === 'success' && (
          <div role="status" aria-live="polite" className="kl-banner kl-banner-success kl-block">
            {status.count} {status.count === 1 ? 'line' : 'lines'} submitted — pending review.
          </div>
        )}

        <div className="kl-overline kl-block">Active WIP Items</div>

        <form
          id="kitchen-log-form"
          onSubmit={handleSubmit}
          noValidate
          aria-label="Kitchen log capture"
          className="kl-form"
        >
          <div className="kl-list">
            {wipItems.map(item => (
              <WipItemStepper
                key={item.id}
                itemName={item.name}
                actionType={actionType}
                line={lines[item.id] ?? {
                  wip_item_id: item.id,
                  qty_porsi: 0,
                  notes: '',
                  plan_qty: 0,
                  stok: 0,
                  tersedia: 0,
                  dirty: false,
                  error: '',
                  capError: '',
                }}
                onQtyChange={qty => handleQtyChange(item.id, qty)}
                onNotesChange={note => handleNotesChange(item.id, note)}
                disabled={isSubmitting}
              />
            ))}
          </div>

          {/* Desktop: un-pinned submit at form foot */}
          <div className="kl-submit-desktop">
            <SubmitButton stagedCount={stagedCount} isSubmitting={isSubmitting} isOnline={isOnline} />
          </div>
        </form>

        {/* Phone: pinned submit bar — outside the form but bound via form= */}
        <div className="kl-submit-phone">
          <SubmitButton
            stagedCount={stagedCount}
            isSubmitting={isSubmitting}
            isOnline={isOnline}
            formId="kitchen-log-form"
          />
        </div>
      </div>
    </PageFrame>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function OfflineBanner({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div role="alert" aria-label="Offline" className="kl-banner kl-banner-offline kl-block">
      You're offline — logging needs a connection. Your entries are kept on screen; reconnect to submit.
    </div>
  )
}

function ContentHeader({ title, logDate }: { title: string; logDate: string }) {
  return (
    <div className="kl-head kl-block">
      <h1 className="kl-head-title">{title}</h1>
      <span className="kl-head-date tabular">{logDate}</span>
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
    <div role="status" aria-label="Loading" className="kl-loading kl-block">
      {[1, 2, 3].map(i => (
        <div key={i} className="kl-skeleton" />
      ))}
    </div>
  )
}
