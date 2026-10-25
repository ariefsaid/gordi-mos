// Meetings collection (route /work/meetings): My meetings | All, search, newest first.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { loadMeetingContext, type MeetingContext } from '@/components/meetings/meeting-context'
import { MeetingsList } from '@/components/meetings/meetings-list'
import { useMeetingRecordOverlay } from '@/components/meetings/use-meeting-record-overlay'
import { Button } from '@/components/ui/button'
import { SearchField } from '@/components/ui/search-field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { EmptyState, ErrorState, FilteredEmptyState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { listMeetings } from '@/lib/db/meetings'
import type { MeetingListRow, MeetingListScope } from '@/lib/db/meetings.types'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useWorkHomeBack } from '@/shell/work-collection-switcher'
import '@/components/record-collection/record-collection.css'
import '@/components/meetings/meetings-list.css'

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: MeetingListRow[] }

export function MeetingsPage() {
  const t = useT()
  const auth = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const scope: MeetingListScope = params.get('show') === 'all' ? 'all' : 'mine'
  const urlSearch = params.get('q') ?? ''
  const [search, setSearch] = useState(urlSearch)
  const [ctx, setCtx] = useState<MeetingContext | null>(null)
  const [ctxFailed, setCtxFailed] = useState(false)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)
  useDocumentTitle(t('common.docTitle', { page: t('nav.work.meetings') }))
  const back = useWorkHomeBack()

  const patchParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }, [params, setParams])

  // The URL carries the search after a short pause, so typing does not rewrite history on every key.
  useEffect(() => {
    if (search === urlSearch) return
    const handle = window.setTimeout(() => patchParams({ q: search.trim() ? search : null }), 250)
    return () => window.clearTimeout(handle)
  }, [patchParams, search, urlSearch])

  useEffect(() => {
    if (!viewerId) return
    let live = true
    setCtxFailed(false)
    loadMeetingContext(viewerId).then((next) => { if (live) setCtx(next) }, () => { if (live) setCtxFailed(true) })
    return () => { live = false }
  }, [viewerId, nonce])

  useEffect(() => {
    if (!ctx || !viewerId) return
    let live = true
    setLoad({ status: 'loading' })
    listMeetings({ scope, personId: viewerId, search: urlSearch }).then(
      (rows) => { if (live) setLoad({ status: 'ready', rows }) },
      () => { if (live) setLoad({ status: 'error' }) },
    )
    return () => { live = false }
  }, [ctx, scope, urlSearch, viewerId, nonce])

  const retry = () => setNonce((n) => n + 1)
  const overlay = useMeetingRecordOverlay({ onCollectionChanged: retry })
  const searching = urlSearch.trim() !== ''
  const summary = useMemo(() => {
    if (load.status !== 'ready') return null
    const n = load.rows.length
    if (scope === 'mine') return t(n === 1 ? 'meetings.summary.mine.one' : 'meetings.summary.mine.other', { count: n })
    return t(n === 1 ? 'meetings.summary.all.one' : 'meetings.summary.all.other', { count: n })
  }, [load, scope, t])

  const toolbar = (
    <div className="meetings-toolbar">
      <SegmentedControl<MeetingListScope>
        label={t('meetings.show')}
        options={[{ value: 'mine', label: t('meetings.scope.mine') }, { value: 'all', label: t('meetings.scope.all') }]}
        value={scope}
        onChange={(next) => patchParams({ show: next === 'all' ? 'all' : null })}
      />
      <SearchField label={t('meetings.search.label')} placeholder={t('meetings.search.placeholder')} value={search} onChange={setSearch} />
    </div>
  )

  let body
  if (ctxFailed || load.status === 'error') {
    body = <ErrorState message={t('meetings.error')} onRetry={retry} />
  } else if (!ctx || load.status === 'loading') {
    body = <LoadingShell label={t('meetings.loading')} />
  } else if (load.rows.length === 0 && searching) {
    body = <FilteredEmptyState items={t('meetings.filteredItems')} onClear={() => { setSearch(''); patchParams({ q: null }) }} clearLabel={t('common.clearSearch')} />
  } else if (load.rows.length === 0) {
    body = (
      <EmptyState variant="quiet" title={t('meetings.empty.title')} copy={t('meetings.empty.copy')}>
        {scope === 'mine' ? <Button variant="outline" onClick={() => patchParams({ show: 'all' })}>{t('meetings.empty.showAll')}</Button> : null}
      </EmptyState>
    )
  } else {
    body = (
      <>
        {summary ? <p className="meetings-summary" role="status">{summary}</p> : null}
        <MeetingsList rows={load.rows} ctx={ctx} onOpen={overlay.onOpenRecord} />
      </>
    )
  }

  return (
    <PageFamilyFrame
      family="management"
      back={back}
      phoneActionBar
      title={t('nav.work.meetings')}
      subtitle={t('meetings.newest')}
      action={<Button variant={overlay.panelOpen ? 'outline' : 'primary'} onClick={() => navigate('/work/meetings/new')}>{t('meetings.new')}</Button>}
    >
      <div className={`work-collection${overlay.splitOpen ? ' record-split' : ''}`}>
        <div className="record-collection-view record-collection-view--list">
          {toolbar}
          {body}
        </div>
        {overlay.slot}
      </div>
    </PageFamilyFrame>
  )
}
