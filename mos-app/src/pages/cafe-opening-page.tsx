// CafeRootPage — /cafe — the Café module root (DD-MVP-17): Today. Opening is a compact
// status/door row; "Log production" opens the Production page, and Log/Plan/Stock are
// never a landing menu. The location discipline is unchanged (DD-MVP-11): the person's effective profile
// location resolves to the canonical Opening Team, a deliberate session choice outranks
// it, and a genuinely ambiguous profile gets the actionable location overview BEFORE any
// capture surface mounts. /cafe/log aliases this root by redirect.
import { ArrowRightIcon } from '@/shell/icons'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CAFE_SECTIONS, visibleSections } from '@/shell/sections'
import { recordsHref } from '@/lib/cafe-records/url-state'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { CafePageFrame } from '@/components/kitchen/cafe-page-frame'
import { ActionBar } from '@/components/ui/action-bar'
import { Chevron } from '@/shell/icons'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import {
  getCafeOpeningProcessId,
  getTodayOpeningForTeam,
  listCafeViewerTeams,
  listStartableCafeTeams,
  resolveCafeOpeningTeamsForBranches,
  resolveCafeOpeningTeamsForTeamIds,
  wibToday,
  type CafeOpeningTeam,
} from '@/lib/db/cafe-opening'
import { listActiveBranches } from '@/lib/db/branches'
import { rememberCafeLocation, rememberCafeOpeningTeam, rememberedCafeOpeningTeamId } from '@/lib/cafe-opening-location'
import { CafeOpeningPanel } from '@/components/cafe/cafe-opening-panel'
import { CafeTodayAttention } from '@/components/cafe/cafe-today-attention'
import { CafeTodayNext } from '@/components/cafe/cafe-today-next'
import { CafeStreamChoices } from '@/components/kitchen/cafe-stream-bar'
import { useCafeTodayStream } from '@/lib/use-cafe-today-stream'
import { useCafeTodayJobs } from '@/lib/use-cafe-today-jobs'
import { useModuleAvailability } from '@/lib/module-availability'
import { streamLabel } from '@/lib/kitchen-action-label'
import { canPushCafe } from '@/lib/kitchen-gates'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { CAFE_OPENING_ENABLED } from '@/lib/cafe-opening-enabled'
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
export function CafeOpeningRoot() {
  const auth = useAuth()
  const viewerKey = auth.status === 'authenticated'
    ? `${auth.viewer.person.id}:${auth.viewer.accessRoles.join(',')}`
    : auth.status
  return <CafeRootPageBody key={viewerKey} />
}

export function CafeRootPage() {
  return CAFE_OPENING_ENABLED ? <CafeOpeningRoot /> : <CafeToday />
}

function CafeRootPageBody() {
  const t = useT()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : EMPTY_ACCESS_ROLES

  const [state, setState] = useState<FetchState>('loading')
  const [processId, setProcessId] = useState<string | null>(null)
  const [team, setTeam] = useState<BranchTeam | null>(null)
  const [teamChoices, setTeamChoices] = useState<BranchTeam[]>([])
  const [changingLocation, setChangingLocation] = useState(false)
  // The switch rebuilds Today's context, so the control that was focused is gone by the time it lands;
  // focus returns to the new "Change location" door instead of falling to <body>.
  const focusAfterSwitch = useRef(false)
  const changeLocationTrigger = useRef<HTMLButtonElement | null>(null)
  const loadGeneration = useRef(0)

  const selectLocation = useCallback((choice: BranchTeam) => {
    if (!viewerId) return
    rememberCafeOpeningTeam(viewerId, choice.id)
    // Plan and Stock never pass through this root, so the branch behind the choice is recorded
    // here for them: it is what bounds their own stream picker.
    rememberCafeLocation(viewerId, { branchId: choice.branchId, branchName: choice.branchName })
    setTeam(choice)
    setChangingLocation(false)
    focusAfterSwitch.current = true
    setState('ready')
  }, [viewerId])

  // The new location's own "Change location" populates the ref as it mounts, so this runs after
  // the rebuilt subtree exists. Focus returns to the control that began the interaction, which is
  // the contract every other door on this surface already keeps.
  useEffect(() => {
    if (!focusAfterSwitch.current || !team) return
    focusAfterSwitch.current = false
    changeLocationTrigger.current?.focus()
  }, [team])

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
        // branch's canonical Opening Team under the existing elevated Café gate as well. Resolve
        // independent branches and source Teams in parallel, then fetch team labels in batches.
        const elevatedPromise = canPushCafe(accessRoles)
          ? resolveCafeOpeningTeamsForBranches(branches.map((branch) => branch.id))
          : Promise.resolve(new Map<string, CafeOpeningTeam>())
        const sourceTeamsPromise = resolveCafeOpeningTeamsForTeamIds(sources.map((source) => source.sourceTeamId))
        const [elevated, openingTeamsBySource] = await Promise.all([elevatedPromise, sourceTeamsPromise])
        const resolvedSources = [
          ...sources.map((source) => ({ source, team: openingTeamsBySource.get(source.sourceTeamId) ?? null })),
          ...[...elevated.values()].map((team) => ({
            source: { sourceTeamId: team.id, isPrimary: false, due: false },
            team,
          })),
        ]
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
          // Not only a deliberate switch: the location a session OPENS on bounds Plan and Stock
          // too, and they never come through here to learn it.
          rememberCafeLocation(viewerId, {
            branchId: defaultLocation.branchId,
            branchName: defaultLocation.branchName,
          })
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

  // Bootstrap/error/location-choice states stay inside the same Today frame.
  if (state === 'ready' && processId && team) {
    return (
      <CafeToday
        contextLine={team.branchName}
        context={<CafeTodayContext
          processId={processId}
          team={team}
          alternateLocations={alternateLocations}
          changingLocation={changingLocation}
          changeLocationTrigger={changeLocationTrigger}
          setChangingLocation={setChangingLocation}
          onChoose={selectLocation}
        />}
      />
    )
  }

  return (
    <CafeToday state={frameState}>
      {state === 'loading' && <LoadingShell count={2} />}
      {state === 'error' && <ErrorState message={t('cafe.opening.loadError')} onRetry={load} />}
      {state === 'no-process' && <EmptyState variant="blank" title={t('cafe.opening.noProcess')} />}
      {state === 'no-team' && <EmptyState variant="blank" title={t('cafe.opening.noTeam')} />}
      {state === 'choice' && <LocationChoices choices={teamChoices} onChoose={selectLocation} />}
    </CafeToday>
  )
}

