import { useWorkHomeBack } from '@/shell/work-collection-switcher'
import { ListPaging } from '@/components/ui/list-paging'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useAuth } from '@/auth/use-auth'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import { useIsRecordSplit } from '@/shell/use-is-split-width'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { OverlayHostSlot, useOverlayHost } from '@/shell/overlay-host'
import { useSignalComposer, type SignalComposerPrefill } from '@/shell/signal-composer-host'
import { Button } from '@/components/ui/button'
import { correctSignal } from '@/lib/db/signals'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import {
  CollectionToolbar,
  type CollectionToolbarChip,
  type CollectionToolbarSearch,
} from '@/components/record-collection/collection-toolbar'
import { SIGNAL_CATEGORIES } from '@/lib/db/signals.types'
import { signalCategoryLabel } from '@/components/signals/signal-labels'
import {
  signalCollectionDescriptor,
  type SignalCollectionQuery,
} from '@/components/signals/signal-collection-adapter'
import {
  SignalCollectionActionsProvider,
  type SignalCollectionActions,
} from '@/components/signals/signal-collection-actions'
import { SignalRecordHost } from '@/components/signals/signal-record-host'
import { SignalInlineComposer } from '@/components/signals/signal-inline-composer'
import { signalTitle } from '@/components/signals/signal-record-adapter'
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

type SignalSavedViewRetry = { kind: 'load' } | { kind: 'apply'; id: string } | { kind: 'save'; name: string }

/**
 * OD-63 / Rule 4: a DIRECT hard load / refresh / new-tab / shared deep-link onto ?record=<id>
 * resolves to the canonical full page (mirror of task-page-mode). An in-list click is an in-app
 * SPA nav (no boot timing entry → BOOT_SIGNAL_RECORD_ID is null), so it stays in the panel. The
 * redirect is decided before the collection mounts: the collection's panel open and URL sync
 * would otherwise write the collection URL back over it. jsdom has no PerformanceNavigationTiming,
 * so unit tests stay in the panel unless they set the boot id.
 */
export function SignalsArchivePage() {
  const [params] = useSearchParams()
  const recordId = params.get('record')
  if (recordId && BOOT_SIGNAL_RECORD_ID === recordId) {
    const next = new URLSearchParams(params)
    next.delete('record')
    const search = next.toString()
    return <Navigate to={{ pathname: `/work/signals/${recordId}`, search: search ? `?${search}` : '' }} replace />
  }
  return <SignalsArchiveCollection />
}

