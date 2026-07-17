// CafeOpeningPage — /cafe — the Café Module home (Step 7 / cafe-retrofit.spec.md §4, B7,
// RATIFY-7D). Answers the Café rail job ("Run today's café floor work — openings, checks, stock,
// shifts", Rule 1) before configuration: hosts CafeOpeningPanel's "Start today's opening" surface,
// then a compact link row to the existing, unchanged capture screens (Log · Plan · Stock · Review,
// FR-708). RATIFY-7C: a bare org with no Café Opening process seeded renders an EmptyState, not a
// crash.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { getCafeOpeningProcessId, listStartableCafeTeams, wibToday } from '@/lib/db/cafe-opening'
import { listAuthorTeams } from '@/lib/db/signals'
import { CafeOpeningPanel } from '@/components/cafe/cafe-opening-panel'
import './cafe-opening-page.css'

type FetchState = 'loading' | 'ready' | 'error' | 'no-process' | 'no-team'

interface BranchTeam {
  id: string
  name: string
}

const CAPTURE_LINKS = [
  { to: '/cafe/log', key: 'nav.cafe.log' as const },
  { to: '/cafe/plan', key: 'nav.cafe.plan' as const },
  { to: '/cafe/stock', key: 'nav.cafe.stock' as const },
  { to: '/cafe/review', key: 'nav.cafe.review' as const },
]

export function CafeOpeningPage() {
  const t = useT()
  useDocumentTitle('Café Operations — Gordi MOS')
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null

  const [state, setState] = useState<FetchState>('loading')
  const [processId, setProcessId] = useState<string | null>(null)
  const [team, setTeam] = useState<BranchTeam | null>(null)

  const load = useCallback(() => {
    if (!viewerId) return
    setState('loading')
    getCafeOpeningProcessId()
      .then(async (id) => {
        if (!id) { setState('no-process'); return }
        setProcessId(id)
        // Prefer a not-yet-started due occurrence for this process (gives the branch Team without
        // assuming it's already started); fall back to the viewer's own Team membership when
        // today's opening is already started (and so omitted from the due list).
        const due = await listStartableCafeTeams(id)
        if (due.length > 0) {
          setTeam({ id: due[0].owning_team_id, name: due[0].team_name })
          setState('ready')
          return
        }
        const myTeams = await listAuthorTeams(viewerId)
        if (myTeams.length === 0) { setState('no-team'); return }
        setTeam({ id: myTeams[0].id, name: myTeams[0].name })
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [viewerId])

  useEffect(() => { load() }, [load])

  return (
    <PageFrame>
      <PageHead title={t('nav.cafe')} meta={wibToday()} />

      {state === 'loading' && <SkeletonRows count={2} />}
      {state === 'error' && <ErrorState message={t('tasks.error.load')} onRetry={load} />}
      {state === 'no-process' && (
        <EmptyState variant="quiet" title={t('cafe.opening.noProcess')} />
      )}
      {state === 'no-team' && (
        <EmptyState variant="quiet" title={t('cafe.opening.noTeam')} />
      )}
      {state === 'ready' && processId && team && (
        <>
          <CafeOpeningPanel processId={processId} teamId={team.id} teamName={team.name} />
          {/* Step 7 minor (item 7b): real button-styled links (btn-outline), full-width tap
              targets at ≤390px (cafe-opening-page.css). */}
          <nav aria-label={t('nav.cafe')} className="cafe-capture-links">
            {CAPTURE_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="btn btn-outline cafe-capture-link">
                {t(link.key)}
              </Link>
            ))}
          </nav>
        </>
      )}
    </PageFrame>
  )
}
