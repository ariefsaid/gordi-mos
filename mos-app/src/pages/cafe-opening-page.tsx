// CafeOpeningPage — /cafe — the Café Module home (Step 7 / cafe-retrofit.spec.md §4, B7,
// RATIFY-7D). Opening is branch-wide: the person's effective profile location is resolved to the
// canonical Opening Team internally, while the page names the branch and offers a deliberate
// location switch when more than one eligible branch is available. Production stream context
// (branch + activity) belongs to Log/Plan/Stock and is intentionally absent from this page.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import {
  getCafeOpeningProcessId,
  getTodayOpeningForTeam,
  listCafeViewerTeams,
  listStartableCafeTeams,
  resolveCafeOpeningTeamForBranch,
  resolveCafeOpeningTeamForTeam,
  wibToday,
} from '@/lib/db/cafe-opening'
import { listActiveBranches } from '@/lib/db/branches'
import { rememberCafeOpeningTeam, rememberedCafeOpeningTeamId } from '@/lib/cafe-opening-location'
import { CafeOpeningPanel } from '@/components/cafe/cafe-opening-panel'
import { canPushCafe, canReviewCafe } from '@/lib/kitchen-gates'
import './cafe-opening-page.css'

type FetchState = 'loading' | 'ready' | 'choice' | 'error' | 'no-process' | 'no-team'
type OpeningStatus = 'not-started' | 'started' | 'unknown'

interface BranchTeam {
  id: string
  /** Canonical Opening Team name, kept for the server-facing panel only. */
  name: string
  branchId: string
  /** User-facing location label. Opening never presents `name` as a production stream. */
  branchName: string
  isPrimary: boolean
  due: boolean
  status?: OpeningStatus
}

// Capture doors every café viewer reaches (Log/Plan/Stock — read/capture for all roles).
const CAPTURE_LINKS = [
  { to: '/cafe/log', key: 'nav.cafe.log' as const },
  { to: '/cafe/plan', key: 'nav.cafe.plan' as const },
  { to: '/cafe/stock', key: 'nav.cafe.stock' as const },
]

// JQ-1: Review admits stream supervisors; Pushes remains ops_lead/admin. Keep the links
// separate so the opening door mirrors each route's own gate and never offers supervisors a
// dead Pushes link.
const REVIEW_LINK = { to: '/cafe/review', key: 'nav.cafe.review' as const }
const PUSH_LINK = { to: '/cafe/pushes', key: 'nav.cafe.pushes' as const }
const EMPTY_ACCESS_ROLES: string[] = []

