// CafeRootPage — /cafe — the Café module root (DD-MVP-17). The assigned worker lands
// directly on Today's production capture surface; Opening is a compact status/door row
// rendered as the capture form's leading slot, and Log/Plan/Stock are never a landing
// menu. The location discipline is unchanged (DD-MVP-11): the person's effective profile
// location resolves to the canonical Opening Team, a deliberate session choice outranks
// it, and a genuinely ambiguous profile gets the actionable location overview BEFORE any
// capture surface mounts. /cafe/log aliases this root by redirect.
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
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
import { cafeDraftCount, clearCafeDraftCount } from '@/lib/cafe-capture-draft'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CafeOpeningPanel } from '@/components/cafe/cafe-opening-panel'
import { canPushCafe } from '@/lib/kitchen-gates'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { KitchenLogPage } from './kitchen-log-page'
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
export function CafeRootPage() {
  const auth = useAuth()
  const viewerKey = auth.status === 'authenticated'
    ? `${auth.viewer.person.id}:${auth.viewer.accessRoles.join(',')}`
    : auth.status
  return <CafeRootPageBody key={viewerKey} />
}

function CafeRootPageBody() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('doc.cafeOps') }))
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : EMPTY_ACCESS_ROLES

  const [state, setState] = useState<FetchState>('loading')
  const [processId, setProcessId] = useState<string | null>(null)
  const [team, setTeam] = useState<BranchTeam | null>(null)
  const [teamChoices, setTeamChoices] = useState<BranchTeam[]>([])
  const [changingLocation, setChangingLocation] = useState(false)
  // A location the person asked for, waiting on the discard confirm. Null = nothing pending.
  const [pendingLocation, setPendingLocation] = useState<BranchTeam | null>(null)
  const changeLocationTrigger = useRef<HTMLButtonElement | null>(null)
  const loadGeneration = useRef(0)

  // The switch itself, once nothing is at stake.
  const applyLocation = useCallback((choice: BranchTeam) => {
    if (!viewerId) return
    clearCafeDraftCount()
    rememberCafeOpeningTeam(viewerId, choice.id)
    setTeam(choice)
    setChangingLocation(false)
    // ConfirmDialog hands closing back to its caller after a successful confirm, so the pending
    // choice has to be released here or the dialog stays up over the location it just switched to.
    setPendingLocation(null)
    setState('ready')
  }, [viewerId])

  // Switching location discards whatever the capture form is holding — a typed number belongs to
  // the stream it was typed against. That is right, and it was silent: someone mid-count lost the
  // work to a button that said nothing. Held behind a confirm while quantities are staged, and
  // free when they are not, so the common switch costs no extra click.
  const selectLocation = useCallback((choice: BranchTeam) => {
    if (!viewerId) return
    if (cafeDraftCount() > 0) {
      // Close the chooser as the confirm opens. Left open behind a modal it becomes a second
      // Escape owner: Escape closed the chooser and moved focus to its trigger while the dialog
      // stayed on screen, so the one key that should dismiss the modal did everything except that.
      setChangingLocation(false)
      setPendingLocation(choice)
      return
    }
    applyLocation(choice)
  }, [applyLocation, viewerId])

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

  // DD-MVP-17: once the location resolves, the capture surface IS the page and brings its
  // own Workspace frame — mounting this one too would nest two frames and put two h1s on
  // one page. Every state BEFORE that still needs a frame of its own to live in.
  if (state === 'ready' && processId && team) {
    return (
      <>
        <CafeCaptureRoot
          key={team.id}
          processId={processId}
          team={team}
          alternateLocations={alternateLocations}
          changingLocation={changingLocation}
          changeLocationTrigger={changeLocationTrigger}
          setChangingLocation={setChangingLocation}
          onChoose={selectLocation}
        />
        {/* Only while something is staged — `selectLocation` switches straight through otherwise.
            Cancel leaves location, stream and draft exactly as they were: it never reaches
            `applyLocation`, and the capture form is not re-keyed, so nothing is rebuilt. */}
        {pendingLocation !== null && (
          <ConfirmDialog
            open
            title={t('cafe.opening.switch.confirmTitle')}
            body={t('cafe.opening.switch.confirmBody', {
              count: cafeDraftCount(),
              qty: t(cafeDraftCount() === 1 ? 'kitchen.log.discard.qty.one' : 'kitchen.log.discard.qty.other'),
              from: team.branchName,
              to: pendingLocation.branchName,
            })}
            confirmLabel={t('cafe.opening.switch.confirm')}
            cancelLabel={t('common.cancel')}
            tone="destructive"
            onConfirm={async () => { applyLocation(pendingLocation) }}
            onCancel={() => {
              setPendingLocation(null)
              // The button that opened this lived in the chooser, which closed as the dialog
              // opened, so the shell's invoker is detached and focus would fall to <body>.
              // "Change location" is the stable door back to the same choice.
              changeLocationTrigger.current?.focus()
            }}
          />
        )}
      </>
    )
  }

  return (
    // V3 Workspace family (Issue 11): the shared frame owns the h1 + job sentence;
    // "today" rides in the head meta slot as before.
    <PageFamilyFrame
      family="workspace"
      title={t('nav.cafe')}
      meta={formatWeekdayDayMonth(wibToday())}
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
    </PageFamilyFrame>
  )
}

/**
 * DD-MVP-17: the ready face of the root. The capture surface IS the page; the Opening
 * door row (location + status + Start door) rides as its leading slot and the navigation
 * menu of large Log/Plan/Stock buttons is gone — those destinations stay in the
 * capability-filtered shell rail (#781). The capture form's own frame owns the page title.
 */
function CafeCaptureRoot({
  processId,
  team,
  alternateLocations,
  changingLocation,
  changeLocationTrigger,
  setChangingLocation,
  onChoose,
}: {
  processId: string
  team: BranchTeam
  alternateLocations: BranchTeam[]
  changingLocation: boolean
  changeLocationTrigger: React.RefObject<HTMLButtonElement | null>
  setChangingLocation: (open: boolean) => void
  onChoose: (choice: BranchTeam) => void
}) {
  const t = useT()
  const door = (
    <section className="cafe-opening-door" aria-label={t('cafe.opening.locationLabel')}>
      <div className="cafe-opening-location" aria-label={t('cafe.opening.locationLabel')}>
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
            onClick={() => setChangingLocation(!changingLocation)}
          >
            {t('cafe.opening.changeLocation')}
          </Button>
        )}
      </div>
      {changingLocation && (
        <div id="cafe-opening-location-switcher">
          <LocationChoices choices={alternateLocations} onChoose={onChoose} />
        </div>
      )}
      <CafeOpeningPanel processId={processId} teamId={team.id} teamName={team.branchName} presentation="door" />
    </section>
  )
  // OD-CAFE-1: the location this root has chosen bounds the capture surface's stream choice.
  return <KitchenLogPage leading={door} activeBranchId={team.branchId} activeBranchName={team.branchName} />
}
