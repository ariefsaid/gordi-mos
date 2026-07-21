import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsSplitWidth } from '@/shell/use-is-split-width'
import { RecordPanelHost } from '@/shell/record-panel-host'
import { useSignalComposer } from '@/shell/signal-composer-host'
import { Toggle } from '@/components/ui/toggle'
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
import { BOOT_SIGNAL_RECORD_ID } from '@/components/signals/signal-page-mode'
import './signals-archive-page.css'

// Work → Signals archive/search (Rule 4 canonical route). Job: "Search and revisit the Signals your
// Teams have shared." The LIST is now a V3 RecordCollection consumer: one typed descriptor owns
// load/filter/sort/group/presentation-switching and mirrors its query into the URL (?q= / ?layout= /
// ?retracted=1 …, FR-415), while every Table row links to the Signal's canonical record (?record=,
// FR-416). Record OPENING stays on the existing ?record= RecordPanelHost seam byte-for-byte (Option A,
// Director ruling 2026-07-21); host-slot adoption is gated on the Issue-4 route-seam slice (R-T-4).

export function SignalsArchivePage() {
  useDocumentTitle('Signals — Gordi MOS')
  const t = useT()
  const navigate = useNavigate()
  const isSplit = useIsSplitWidth()
  const [params, setParams] = useSearchParams()
  const recordId = params.get('record')
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

  function setQuery(patch: Partial<SignalCollectionQuery>) {
    controller.setQuery({ ...query, ...patch })
  }

  // Collection contract onOpenRecord — navigates to ?record= preserving all query state.
  // This replaces the old actions.onOpen. The controller's openRecord requires an overlay host
  // (Issue 4), so we provide a page-level implementation here (Option A).
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
  }

  function closeRecord() {
    const nextParams = new URLSearchParams(params)
    nextParams.delete('record')
    setParams(nextParams, { replace: true })
  }

  // The list-search query minus ?record= — shared by the canonical-page redirect and the
  // panel's "Open full page" escalation, so the search state (q / retracted) survives the jump.
  const searchWithoutRecord = () => {
    const next = new URLSearchParams(params)
    next.delete('record')
    const s = next.toString()
    return s ? `?${s}` : ''
  }

  // OD-63 / Rule 4: a DIRECT hard load / refresh / new-tab / shared deep-link onto
  // ?record=<id> escalates to the full canonical page (mirror of task-page-mode). An in-list
  // click is an in-app SPA nav (no boot timing entry → BOOT_SIGNAL_RECORD_ID is null), so it
  // stays in the drawer. jsdom has no PerformanceNavigationTiming, so unit tests stay in the
  // drawer; the e2e proves the real-browser hard-load redirect.
  if (recordId && BOOT_SIGNAL_RECORD_ID === recordId) {
    return <Navigate to={{ pathname: `/work/signals/${recordId}`, search: searchWithoutRecord() }} replace />
  }

  const openFullPage = () => {
    if (recordId) navigate({ pathname: `/work/signals/${recordId}`, search: searchWithoutRecord() })
  }

  // ≥1100px + a record open → the list squashes and the record mounts as an inline non-modal
  // split beside it (identical side/width to a Task, spec FR-3). Below split, RecordPanelHost
  // renders its own modal overlay, so the list stays full-width underneath (no grid track).
  const splitOpen = Boolean(recordId) && isSplit

  const clearFilters = () =>
    setQuery({ q: '', attention: null, category: null, teamId: null, view: 'all' })

  const signalToolbar = (
    <CollectionToolbar
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
        {
          id: 'attention', label: t('signals.archive.filterAttention'), value: query.attention ?? '',
          options: [
            { value: '', label: t('signals.archive.filterAnyAttention') },
            { value: 'FYI', label: 'FYI' },
            { value: 'Needs attention', label: t('signals.archive.viewAttention') },
            { value: 'Urgent', label: t('signals.archive.attentionUrgent') },
          ],
          onChange: (attention) => setQuery({ attention: attention ? attention as SignalCollectionQuery['attention'] : null }),
        },
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

  return (
    <PageFamilyFrame
      family="workspace"
      title={t('nav.work.signals')}
      jobSentence={t('job.signals')}
      count={projection ? projection.visibleRecords.length : null}
    >
      <SignalCollectionActionsProvider actions={actions}>
        <div className={splitOpen ? 'record-split' : undefined}>
          <div className="signals-archive-main">
            <RecordCollectionSurface
              controller={controller}
              controls={signalToolbar}
              empty={{ title: t('signals.archive.empty', { query: query.q }) }}
              filteredEmpty={{ title: t('signals.archive.filteredEmpty'), clear: clearFilters }}
              error={{ message: t('signals.archive.error'), retry: () => controller.retry() }}
              loadingLabel={t('signals.archive.loading')}
              onOpenRecord={onOpenRecord}
            />
          </div>

          {/* An in-list ?record=<id> click opens the Signal in the SAME shared RecordPanelHost as a
              Task — same side, width, and chrome (spec FR-3). Direct hard-loads redirected above to
              the canonical /work/signals/:id page. */}
          {recordId && (
            <RecordPanelHost
              label={t('signals.record.title')}
              title={t('signals.record.title')}
              rootClassName="signal-record-drawer-root"
              onOpenPage={openFullPage}
              onClose={closeRecord}
              focusKey={recordId}
            >
              <SignalRecordHost signalId={recordId} mode="panel" />
            </RecordPanelHost>
          )}
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
  useDocumentTitle('Signal — Gordi MOS')
  const { signalId } = useParams<{ signalId: string }>()
  if (!signalId) return <Navigate to="/work/signals" replace />
  return (
    <PageFamilyFrame
      family="focused-record"
      title="Signal"
      jobSentence="Search and revisit the Signals your Teams have shared."
    >
      <SignalRecordHost signalId={signalId} mode="page" />
    </PageFamilyFrame>
  )
}
