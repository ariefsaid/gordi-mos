// HomePage — the index route (/). Home renders the SAME consequence-ranked task data —
// overdue → due today → blocked, failed checks, and my work today — in one attention-first daily
// brief. The composition has no user-selectable presentation modes.
// Mentions are not a Home region: the Inbox page and its bell are the one mentions surface (#745).
// HomePage owns every data read + the ranking/selection logic and hands the result down as the ONE
// shared region model (`buildHomeRegions`, FR-930) — the brief composes those regions, it never
// re-derives them. The OD-18 region-order toggle that used to reorder the old single-stream view
// was retired (OD-V4-10); attention always leads.
//
// This is presentation over the EXISTING task/failed-check contracts and lane logic
// (lib/home-attention + lib/home-stream selectors). Home adds two small, RLS-backed doors for
// the persona composition: the Café opening door and the real Objective progress projection.
// Financial routine KPIs stay on /dashboard (OD-REDESIGN-17); financial *exceptions* would surface in
// the needs-you region via the attention bands.
//
// The Signals column is the real feed (#245). It shipped as a "not available yet" placeholder
// during the port, when Signals had no surface on this line; #193 landed the DAL, the record
// surface and `/work/signals`, so the placeholder is gone and `SignalFeedSection` renders live
// rows. HomePage owns the ONE Signals read, as it owns every other read on this page — the
// section is presentational (FR-V3-013: no second Signal loader).
//
// Home passes EVERY readable Signal, not only the FYI tail v4 passed. v4 split them because its
// attention-worthy Signals led the ranked stream as their own band; this line's region model has
// four regions and none of them is Signals, so filtering to FYI here would drop Urgent and
// Needs-attention Signals off Home altogether. `orderSignalsForFeed` (inside the rows) already
// floats those tiers to the top, so the ranking survives the difference. Should a Signals
// attention band ever join `buildHomeRegions`, this becomes the FYI tail again.
//
// The standing aside carries one more thing for a viewer who steers a scope: the Objectives
// roll-up door (AC-204 (4)). #179 cut the cascade route and took Home's progress drill with it,
// and the criterion is that what is left reads deliberate. It lives in the aside rather than in
// the region model on purpose — the regions are the attention ranking, and a standing reference
// door is not something that needs the viewer today.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { listTasks } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { loadFailedChecksForViewer } from '@/lib/db/home-attention-data'
import { listReadableSignals, listAllTeams } from '@/lib/db/signals'
import type { SignalRow } from '@/lib/db/signals.types'
import { getBusinessUnits, getPeople, getRoles } from '@/lib/db/directory'
import type { RoleScopeRow } from '@/lib/db/directory'
// The tested role-scope predicates remain a live Home seam. The composition helper calls these
// same pure predicates rather than growing a second, drifting idea of who heads a business unit.
import { canReviewCafeFailedChecks, holdsHomeCockpitScope } from '@/lib/home-composition'
import { wibToday, type AttentionItem, type AttentionDirectory } from '@/lib/home-attention'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import {
  overdueStreamItems, dueTodayStreamItems, blockedStreamItems, failedCheckStreamItems,
  myWorkStreamItems, openTaskCount, type StreamBand,
} from '@/lib/home-stream'
import { buildHomeRegions } from '@/components/home/home-regions'
import { HomeHeadCounts, type HomeDayTally } from '@/components/home/home-day-header'
import { HomeDailyBrief } from '@/components/home/home-daily-brief'
import { HomeCafeDoor } from '@/components/home/home-cafe-door'
import { SignalFeedSection } from '@/components/signals/signal-feed-section'
import { HomeObjectivesDoor } from '@/components/home/home-objectives-door'
import { loadHomeCafeDoor, type HomeCafeDoorData } from '@/lib/db/home-cafe'
import { loadHomeObjectiveProgress, type HomeObjectiveProgress } from '@/lib/db/home-objectives'
import { isShipGated } from '@/lib/ship-gate'
import './home-page.css'
import '@/components/signals/signal-feed-section.css'

