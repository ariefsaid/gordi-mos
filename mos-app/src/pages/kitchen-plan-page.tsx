// KitchenPlanPage — /cafe/plan — S2 plan editor + 14-day "pesanan" horizon.
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S2.
// Two faces of one route, role-gated (member-read / lead-edit — NOT a forbidden wall):
//   • ops_lead/admin → EDITOR: set qty_porsi per (item, movement) within ONE (branch,
//     activity) stream (OD-WAY-28); save is an upsert/replace (FR-031); a quiet "saved"
//     confirms in place (no view transition).
//   • member        → PESANAN: read-only 14-day forward horizon of planned items
//     (FR-035, AC-024) for the org's default stream — grouped by date, NO
//     logging/approve/edit affordance.
// Both faces render through the shared <DataTable> primitive. Proves (unit): AC-024
// (member read-only horizon), FR-030/031 (lead edit → upsert, payload never carries
// org_id/plan_by). All states: loading, empty, error+retry, saving/saved, offline
// (online-only writes, NFR-008), read-only, unauthenticated.
//
// #247 / #197 port: the prior version of this page read/wrote a stored `action_type`
// column that the squashed schema never carries — every plan editor and pesanan read
// against a live database 404'd. Cells now carry a KitchenMovement (DD-WAY-13) within an
// explicitly chosen (branch, activity) stream (OD-WAY-28), the same model the Café · Log
// capture surface already ported (#196).

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { listActiveWipItems } from '@/lib/db/kitchen-logs'
import { useCafeStream } from '@/lib/use-cafe-stream'
import { listKitchenPlans, listPesanan, upsertKitchenPlan } from '@/lib/db/kitchen-plans'
import type {
  KitchenMovement,
  PesananRow,
  PlanCell,
  ProductionStream,
  WipItemOption,
} from '@/lib/db/kitchen-logs.types'
import { PESANAN_HORIZON_DAYS } from '@/lib/db/kitchen-logs.types'
import {
  deriveActionLabel,
  movementsEqual,
  movementsForStream,
  PRODUCE,
} from '@/lib/kitchen-action-label'
import { MovementSeg } from '@/components/kitchen/movement-seg'
import { CafeStreamBar } from '@/components/kitchen/cafe-stream-bar'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { MetricSummaryRule } from '@/components/kitchen/metric-summary-rule'
import { KitchenToolbar } from '@/components/kitchen/kitchen-toolbar'
import { PlanQtyField } from '@/components/kitchen/plan-qty-field'
import { HelpTip } from '@/components/ui/help-tip'
import { groupByCategory } from '@/lib/kitchen-category'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'
import {
  DataTable,
  type DataTableColumn,
  type DataTableGroup,
} from '@/components/dashboard/data-table'
import { usePlanSummary } from '@/lib/kitchen-plan-kpis'
import './kitchen-plan-page.css'

// WIB "today" as YYYY-MM-DD (fixed +7h offset, NFR-007) — matches the other Café pages.
function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' }

export function KitchenPlanPage() {
  const auth = useAuth()
  const t = useT()
  // issue 455: the tab names the module the rail and breadcrumb name; leaf-first per
  // the catalog's own docTitle convention (tasks-layout, signals-archive).
  useDocumentTitle(t('common.docTitle', { page: `${t('nav.cafe.plan')} · ${t('nav.cafe')}` }))
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.plan')}`

  // Face split (member-read / editor). RLS is the authority; this picks which face renders.
  // #784 / OD-WAY-95 (7): the plan-write policy admits ops_lead, admin AND the stream's
  // reviewer (a supervisor holding a live membership in the branch stream). The editor face
  // therefore admits `supervisor` too — the per-stream write gate inside the editor mirrors
  // the DB rule from a viewer fact on the plan payload (viewerSupervises), never a second
  // client-side derivation of who reviews which stream.
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const canEdit =
    accessRoles.includes('ops_lead') ||
    accessRoles.includes('admin') ||
    accessRoles.includes('supervisor')

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
        <div className="kp-block kp-forbidden">
          <p className="kp-forbidden-msg">{t('kitchen.plan.signInMsg')}</p>
          <Link to="/login" className="btn btn-primary">{t('common.signIn')}</Link>
        </div>
      </PageFamilyFrame>
    )
  }

  return canEdit ? <PlanEditor /> : <PesananView />
}

