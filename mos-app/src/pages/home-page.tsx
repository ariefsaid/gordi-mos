// HomePage — the index route (/). Home renders the SAME consequence-ranked task data —
// overdue → due today → blocked, failed checks, mentions, and my work today — in whichever of the
// three Home layouts (Focused / Overview / List) the viewer has chosen from /profile (OD-V4-9).
// HomePage owns every data read + the ranking/selection logic and hands the result down as the ONE
// shared region model (`buildHomeRegions`, FR-930) — a layout composes those regions, it never
// re-derives them. The OD-18 region-order toggle that used to reorder the old single-stream layout
// was retired (OD-V4-10): List renders the same attention-first order that was already the default.
//
// This is presentation over the EXISTING data contracts: the same tasks/notifications/failed-check
// projections and lane logic (lib/home-attention + lib/home-stream selectors) — no new data path.
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
import { viewerAdmittedToRoute } from '@/shell/destinations'
import { useDocumentTitle } from '@/shell/use-document-title'
import { listTasks } from '@/lib/db/tasks'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { listNotifications } from '@/lib/db/notifications'
import type { NotificationRow } from '@/lib/db/notifications'
import { loadFailedChecksForViewer, CAFE_LOG_ROUTE } from '@/lib/db/home-attention-data'
import { listReadableSignals, listAllTeams } from '@/lib/db/signals'
import type { SignalRow } from '@/lib/db/signals.types'
import { getBusinessUnits, getPeople, getRoles } from '@/lib/db/directory'
import type { RoleScopeRow } from '@/lib/db/directory'
// The tested role-scope predicates (pure, no I/O). Home asks them the SAME question the role tree
// answers everywhere else — "does this viewer steer a scope" — rather than growing a second,
// drifting idea of who heads a business unit.
import { isOwnerDirector, buHeadsForViewer } from '@/lib/home-stack'
import { unreadMentions, wibToday, type AttentionItem, type AttentionDirectory } from '@/lib/home-attention'
import {
  overdueStreamItems, dueTodayStreamItems, blockedStreamItems, failedCheckStreamItems,
  mentionStreamItems, myWorkStreamItems, openTaskCount, handledTodayCount, type StreamBand,
} from '@/lib/home-stream'
import { dayRotation } from '@/lib/home-day-state'
import { resolveHomeLayout, type HomeLayout } from '@/lib/home-layout'
import { buildHomeRegions } from '@/components/home/home-regions'
import {
  HomeHeadCounts, HomeHeadState, type HomeDayTally,
} from '@/components/home/home-day-header'
import { HomeFocused } from '@/components/home/home-focused'
import { HomeOverview } from '@/components/home/home-overview'
import { HomeList } from '@/components/home/home-list'
import { SignalFeedSection } from '@/components/signals/signal-feed-section'
import { HomeObjectivesDoor } from '@/components/home/home-objectives-door'
import { HelpTip } from '@/components/ui/help-tip'
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
  const seesCafe = useMemo(
    () => viewerAdmittedToRoute(CAFE_LOG_ROUTE, viewer?.accessRoles ?? []),
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

  // ── Notifications (mentions band) — reuses Inbox's own "what asked for me" read ──
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [notificationsState, setNotificationsState] = useState<FetchState>('loading')
  const notificationsInFlightRef = useRef(false)
  const notificationsTokenRef = useRef(0)

  const loadNotifications = useCallback(() => {
    if (!personId || notificationsInFlightRef.current) return
    notificationsInFlightRef.current = true
    const token = ++notificationsTokenRef.current
    setNotificationsState('loading')
    listNotifications()
      .then(rows => {
        if (!isMountedRef.current || notificationsTokenRef.current !== token) return
        setNotifications(rows)
        setNotificationsState('ready')
      })
      .catch(() => {
        if (!isMountedRef.current || notificationsTokenRef.current !== token) return
        setNotificationsState('error')
      })
      .finally(() => {
        if (notificationsTokenRef.current === token) notificationsInFlightRef.current = false
      })
  }, [personId])

  useEffect(() => {
    notificationsTokenRef.current += 1
    notificationsInFlightRef.current = false
    loadNotifications()
  }, [loadNotifications])

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
  const holdsCockpitScope = useMemo(() => {
    const heldRoles = viewer?.roles ?? []
    return isOwnerDirector(heldRoles) || buHeadsForViewer(heldRoles, orgRoles).length > 0
  }, [viewer, orgRoles])

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

  // Failed-checks + mentions keep their OWN independent fetch state (separate DALs).
  const failedChecksBand: StreamBand = useMemo(() => ({
    kind: 'failed-checks', state: failedChecksState,
    items: failedChecksState === 'ready' ? failedCheckStreamItems(failedChecks) : [],
    onRetry: loadFailedChecks,
  }), [failedChecksState, failedChecks, loadFailedChecks])
  const mentionsBand: StreamBand = useMemo(() => ({
    kind: 'mentions', state: notificationsState,
    items: notificationsState === 'ready' ? mentionStreamItems(unreadMentions(notifications)) : [],
    onRetry: loadNotifications,
  }), [notificationsState, notifications, loadNotifications])

  // ONE muted meta line beside the greeting (the shared workspace-head `.ch-meta-line` grammar):
  // the viewer's role identity — which is what makes a cross-BU brief legible as the stacked union
  // of the roles they hold. This replaces the separate full-width subtitle line, whose only content
  // was that same role string; the decorative "Your week at a glance" fallback for a role-less
  // viewer is dropped rather than restyled (it stated nothing).
  const roleLabel = viewer && viewer.roles.length > 0
    ? viewer.roles[0].name + (viewer.roles.length > 1 ? ` +${viewer.roles.length - 1}` : '')
    : null

  // H10 fix (design audit, 2026-07-28): the "?" HelpTip always rides beside the role meta line
  // (never conditional on it) — it explains the attention bands regardless of whether a role
  // label happens to be present this render.
  const headMeta = (
    <>
      {roleLabel && (
        <span className="ch-meta-line home-head-meta">
          {roleLabel}
        </span>
      )}
      <HelpTip label={t('home.help')} />
    </>
  )

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

  // The ONE region model shared by all three arrangements (FR-930) — a layout chooses how to
  // present these regions, never which of them exist (NFR-924 parity). needs-you and my-work share
  // the ONE tasks-projection state + retry (DIV-G5); failed-checks/mentions carry their own.
  const regions = useMemo(
    () => buildHomeRegions({
      overdue, dueToday, blocked, myWork,
      failedChecks: failedChecksBand.items, mentions: mentionsBand.items,
      taskState, onRetryTasks: loadTasks,
      failedChecksState: failedChecksBand.state, onRetryFailedChecks: loadFailedChecks,
      mentionsState: mentionsBand.state, onRetryMentions: loadNotifications,
      myWorkFullCount: ready ? openCount : undefined,
    }),
    [
      overdue, dueToday, blocked, myWork, failedChecksBand, mentionsBand,
      taskState, loadTasks, loadFailedChecks, loadNotifications, ready, openCount,
    ],
  )

  // ── The day's tally behind the header (mockup home-priority-2026-07-28 `.hdr`) ───────────────
  // NO new data read: `left` is the sum of the SAME region counts rendered a few pixels below it
  // (so the number reconciles with what the viewer can see), and `done` comes off the tasks
  // projection Home already fetched.
  //
  // Null — never a partial total — the moment ANY region count is null, i.e. any read behind it
  // has not succeeded (DIV-G5). A header that adds up the reads that happened to land would state
  // a figure the viewer cannot trace, which is exactly the defect the region counts were fixed
  // for: absent, not zero.
  const tally = useMemo<HomeDayTally | null>(() => {
    if (!personId) return null
    let left = 0
    for (const region of regions) {
      if (region.count === null) return null
      left += region.count
    }
    return { done: handledTodayCount(tasks, personId, today), left }
  }, [personId, regions, tasks, today])

  return (
    <PageFamilyFrame
      family="workspace"
      surfaceWash
      title={viewer ? t(greetingKey(), { name: viewer.person.full_name.split(' ')[0] }) : t('home.title')}
      // No `jobSentence`: this head carries a `statusRow`, and PageHead renders one or the other,
      // never both. The live state line answers "what is this page for right now" better than the
      // static registry sentence, which on Home only re-asked the question. Passing a sentence
      // that is guaranteed to be discarded is a comment pretending to be code.
      meta={headMeta}
      // `N handled - N left`, right-aligned on the title row; the state line + progress track on
      // the row below it. Both live INSIDE the one shared header block, so every arrangement
      // inherits the identical header (it sits above them).
      action={<HomeHeadCounts tally={tally} />}
      statusRow={<HomeHeadState tally={tally} rotation={dayRotation(today)} />}
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
        // The standing aside: the Objectives door (cockpit-scope viewers only) above the ambient
        // Signals feed. ONE node, because `.home-layout` is a two-column grid and a second child
        // here would drop out of the aside track into the work column's next row. The feed's own
        // 24px group seam (signal-feed-section.css, DO-16(d)) separates the two — no new spacing
        // rule. Both arrive through the arrangements' existing `feed` slot, so all three
        // arrangements inherit the identical aside and none can grow its own (NFR-924).
        const aside = (
          <div>
            {holdsCockpitScope && <HomeObjectivesDoor />}
            <SignalFeedSection
              signals={signals}
              authorNamesById={directory.people ?? NO_NAMES}
              teamNamesById={teamNames}
              loading={signalsState === 'loading'}
              error={signalsState === 'error'}
              onReload={loadSignals}
            />
          </div>
        )
        if (layout === 'overview') return <HomeOverview regions={regions} feed={aside} />
        if (layout === 'list') return <HomeList regions={regions} feed={aside} />
        return <HomeFocused regions={regions} feed={aside} />
      })()}</div>
    </PageFamilyFrame>
  )
}