type FetchState = 'loading' | 'ready' | 'error'

const MY_WORK_CAP = 7

const NO_NAMES: ReadonlyMap<string, string> = new Map()

export function HomePage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('nav.home') }))
  const { locale } = useI18n()
  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  // WIB day-parts per e7's greeting grammar: pagi <11, siang 11-15, sore 15+ (id conventions).
  const greetingKey = () => {
    const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jakarta' }).format(new Date()))
    return h < 11 ? 'home.greeting.morning' as const : h < 15 ? 'home.greeting.afternoon' as const : 'home.greeting.evening' as const
  }
  const personId = viewer?.person?.id ?? null
  // Failed checks are an operational exception, not generic `/cafe/log` route admission. The route
  // is intentionally readable by every authenticated viewer; Home narrows the band to the
  // affiliation fact supplied by auth, with admin as the explicit cross-Café exception.
  const seesCafe = useMemo(
    () => viewer ? canReviewCafeFailedChecks(viewer) : false,
    [viewer])

  // Shared unmount guard for every retryable loader (never setState after unmount). Set true in the
  // effect BODY (not just useRef's initial value) so StrictMode's mount→cleanup→remount cycle doesn't
  // leave loaders believing the page is unmounted forever (a real, observed regression).
  const isMountedRef = useRef(false)
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // ── Tasks (everyone) — the ONE projection behind the overdue/due-today/blocked bands AND the
  // my-work band. Never two independent fetches for the same data. Retry-safe: `tasksInFlightRef`
  // makes a concurrent call a no-op; `tasksTokenRef` invalidates a stale response if the viewer
  // changes mid-fetch (a fresh load always wins).
  const [tasks, setTasks] = useState<TaskListRow[]>([])
  const [taskState, setTaskState] = useState<FetchState>('loading')
  const tasksInFlightRef = useRef(false)
  const tasksTokenRef = useRef(0)

  const loadTasks = useCallback(() => {
    if (!personId || tasksInFlightRef.current) return
    tasksInFlightRef.current = true
    const token = ++tasksTokenRef.current
    setTaskState('loading')
    listTasks({})
      .then(rows => {
        if (!isMountedRef.current || tasksTokenRef.current !== token) return
        setTasks(rows)
        setTaskState('ready')
      })
      .catch(() => {
        if (!isMountedRef.current || tasksTokenRef.current !== token) return
        setTaskState('error')
      })
      .finally(() => {
        if (tasksTokenRef.current === token) tasksInFlightRef.current = false
      })
  }, [personId])

  useEffect(() => {
    tasksTokenRef.current += 1 // a personId change (or mount) always supersedes any prior fetch
    tasksInFlightRef.current = false
    loadTasks()
  }, [loadTasks])

  // ── Failed checks (café rejected logs, RATIFY-3) ──────────────────────────────
  const [failedChecks, setFailedChecks] = useState<AttentionItem[]>([])
  const [failedChecksState, setFailedChecksState] = useState<FetchState>('loading')
  const failedChecksInFlightRef = useRef(false)
  const failedChecksTokenRef = useRef(0)

  const loadFailedChecks = useCallback(() => {
    if (!personId || failedChecksInFlightRef.current) return
    // A viewer the /cafe/log route does NOT admit gets no band at all — an empty ready state, never
    // a deep-link that would bounce them. RLS still owns row visibility.
    // Two independent questions, deliberately answered separately: `seesCafe` (route admission,
    // OD-WAY-51) decides whether the band appears at all; `personId` scopes what is IN it. Reading
    // the ruling as answering both would put other people's rejects in this viewer's count.
    if (!seesCafe || !personId) { setFailedChecks([]); setFailedChecksState('ready'); return }
    failedChecksInFlightRef.current = true
    const token = ++failedChecksTokenRef.current
    setFailedChecksState('loading')
    loadFailedChecksForViewer(personId)
      .then(items => {
        if (!isMountedRef.current || failedChecksTokenRef.current !== token) return
        setFailedChecks(items)
        setFailedChecksState('ready')
      })
      .catch(() => {
        if (!isMountedRef.current || failedChecksTokenRef.current !== token) return
        setFailedChecksState('error')
      })
      .finally(() => {
        if (failedChecksTokenRef.current === token) failedChecksInFlightRef.current = false
      })
  }, [personId, seesCafe])

  useEffect(() => {
    failedChecksTokenRef.current += 1
    failedChecksInFlightRef.current = false
    loadFailedChecks()
  }, [loadFailedChecks])

  // ── Signals (the ambient feed column, #245) ─────────────────────────────────
  // The ONE Signals read on this page; `SignalFeedSection` is presentational and receives the rows,
  // the resolved names and a reload. Same in-flight/token/retry shape as every other loader here,
  // so a stale response from a superseded viewer can never win. Team names ride along in the SAME
  // load: they decorate the rows the load returns, so splitting them into a second effect would let
  // rows paint with a name the page could still fail to fetch.
  const [signals, setSignals] = useState<SignalRow[]>([])
  const [teamNames, setTeamNames] = useState<ReadonlyMap<string, string>>(NO_NAMES)
  const [signalsState, setSignalsState] = useState<FetchState>('loading')
  const signalsInFlightRef = useRef(false)
  const signalsTokenRef = useRef(0)

  const loadSignals = useCallback(() => {
    if (!personId || signalsInFlightRef.current) return
    signalsInFlightRef.current = true
    const token = ++signalsTokenRef.current
    setSignalsState('loading')
    Promise.all([listReadableSignals(), listAllTeams()])
      .then(([rows, teams]) => {
        if (!isMountedRef.current || signalsTokenRef.current !== token) return
        setSignals(rows)
        setTeamNames(new Map(teams.map(team => [team.id, team.name])))
        setSignalsState('ready')
      })
      .catch(() => {
        if (!isMountedRef.current || signalsTokenRef.current !== token) return
        setSignalsState('error')
      })
      .finally(() => {
        if (signalsTokenRef.current === token) signalsInFlightRef.current = false
      })
  }, [personId])

  useEffect(() => {
    signalsTokenRef.current += 1
    signalsInFlightRef.current = false
    loadSignals()
  }, [loadSignals])

  // ── Display directory (Luna J01/J02 decision context) — the SAME shared read the app already
  // uses. Best-effort ENRICHMENT only: decorates task rows with the PIC (Responsible) + owning-BU
  // caption; its absence never blocks or errors a band (rows just render without the meta line).
  // The org role tree rides the SAME read: it answers one question Home asks below (does this
  // viewer steer a scope, and so does the Objectives door earn its place). One shared-schema
  // round trip, not a second effect racing this one.
  const [directory, setDirectory] = useState<AttentionDirectory>({})
  const [orgRoles, setOrgRoles] = useState<RoleScopeRow[]>([])
  useEffect(() => {
    if (!personId) return
    let live = true
    Promise.all([getPeople(), getBusinessUnits(), getRoles()])
      .then(([people, bus, roles]) => {
        if (!live || !isMountedRef.current) return
        setDirectory({
          people: new Map(people.map(p => [p.id, p.full_name])),
          businessUnits: new Map(bus.map(b => [b.id, b.name])),
        })
        setOrgRoles(roles)
      })
      // Enrichment is optional — a failed directory read leaves rows undecorated. It also leaves
      // `orgRoles` empty, so the Objectives door fails CLOSED for a BU-head: an affordance we
      // cannot justify is not offered, rather than offered on a guess.
      .catch(() => { /* see above */ })
    return () => { live = false }
  }, [personId])

  // ── Who the Objectives roll-up door is for (AC-204 (4)) ─────────────────────
  // The people who come to Home to STEER a scope: the owner-director (whole company) and a
  // function owner (the apex role of a business unit). For them "are we moving toward what we
  // committed to" is a standing question, so the door earns its place in the aside beside the
  // ambient feed. A member comes to Home for what needs them TODAY — one door into a
  // company-wide roll-up is noise on that job, so they get none, exactly as the stacked
  // composition gives them no cockpit. One door, gated once: the stacked surface repeated the
  // slot per cockpit section because it renders one section per scope; Home has one aside.
  const holdsCockpitScope = useMemo(
    () => viewer ? holdsHomeCockpitScope(viewer, orgRoles) : false,
    [viewer, orgRoles],
  )

  // ── Ranked stream items (owner redirect) ────────────────────────────────────
  const today = useMemo(() => wibToday(), [])
  const ready = taskState === 'ready'

  // The three task-derived rank bands, in order. All read the SAME `loadTasks` projection, so
  // their loading/error is a single consolidated grammar, never a duplicate fetch/spinner/error.
  const overdue = useMemo(
    () => (ready && personId ? overdueStreamItems(tasks, personId, today, locale, directory) : []),
    [ready, personId, tasks, today, locale, directory])
  const dueToday = useMemo(
    () => (ready && personId ? dueTodayStreamItems(tasks, personId, today, locale, directory) : []),
    [ready, personId, tasks, today, locale, directory])
  const blocked = useMemo(
    () => (ready && personId ? blockedStreamItems(tasks, personId, today, locale, directory) : []),
    [ready, personId, tasks, today, locale, directory])

  // The my-work band = owned open work NOT already surfaced in a task attention band (overdue ∪
  // due-today ∪ blocked ids), off-track first, capped. Shares the one tasks projection.
  const myWork = useMemo(() => {
    if (!ready || !personId) return []
    const excludeIds = new Set<string>([...overdue, ...dueToday, ...blocked].map(i => i.id))
    return myWorkStreamItems(tasks, personId, today, locale, directory, excludeIds).slice(0, MY_WORK_CAP)
  }, [ready, personId, tasks, today, locale, directory, overdue, dueToday, blocked])

  // ── Member Café door ────────────────────────────────────────────────────────
  // The door is only a member composition affordance. It reads the viewer's real primary stream
  // and today's existing run; it never starts a process as a side effect of visiting Home.
  const cafeMember = Boolean(viewer && !holdsCockpitScope && viewer.affiliated.includes('cafe'))
  const [cafeDoor, setCafeDoor] = useState<HomeCafeDoorData | null>(null)
  const [cafeDoorState, setCafeDoorState] = useState<FetchState>('ready')
  const cafeDoorInFlightRef = useRef(false)
  const cafeDoorTokenRef = useRef(0)

  const loadCafeDoor = useCallback(() => {
    if (!personId || !cafeMember) {
      setCafeDoor(null)
      setCafeDoorState('ready')
      return
    }
    if (cafeDoorInFlightRef.current) return
    cafeDoorInFlightRef.current = true
    const token = ++cafeDoorTokenRef.current
    setCafeDoorState('loading')
    loadHomeCafeDoor(personId)
      .then(data => {
        if (!isMountedRef.current || cafeDoorTokenRef.current !== token) return
        setCafeDoor(data)
        setCafeDoorState('ready')
      })
      .catch(() => {
        if (!isMountedRef.current || cafeDoorTokenRef.current !== token) return
        setCafeDoorState('error')
      })
      .finally(() => {
        if (cafeDoorTokenRef.current === token) cafeDoorInFlightRef.current = false
      })
  }, [personId, cafeMember])

  useEffect(() => {
    cafeDoorTokenRef.current += 1
    cafeDoorInFlightRef.current = false
    loadCafeDoor()
  }, [loadCafeDoor])

  // ── Objectives cockpit door ─────────────────────────────────────────────────
  // Home reuses the task projection already in flight, then reads only the active Objective and
  // Work-line edges needed to resolve each task to its Objective. No percentage or target is
  // invented; an empty catalog and a read failure remain distinct states.
  const showObjectives = holdsCockpitScope && !isShipGated('/work/objectives')
  const [objectiveRows, setObjectiveRows] = useState<HomeObjectiveProgress[]>([])
  const [objectiveReadState, setObjectiveReadState] = useState<FetchState>('ready')
  const objectiveInFlightRef = useRef(false)
  const objectiveTokenRef = useRef(0)

  const loadObjectives = useCallback(() => {
    if (!personId || !showObjectives || taskState !== 'ready') {
      if (!showObjectives) {
        setObjectiveRows([])
        setObjectiveReadState('ready')
      }
      return
    }
    if (objectiveInFlightRef.current) return
    objectiveInFlightRef.current = true
    const token = ++objectiveTokenRef.current
    setObjectiveReadState('loading')
    loadHomeObjectiveProgress(tasks)
      .then(rows => {
        if (!isMountedRef.current || objectiveTokenRef.current !== token) return
        setObjectiveRows(rows)
        setObjectiveReadState('ready')
      })
      .catch(() => {
        if (!isMountedRef.current || objectiveTokenRef.current !== token) return
        setObjectiveReadState('error')
      })
      .finally(() => {
        if (objectiveTokenRef.current === token) objectiveInFlightRef.current = false
      })
  }, [personId, showObjectives, taskState, tasks])

  useEffect(() => {
    objectiveTokenRef.current += 1
    objectiveInFlightRef.current = false
    loadObjectives()
  }, [loadObjectives])

  const objectivesState: FetchState = !showObjectives
    ? 'ready'
    : taskState === 'error'
      ? 'error'
      : taskState === 'loading'
        ? 'loading'
        : objectiveReadState
  const retryObjectives = taskState === 'error' ? loadTasks : loadObjectives

  // Failed-checks keeps its OWN independent fetch state (separate DAL).
  const failedChecksBand: StreamBand = useMemo(() => ({
    kind: 'failed-checks', state: failedChecksState,
    items: failedChecksState === 'ready' ? failedCheckStreamItems(failedChecks) : [],
    onRetry: loadFailedChecks,
  }), [failedChecksState, failedChecks, loadFailedChecks])
  // ONE muted meta line beside the greeting (the shared workspace-head `.ch-meta-line` grammar):
  // the viewer's role identity — which is what makes a cross-BU brief legible as the stacked union
  // of the roles they hold. This replaces the separate full-width subtitle line, whose only content
  // was that same role string; the decorative "Your week at a glance" fallback for a role-less
  // viewer is dropped rather than restyled (it stated nothing).
  const roleLabel = viewer && viewer.roles.length > 0
    ? viewer.roles[0].name + (viewer.roles.length > 1 ? ` +${viewer.roles.length - 1}` : '')
    : null

  // Day and role share one compact meta line beside the greeting. The replacement's first content
  // block is the attention queue; no layout selector or date-only chrome sits between orientation
  // and work.
  const headMeta = (
    <span className="home-head-meta">
      <span className="ch-meta-line home-head-date">{formatWeekdayDayMonth(today, locale)}</span>
      {roleLabel && <span className="ch-meta-line home-head-role">{roleLabel}</span>}
    </span>
  )

  // The viewer's FULL open-task count (all owned, non-Done tasks — not just the capped my-work
  // items rendered in the region) — feeds the restored "My open tasks · N →" drill link.
  const openCount = ready && personId ? openTaskCount(tasks, personId) : 0

  // The one region model feeds the daily brief. needs-you and my-work share the ONE tasks
  // projection + retry (DIV-G5); failed-checks carries its own.
  const regions = useMemo(
    () => buildHomeRegions({
      overdue, dueToday, blocked, myWork,
      failedChecks: failedChecksBand.items,
      taskState, onRetryTasks: loadTasks,
      failedChecksState: failedChecksBand.state, onRetryFailedChecks: loadFailedChecks,
      myWorkFullCount: ready ? openCount : undefined,
    }),
    [
      overdue, dueToday, blocked, myWork, failedChecksBand,
      taskState, loadTasks, loadFailedChecks, ready, openCount,
    ],
  )

  // ── The day's tally behind the header ──────────────────────────────────────────────────────
  // `left` only — the sum of the SAME region counts rendered a few pixels below it, so the number
  // reconciles with what the viewer can see. No new data read, and no `done`: nothing in the app
  // records WHEN work was handled, so a "handled" figure would be invented (ruling #6 — drop the
  // tally and its track, keep `N left`). The `done?` input stays a REAL option: a future source
  // (e.g. a `completed_at`) may supply it, and the tally then reads `N handled · N left`.
  //
  // Null — never a partial total — the moment ANY region count is null, i.e. any read behind it
  // has not succeeded (DIV-G5). A header that adds up the reads that happened to land would state
  // a figure the viewer cannot trace, which is exactly the defect the region counts were fixed
  // for: absent, not zero.
  const tally = useMemo<HomeDayTally | null>(() => {
    if (!personId) return null
    let left = 0
    const visibleRegions = holdsCockpitScope
      ? regions
      : regions.filter((region) => region.id !== 'failed-checks')
    for (const region of visibleRegions) {
      if (region.count === null) return null
      left += region.count
    }
    return { left }
  }, [personId, regions, holdsCockpitScope])

  return (
    <PageFamilyFrame
      family="workspace"
      surfaceWash
      title={viewer ? t(greetingKey(), { name: viewer.person.full_name.split(' ')[0] }) : t('home.title')}
      // No `jobSentence`: the day header is greeting + role chip + tally, one line — its answer
      // to "what is this page for right now" is the tally itself. A sentence here would be the
      // third line the header was just cut back from (ruling #6).
      meta={headMeta}
      action={<HomeHeadCounts tally={tally} />}
      // One line at every width (guard-home-day-header.css.test.ts pins the wrap): `--compact`
      // is the shared head grammar's stepped-down-title + phone-inline-meta mode — the winning
      // mockup's greeting rung (`--fs-md` = subheading) and the rule that keeps the chip beside
      // the greeting until the ≤390 block in home-page.css drops it to line 2.
      headClassName="home-day-header content-header--compact"
    >
      {/* Keep a stable frame around the replacement so the Home surface owns its wide measure while
          the daily brief's own container queries respond to the content width. */}
      <div className="home-frame">{(() => {
        // The feed states no count of its own — nothing beside it can read as a confident 0 while
        // the read is still out (the same rule the region counts follow, DIV-G5). `error` routes to
        // the section's ErrorState + Retry, so a failed load never reads as "No Signals yet".
        // Author names come from the shared best-effort directory: a missing name leaves a row
        // undecorated, it never blocks or errors the feed.
        // The Signals feed is the ambient companion. Home rows remain read-only; Create task and
        // categorization are record-level actions on /work/signals.
        const aside = (
          <div>
            <SignalFeedSection
              signals={signals}
              authorNamesById={directory.people ?? NO_NAMES}
              teamNamesById={teamNames}
              showSearch={false}
              loading={signalsState === 'loading'}
              error={signalsState === 'error'}
              onReload={loadSignals}
            />
          </div>
        )
        const objectives = showObjectives ? (
          <HomeObjectivesDoor
            state={objectivesState}
            rows={objectiveRows}
            onRetry={retryObjectives}
          />
        ) : null
        const cafe = cafeMember ? (
          <HomeCafeDoor state={cafeDoorState} data={cafeDoor} onRetry={loadCafeDoor} />
        ) : null
        return (
          <HomeDailyBrief
            regions={regions}
            feed={aside}
            objectives={objectives}
            cafeDoor={cafe}
            composition={holdsCockpitScope ? 'cockpit' : 'member'}
            showFailedChecks={seesCafe}
          />
        )
      })()}</div>
    </PageFamilyFrame>
  )
}
