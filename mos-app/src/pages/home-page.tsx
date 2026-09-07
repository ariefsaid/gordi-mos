// HomePage — the index route (/). Home is persona-composed from the ONE region model (#759,
// OD-WAY-93 (3)): `composeHome` picks a member arm (capture-first: the viewer's Module capture
// door, a `needs-you` band, and a search-less Signals tail) or a lead+ arm (cockpit: Focused
// tabs over needs-you / my-work / failed-checks?, an Objectives roll-up door, and Signals). The
// arrangement (Focused / Overview / List, OD-V4-9) chooses how the lead arm PRESENTS those
// regions; it never re-derives them. Mentions are not a Home region — Inbox owns them (#745).
// HomePage owns every data read on this line and hands regions + doors + feed down as
// presentation (FR-V3-013 — the Signal feed is the same shared read the region model uses).
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { can } from '@/lib/capabilities'
import { canCaptureCafe } from '@/lib/cafe-affiliation'
import { useDocumentTitle } from '@/shell/use-document-title'
import { listTasks } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { loadFailedChecksForViewer } from '@/lib/db/home-attention-data'
import { listReadableSignals, listAllTeams } from '@/lib/db/signals'
import type { SignalRow } from '@/lib/db/signals.types'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
// #759: the org-role tree fed the pre-#759 "does this viewer steer a scope" predicate. Home now
// composes per persona from `isManager` + manage capability (composeHome), so the role-chain read
// and its `orgRoles` state are dropped — one fewer round trip on the index route, and the
// Objectives door decision no longer waits on it.
import { wibToday, type AttentionItem, type AttentionDirectory } from '@/lib/home-attention'
import {
  overdueStreamItems, dueTodayStreamItems, blockedStreamItems, failedCheckStreamItems,
  myWorkStreamItems, openTaskCount, type StreamBand,
} from '@/lib/home-stream'
import { resolveHomeLayout, type HomeLayout } from '@/lib/home-layout'
import { buildHomeRegions } from '@/components/home/home-regions'
import { composeHome } from '@/components/home/home-composition'
import { HomeHeadCounts, type HomeDayTally } from '@/components/home/home-day-header'
import { HomeFocused } from '@/components/home/home-focused'
import { HomeOverview } from '@/components/home/home-overview'
import { HomeList } from '@/components/home/home-list'
import { HomeMember } from '@/components/home/home-member'
import { SignalFeedSection } from '@/components/signals/signal-feed-section'
import { MEMBER_AMBIENT_CAP } from '@/components/signals/signal-feed-rows'
import { signalTaskCreateHref } from '@/components/signals/signal-task-intent'
import { HomeObjectivesDoor } from '@/components/home/home-objectives-door'
import { HomeCafeDoor } from '@/components/home/home-cafe-door'
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
  // The failed-checks band routes to /cafe/log, so Home shows it exactly where that ROUTE admits the
  // viewer — the same authority the rail uses (`OD-WAY-51`: navigation mirrors what the route
  // admits). Home is the one instance the nav guard structurally cannot cover, because it is not
  // nav. This replaces `viewerSeesCafe`, which decided by regex over job-role NAME strings — the
  // mechanism OD-WAY-51 removed after measuring that 5 of 10 real job roles matched no module at
  // all, leaving viewers the route fully admitted with no signal.
  const seesCafe = viewer != null && (viewer.accessRoles.includes('admin') || viewer.affiliated.includes('cafe'))

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
  const [teamBusinessUnits, setTeamBusinessUnits] = useState<ReadonlyMap<string, string>>(NO_NAMES)
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
        setTeamBusinessUnits(new Map(teams.map(team => [team.id, team.business_unit_id])))
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
  const [directory, setDirectory] = useState<AttentionDirectory>({})
  useEffect(() => {
    if (!personId) return
    let live = true
    Promise.all([getPeople(), getBusinessUnits()])
      .then(([people, bus]) => {
        if (!live || !isMountedRef.current) return
        setDirectory({
          people: new Map(people.map(p => [p.id, p.full_name])),
          businessUnits: new Map(bus.map(b => [b.id, b.name])),
        })
      })
      // Enrichment is optional — a failed directory read leaves rows undecorated (rows just render
      // without the meta line).
      .catch(() => { /* see above */ })
    return () => { live = false }
  }, [personId])

  // ── Persona-composed Home (#759, AC-080) ───────────────────────────────────
  // Home composes per persona from the ONE region model: a member (no reports, no manage
  // capability) gets the capture-first plan (cafe-door → needs-you → signals-no-search); a lead+
  // gets the cockpit (tabs + Objectives door + Signals). The plan is decided by `composeHome`
  // (home-composition.ts) — one pure rule, unit-tested against every persona arm; the page
  // dispatches the rendering off it. `isManager`/access roles arrive on the viewer already —
  // `orgRoles` used to be a second predicate for the Objectives door here (owner-director or a
  // BU apex from the role chain), but the composition now folds that into `isManager` +
  // manage-capability so the whole decision is one call.
  const composition = useMemo(() => composeHome({
    isManager: viewer?.isManager ?? false,
    canManageObjectives: can(viewer?.accessRoles ?? [], 'objective.manage'),
    canManageWorkLines: can(viewer?.accessRoles ?? [], 'workline.manage'),
    canCaptureCafe: viewer ? canCaptureCafe(viewer) : false,
    seesCafeChecks: seesCafe,
  }), [viewer, seesCafe])

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

  // The role chip — the day header's ONLY meta (DESIGN.md § Components → Home arrangements →
  // "Home day header"). The overline rung + relaxed nowrap it needs live on `.home-head-role`
  // in home-page.css; the wrap behaviour comes from the shared head grammar, not from markup.
  const headMeta = roleLabel
    ? <span className="ch-meta-line home-head-role">{roleLabel}</span>
    : null

  // ── Home layout preference (OD-V4-9) — resolved LAZILY at first render (FR-921/924, #301):
  // initializing to 'focused' and correcting in a post-mount effect painted one wrong frame for
  // every viewer with a stored non-default arrangement. The initializer reads the store before
  // the first paint; the effect stays only for the person CHANGING after mount (auth resolving
  // late, or a mid-session viewer switch), where it re-resolves that person's stored choice.
  const [layout, setLayout] = useState<HomeLayout>(() =>
    personId ? resolveHomeLayout(personId) : 'focused')
  useEffect(() => {
    if (personId) setLayout(resolveHomeLayout(personId))
  }, [personId])

  // The viewer's FULL open-task count (all owned, non-Done tasks — not just the capped my-work
  // items rendered in the region) — feeds the restored "My open tasks · N →" drill link.
  const openCount = ready && personId ? openTaskCount(tasks, personId) : 0

  // The ONE region model — persona-composed (#759, AC-080). A layout chooses how to PRESENT
  // whatever regions the composition returned, never which of them exist (NFR-924 parity). A
  // MEMBER carries only `needs-you`, and no `my-work`/`failed-checks` (their assigned work IS the
  // needs-you band, no reports to review), so `myWorkFullCount` is withheld — the member's
  // needs-you drills to the same view either way and its label is a number the region should not
  // borrow from a role it does not have. A LEAD keeps the cockpit region set the layouts have
  // always carried. needs-you and my-work share the ONE tasks-projection state + retry (DIV-G5);
  // failed-checks carries its own.
  const memberComposition = composition.kind === 'member'
  const regions = useMemo(
    () => buildHomeRegions({
      overdue, dueToday, blocked,
      myWork: memberComposition ? [] : myWork,
      failedChecks: memberComposition ? [] : failedChecksBand.items,
      failedChecksAdmitted: composition.failedChecksAdmitted,
      taskState, onRetryTasks: loadTasks,
      failedChecksState: failedChecksBand.state, onRetryFailedChecks: loadFailedChecks,
      myWorkFullCount: memberComposition ? undefined : (ready ? openCount : undefined),
    }),
    [
      overdue, dueToday, blocked, myWork, failedChecksBand,
      taskState, loadTasks, loadFailedChecks, ready, openCount,
      composition.failedChecksAdmitted, memberComposition,
    ],
  )
  // A member's Home carries only `needs-you` in the region list; the composition drops
  // `my-work` and `failed-checks` (a member has no reports to review, and their assigned work IS
  // the needs-you band). Overview/List/Focused for a member all render the SAME single region
  // (AC-086 parity), rather than a lonely single tab or a lonely single tile — the member layout
  // below stacks the band directly, with no tab strip and no tile chrome (AC-081 "no tabs").
  const composedRegions = useMemo(
    () => memberComposition ? regions.filter((r) => r.id === 'needs-you') : regions,
    [memberComposition, regions],
  )
  const needsYouRegion = composedRegions.find((r) => r.id === 'needs-you')

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
    for (const region of composedRegions) {
      if (region.count === null) return null
      left += region.count
    }
    return { left }
  }, [personId, composedRegions])

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
      {/* `.home-frame` exists for ONE reason: it is the inline-size container every arrangement's
          responsive branch is measured against (FR-932 / NFR-923 / DESIGN.md § Layout → The
          Container-Query Rule). The person's chosen Home layout (OD-V4-9) — Focused (default),
          Overview or List. All three render the SAME regions + the SAME feed slot; only the
          arrangement differs (NFR-924). */}
      <div className="home-frame">{(() => {
        // The feed states no count of its own — nothing beside it can read as a confident 0 while
        // the read is still out (the same rule the region counts follow, DIV-G5). `error` routes to
        // the section's ErrorState + Retry, so a failed load never reads as "No Signals yet".
        // Author names come from the shared best-effort directory: a missing name leaves a row
        // undecorated, it never blocks or errors the feed.
        //
        // The Signals feed is a STANDING column in every persona composition (AC-082: "same bands
        // in the work column, Signals column beside"). Its shape differs per persona through the
        // `showSearch` prop the composition supplies: a member's ambient tail carries the Share
        // door only (D-D2, the ticket's `signals-no-search`); a lead's cockpit keeps search too.
        const signalFeed = (
          <SignalFeedSection
            signals={signals}
            authorNamesById={directory.people ?? NO_NAMES}
            teamNamesById={teamNames}
            createTaskHref={(signal) => {
              const businessUnitId = teamBusinessUnits.get(signal.owning_team_id)
              return personId && businessUnitId
                ? signalTaskCreateHref(signal, businessUnitId, personId)
                : undefined
            }}
            loading={signalsState === 'loading'}
            error={signalsState === 'error'}
            onReload={loadSignals}
            showSearch={composition.signalsSearch}
            {...(composition.kind === 'member' ? { cap: MEMBER_AMBIENT_CAP } : {})}
          />
        )

        // Member composition (#759, AC-081/082): capture-first stack — Café door (when
        // affiliated) → Needs you now (as a plain band, NO tabs, no Objectives door, no Failed
        // checks) → Signals with `Share a Signal` only. HomeMember renders the two work bands
        // stacked, and the Signals feed sits in the aside column (`.home-layout`'s standing
        // Signals track carries it in every arrangement, including this one).
        if (composition.kind === 'member') {
          return (
            <HomeMember
              needsYou={needsYouRegion ?? null}
              cafeDoor={composition.cafeDoor && viewer != null ? <HomeCafeDoor /> : null}
              feed={signalFeed}
            />
          )
        }

        // Cockpit (lead+): the three arrangements as before. The standing aside carries the
        // Objectives door above the Signals feed. ONE aside node, because `.home-layout` is a
        // two-column grid and a second child here would drop out of the aside track into the
        // work column's next row. The feed's own 24px group seam (signal-feed-section.css,
        // DO-16(d)) separates the two — no new spacing rule.
        const aside = (
          <div>
            {/* #444: the door is the drill into /work/objectives, so it follows that path's ship
                gate — asked through the SAME predicate the router and the rail ask, never a
                second hardcoded check. Hiding the destination without hiding this leaves a
                headed band whose only control forwards home: a dead end dressed as a finished
                section. The aside is a single stacked node, so its absence closes up rather than
                leaving a hole — the Signals feed simply starts at the top of the column. */}
            {composition.objectivesDoor && !isShipGated('/work/objectives') && <HomeObjectivesDoor />}
            {signalFeed}
          </div>
        )
        if (layout === 'overview') return <HomeOverview regions={composedRegions} feed={aside} />
        if (layout === 'list') return <HomeList regions={composedRegions} feed={aside} />
        return <HomeFocused regions={composedRegions} feed={aside} />
      })()}</div>
    </PageFamilyFrame>
  )
}