function SignalsArchiveCollection() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('nav.signals') }))
  const host = useOverlayHost()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const navigate = useNavigate()
  const isSplit = useIsRecordSplit()
  const isDesktop = useIsDesktop()
  const savedViewRetryRef = useRef<SignalSavedViewRetry | null>(null)
  const [params, setParams] = useSearchParams()
  const recordId = params.get('record')
  const hadSignalSession = useRef(false)
  const suppressNextOpen = useRef(false)
  const { open: openSignalComposer, postCount, canPost, canTag, registerInline } = useSignalComposer()
  // Writing happens on this page, above the list: every Share-signal entry point lands here.
  const [composer, setComposer] = useState<{ prefill?: SignalComposerPrefill } | null>(null)
  useEffect(() => {
    registerInline((prefill) => setComposer({ prefill }))
    return () => registerInline(null)
  }, [registerInline])

  const controller = useRecordCollection({
    descriptor: signalCollectionDescriptor,
    urlMode: 'synced',
    isDesktop,
    viewerId,
    accessRoles: auth.status === 'authenticated' ? auth.viewer.accessRoles : [],
  })
  const query = controller.state.query
  const projection = controller.state.projection
  const context = controller.state.data?.context

  // #360 (AC-430): a Share from the toolbar's compose door bumps the composer host's postCount —
  // re-run the collection's load so the fresh Signal appears without a manual refresh. This uses
  // the same retry handle as categorization while preserving the typed collection query.
  const { retry: retryCollection } = controller
  const seenPostCountRef = useRef(postCount)
  useEffect(() => {
    if (seenPostCountRef.current === postCount) return
    seenPostCountRef.current = postCount
    retryCollection()
  }, [postCount, retryCollection])

  function setQuery(patch: Partial<SignalCollectionQuery>) {
    controller.setQuery({ ...query, ...patch })
  }

  // Collection contract onOpenRecord — replace the query state before the host pushes its one
  // route marker. This yields one Back step from the record marker to the prior collection URL.
  function onOpenRecord(record: { id: string }) {
    // A fresh row click is explicit intent, so it clears the close/reopen memories used by the
    // route-seam effects. Without this reset, a signal reopened immediately after Back could be
    // swallowed by the previous session's suppression flag.
    suppressNextOpen.current = false
    hadSignalSession.current = false
    // No room for list + panel (phone, or a content track under the split threshold): the Signal
    // opens as its full page, as a Task does.
    if (!isDesktop || !isSplit) {
      const next = new URLSearchParams(params)
      next.delete('record')
      const search = next.toString()
      navigate({
        pathname: `/work/signals/${record.id}`,
        search: search ? `?${search}` : '',
      })
      return
    }
    const next = new URLSearchParams(params)
    next.set('record', record.id)
    setParams(next)
  }

  // A record already open (deep link, or the track shrank under an open panel) promotes to the
  // full page the same way, so a squeezed panel never lingers beside a squeezed list.
  useEffect(() => {
    if (!recordId || !isDesktop || isSplit) return
    suppressNextOpen.current = true
    const next = new URLSearchParams(params)
    next.delete('record')
    const search = next.toString()
    navigate({ pathname: `/work/signals/${recordId}`, search: search ? `?${search}` : '' }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, isDesktop, isSplit])

  async function handleCategorize(signalId: string, category: SignalCollectionQuery['category']) {
    if (!category) return
    await correctSignal(signalId, { category })
    controller.retry()
  }

  const actions: SignalCollectionActions = {
    onCategorize: (signalId, category) => { void handleCategorize(signalId, category) },
    ...(canPost === false ? {} : { onShareClick: () => openSignalComposer() }),
    onSort: (sort, direction) => setQuery({ sort, direction }),
  }

  // The page head owns the ONE Share Signal primary (#770 AC-021: the head holds the only
  // .btn-primary — the toolbar renders no second door inside <main>). It stays on the page at
  // phone width too (#1032), outside the View & filters door.

  // The list-search query minus ?record= — the panel's "Open full page" escalation keeps the
  // search state (q / retracted) across the jump.
  const searchWithoutRecord = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('record')
    const s = next.toString()
    return s ? `?${s}` : ''
  }, [params])

  // ≥1100px + a record open → the list squashes and the record mounts as an inline non-modal
  // split beside it (identical side/width to a Task, spec FR-3). Below split, OverlayHostSlot
  // renders its own modal overlay, so the list stays full-width underneath (no grid track).
  const splitOpen = Boolean(recordId) && isSplit

  // Record-scoped "Ask Deputy" seed (#426, mirror of tasks-workspace): the loaded row carries the
  // signal body, so the composer opens with "About Signal: <first line, ≤72 chars>". Falls back to
  // the generic record noun when the row isn't in the loaded collection (e.g. a deep link).
  const openSignalBody = recordId
    ? controller.state.data?.records.find((r) => r.id === recordId)?.body
    : undefined
  const signalEntry = useMemo(() => {
    if (!recordId) return null
    return {
      key: `signal:${recordId}`,
      owner: 'signals' as const,
      tenant: 'record' as const,
      label: t('signals.record.title'),
      title: t('signals.record.title'),
      actions: (
        <AskDeputyAction
          labelled
          draft={t('assistant.askAbout.signal', {
            title: openSignalBody ? signalTitle(openSignalBody) : t('signals.record.title'),
          })}
        />
      ),
      pageTo: { pathname: `/work/signals/${recordId}`, search: searchWithoutRecord() },
      content: (
        <SignalRecordHost
          signalId={recordId}
          mode="panel"
          onReload={controller.retry}
          onPromote={(to, state) => { suppressNextOpen.current = true; void host.openPage(to, state) }}
        />
      ),
    }
  }, [controller.retry, host, openSignalBody, recordId, searchWithoutRecord, t])

  useEffect(() => {
    if (!signalEntry) {
      suppressNextOpen.current = false
      return
    }
    if (suppressNextOpen.current) return
    const active = host.session?.frames.at(-1)?.entry
    if (active?.key === signalEntry.key) return
    // A pushed child (for example Signal → Create task) changes the active top frame, but the
    // Signal is still the root owner. Replacing the root here would silently discard that child
    // on the next render. The root identity is the stable seam for collection synchronization.
    const signalRoot = host.session?.frames[0]?.entry
    if (signalRoot?.key === signalEntry.key) return
    const hasSignalSession = host.session?.frames.some((frame) => frame.entry.owner === 'signals')
    void (hasSignalSession
      ? host.replaceRoot(signalEntry)
      : host.openRoot(signalEntry, 'route', true))
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

  const clearFilters = () =>
    setQuery({ q: '', attention: null, category: null, teamId: null, view: 'all', showRetracted: false })

  // #581: named once so the phone composition below can plant the same search field OUTSIDE the
  // "View & filters" door while the toolbar instance (rendered either standalone on desktop, or
  // INSIDE the door on phone) skips its own copy — see hideSearchRow.
  const signalSearch: CollectionToolbarSearch = {
    label: t('signals.archive.searchLabel'),
    placeholder: t('signals.archive.searchPlaceholder'),
    value: query.q,
    onChange: (q) => setQuery({ q }),
  }

  const signalChips: CollectionToolbarChip[] = []
  if (query.teamId) signalChips.push({ key: 'team', label: `${t('signals.archive.filterTeam')}: ${context?.teamNamesById.get(query.teamId) ?? ''}`, onRemove: () => setQuery({ teamId: null }) })
  if (query.category) signalChips.push({ key: 'category', label: `${t('signals.archive.filterCategory')}: ${signalCategoryLabel(t, query.category)}`, onRemove: () => setQuery({ category: null }) })
  if (query.attention) signalChips.push({ key: 'attention', label: t('signals.archive.filterAttention'), onRemove: () => setQuery({ attention: null }) })

  const signalToolbar = (
    <CollectionToolbar
      className="signals-archive-toolbar"
      // The Share signal primary lives in the PAGE HEAD — layout-independent across Table and
      // Feed. The in-feed "Share a Signal" row is ambient-only (Home tail) — see SignalFeedRows.
      exposedFilterIds={isDesktop ? ['category', 'sort'] : ['sort']}
      presentationIn={isDesktop ? 'bar' : 'panel'}
      resultSummary={projection ? t(projection.visibleRecords.length === 1 ? 'signals.archive.count.one' : 'signals.archive.count.other', { count: projection.visibleRecords.length }) : '—'}
      chips={signalChips}
      onClearAll={clearFilters}
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
          { value: 'i-posted', label: t('signals.archive.viewMine') },
        ],
        // Choosing any explicit view also clears the pre-collection `?retracted=1`
        // compatibility flag. The flag remains readable for old links, but must not
        // silently keep retracted records in the All view after a user changes views.
        onChange: (view) => setQuery({ view, showRetracted: false }),
      }}
      search={signalSearch}
      filters={[
        // F6 (OD-REDESIGN-91 #21): "Needs attention" lives on the view chip ONLY — the duplicate
        // Attention filter dropdown died here. The needs-attention view already surfaces every
        // attention-worthy Signal (Urgent + Needs attention); grouping-by-attention and
        // sort-by-Urgent below cover the remaining slices without re-duplicating the chip.
        // Row-2 order per the #770 After state: search · Team · Category (· Group · Sort) · Save view.
        // Renders only when the loaded collection has a historical team-audience row to match
        // (the adapter scopes teamNamesById to Teams present on loaded rows). A saved view that
        // stored a teamId keeps filtering correctly either way — the collection applies
        // query.teamId directly against each row (signal-collection-adapter.tsx) regardless of
        // whether this control is shown; hiding it only removes a choice that could never match.
        ...(context && context.teamNamesById.size > 0 ? [{
          id: 'team', label: t('signals.archive.filterTeam'), value: query.teamId ?? '',
          options: [
            { value: '', label: t('signals.archive.filterAnyTeam') },
            ...Array.from(context.teamNamesById).map(([value, label]) => ({ value, label })),
          ],
          onChange: (teamId: string) => setQuery({ teamId: teamId || null }),
        }] : []),
        {
          id: 'category', label: t('signals.archive.filterCategory'), value: query.category ?? '',
          options: [
            { value: '', label: t('signals.archive.filterAnyCategory') },
            // AC-031/FR-024: the eight families render in the viewer's locale — the enum value
            // stays the storage/query contract; the label goes through the ONE category seam.
            ...SIGNAL_CATEGORIES.map((category) => ({ value: category, label: signalCategoryLabel(t, category) })),
          ],
          onChange: (category) => setQuery({ category: category ? category as SignalCollectionQuery['category'] : null }),
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
        ] : [
          {
            // The feed is chronological: its one sort is the direction of time, and it is shown.
            id: 'sort', label: t('signals.archive.sortLabel'),
            value: `occurredAt:${query.direction}`,
            options: [
              { value: 'occurredAt:descending', label: t('signals.archive.sortNewest') },
              { value: 'occurredAt:ascending', label: t('signals.archive.sortOldest') },
            ],
            onChange: (value: string) => setQuery({ sort: 'occurredAt', direction: value.endsWith('ascending') ? 'ascending' : 'descending' }),
          },
        ]),
      ]}
      savedViews={{
        label: t('signals.archive.savedViews'),
        selectedId: query.savedViewId,
        operation: controller.state.savedViews.operation,
        error: controller.state.savedViews.error,
        errorMessage: t('signals.archive.savedViewsError'),
        items: controller.state.savedViews.items,
        onLoad: () => {
          savedViewRetryRef.current = { kind: 'load' }
          return controller.loadSavedViews()
        },
        onRetry: () => {
          const retry = savedViewRetryRef.current
          if (!retry) return
          if (retry.kind === 'load') void controller.loadSavedViews()
          else if (retry.kind === 'apply') void controller.applySavedView(retry.id)
          else void controller.saveCurrentView(retry.name, 'private')
        },
        onApply: async (id) => {
          savedViewRetryRef.current = { kind: 'apply', id }
          await controller.applySavedView(id)
        },
        onSave: (name) => {
          savedViewRetryRef.current = { kind: 'save', name }
          return controller.saveCurrentView(name, 'private')
        },
      }}
    />
  )

  // Signals and Tasks share the same capture-first phone contract: presentation, filters,
  // grouping, and saved views stay behind one disclosure. Signals diverges from Tasks here
  // (#581): the archive's job is search-and-revisit, so on phone the search input renders
  // OUTSIDE that door — findable without opening it — while view options stay behind it. The
  // collection toolbar itself stays unchanged for desktop, which keeps the full E7 control row.

  const workBack = useWorkHomeBack()
  return (
    <PageFamilyFrame
      family="workspace"
      back={workBack}
      title={t('nav.work.signals')}
      phoneActionBar
      // AC-021 (#770): the head holds the ONE .btn-primary on the surface — the same head-action
      // slot Tasks uses for "New task", at every width.
      // While the composer is open it carries its own Share, so the page head offers nothing second.
      action={canPost === false || composer ? undefined : (
        <Button variant="primary" onClick={() => openSignalComposer()}>
          {t('signals.action.share')}
        </Button>
      )}
    >
      <SignalCollectionActionsProvider actions={actions}>
        {composer && viewerId && auth.status === 'authenticated' ? (
          <SignalInlineComposer
            authorId={viewerId}
            authorName={auth.viewer.person.full_name}
            canTag={canTag === true}
            prefill={composer.prefill}
            onShared={() => { setComposer(null); controller.retry() }}
            onClose={() => setComposer(null)}
          />
        ) : null}
        {/* #930 — work-collection always renders (record open or not) so the page frame stays
            at the shared wide operating measure in both states; record-split is added only
            when a record is open, same as before. */}
        <div className={`work-collection${splitOpen ? ' record-split' : ''}`}>
          <div className={`record-collection-view signals-archive-main record-collection-view--${controller.state.presentation}`}>
            <RecordCollectionSurface
              controller={controller}
              controls={signalToolbar}
              empty={{
                title: query.q.trim()
                  ? t('signals.archive.empty', { query: query.q })
                  : t('signals.archive.emptyUnfiltered'),
                copy: query.q.trim() || canPost === false ? undefined : t('signals.archive.emptyShareAbove'),
                variant: 'next-step',
              }}
              filteredEmpty={{
                items: t('collection.items.signals'),
                clear: clearFilters,
                clearLabel: query.q.trim() && !query.attention && !query.category && !query.teamId && query.view === 'all' && !query.showRetracted ? t('common.clearSearch') : undefined,
              }}
              error={{ message: t('signals.archive.error'), retry: () => controller.retry() }}
              loadingLabel={t('signals.archive.loading')}
              onOpenRecord={onOpenRecord}
            />
            {context && controller.state.status !== 'loading' && controller.state.status !== 'error' ? (
              <ListPaging count={controller.state.data?.records.length ?? 0}
                hasMore={Boolean(context.nextCursor)} loading={controller.state.loadingMore}
                error={Boolean(controller.state.moreError)} onLoadMore={() => { void controller.loadMore() }} />
            ) : null}

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
  const location = useLocation()
  const [title, setTitle] = useState<string | null>(null)
  const fromHome = (location.state as { from?: string } | null)?.from === 'home'
  // The shell breadcrumb ends on the record's own name once it resolves (UX-STANDARD NV1).
  useSetBreadcrumbTitle(title ? signalTitle(title) : '')
  // R6-P2 parity with TaskRecordPage: reflect the resolved record name in the browser tab.
  useDocumentTitle(t('common.docTitle', { page: title ? `${title} · ${t('nav.signals')}` : t('nav.signals') }))
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
        backTo={fromHome ? '/' : { pathname: '/work/signals', search: location.search }}
        backLabel={fromHome ? t('dest.home') : t('nav.signals')}
        // #426 (mirror of TaskRecordPage): null until the record resolves, so no Ask Deputy
        // affordance renders with a bare stub seed.
        deputyDraft={title ? t('assistant.askAbout.signal', { title: signalTitle(title) }) : null}
      />
      <SignalRecordHost signalId={signalId} mode="page" onTitleResolved={setTitle} />
    </PageFamilyFrame>
  )
}
