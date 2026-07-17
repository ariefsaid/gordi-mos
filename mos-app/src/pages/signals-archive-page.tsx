import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { Toggle } from '@/components/ui/toggle'
import { listReadableSignals, listAllTeams } from '@/lib/db/signals'
import { getPeople } from '@/lib/db/directory'
import { formatWibDateTime } from '@/lib/wib-time'
import { attentionSlug, type SignalRow } from '@/lib/db/signals.types'
import { SignalRecordHost } from '@/components/signals/signal-record-host'
import './signals-archive-page.css'

type FetchState = 'loading' | 'ready' | 'error'

function attentionClass(attention: SignalRow['attention']): string {
  return `signal-row-attention signal-row-attention--${attentionSlug(attention)}`
}

// Work → Signals archive/search (Rule 4 canonical route, replaces the SliceStubPage at
// /work/signals). Job: "Search and revisit the Signals your Teams have shared." Search state
// lives in the URL (?q=) so Back/refresh/new-tab preserve it (FR-415); every row links to the
// Signal's canonical record URL (?record=<id>, FR-416).
export function SignalsArchivePage() {
  useDocumentTitle('Signals — Gordi MOS')
  const t = useT()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const recordId = params.get('record')
  // IMPORTANT-6 (design-review step-4): retracted Signals are tombstones, not the common
  // case — hidden by default, one compact toggle away. State lives in the URL (?retracted=1)
  // like every other archive filter (Rule 4), so it round-trips through Back/refresh/new-tab.
  const showRetracted = params.get('retracted') === '1'

  const [signals, setSignals] = useState<SignalRow[]>([])
  const [authorNamesById, setAuthorNamesById] = useState<Record<string, string>>({})
  const [teamNamesById, setTeamNamesById] = useState<Record<string, string>>({})
  const [state, setState] = useState<FetchState>('loading')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setState('loading')
    setError(null)
    Promise.all([listReadableSignals({ includeRetracted: true }), getPeople(), listAllTeams()])
      .then(([signalRows, people, teams]) => {
        if (cancelled) return
        setSignals(signalRows)
        setAuthorNamesById(Object.fromEntries(people.map((p) => [p.id, p.full_name])))
        setTeamNamesById(Object.fromEntries(teams.map((team) => [team.id, team.name])))
        setState('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setState('error')
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => load(), [load])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return signals.filter((signal) => {
      if (!showRetracted && signal.retracted_at) return false
      if (!term) return true
      const author = authorNamesById[signal.author_id] ?? ''
      const team = teamNamesById[signal.owning_team_id] ?? ''
      return `${signal.body} ${author} ${team}`.toLowerCase().includes(term)
    })
  }, [signals, q, showRetracted, authorNamesById, teamNamesById])

  function updateSearch(next: string) {
    const nextParams = new URLSearchParams(params)
    if (next) nextParams.set('q', next)
    else nextParams.delete('q')
    setParams(nextParams, { replace: true })
  }

  function toggleRetracted(next: boolean) {
    const nextParams = new URLSearchParams(params)
    if (next) nextParams.set('retracted', '1')
    else nextParams.delete('retracted')
    setParams(nextParams, { replace: true })
  }

  function closeRecord() {
    const nextParams = new URLSearchParams(params)
    nextParams.delete('record')
    setParams(nextParams, { replace: true })
  }

  return (
    <PageFrame variant="data">
      <PageHead
        variant="content"
        title={t('nav.work.signals')}
        subtitle={t('job.signals')}
        count={state === 'ready' ? filtered.length : null}
      />

      <div className="signals-archive-toolbar">
        <div className="signals-searchbar">
          <input
            type="search"
            role="searchbox"
            aria-label={t('signals.archive.searchLabel')}
            placeholder={t('signals.archive.searchPlaceholder')}
            value={q}
            onChange={(e) => updateSearch(e.target.value)}
          />
        </div>
        <div className="signals-archive-retracted-toggle">
          <Toggle
            size="small"
            value={showRetracted}
            onChange={toggleRetracted}
            aria-label={t('signals.archive.showRetracted')}
          />
          <span aria-hidden="true">{t('signals.archive.showRetracted')}</span>
        </div>
      </div>

      {state === 'loading' && <SkeletonRows count={5} />}
      {state === 'error' && (
        <ErrorState message={error ?? t('signals.archive.error')} onRetry={load} />
      )}
      {state === 'ready' && filtered.length === 0 && (
        <EmptyState title={t('signals.archive.empty', { query: q })} />
      )}
      {state === 'ready' && filtered.length > 0 && (
        <div className="signals-archive-list">
          {filtered.map((signal) => {
            const href = `/work/signals?record=${signal.id}`
            if (signal.retracted_at) {
              return (
                <div key={signal.id} className="signal-row signal-row--retracted">
                  <span>{t('signals.retracted')}</span>
                  {signal.retract_reason && <span>{signal.retract_reason}</span>}
                </div>
              )
            }
            return (
              <Link key={signal.id} to={href} data-canonical={href} className="signal-row">
                <span className="signal-row-body">{signal.body}</span>
                <span className="signal-row-meta">
                  {authorNamesById[signal.author_id] ?? t('signals.card.unknownAuthor')}
                  {' · '}
                  {teamNamesById[signal.owning_team_id] ?? ''}
                  {' · '}
                  {formatWibDateTime(signal.occurred_at)}
                </span>
                <span className={attentionClass(signal.attention)}>{signal.attention}</span>
              </Link>
            )
          })}
        </div>
      )}

      {/* ?record=<id> opens the record drawer beside the list (Rule 4/6) — the SAME URL for an
          in-list click, a direct load, a refresh, or a new tab (C3). */}
      {recordId && (
        <div className="drawer-modal-root signal-record-drawer-root">
          <div className="drawer-scrim" aria-hidden="true" onClick={closeRecord} />
          <aside className="drawer drawer-modal drawer-sheet" role="complementary" aria-label={t('signals.record.title')}>
            <SignalRecordHost signalId={recordId} onClose={closeRecord} />
          </aside>
        </div>
      )}
    </PageFrame>
  )
}
