// CafeOpeningPage — /cafe/opening — the Café Module's opening record (#781, OD-WAY-95).
// The Module's ROOT (/cafe) is the capture list (KitchenLogPage); this record page is what the
// in-page opening door on that root opens — it hosts CafeOpeningPanel's "Start today's opening"
// surface. The capture-links row that lived here before is gone: capture is /cafe now (the
// module root), and the rail carries the other doors (Plan/Stock and, gated, Review/Pushes).
// RATIFY-7C: a bare org with no Café Opening process seeded renders an EmptyState, not a crash.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Select } from '@/components/ui/select'
import { getCafeOpeningProcessId, listStartableCafeTeams, wibToday } from '@/lib/db/cafe-opening'
import { listAuthorTeams } from '@/lib/db/signals'
import { resolveTeamContext } from '@/lib/team-context'
import { CafeOpeningPanel } from '@/components/cafe/cafe-opening-panel'
import './cafe-opening-page.css'

type FetchState = 'loading' | 'ready' | 'choice' | 'error' | 'no-process' | 'no-team'

interface BranchTeam {
  id: string
  name: string
}

export function CafeOpeningPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('doc.cafeOps') }))
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null

  const [state, setState] = useState<FetchState>('loading')
  const [processId, setProcessId] = useState<string | null>(null)
  const [team, setTeam] = useState<BranchTeam | null>(null)
  const [teamChoices, setTeamChoices] = useState<BranchTeam[]>([])

  const load = useCallback(() => {
    if (!viewerId) return
    setState('loading')
    setTeam(null)
    setTeamChoices([])
    getCafeOpeningProcessId()
      .then(async (id) => {
        if (!id) { setState('no-process'); return }
        setProcessId(id)
        // Prefer a not-yet-started due occurrence for this process; fall back to the viewer's own
        // Team membership when today's opening is already started (and so omitted from the due list).
        // The shared resolver deliberately makes multiple eligible Teams a user choice.
        const due = await listStartableCafeTeams(id)
        if (due.length > 0) {
          const resolution = resolveTeamContext(
            due.map((run) => ({ id: run.owning_team_id, name: run.team_name })),
          )
          if (resolution.kind === 'single') {
            setTeam(resolution.team)
            setState('ready')
          } else if (resolution.kind === 'choice') {
            setTeamChoices(resolution.teams)
            setState('choice')
          } else {
            setState('no-team')
          }
          return
        }
        const myTeams = await listAuthorTeams(viewerId)
        const resolution = resolveTeamContext(myTeams.map(({ id: teamId, name }) => ({ id: teamId, name })))
        if (resolution.kind === 'single') {
          setTeam(resolution.team)
          setState('ready')
        } else if (resolution.kind === 'choice') {
          setTeamChoices(resolution.teams)
          setState('choice')
        } else {
          setState('no-team')
        }
      })
      .catch(() => setState('error'))
  }, [viewerId])

  useEffect(() => { load() }, [load])

  // Shell state seam (V3 Workspace family): resolve the opening-fetch state to the shared
  // PageFamilyState; the branch bodies below keep their own skeleton/empty/error grammar.
  const frameState =
    state === 'loading' ? 'loading'
    : state === 'error' ? 'error'
    : state === 'no-process' || state === 'no-team' ? 'empty'
    : 'default'

  return (
    // V3 Workspace family (Issue 11): the shared frame owns the h1 + job sentence;
    // "today" rides in the head meta slot as before.
    <PageFamilyFrame
      family="workspace"
      title={t('nav.cafe')}
      meta={wibToday()}
      state={frameState}
    >
      {state === 'loading' && <LoadingShell count={2} />}
      {state === 'error' && <ErrorState message={t('tasks.error.load')} onRetry={load} />}
      {state === 'no-process' && (
        // 'blank' (never 'quiet' — no config exists yet, so the ✓ earned-all-clear glyph would
        // misread as "you're done" instead of "an admin still needs to set this up").
        <EmptyState variant="blank" title={t('cafe.opening.noProcess')} />
      )}
      {state === 'no-team' && (
        <EmptyState variant="blank" title={t('cafe.opening.noTeam')} />
      )}
      {state === 'choice' && (
        <section className="cafe-team-choice" aria-label={t('cafe.opening.chooseTeam')}>
          <Select
            label={t('cafe.opening.chooseTeam')}
            fullWidth
            value=""
            onChange={(event) => {
              const chosen = teamChoices.find((candidate) => candidate.id === event.target.value)
              if (!chosen) return
              setTeam(chosen)
              setTeamChoices([])
              setState('ready')
            }}
          >
            <option value="" disabled>{t('cafe.opening.chooseTeam')}</option>
            {teamChoices.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
            ))}
          </Select>
        </section>
      )}
      {state === 'ready' && processId && team && (
        <CafeOpeningPanel processId={processId} teamId={team.id} teamName={team.name} />
      )}
    </PageFamilyFrame>
  )
}