function CafeToday({ contextLine, context, state, children }: { contextLine?: string; context?: React.ReactNode; state?: 'loading' | 'saving' | 'saved' | 'error' | 'empty' | 'permission' | 'read-only' | 'validation' | 'default'; children?: React.ReactNode }) {
  const t = useT()
  const auth = useAuth()
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const affiliated = auth.status === 'authenticated' ? auth.viewer.affiliated : []
  const canCapture = auth.status === 'authenticated' && canCaptureCafe({ affiliated, accessRoles: roles })
  // Leads (and stream supervisors) see what is waiting for them; the rows inside gate themselves by role.
  const reviewer = roles.some(role => ['ops_lead', 'admin', 'supervisor'].includes(role))
  const { isOn } = useModuleAvailability()
  const sections = visibleSections(CAFE_SECTIONS.filter((section) => section.path !== '/cafe'), roles, isOn)
  const groups = ['cafe.nav.today', 'cafe.nav.stock', 'cafe.nav.close', 'cafe.nav.setup'] as const
  const isDesktop = useIsDesktop()
  // Café home states which stream its numbers belong to, and reads each job's state for that stream.
  const today = useCafeTodayStream()
  const { stream } = today
  const jobs = useCafeTodayJobs({ stream, allOptions: today.allOptions, destinations: today.destinations, branches: today.branches, canCapture })
  const setupHref = `/cafe/items?unit=${encodeURIComponent('Needs unit')}`
  // The filled button is the first unfinished job: items to set up when none are, else production until
  // everything planned is made, then the first transfer with a plan.
  const productionDone = jobs.planned > 0 && jobs.made >= jobs.planned
  const nextTransfer = jobs.state === 'ready' && productionDone && jobs.transfers.some(move => move.planned > 0)
  const primary = canCapture && stream && jobs.state === 'ready' && jobs.itemsReady === false
    ? (jobs.canSetUpItems ? <Link className="cafe-today__primary btn btn-primary btn-touch" to={setupHref}>{t('cafe.itemsEmpty.action')}</Link> : undefined)
    : canCapture && stream && jobs.state === 'ready' && !jobs.producing ? undefined
      : nextTransfer
        ? <Link className="cafe-today__primary btn btn-primary btn-touch" to="/cafe/transfer">{t('cafe.today.logTransfer')}</Link>
        : <Link className="cafe-today__primary btn btn-primary btn-touch" to="/cafe/production">{t('cafe.today.logProduction')}</Link>
  const [openGroups, setOpenGroups] = useState<Record<(typeof groups)[number], boolean>>(() => {
    const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
    return { 'cafe.nav.today': true, 'cafe.nav.stock': desktop, 'cafe.nav.close': desktop, 'cafe.nav.setup': desktop }
  })
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const update = () => setOpenGroups({ 'cafe.nav.today': true, 'cafe.nav.stock': media.matches, 'cafe.nav.close': media.matches, 'cafe.nav.setup': media.matches })
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const streamBar = today.state === 'ready' && !state ? {
    options: today.streamOptions,
    locationBranchId: today.locationId,
    stream,
    homeStream: today.homeStream,
    myStreamKeys: today.myStreamKeys,
    onChange: today.setStream,
  } : undefined
  const nothingUnsent = jobs.state === 'ready' && Object.keys(jobs.drafts).length === 0 && jobs.lockedReceipts === 0
  return (
    <CafePageFrame page="today" date={wibToday()} streamBar={streamBar} recordsHref={recordsHref({ question: 'everything', reading: 'day', stream: stream ? { branchId: stream.branch.id, activity: stream.activity } : null, today: wibToday() })} contextLine={contextLine ? t('cafe.today.context', { location: contextLine }) : undefined} state={state} primaryAction={isDesktop ? primary : undefined}>
      <div className="cafe-today" data-cafe-today>
        {context}
        <div className="cafe-today__layout">
          <section className="cafe-today__work" aria-label={t('cafe.today.next.title')}>
            {canCapture && today.state === 'ready' && !stream && !state && <CafeStreamChoices
              options={today.streamOptions}
              homeStream={today.homeStream}
              myStreamKeys={today.myStreamKeys}
              onChoose={today.setStream}
            />}
            {canCapture && stream && <div className="cafe-today-next">
              <h2>{t('cafe.today.next.title')}</h2>
              {nothingUnsent && <p className="cafe-today-next__clear">{t('cafe.today.noUnfinished', { stream: streamLabel(t, stream) })}</p>}
              <CafeTodayNext jobs={jobs} stream={stream} setupHref={setupHref} />
            </div>}
            {!reviewer && !canCapture && <div className="cafe-today__no-actions">
              <p>{t('cafe.today.noActions')}</p>
              <Link to="/cafe/production">{t('nav.cafe.production')}<ArrowRightIcon /></Link>
            </div>}
          </section>
          {reviewer && <CafeTodayAttention />}
          {!isDesktop && <section className="cafe-today__directory" aria-labelledby="cafe-today-groups">
            <h2 id="cafe-today-groups">{t('cafe.today.groups')}</h2>
            {groups.map(group => {
              const entries = sections.filter(section => section.group === group && !section.parentPath)
              if (!entries.length) return null
              const groupId = `cafe-today-group-${group.replaceAll('.', '-')}`
              const contentId = `${groupId}-links`
              return <section className="cafe-today__group" key={group}>
                <button className="cafe-today__group-toggle" type="button" aria-expanded={openGroups[group]} aria-controls={contentId}
                  onClick={() => setOpenGroups(current => ({ ...current, [group]: !current[group] }))}>
                  <Chevron className={`cafe-today__group-chev${openGroups[group] ? '' : ' cafe-today__group-chev--closed'}`} />
                  <span>{t(group)}</span><span className="cafe-today__group-count tabular">{entries.length}</span>
                </button>
                <ul className="cafe-today__links" id={contentId} hidden={!openGroups[group]}>{entries.map(item => <li key={item.path}>
                  <Link to={item.path}>{item.labelKey ? t(item.labelKey) : item.label}<ArrowRightIcon /></Link>
                  {sections.filter(child => child.parentPath === item.path).map(child => <Link className="cafe-today__secondary" key={child.path} to={child.path}>{child.labelKey ? t(child.labelKey) : child.label}<ArrowRightIcon /></Link>)}
                </li>)}</ul>
              </section>
            })}
          </section>}
        </div>
      </div>
      {children}
      {!isDesktop && primary && <ActionBar className="cafe-today__bar" primary={primary} />}
    </CafePageFrame>
  )
}