function LocationChoices({
  choices,
  onChoose,
}: {
  choices: readonly BranchTeam[]
  onChoose: (choice: BranchTeam) => void
}) {
  const t = useT()
  return (
    <section className="cafe-location-choice" aria-labelledby="cafe-location-choice-title">
      <h2 id="cafe-location-choice-title">{t('cafe.opening.chooseLocation')}</h2>
      <p className="cafe-location-choice__help">{t('cafe.opening.locationChoiceHelp')}</p>
      <div className="cafe-location-choice__list">
        {choices.map((choice) => {
          const statusKey = choice.status === 'started'
            ? 'cafe.opening.locationStarted'
            : choice.status === 'not-started'
              ? 'cafe.opening.locationNotStarted'
              : choice.status === 'unknown'
                ? 'cafe.opening.locationStatusUnknown'
                : null
          const statusText = statusKey ? t(statusKey) : null
          const statusId = `cafe-location-choice-status-${choice.id}`
          return (
            <button
              key={choice.id}
              type="button"
              className="cafe-location-choice__option"
              onClick={() => onChoose(choice)}
              aria-label={`${t('cafe.opening.openLocation')} ${choice.branchName}${statusText ? ` — ${statusText}` : ''}`}
              aria-describedby={statusText ? statusId : undefined}
            >
              <span className="cafe-location-choice__name">{choice.branchName}</span>
              {statusText && (
                <span id={statusId} className="cafe-location-choice__status">{statusText}</span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Keep the Opening context subtree keyed by viewer identity. Auth can change while the route
 * remains mounted; remounting here prevents one person's branch/panel from appearing for the
 * next person even for the render before the new location read starts.
 */
export function CafeOpeningPage() {
  const auth = useAuth()
  const viewerKey = auth.status === 'authenticated'
    ? `${auth.viewer.person.id}:${auth.viewer.accessRoles.join(',')}`
    : auth.status
  return <CafeOpeningPageBody key={viewerKey} />
}

function CafeOpeningPageBody() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('doc.cafeOps') }))
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : EMPTY_ACCESS_ROLES
  const captureLinks = canReviewCafe(accessRoles)
    ? [...CAPTURE_LINKS, REVIEW_LINK, ...(canPushCafe(accessRoles) ? [PUSH_LINK] : [])]
    : CAPTURE_LINKS

  const [state, setState] = useState<FetchState>('loading')
  const [processId, setProcessId] = useState<string | null>(null)
  const [team, setTeam] = useState<BranchTeam | null>(null)
  const [teamChoices, setTeamChoices] = useState<BranchTeam[]>([])
  const [changingLocation, setChangingLocation] = useState(false)
  const changeLocationTrigger = useRef<HTMLButtonElement | null>(null)
  const loadGeneration = useRef(0)

  const selectLocation = useCallback((choice: BranchTeam) => {
    if (!viewerId) return
    rememberCafeOpeningTeam(viewerId, choice.id)
    setTeam(choice)
    setChangingLocation(false)
    setState('ready')
  }, [viewerId])

  const load = useCallback(() => {
    if (!viewerId) return
    const generation = ++loadGeneration.current
    setState('loading')
    setProcessId(null)
    setTeam(null)
    setTeamChoices([])
    setChangingLocation(false)

    void (async () => {
      try {
        const id = await getCafeOpeningProcessId()
        if (generation !== loadGeneration.current) return
        if (!id) {
          setState('no-process')
          return
        }
        setProcessId(id)

        // The due catalog contains only unstarted occurrences. Profile memberships are the
        // complementary source for an already-started primary and for authorized alternatives.
        // Both sets are retained before canonical Opening-Team deduplication.
        const [due, memberships, branches] = await Promise.all([
          listStartableCafeTeams(id),
          listCafeViewerTeams(viewerId),
          listActiveBranches(),
        ])
        if (generation !== loadGeneration.current) return

        const sources = [
          ...memberships.map((membership) => ({
            sourceTeamId: membership.id,
            isPrimary: membership.is_primary,
            due: false,
          })),
          ...due.map((run) => ({
            sourceTeamId: run.owning_team_id,
            isPrimary: false,
            due: true,
          })),
        ]
        // Ops leads/admins can be authorized for a branch without holding a profile membership.
        // Their started branches never appear in due_process_runs(), so include every active
        // branch's canonical Opening Team under the existing elevated Café gate as well.
        if (canPushCafe(accessRoles)) {
          const elevated = await Promise.all(
            branches.map(async (branch) => ({
              branch,
              team: await resolveCafeOpeningTeamForBranch(branch.id),
            })),
          )
          sources.push(
            ...elevated
              .filter(result => result.team !== null)
              .map(result => ({ sourceTeamId: result.team!.id, isPrimary: false, due: false })),
          )
        }
        const resolvedSources = await Promise.all(
          sources.map(async (source) => ({ source, team: await resolveCafeOpeningTeamForTeam(source.sourceTeamId) })),
        )
        if (generation !== loadGeneration.current) return

        const candidates = new Map<string, BranchTeam>()
        for (const { source, team: resolved } of resolvedSources) {
          if (!resolved) continue
          const branch = branches.find(candidate => candidate.id === resolved.branchId)
          // An archived/missing branch is not an eligible location for a new Opening context.
          if (!branch) continue
          const existing = candidates.get(resolved.id)
          if (existing) {
            existing.isPrimary ||= source.isPrimary
            existing.due ||= source.due
          } else {
            candidates.set(resolved.id, {
              id: resolved.id,
              name: resolved.name,
              branchId: resolved.branchId,
              branchName: branch.name,
              isPrimary: source.isPrimary,
              due: source.due,
            })
          }
        }

        const eligible = [...candidates.values()]
        const rememberedId = rememberedCafeOpeningTeamId(viewerId)
        const remembered = rememberedId ? eligible.find(candidate => candidate.id === rememberedId) : undefined
        if (rememberedId && !remembered) rememberCafeOpeningTeam(viewerId, null)
        const primary = eligible.filter(candidate => candidate.isPrimary)
        const defaultLocation = remembered
          ?? (primary.length === 1 ? primary[0] : eligible.length === 1 ? eligible[0] : null)

        if (defaultLocation) {
          setTeam(defaultLocation)
          setTeamChoices(eligible)
          setState('ready')
          return
        }
        if (eligible.length === 0) {
          setState('no-team')
          return
        }

        // Ambiguous viewers get real status where the read permits it. A per-location read failure
        // remains an honest unknown on that option; it must not hide the actionable location choice.
        const withStatus = await Promise.all(eligible.map(async (candidate) => {
          if (candidate.due) return { ...candidate, status: 'not-started' as const }
          try {
            const opening = await getTodayOpeningForTeam(id, candidate.id)
            return { ...candidate, status: opening.started ? 'started' as const : 'not-started' as const }
          } catch {
            return { ...candidate, status: 'unknown' as const }
          }
        }))
        if (generation !== loadGeneration.current) return
        setTeamChoices(withStatus)
        setState('choice')
      } catch {
        if (generation === loadGeneration.current) setState('error')
      }
    })()
  }, [accessRoles, viewerId])

  useEffect(() => { load() }, [load])
  useEffect(() => () => { loadGeneration.current += 1 }, [])
  useEffect(() => {
    if (!changingLocation) return
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setChangingLocation(false)
      changeLocationTrigger.current?.focus()
    }
    document.addEventListener('keydown', dismissOnEscape)
    return () => document.removeEventListener('keydown', dismissOnEscape)
  }, [changingLocation])

  // Shell state seam (V3 Workspace family): resolve the opening-fetch state to the shared
  // PageFamilyState; the branch bodies below keep their own skeleton/empty/error grammar.
  const frameState =
    state === 'loading' ? 'loading'
    : state === 'error' ? 'error'
    : state === 'no-process' || state === 'no-team' ? 'empty'
    : 'default'

  const alternateLocations = team
    ? teamChoices.filter(candidate => candidate.id !== team.id)
    : []

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
      {state === 'error' && <ErrorState message={t('cafe.opening.loadError')} onRetry={load} />}
      {state === 'no-process' && (
        <EmptyState variant="blank" title={t('cafe.opening.noProcess')} />
      )}
      {state === 'no-team' && (
        <EmptyState variant="blank" title={t('cafe.opening.noTeam')} />
      )}
      {state === 'choice' && (
        <LocationChoices choices={teamChoices} onChoose={selectLocation} />
      )}
      {state === 'ready' && processId && team && (
        <>
          <section className="cafe-opening-location" aria-label={t('cafe.opening.locationLabel')}>
            <div className="cafe-opening-location__copy">
              <span className="cafe-opening-location__label">{t('cafe.opening.locationLabel')}</span>
              <strong data-testid="cafe-opening-location">{team.branchName}</strong>
            </div>
            {alternateLocations.length > 0 && (
              <Button
                variant="ghost"
                className="cafe-opening-location__change"
                ref={changeLocationTrigger}
                aria-expanded={changingLocation}
                aria-controls="cafe-opening-location-switcher"
                onClick={() => setChangingLocation(open => !open)}
              >
                {t('cafe.opening.changeLocation')}
              </Button>
            )}
          </section>
          {changingLocation && (
            <div id="cafe-opening-location-switcher">
              <LocationChoices choices={alternateLocations} onChoose={selectLocation} />
            </div>
          )}
          <CafeOpeningPanel key={team.id} processId={processId} teamId={team.id} teamName={team.branchName} />
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
