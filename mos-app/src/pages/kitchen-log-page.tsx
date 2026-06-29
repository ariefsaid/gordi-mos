// KitchenLogPage — /mos/kitchen/log — Log capture screen (OD-K-5 redesign).
// Design authority: docs/plans/2026-06-21-kitchen-log-redesign.md.
// ONE responsive screen: desktop dense <table> + KPI strip (≥768px) ↔ phone
// floor-fast cards (<768px), chosen via useIsDesktop() — ONE branch in the DOM (P-4).
//
// PARITY (unchanged from the prior screen — presentational redesign + derived KPIs ONLY):
//  - Data hooks unchanged (listActiveWipItems / fetchPlanMap / fetchStockMap /
//    resolveKitchenBuId / insertKitchenLogBatch).
//  - Gates unchanged (needsVarianceNote / transferExceedsAvailable / effectiveTarget).
//  - Submit payload byte-identical (NEVER sends status / org_id / submitted_by — NFR-003).
//  - AC-020/021 (variance-note gate), AC-022 (transfer cap REJECT — keeps typed qty),
//    AC-030 (submit payload) preserved.
// NEW (presentational only, P-1/P-3): the derived KPI strip (pure useMemo over `lines`),
// Planned/Off-plan grouping, client-side search + category filter, group collapse,
// Discard (confirmed). No new fetch/RPC/table/persistence/ESB.

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
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
  VARIANCE_NOTE_CUE,
  TRANSFER_SHORT_CUE,
} from '@/lib/kitchen-gates'
import { useKitchenKpis } from '@/lib/kitchen-kpis'
import { ActionTypeSeg } from '@/components/kitchen/action-type-seg'
import { KitchenKpiStrip } from '@/components/kitchen/kitchen-kpi-strip'
import { KitchenLogTable } from '@/components/kitchen/kitchen-log-table'
import { KitchenLogCards } from '@/components/kitchen/kitchen-log-cards'
import { EmptyState, SkeletonRows } from '@/components/ui/state-kit'
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
  const isDesktop = useIsDesktop()

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

  // NEW presentational state (P-3): client-side search + category + group collapse.
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())

  // Derived KPIs (P-1) — pure useMemo over `lines`; no fetch/RPC/persistence.
  const kpis = useKitchenKpis(lines)

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
      // FR-023 / AC-022: do NOT clamp — keep the entered qty. An over-`tersedia` transfer
      // sets capError (TRANSFER_SHORT_CUE) which blocks Submit (parity with the OLD app's
      // hard stop "Produksi dulu sebelum transfer"); the user types the real number.
      const staged = qty > 0
      const gated = gateLine({ ...cur, qty_porsi: qty, dirty: staged }, actionType)
      return { ...prev, [itemId]: gated }
    })
  }

  function handleNotesChange(itemId: string, note: string) {
    setLines(prev => {
      const next: KitchenLogLine = { ...prev[itemId], notes: note }
      return { ...prev, [itemId]: gateLine(next, actionType) }
    })
  }

  // Discard all staged entries (consequential — confirmed). OQ-4: native confirm (v1).
  function handleDiscard() {
    const stagedCount = Object.values(lines).filter(l => l.qty_porsi > 0).length
    if (stagedCount === 0) return
    const ok = typeof window !== 'undefined' ? window.confirm('Discard all staged entries?') : true
    if (!ok) return
    setLines(buildLines(wipItems, planMap, stockMap, actionType))
    setSearch('')
    setCategory('All')
  }

  function handleToggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
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
          <Link to="/login" className="btn btn-primary btn-touch kl-touch">Sign in</Link>
        </div>
      </PageFrame>
    )
  }

  // ── Data loading state — offline indicator surfaced here too (#2, RI-2) ──────
  if (status.kind === 'loading') {
    return (
      <PageFrame variant="data">
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
      <PageFrame variant="data">
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

  // ── Empty state (no WIP items) — no KPI strip (nothing to derive, plan §7) ────
  if (wipItems.length === 0) {
    return (
      <PageFrame variant="data">
        <div className="kl-page">
          <OfflineBanner show={!isOnline} />
          <PageHead
            variant="content"
            title="Kitchen · Log"
            meta={<span className="kl-date tabular">{logDate}</span>}
          />
          <EmptyState
            title="No active WIP items"
            copy="Ask an ops lead to add items."
          />
        </div>
      </PageFrame>
    )
  }

  const isSubmitting = status.kind === 'submitting'
  const stagedLines = Object.values(lines).filter(l => l.qty_porsi > 0)
  const stagedCount = stagedLines.length
  // FR-023 / AC-022: an over-`tersedia` transfer line is a hard stop — Submit stays
  // disabled while any staged line exceeds availability (the line shows the cue).
  const hasBlockingError = stagedLines.some(
    l => transferExceedsAvailable(l, actionType),
  )
  // F3 (FR-022): surface the variance-note gate as an EXPLICIT disabled control — a
  // staged off-plan line whose required note is empty disables Submit (the blocking
  // state is visible up front, not enabled-until-bounced). handleSubmit still re-gates
  // on click (defense in depth — the re-gate is the authority, this is the UX cue).
  const noteUnresolved = stagedLines.some(
    l => needsVarianceNote(l, actionType) && !l.notes.trim(),
  )

  return (
    <PageFrame variant="data">
      <div className="kl-page">
        <OfflineBanner show={!isOnline} />

        <PageHead
          variant="content"
          title="Kitchen · Log"
          meta={<span className="kl-date tabular">{logDate}</span>}
        />

        {/* Derived KPI strip (P-1) — pure view over `lines`; one branch in the DOM */}
        <KitchenKpiStrip kpis={kpis} isDesktop={isDesktop} />

        {/* Toolbar: action_type segmented control (shared desktop/phone) */}
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

        <form
          id="kitchen-log-form"
          onSubmit={handleSubmit}
          noValidate
          aria-label="Kitchen log capture"
          className="kl-form"
        >
          {/* Reflow (P-4): ONE branch in the DOM — desktop <table> OR phone cards */}
          {isDesktop ? (
            <KitchenLogTable
              items={wipItems}
              lines={lines}
              search={search}
              category={category}
              collapsedGroups={collapsedGroups}
              onQtyChange={handleQtyChange}
              onNotesChange={handleNotesChange}
              onToggleGroup={handleToggleGroup}
              onSearchChange={setSearch}
              onCategoryChange={setCategory}
              disabled={isSubmitting}
            />
          ) : (
            <KitchenLogCards
              items={wipItems}
              lines={lines}
              actionType={actionType}
              search={search}
              onQtyChange={handleQtyChange}
              onNotesChange={handleNotesChange}
              onSearchChange={setSearch}
              disabled={isSubmitting}
            />
          )}

          {/* Sticky action footer — ONE branch; tally + Discard + Submit */}
          <div className="kl-footer">
            <div className="kl-tally">
              <span className="kl-tally-num tabular">
                {stagedCount} {stagedCount === 1 ? 'dish' : 'dishes'} · {kpis.madeSoFar} units
              </span>
              <span className="kl-tally-sub">pending review on Submit</span>
            </div>
            <div className="kl-footer-actions">
              {/* F3 inline blocker reason — visible near the button so the user knows
                  why Submit is disabled without having to attempt a click (Fix 3). */}
              {noteUnresolved && !hasBlockingError && (
                <span className="kl-submit-reason" role="status" aria-live="polite">
                  Isi catatan wajib untuk submit
                </span>
              )}
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleDiscard}
                disabled={isSubmitting || stagedCount === 0}
              >
                Discard
              </button>
              <SubmitButton
                stagedCount={stagedCount}
                isSubmitting={isSubmitting}
                isOnline={isOnline}
                blocked={hasBlockingError || noteUnresolved}
              />
            </div>
          </div>
        </form>
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

function SubmitButton({
  stagedCount,
  isSubmitting,
  isOnline,
  blocked = false,
}: {
  stagedCount: number
  isSubmitting: boolean
  isOnline: boolean
  /** true when a staged line exceeds transfer availability (FR-023 hard stop) */
  blocked?: boolean
}) {
  const disabled = isSubmitting || !isOnline || stagedCount === 0 || blocked
  return (
    <button
      type="submit"
      className="btn btn-primary btn-touch kl-submit"
      disabled={disabled}
      aria-busy={isSubmitting}
    >
      {isSubmitting
        ? 'Submitting…'
        : stagedCount > 0
          ? `Submit ${stagedCount} ${stagedCount === 1 ? 'entry' : 'entries'}`
          : 'Submit'}
    </button>
  )
}

function LoadingState() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="kl-block">
      <SkeletonRows count={3} />
    </div>
  )
}