// ════════════════════════════════════════════════════════════════════════════
// ops_lead / admin — the plan EDITOR (FR-030/031)
// ════════════════════════════════════════════════════════════════════════════
function PlanEditor() {
  const t = useT()
  const auth = useAuth()
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.plan')}`
  const [logDate] = useState(wibToday) // today WIB (date stepper deferred — owner OQ-7)
  // The enumerable stream catalog (FR-005) — the head picker's options (#440). The branch
  // catalog comes with it: the MOVEMENT control offers every branch as a destination, which is
  // a different question from which stream this plan belongs to.
  const cafeStream = useCafeStream()
  const { branches, options: streamOptions, stream } = cafeStream
  const { resolve: resolveStream, adopt: adoptStream, setStream: chooseStream } = cafeStream
  const [movement, setMovement] = useState<KitchenMovement>(PRODUCE)
  const [items, setItems] = useState<WipItemOption[]>([])
  const [cells, setCells] = useState<PlanCell[]>([])
  // #784: viewerSupervises rides the payload — the DB write rule (ops.is_stream_reviewer for
  // this stream) mirrored as one fact, per-stream. ops_lead/admin bypass this via the role
  // check below; nobody else may edit until the payload says so.
  const [viewerSupervises, setViewerSupervises] = useState(false)
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [savingId, setSavingId] = useState<string | null>(null) // wip_item_id mid-save
  // The last-committed cell — drives the transient inline ✓ Saved tick (A5). Page-level
  // (not a local saving→idle transition) because `savingId` also clears on save ERROR,
  // so only a success-set flag can safely mean "this cell stuck".
  const [justSavedId, setJustSavedId] = useState<string | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveError, setSaveError] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const isDesktop = useIsDesktop()
  const [search, setSearch] = useSearchParamState('q', '')
  const [category, setCategory] = useSearchParamState('category', 'All')
  // #401 / DD-WAY-40: the figures band is the Metric summary rule (two numbers for
  // the current movement) — the retired word-tiles are gone. Pure derivation over `cells`.
  // #784 AC-059: the floating "nothing planned" sentence retires with its derived flag —
  // the summary line ("Planned total 0") speaks the same fact once, standing alone.
  const summary = usePlanSummary(cells, movement)

  useEffect(() => {
    function on() { setIsOnline(true) }
    function off() { setIsOnline(false) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Clear the transient ✓ Saved timer on unmount so it can't setState after teardown.
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  // #440: the plan editor used to open on `defaultStreamFrom` — the catalog's first branch,
  // a guess that has nothing to do with the person or with what they were just looking at.
  // It now resolves the module's stream: whatever was chosen elsewhere in Café this session,
  // else the person's own stream (shared.default_stream(), FR-001), else an explicit choice.
  const fetchEditor = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const [itemRows, catalog] = await Promise.all([listActiveWipItems(), resolveStream()])
      const payload = catalog.stream
        ? await listKitchenPlans(logDate, catalog.stream)
        : { cells: [], viewerSupervises: false }
      setItems(itemRows)
      adoptStream(catalog)
      setMovement(PRODUCE)
      setCells(payload.cells)
      setViewerSupervises(payload.viewerSupervises)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [logDate, resolveStream, adoptStream])

  useEffect(() => { fetchEditor() }, [fetchEditor, retryKey])

  // Switching the stream re-reads the plan — a different (branch, activity) has its own
  // plan rows entirely, same as the capture surface's applyStream (#196). The payload's
  // viewerSupervises fact re-arrives with the cells so the edit gate follows the stream.
  const applyStream = useCallback(async (nextStream: ProductionStream) => {
    chooseStream(nextStream) // the whole Café module follows this choice (#440)
    setMovement(PRODUCE)
    setLoad({ kind: 'loading' })
    try {
      const payload = await listKitchenPlans(logDate, nextStream)
      setCells(payload.cells)
      setViewerSupervises(payload.viewerSupervises)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [logDate, chooseStream])

  // Plan qty for (item, current movement) — 0 when no plan row yet.
  const qtyOf = useCallback(
    (wipItemId: string): number =>
      cells.find(c => c.wip_item_id === wipItemId && movementsEqual(c.movement, movement))?.qty_porsi ?? 0,
    [cells, movement],
  )

  // Persist one cell (FR-031 upsert). No-op when unchanged or offline; a commit with no
  // resolved stream IS the attempt — it raises the alert (FR-006, Log's handleSubmit guard)
  // and writes nothing.
  async function saveCell(wipItemId: string, nextQty: number) {
    if (!isOnline) return
    if (nextQty < 0) return
    if (!stream) {
      setSaveError(t('kitchen.log.stream.missing'))
      return
    }
    const current = qtyOf(wipItemId)
    if (nextQty === current) return
    setSavingId(wipItemId)
    setSaveError('')
    try {
      const id = await upsertKitchenPlan({
        log_date: logDate,
        wip_item_id: wipItemId,
        branch_id: stream.branch.id,
        activity: stream.activity,
        action: movement.action,
        destination_branch_id: movement.destinationBranchId,
        qty_porsi: nextQty,
      })
      // Reflect the confirmed result in place (no view transition).
      setCells(prev => {
        const without = prev.filter(
          c => !(c.wip_item_id === wipItemId && movementsEqual(c.movement, movement)),
        )
        return [...without, { id, wip_item_id: wipItemId, movement, qty_porsi: nextQty }]
      })
      // Surface the commit INLINE at THIS cell (A5): a transient ✓ Saved tick, then
      // idle. Reset any in-flight tick (e.g. rapid back-to-back edits) before re-arming.
      setJustSavedId(wipItemId)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setJustSavedId(null), 1500)
    } catch (err) {
      setSaveError(err instanceof Error ? `Couldn't save — ${err.message}` : "Couldn't save — please try again.")
    } finally {
      setSavingId(null)
    }
  }

  // Client-side search + category filter + null-safe category grouping.
  const q = search.trim().toLowerCase()
  const visible = useMemo(
    () => items.filter(it =>
      (!q || it.name.toLowerCase().includes(q)) &&
      (category === 'All' || (it.category ?? '') === category)),
    [items, q, category],
  )
  const categories = ['All', ...Array.from(new Set(items.map(i => i.category ?? '').filter(Boolean)))
    .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b)))]
  // #784 AC-058: on desktop each group header carries ONE `See these in Log →` link — the
  // group-level shortcut to the Log surface. The phone carries none (the Café tab is one tap
  // away). The link is not row-scoped: rows themselves render item names as plain text.
  const planGroups: DataTableGroup<WipItemOption>[] = useMemo(
    () => groupByCategory(visible).map(g => ({
      key: g.cat ?? '__uncategorised__',
      label: g.cat ? kitchenCategoryLabel(t, g.cat) : g.cat,
      rows: g.rows,
      headerActions: isDesktop ? (
        <Link to="/cafe/log" className="kp-group-log-link">
          {t('kitchen.plan.seeInLog')}
        </Link>
      ) : undefined,
    })),
    [visible, t, isDesktop],
  )

  // #784: the plan-write gate mirrors the DB rule — ops_lead/admin bypass, else the
  // payload's viewerSupervises fact decides for the stream in view. The client never derives
  // "who reviews which stream" a second way; the DB says so via ops.is_stream_reviewer, and
  // listKitchenPlans returns the answer on the plan payload. Offline still pre-disables.
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const isLeadOrAdmin = accessRoles.includes('ops_lead') || accessRoles.includes('admin')
  const canWriteHere = isLeadOrAdmin || viewerSupervises
  const fieldDisabled = !isOnline || !canWriteHere

  const planColumns: DataTableColumn<WipItemOption>[] = [
    {
      key: 'dish',
      header: t('kitchen.plan.col.item'),
      cardLabel: '',
      // #784 AC-058: item names are plain text — no per-row drill link. The Log shortcut
      // lives on the desktop group header (headerActions), not per row; the phone carries
      // none because the Café tab reaches the Log in one tap.
      render: item => (
        <span className="kp-dish">
          <span className="kp-name">{item.name}</span>
          {item.category && <span className="kp-cat">{kitchenCategoryLabel(t, item.category)}</span>}
        </span>
      ),
    },
    {
      key: 'plan',
      header: t('kitchen.plan.col.plan'),
      numeric: true,
      // v4 (DD-5 typed-qty port): both viewports render the SAME typed field —
      // PlanQtyField — not the retired −/+ PlanQtyCell/PlanQtyStepper pair. Planning a
      // dish at 25 portions cost 25 taps; the owner already ordered this pattern killed
      // on Café · Log ("the production is not logged incrementally. it should be typed
      // in the amount being produced. mostly are 10-20+. incremental is just too
      // tedious"), and Plan is the same job on the next screen. Desktop gets the dense
      // (32px pointer-surface) sizing; the phone card keeps the 44px touch floor.
      // Commit state (Saving… / ✓ Saved) renders BESIDE the field at the page, only
      // when it has something to say — inline in the control it would reflow the row's
      // one input mid-entry.
      render: item => {
        const saving = savingId === item.id
        const saved = !saving && justSavedId === item.id
        return (
          <div className="kp-cell-qty">
            <PlanQtyField
              itemName={item.name}
              qty={qtyOf(item.id)}
              // #548 FR-006: entry stays live without a stream (Log's grammar) — the commit
              // attempt raises the alert; only offline pre-disables the field. Committed value
              // unchanged: it renders beside the field at the page.
              // #784: also disabled when the payload says the viewer does not supervise this
              // stream — the DB write would refuse and the affordance mirrors that refusal.
              disabled={fieldDisabled}
              onSave={next => saveCell(item.id, next)}
              dense={isDesktop}
            />
            {(saving || saved) && (
              <span className="kp-cell-status" role="status" aria-live="polite">
                {saving
                  ? t('record.field.saving')
                  : <><span className="kp-cell-tick" aria-hidden="true">✓</span> {t('record.field.saved')}</>}
              </span>
            )}
          </div>
        )
      },
    },
  ]

  const streamMissing = stream === null

  // #548 FR-007: Plan's phone face is the DESIGN.md compact capture row — identity left,
  // the typed plan field + unit right, no per-card field label. Same seam as Log
  // (renderCard → PhoneCard applies .dt-card--compact); the meta line renders ONLY when it
  // has something to say (commit state). No dense: the phone card keeps the 44px touch floor.
  const renderPlanCard = (item: WipItemOption) => {
    const saving = savingId === item.id
    const saved = !saving && justSavedId === item.id
    return (
      <div className="kp-card">
        <div className="kp-card-head">
          {/* #784 AC-058: item names are plain text — no per-row link on phone either. */}
          <span className="kp-card-name">
            <span className="kp-name">{item.name}</span>
            {item.category && <span className="kp-card-cat">{kitchenCategoryLabel(t, item.category)}</span>}
          </span>
          <PlanQtyField
            itemName={item.name}
            qty={qtyOf(item.id)}
            disabled={fieldDisabled}
            onSave={next => saveCell(item.id, next)}
          />
        </div>
        {(saving || saved) && (
          <div className="kp-card-meta">
            <span className="kp-cell-status" role="status" aria-live="polite">
              {saving
                ? t('record.field.saving')
                : <><span className="kp-cell-tick" aria-hidden="true">✓</span> {t('record.field.saved')}</>}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      /* #440: the stream this plan is being written INTO, stated in the head and switched
         there — the same statement-and-switch every other Café surface carries, in the same
         place. It replaces the shared head's static job sentence (PageHead renders one or the
         other): which books a planned quantity lands in is what the number means. */
      statusRow={
        <CafeStreamBar
          options={streamOptions}
          stream={stream}
          onChange={next => { void applyStream(next) }}
        />
      }
      meta={
        <span className="kp-meta-line">
          {/* #401: same H10 seam six surfaces already use; rides the meta line rather
              than claiming new chrome on a capture surface. */}
          <HelpTip label={t('kitchen.plan.help')} />
          <span className="kp-date tabular">{logDate}</span>
        </span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : items.length === 0 ? 'empty' : saveError ? 'validation' : savingId ? 'saving' : 'default'}
    >
      {/* #784 AC-059: the summary line stands alone — a floating `Nothing planned yet` above
          it doubles the same fact "Planned total 0" already speaks. That sentence lives only
          inside the true-empty state (the horizon's EmptyState body). */}
      {/* #401 / DD-WAY-40: Plan is an ACT surface — its figures render as the DESIGN.md
          Metric summary rule: one inline line, no card, no width branch, never a tile
          row (OD-WAY-74 #2). No delta: a capture band has no state worth acting on. */}
      {load.kind === 'ready' && items.length > 0 && (
        <MetricSummaryRule
          ariaLabel={t(summary.ariaLabel)}
          metrics={summary.metrics.map(m => ({ key: m.key, label: t(m.label), value: m.value }))}
        />
      )}

      {!isOnline && (
        <div role="alert" className="kp-banner kp-banner-offline kp-block">
          {t('kitchen.plan.offline')}
        </div>
      )}
      {saveError && (
        <div role="alert" className="kp-banner kp-banner-error kp-block">{saveError}</div>
      )}
      {/* #548 FR-006: the precondition is a muted hint at rest (Log's .kl-submit-reason
          grammar, role="status" — programmatically associated as a live region, NFR-002). The
          role="alert" banner above is reserved for an actual commit attempt (saveCell's
          no-stream guard). */}
      {streamMissing && load.kind === 'ready' && (
        <p className="kp-stream-hint" role="status" aria-live="polite">
          {t('kitchen.log.stream.missing')}
        </p>
      )}

      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.plan') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {load.kind === 'ready' && items.length === 0 && (
        <EmptyState
          variant="blank"
          title={t('kitchen.empty.noActiveItems.title')}
          copy={t('kitchen.plan.empty.copy')}
        />
      )}

      {load.kind === 'ready' && items.length > 0 && (
        <div className="kp-block">
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            categories={categories}
            categoryLabel={value => kitchenCategoryLabel(t, value)}
            category={category}
            onCategoryChange={setCategory}
            searchPlaceholder={t('kitchen.plan.searchPlaceholder')}
            ariaLabel={t('kitchen.plan.toolbarAria')}
          >
            <div className="kp-scope">
              {/* #440: the branch × activity pair of selects that used to lead this block is
                  gone — it named the stream a SECOND way (and named Rumah Rames by the
                  'Bungur' alias, which names a transfer destination and never a stream), while
                  the head now names it once for the whole module. What stays is the movement:
                  a property of the rows, not of the books. */}
              {/* Same destination picker as capture (FR-013), including the origin so the
                  intra-branch entry reads the same here as it does on the log surface —
                  a plan for a movement the capture form cannot name is a plan nobody fills. */}
              <MovementSeg
                value={movement}
                options={movementsForStream(branches, streamOptions)}
                branches={branches}
                origin={stream}
                onChange={setMovement}
              />
            </div>
          </KitchenToolbar>
          <DataTable
            columns={planColumns}
            rows={visible}
            groups={planGroups}
            renderCard={renderPlanCard}
            isDesktop={isDesktop}
            state={visible.length > 0 ? 'ready' : 'empty'}
            emptyLabel={t('kitchen.filter.noMatch')}
            caption={t('kitchen.plan.caption')}
          />
        </div>
      )}
    </PageFamilyFrame>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// member — the read-only PESANAN horizon (FR-035 / AC-024)
// ════════════════════════════════════════════════════════════════════════════
function PesananView() {
  const t = useT()
  const pageTitle = `${t('dest.cafe')} · ${t('nav.cafe.plan')}`
  const [from] = useState(wibToday) // horizon start = today WIB
  const [rows, setRows] = useState<PesananRow[]>([])
  const cafeStream = useCafeStream()
  const { branches, options: streamOptions, stream } = cafeStream
  const { resolve: resolveStream, adopt: adoptStream, setStream: chooseStream } = cafeStream
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const isDesktop = useIsDesktop()
  // #401: URL-synced search + category over the ~231-row horizon (v4's KitchenToolbar
  // port; Nielsen Café·Plan 16/32). Same keys as the editor face ('q'/'category') —
  // the faces are role-exclusive, so they never share a URL. Refresh/share keeps the
  // filtered view (I7 / D-E1).
  const [search, setSearch] = useSearchParamState('q', '')
  const [category, setCategory] = useSearchParamState('category', 'All')

  // #440: the horizon a floor member reads is THEIR stream's — it used to be
  // `defaultStreamFrom`, the catalog's first branch, so a Radiant barista read Gordi HQ's
  // pesanan and had no way to tell. Same resolution and same head control as every other
  // Café surface; switching is offered here too, because "what is the OTHER stream
  // planning" is a question the floor asks and reading a plan changes nothing.
  const fetchHorizon = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const catalog = await resolveStream()
      const data = catalog.stream ? await listPesanan(from, PESANAN_HORIZON_DAYS, catalog.stream) : []
      adoptStream(catalog)
      setRows(data)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [from, resolveStream, adoptStream])

  const applyStream = useCallback(async (next: ProductionStream) => {
    chooseStream(next) // the whole Café module follows this choice (#440)
    setLoad({ kind: 'loading' })
    try {
      setRows(await listPesanan(from, PESANAN_HORIZON_DAYS, next))
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [from, chooseStream])

  useEffect(() => { fetchHorizon() }, [fetchHorizon, retryKey])

  // #401: client-side search + category over the read horizon (mirrors the editor).
  const q = search.trim().toLowerCase()
  const visible = useMemo(
    () => rows.filter(r =>
      (!q || r.wip_item_name.toLowerCase().includes(q)) &&
      (category === 'All' || (r.category ?? '') === category)),
    [rows, q, category],
  )
  const categories = ['All', ...Array.from(new Set(rows.map(r => r.category ?? '').filter(Boolean)))
    .sort((a, b) => kitchenCategoryLabel(t, a).localeCompare(kitchenCategoryLabel(t, b)))]

  // Group the flat rows by date (already date-sorted by the query) for the read view.
  // #784 AC-058: on desktop each group header carries ONE `See these in Log →` link; the
  // phone carries none (the Café tab is one tap away).
  const pesananGroups: DataTableGroup<PesananRow>[] = useMemo(() => {
    const byDate = new Map<string, PesananRow[]>()
    for (const r of visible) {
      const list = byDate.get(r.log_date) ?? []
      list.push(r)
      byDate.set(r.log_date, list)
    }
    return [...byDate.entries()].map(([date, dateRows]) => ({
      key: date,
      label: date,
      count: dateRows.length,
      rows: dateRows,
      headerActions: isDesktop ? (
        <Link to="/cafe/log" className="kp-group-log-link">
          {t('kitchen.plan.seeInLog')}
        </Link>
      ) : undefined,
    }))
  }, [visible, isDesktop, t])

  // Read-only pesanan columns: Item (name + category sub-label) · Action · Planned.
  // No edit affordance (AC-024) — the qty is a plain tabular number, no stepper.
  // #784 AC-058: item names are plain text — no per-row link on either face.
  const pesananColumns: DataTableColumn<PesananRow>[] = [
    {
      key: 'item',
      header: t('kitchen.plan.pesanan.col.item'),
      cardLabel: '',
      render: r => (
        <span className="kp-dish">
          <span className="kp-name">{r.wip_item_name}</span>
          {r.category && <span className="kp-cat">{kitchenCategoryLabel(t, r.category)}</span>}
        </span>
      ),
    },
    {
      key: 'movement',
      header: t('kitchen.plan.pesanan.col.action'),
      render: r => deriveActionLabel(t, r.movement, branches),
    },
    { key: 'qty_porsi', header: t('kitchen.plan.pesanan.col.planned'), numeric: true },
  ]

  return (
    <PageFamilyFrame
      family="workspace"
      title={pageTitle}
      statusRow={
        <CafeStreamBar
          options={streamOptions}
          stream={stream}
          onChange={next => { void applyStream(next) }}
        />
      }
      meta={
        <span className="kp-date tabular">
          {t('kitchen.plan.pesanan.meta.horizon', { days: PESANAN_HORIZON_DAYS })}
        </span>
      }
      state={load.kind === 'loading' ? 'loading' : load.kind === 'error' ? 'error' : rows.length === 0 ? 'empty' : 'read-only'}
    >
      {/* #401: the face floor staff actually get said nothing about why it cannot be
          edited — one sentence + the CTA to the surface where their work happens. */}
      <div className="kp-readonly kp-block">
        <p className="kp-readonly-note">
          {t('kitchen.plan.pesanan.readOnlyNote', { days: PESANAN_HORIZON_DAYS })}
        </p>
        <Link to="/cafe/log" className="btn btn-outline kp-readonly-cta">
          {t('kitchen.plan.pesanan.readOnlyCta')}
        </Link>
      </div>

      {load.kind === 'loading' && <LoadingShell count={3} />}

      {load.kind === 'error' && (
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.upcomingPlan') })}
          onRetry={() => setRetryKey(k => k + 1)}
        />
      )}

      {/* #440: "nothing planned" and "no stream to read a plan against" are different facts, and
          the first one told as the second is how a person concludes the kitchen has no plan when
          they simply have no stream yet (FR-002). */}
      {load.kind === 'ready' && stream === null && (
        <EmptyState variant="blank" title={t('cafe.stream.none')} />
      )}

      {load.kind === 'ready' && stream !== null && rows.length === 0 && (
        <EmptyState
          variant="awaiting"
          title={t('kitchen.plan.pesanan.empty.title')}
          copy={t('kitchen.plan.pesanan.empty.copy', { days: PESANAN_HORIZON_DAYS })}
        />
      )}

      {load.kind === 'ready' && rows.length > 0 && (
        <div className="kp-block">
          <KitchenToolbar
            search={search}
            onSearchChange={setSearch}
            categories={categories}
            categoryLabel={value => kitchenCategoryLabel(t, value)}
            category={category}
            onCategoryChange={setCategory}
            searchPlaceholder={t('kitchen.plan.pesanan.searchPlaceholder')}
            ariaLabel={t('kitchen.plan.pesanan.toolbarAria')}
          />
          <DataTable
            columns={pesananColumns}
            rows={visible}
            groups={pesananGroups}
            isDesktop={isDesktop}
            state={visible.length > 0 ? 'ready' : 'empty'}
            emptyLabel={t('kitchen.filter.noMatch')}
            caption={t('kitchen.plan.pesanan.caption')}
          />
        </div>
      )}
    </PageFamilyFrame>
  )
}
