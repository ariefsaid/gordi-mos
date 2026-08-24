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
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Select } from '@/components/ui/select'
import { getCafeOpeningProcessId, listStartableCafeTeams, wibToday } from '@/lib/db/cafe-opening'
import { listAuthorTeams } from '@/lib/db/signals'
import { resolveTeamContext } from '@/lib/team-context'
import { CafeOpeningPanel } from '@/components/cafe/cafe-opening-panel'
import { canReviewCafe } from '@/lib/kitchen-gates'
// #440: the module ROOT is where the stream context belongs first — the doors below lead into
// five stream-scoped surfaces, and a person who lands here should be able to read (and set)
// which books they are about to work in before they walk through one.
import { CafeStreamBar } from '@/components/kitchen/cafe-stream-bar'
import { resolveCafeStream, rememberStream } from '@/lib/cafe-stream'
import { listStreamPairs, streamCatalogFrom } from '@/lib/db/kitchen-logs'
import { listActiveBranches } from '@/lib/db/branches'
import { fetchDefaultStream } from '@/lib/db/default-stream'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import './cafe-opening-page.css'

type FetchState = 'loading' | 'ready' | 'choice' | 'error' | 'no-process' | 'no-team'

interface BranchTeam {
  id: string
  name: string
}

// Capture doors every café viewer reaches (Log/Plan/Stock — read/capture for all roles).
const CAPTURE_LINKS = [
  { to: '/cafe/log', key: 'nav.cafe.log' as const },
  { to: '/cafe/plan', key: 'nav.cafe.plan' as const },
  { to: '/cafe/stock', key: 'nav.cafe.stock' as const },
]

// JQ-1: Review + Pushes are ops_lead/admin-only day-steps. Their doors render ONLY for a
// viewer who can actually reach the route (canReviewCafe) — a member no longer sees a tab
// that silently bounces them off the section (the route's forbidden panel stays as backstop).
const LEAD_LINKS = [
  { to: '/cafe/review', key: 'nav.cafe.review' as const },
  { to: '/cafe/pushes', key: 'nav.cafe.pushes' as const },
]

export function CafeOpeningPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('doc.cafeOps') }))
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const captureLinks = canReviewCafe(accessRoles) ? [...CAPTURE_LINKS, ...LEAD_LINKS] : CAPTURE_LINKS

  const [state, setState] = useState<FetchState>('loading')
  const [processId, setProcessId] = useState<string | null>(null)
  const [team, setTeam] = useState<BranchTeam | null>(null)
  const [teamChoices, setTeamChoices] = useState<BranchTeam[]>([])
  // The module's stream (#440). Read on its own so a failure here never takes the opening
  // surface down with it: the opening itself is Team-scoped, not stream-scoped, so the head's
  // statement is context for the doors below, not a precondition for the panel.
  const [streamOptions, setStreamOptions] = useState<ProductionStream[]>([])
  const [stream, setStream] = useState<ProductionStream | null>(null)

  useEffect(() => {
    if (!viewerId) return
    let live = true
    void (async () => {
      try {
        const [branches, pairs] = await Promise.all([listActiveBranches(), listStreamPairs()])
        const catalog = streamCatalogFrom(pairs, branches)
        const resolved = resolveCafeStream(catalog, await fetchDefaultStream(branches))
        if (!live) return
        setStreamOptions(catalog)
        setStream(resolved)
      } catch {
        if (live) setStreamOptions([]) // the head then reads "—": no stream known, nothing claimed
      }
    })()
    return () => { live = false }
  }, [viewerId])

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
      statusRow={
        <CafeStreamBar
          options={streamOptions}
          stream={stream}
          onChange={next => { setStream(next); rememberStream(next) }}
        />
      }
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
        // distill: the Select's own visible label already says "Choose a Team" — a
        // standalone prompt paragraph above it (formerly "Choose the Team whose opening
        // you want to view.") restated the same instruction a second time for a
        // one-field form. The section's aria-label keeps the region navigable by AT
        // landmark; the field label is the single remaining copy of the instruction.
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
        <>
          <CafeOpeningPanel processId={processId} teamId={team.id} teamName={team.name} />
          {/* Step 7 minor (item 7b): real button-styled links (btn-outline), full-width tap
              targets at ≤390px (cafe-opening-page.css). */}
          <nav aria-label={t('nav.cafe')} className="cafe-capture-links">
            {captureLinks.map((link) => (
              <Link key={link.to} to={link.to} className="btn btn-outline cafe-capture-link">
                {t(link.key)}
              </Link>
            ))}
          </nav>
        </>
      )}
    </PageFamilyFrame>
  )
}
