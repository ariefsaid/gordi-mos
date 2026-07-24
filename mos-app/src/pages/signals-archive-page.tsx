import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsSplitWidth } from '@/shell/use-is-split-width'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { ViewOptionsDisclosure } from '@/shell/view-options-disclosure'
import { OverlayHostSlot, useOverlayHost } from '@/shell/overlay-host'
import { useSignalComposer } from '@/shell/signal-composer-host'
import { Toggle } from '@/components/ui/toggle'
import { Button } from '@/components/ui/button'
import { correctSignal } from '@/lib/db/signals'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import { CollectionToolbar } from '@/components/record-collection/collection-toolbar'
import { SIGNAL_CATEGORIES } from '@/lib/db/signals.types'
import {
  signalCollectionDescriptor,
  type SignalCollectionQuery,
} from '@/components/signals/signal-collection-adapter'
import {
  SignalCollectionActionsProvider,
  type SignalCollectionActions,
} from '@/components/signals/signal-collection-actions'
import { SignalRecordHost } from '@/components/signals/signal-record-host'
import { AskDeputyAction } from '@/components/records/ask-deputy-action'
import { RecordPageChrome } from '@/shell/record-page-chrome'
import { BOOT_SIGNAL_RECORD_ID } from '@/components/signals/signal-page-mode'
import './signals-archive-page.css'

// Work → Signals archive/search (Rule 4 canonical route). Job: "Search and revisit the Signals your
// Teams have shared." The LIST is now a V3 RecordCollection consumer: one typed descriptor owns
// load/filter/sort/group/presentation-switching and mirrors its query into the URL (?q= / ?layout= /
// ?retracted=1 …, FR-415), while every Table row opens a route-mode entry through the shell's one
// OverlayHostSlot. The record query remains readable collection URL state; the host marker supplies
// the shared focus/Back/leave-guard session.