function CafeTodayContext({ processId, team, alternateLocations, changingLocation, changeLocationTrigger, setChangingLocation, onChoose }: {
  processId: string
  team: BranchTeam
  alternateLocations: BranchTeam[]
  changingLocation: boolean
  changeLocationTrigger: React.RefObject<HTMLButtonElement | null>
  setChangingLocation: (open: boolean) => void
  onChoose: (choice: BranchTeam) => void
}) {
  const t = useT()
  return <section className="cafe-today-context" aria-label={t('cafe.opening.locationLabel')}>
    <div className="cafe-opening-location">
      <div className="cafe-opening-location__copy">
        <span className="cafe-opening-location__label">{t('cafe.opening.locationLabel')}</span>
        <strong data-testid="cafe-opening-location">{team.branchName}</strong>
      </div>
      {alternateLocations.length > 0 && <Button variant="ghost" className="cafe-opening-location__change"
        ref={changeLocationTrigger} aria-expanded={changingLocation} aria-controls="cafe-opening-location-switcher"
        onClick={() => setChangingLocation(!changingLocation)}>{t('cafe.opening.changeLocation')}</Button>}
    </div>
    {changingLocation && <div id="cafe-opening-location-switcher"><LocationChoices choices={alternateLocations} onChoose={onChoose} /></div>}
    <CafeOpeningPanel processId={processId} teamId={team.id} teamName={team.branchName} presentation="door" />
  </section>
}