export function SignalsArchivePage() {
  useDocumentTitle('Signals — Gordi MOS')
  const t = useT()
  const host = useOverlayHost()
  const isSplit = useIsSplitWidth()
  const isDesktop = useIsDesktop()
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false)
  const [params, setParams] = useSearchParams()
  const recordId = params.get('record')
  const hadSignalSession = useRef(false)
  const suppressNextOpen = useRef(false)
  const { open: openSignalComposer } = useSignalComposer()

  const controller = useRecordCollection({
    descriptor: signalCollectionDescriptor,
    urlMode: 'synced',
    viewerId: null,
    accessRoles: [],
  })
  const query = controller.state.query
  const projection = controller.state.projection
  const context = controller.state.data?.context

  // The active Signals view as a readable label — shared by the result header and the phone
  // "View & filters" disclosure summary so the two never drift (OD-REDESIGN-72/79 convergence).
  const signalViewLabel = (view: SignalCollectionQuery['view']) =>
    view === 'needs-attention' ? t('signals.archive.viewAttention')
      : view === 'retracted' ? t('signals.archive.viewRetracted')
        : t('signals.archive.viewAll')

  function setQuery(patch: Partial<SignalCollectionQuery>) {
    controller.setQuery({ ...query, ...patch })
  }

  // Collection contract onOpenRecord — replace the query state before the host pushes its one
  // route marker. This yields one Back step from the record marker to the prior collection URL.
  function onOpenRecord(record: { id: string }) {
    const next = new URLSearchParams(params)
    next.set('record', record.id)
    setParams(next)
  }

  async function handleCategorize(signalId: string, category: SignalCollectionQuery['category']) {
    if (!category) return
    await correctSignal(signalId, { category })
    controller.retry()
  }

  const actions: SignalCollectionActions = {
    onCategorize: (signalId, category) => { void handleCategorize(signalId, category) },
    onShareClick: openSignalComposer,
    onSort: (sort, direction) => setQuery({ sort, direction }),
  }

  // The list-search query minus ?record= — shared by the canonical-page redirect and the
  // panel's "Open full page" escalation, so the search state (q / retracted) survives the jump.
  const searchWithoutRecord = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('record')
    const s = next.toString()
    return s ? `?${s}` : ''
  }, [params])

  // OD-63 / Rule 4: a DIRECT hard load / refresh / new-tab / shared deep-link onto
  // ?record=<id> escalates to the full canonical page (mirror of task-page-mode). An in-list
  // click is an in-app SPA nav (no boot timing entry → BOOT_SIGNAL_RECORD_ID is null), so it
  // stays in the drawer. jsdom has no PerformanceNavigationTiming, so unit tests stay in the
  // drawer; the e2e proves the real-browser hard-load redirect.
  const shouldEscalateToCanonical = Boolean(recordId && BOOT_SIGNAL_RECORD_ID === recordId)

  // ≥1100px + a record open → the list squashes and the record mounts as an inline non-modal
  // split beside it (identical side/width to a Task, spec FR-3). Below split, OverlayHostSlot
  // renders its own modal overlay, so the list stays full-width underneath (no grid track).
  const splitOpen = Boolean(recordId) && isSplit

  // Record-scoped "Ask Deputy" seed: prefer the loaded signal's own message so the composer opens
  // with "About Signal: <message>". Falls back to the generic record noun when the record isn't in
  // the loaded set (deep link) — the seed is an editable draft, so a generic reference is fine.
  const askSignalDraft = useMemo(() => {
    if (!recordId) return null
    const body = controller.state.data?.records.find((r) => r.id === recordId)?.body?.trim()
    const title = body ? (body.length > 72 ? `${body.slice(0, 71).trimEnd()}…` : body) : t('signals.record.title')
    return t('assistant.askAbout.signal', { title })
  }, [recordId, controller.state.data, t])

  const signalEntry = useMemo(() => {
    if (!recordId) return null
    return {
      key: `signal:${recordId}`,
      owner: 'signals' as const,
      tenant: 'record' as const,
      label: t('signals.record.title'),
      title: t('signals.record.title'),
      actions: askSignalDraft ? <AskDeputyAction draft={askSignalDraft} /> : undefined,
      pageTo: { pathname: `/work/signals/${recordId}`, search: searchWithoutRecord() },
      content: <SignalRecordHost signalId={recordId} mode="panel" />,
    }
  }, [recordId, searchWithoutRecord, t, askSignalDraft])

  useEffect(() => {
    if (!signalEntry) {
      suppressNextOpen.current = false
      return
    }
    if (suppressNextOpen.current) return
    const active = host.session?.frames.at(-1)?.entry
    if (active?.key === signalEntry.key) return
    const hasSignalSession = host.session?.frames.some((frame) => frame.entry.owner === 'signals')
    void (hasSignalSession
      ? host.replaceRoot(signalEntry)
      : host.openRoot(signalEntry, 'route'))
  }, [host, signalEntry])

  // A route marker adds one history step above the readable ?record= state. When the shared host
  // closes through an explicit action or browser POP, remove that query state without adding a
  // second Back step. The ref prevents the initial host-open effect from clearing its own record.
  const signalSessionActive = host.session?.frames.some((frame) => frame.entry.owner === 'signals') ?? false
  const clearRecordQuery = () => {
    suppressNextOpen.current = true
    const next = new URLSearchParams(params)
    next.delete('record')
    setParams(next, { replace: true })
  }
  useEffect(() => {
    if (signalSessionActive) {
      hadSignalSession.current = true
      return
    }
    if (!hadSignalSession.current || !recordId) return
    if (suppressNextOpen.current) return
    hadSignalSession.current = false
    const next = new URLSearchParams(params)
    next.delete('record')
    setParams(next, { replace: true })
  }, [params, recordId, setParams, signalSessionActive])

  // Keep the direct-load redirect after every hook so an in-app route change and a
  // hard-load redirect share one stable hook order.
  if (shouldEscalateToCanonical) {
    return <Navigate to={{ pathname: `/work/signals/${recordId}`, search: searchWithoutRecord() }} replace />
  }

  const clearFilters = () =>
    setQuery({ q: '', attention: null, category: null, teamId: null, view: 'all' })

  const signalToolbar = (
    <CollectionToolbar
      // D-D2 / Rule 7: the ONE compose door for /work/signals lives in the toolbar, so it is present
      // in BOTH Table and Feed (it used to appear only as the in-feed row and vanish in Table). The
      // in-feed "Share a Signal" row is now ambient-only (Home tail) — see SignalFeedRows.
      primaryAction={(
        <Button variant="primary" onClick={openSignalComposer}>
          {t('signals.action.share')}
        </Button>
      )}
      presentation={{
        label: t('signals.archive.presentationLabel'),
        value: controller.state.presentation,
        options: [
          { value: 'table', label: t('signals.archive.table') },
          { value: 'feed', label: t('signals.archive.feed') },
        ],
        onChange: (next) => { controller.switchPresentation(next) },
      }}
      views={{
        label: t('signals.archive.viewsLabel'),
        value: query.view,
        options: [
          { value: 'all', label: t('signals.archive.viewAll') },
          { value: 'needs-attention', label: t('signals.archive.viewAttention') },
          { value: 'retracted', label: t('signals.archive.viewRetracted') },
        ],
        onChange: (view) => setQuery({ view }),
      }}
      search={{
        label: t('signals.archive.searchLabel'),
        placeholder: t('signals.archive.searchPlaceholder'),
        value: query.q,
        onChange: (q) => setQuery({ q }),
      }}
      filters={[
        // F6 (OD-REDESIGN-91 #21): "Needs attention" lives on the view chip ONLY — the duplicate
        // Attention filter dropdown died here. The needs-attention view already surfaces every
        // attention-worthy Signal (Urgent + Needs attention); grouping-by-attention and
        // sort-by-Urgent below cover the remaining slices without re-duplicating the chip.
        {
          id: 'category', label: t('signals.archive.filterCategory'), value: query.category ?? '',
          options: [
            { value: '', label: t('signals.archive.filterAnyCategory') },
            ...SIGNAL_CATEGORIES.map((category) => ({ value: category, label: category })),
          ],
          onChange: (category) => setQuery({ category: category ? category as SignalCollectionQuery['category'] : null }),
        },
        {
          id: 'team', label: t('signals.archive.filterTeam'), value: query.teamId ?? '',
          options: [
            { value: '', label: t('signals.archive.filterAnyTeam') },
            ...Array.from(context?.teamNamesById ?? new Map()).map(([value, label]) => ({ value, label })),
          ],
          onChange: (teamId) => setQuery({ teamId: teamId || null }),
        },
        ...(controller.state.presentation === 'table' ? [
          {
            id: 'group', label: t('signals.archive.groupLabel'), value: query.groupBy,
            options: [
              { value: 'none', label: t('signals.archive.groupNone') },
              { value: 'team', label: t('signals.archive.filterTeam') },
              { value: 'attention', label: t('signals.archive.filterAttention') },
              { value: 'category', label: t('signals.archive.filterCategory') },
            ],
            onChange: (groupBy: string) => setQuery({ groupBy: groupBy as SignalCollectionQuery['groupBy'] }),
          },
          {
            id: 'sort', label: t('signals.archive.sortLabel'),
            value: `${query.sort}:${query.direction}`,
            options: [
              { value: 'occurredAt:descending', label: t('signals.archive.sortNewest') },
              { value: 'occurredAt:ascending', label: t('signals.archive.sortOldest') },
              { value: 'attention:descending', label: t('signals.archive.sortUrgent') },
            ],
            onChange: (value: string) => {
              const [sort, direction] = value.split(':')
              setQuery({
                sort: sort as SignalCollectionQuery['sort'],
                direction: direction as SignalCollectionQuery['direction'],
              })
            },
          },
        ] : []),
      ]}
      toggles={(
        <label className="collection-toolbar__toggle">
          <Toggle
            size="small"
            value={query.showRetracted}
            onChange={(showRetracted) => setQuery({ showRetracted })}
            aria-label={t('signals.archive.showRetracted')}
          />
          <span>{t('signals.archive.showRetracted')}</span>
        </label>
      )}
      savedViews={{
        label: t('signals.archive.savedViews'),
        selectedId: query.savedViewId,
        operation: controller.state.savedViews.operation,
        items: controller.state.savedViews.items,
        onLoad: () => { void controller.loadSavedViews() },
        onApply: async (id) => { await controller.applySavedView(id) },
        onSave: async (name) => { await controller.saveCurrentView(name, 'private') },
      }}
    />
  )

  // Signals and Tasks share the same capture-first phone contract: the first record leads;
  // presentation, filters, grouping, and saved views remain available behind one disclosure.
  // The collection toolbar itself stays unchanged, so desktop keeps the full E7 control row.
  const signalControls = isDesktop ? signalToolbar : (
    <ViewOptionsDisclosure
      open={mobileOptionsOpen}
      onToggle={() => setMobileOptionsOpen((open) => !open)}
      label={t('signals.archive.viewAndFilters')}
      summary={signalViewLabel(query.view)}
      panelId="mobile-signal-options-panel"
      className="collection-mobile-options"
      triggerClassName="collection-mobile-options-trigger"
      summaryClassName="collection-mobile-options-summary"
      chevronClassName="collection-mobile-options-chevron"
      panelClassName="collection-mobile-options-panel"
    >
      {signalToolbar}
    </ViewOptionsDisclosure>
  )

  return (
    <PageFamilyFrame
      family="workspace"
      title={t('nav.work.signals')}
      jobSentence={t('job.signals')}
      count={projection ? projection.visibleRecords.length : null}
    >
      <SignalCollectionActionsProvider actions={actions}>
        <div className={splitOpen ? 'record-split' : undefined}>
          <div className={`record-collection-view signals-archive-main record-collection-view--${controller.state.presentation}`}>
            <RecordCollectionSurface
              controller={controller}
              resultHeader={{
                collectionLabel: t('nav.work.signals'),
                viewLabel: signalViewLabel(query.view),
                count: projection ? projection.visibleRecords.length : null,
              }}
              controls={signalControls}
              empty={{ title: t('signals.archive.empty', { query: query.q }) }}
              filteredEmpty={{ title: t('signals.archive.filteredEmpty'), clear: clearFilters }}
              error={{ message: t('signals.archive.error'), retry: () => controller.retry() }}
              loadingLabel={t('signals.archive.loading')}
              onOpenRecord={onOpenRecord}
            />
          </div>

          {/* One physical host grammar for Signal records. The collection owns query state;
              OverlayHostSlot owns panel geometry, focus, Back, Escape, and canonical promotion. */}
          <OverlayHostSlot
            owner="signals"
            onClose={(via, close) => {
              clearRecordQuery()
              void close(via)
            }}
            onOpenPage={(to, openPage) => {
              suppressNextOpen.current = true
              void openPage(to)
            }}
          />
        </div>
      </SignalCollectionActionsProvider>
    </PageFamilyFrame>
  )
}

/**
 * Standalone full canonical Signal record page (OD-63 / Rule 4, spec FR-3). Reached by a direct
 * load / refresh / new-tab of `/work/signals/:signalId`, or the drawer's "Open full page"
 * escalation. Reuses the ONE SignalRecordHost renderer at mode="page" — no list shell, no drawer
 * chrome — mirroring the Task's TaskRecordPage (tasks-layout.tsx). Same renderer as the panel,
 * `mode` the only difference (Rule 11).
 */
export function SignalRecordPage() {
  const t = useT()
  const { signalId } = useParams<{ signalId: string }>()
  const [title, setTitle] = useState<string | null>(null)
  // R6-P2 parity with TaskRecordPage: reflect the resolved record name in the browser tab.
  useDocumentTitle(title ? `${title} · Signal — Gordi MOS` : 'Signal — Gordi MOS')
  // Record-scoped Ask-Deputy seed (mirrors the panel's askSignalDraft) — resolved once the record
  // loads; a compact reference so the composer opens with "About Signal: <message>".
  const deputyDraft = title
    ? t('assistant.askAbout.signal', { title: title.length > 72 ? `${title.slice(0, 71).trimEnd()}…` : title })
    : null
  if (!signalId) return <Navigate to="/work/signals" replace />
  // SR-3 / SR-8 (mirrors TaskRecordPage exactly): the generic "Signal" page head + its job
  // sentence are pure duplication above the record's OWN identity header (SIGNAL overline +
  // resolved title). `hideHead` suppresses that generic head so there is exactly ONE heading on
  // the page — the record's title. H3 (Luna floor): the record-page Back lives at the SHARED
  // record-page seam (mirror of the Task page) so every record kind returns the same way.
  return (
    <PageFamilyFrame
      family="focused-record"
      title="Signal"
      jobSentence="Review and follow up on this Signal."
      hideHead
    >
      <RecordPageChrome
        backTo="/work/signals"
        backLabel={t('nav.signals')}
        deputyDraft={deputyDraft}
      />
      <SignalRecordHost signalId={signalId} mode="page" onTitleResolved={setTitle} />
    </PageFamilyFrame>
  )
}
