/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  useLocation,
  useNavigate,
  useNavigationType,
  type Location,
  type To,
} from 'react-router-dom'
import { RecordPanelHost } from './record-panel-host'
import {
  historyDeltaForClose,
  readOverlayMarker,
  withOverlayMarker,
  type OverlayEntrySummary,
  type OverlayHistoryMarker,
  type OverlayLeaveDecision,
  type OverlayLeaveGuard,
  type OverlayLeaveIntent,
  type OverlayLeaveRequest,
  type OverlayOwner,
  type OverlayTransitionResult,
} from './overlay-navigation'

// V3 Issue 4 — the ONE shared overlay controller. It owns the active session, the internal
// linked-record stack, the no-double-panel invariant, and the single domain-neutral
// asynchronous leave-guard transaction. Every leave-like action (Close, Escape, internal
// Back, root/current replacement, related-record push, page promotion, browser Back/Forward)
// flows through one `requestLeave(intent, commit)` path: a clean entry commits synchronously;
// a guarded entry awaits its tenant-owned `leaveGuard(intent)` and either commits (allow) or
// leaves the frame and focus in place (deny). Repeated actions while a request is pending
// coalesce onto the one in-flight Promise so the guard is never invoked twice for the same
// transition.
//
// The controller stores React content only at the presentation boundary. It owns NO domain
// dirty state, Deputy state, notification data, or confirmation copy — those belong to the
// active tenant's `leaveGuard`.
//
// ROUTE SEAM (R-T-4): the controller now mirrors the active session into the browser URL via
// serializable `__mosOverlay` history markers (route mode only; ephemeral mode has no URL).
// `openRoot(_, 'route')` / `push` push markers; `back` / `close` pop them with one
// deterministic delta (`historyDeltaForClose`); `openPage(to)` navigates to the canonical page.
// A browser-initiated Back/Forward (POP) runs the SAME guarded transaction as an explicit
// action: a clean entry simply re-syncs the session to the marker depth; a guarded entry is
// first restored to its pre-pop URL (so the dirty draft stays visible), then the
// `browser-pop` intent is consulted — deny leaves the URL/marker/frame in place, allow commits
// the session change and lands on the target. The one-use approval is the natural coalescing
// of `requestLeave`: once the in-flight request resolves, `pendingLeave` clears and the very
// next transition re-guards. Programmatic history moves (`programmaticGo`) carry a suppress
// flag so the POP they cause is not re-interpreted as a user gesture; and because the session
// is always committed to match the target marker BEFORE the move lands, the marker-sync effect
// self-stabilizes even without the flag.

export type OverlayTenant = 'record' | 'deputy' | 'quick'

/**
 * Abstraction over the browser history's index + relative navigation, so router POP tests can
 * be deterministic. Production defaults to `window.history.state.idx` / `window.history.go`;
 * react-router-backed mounts pass a driver wired to `useNavigate`.
 */
export type OverlayHistoryDriver = {
  index: () => number | null
  go: (delta: number) => void
}

/**
 * Restores an in-memory session from a deep-linked URL marker (hard load / fresh arrival on a
 * URL carrying `__mosOverlay`). The resolver is tenant-supplied (it owns the React content for
 * its entryKey); the controller only reads the marker and opens whatever entry the resolver
 * returns. `ephemeral` markers never deep-link (Deputy/quick have no canonical URL).
 */
export type OverlayDeepLinkResolver = (
  marker: OverlayHistoryMarker,
  location: Location,
) => OverlayEntry | null

export type OverlayEntry = {
  key: string
  owner: OverlayOwner
  tenant: OverlayTenant
  label: string
  title?: ReactNode
  pageTo?: To
  content: ReactNode
  leaveGuard?: OverlayLeaveGuard
}

export type OverlayFrame = {
  entry: OverlayEntry
  returnFocus: HTMLElement | null
}

// Internal frame carries the optional route marker so a dirty browser-pop can report its
// `from` marker and a forward-restore can recover the cached frame. It is structurally
// compatible with the public `OverlayFrame` (the marker is extra, non-public data).
type HostFrame = OverlayFrame & { marker?: OverlayHistoryMarker }

export type OverlaySession = {
  id: string
  mode: 'route' | 'ephemeral'
  frames: readonly OverlayFrame[]
}

export type OverlayHostApi = {
  session: OverlaySession | null
  pendingLeave: OverlayLeaveRequest | null
  openRoot: (
    entry: OverlayEntry,
    mode: OverlaySession['mode'],
  ) => Promise<OverlayTransitionResult>
  replaceRoot: (entry: OverlayEntry) => Promise<OverlayTransitionResult>
  push: (entry: OverlayEntry) => Promise<OverlayTransitionResult>
  replaceCurrent: (entry: OverlayEntry) => Promise<OverlayTransitionResult>
  back: () => Promise<OverlayTransitionResult>
  close: (via?: 'explicit-close' | 'escape') => Promise<OverlayTransitionResult>
  openPage: (to: To) => Promise<OverlayTransitionResult>
}

const COMMITTED: OverlayTransitionResult = { status: 'committed' }
const DENIED: OverlayTransitionResult = { status: 'denied' }

const OverlayHostContext = createContext<OverlayHostApi | null>(null)

let idCounter = 0
function createId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function captureFocus(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return (document.activeElement as HTMLElement | null) ?? null
}

function summarize(entry: OverlayEntry): OverlayEntrySummary {
  return { key: entry.key, owner: entry.owner }
}

function makeFrame(entry: OverlayEntry, marker?: OverlayHistoryMarker): HostFrame {
  return { entry, returnFocus: captureFocus(), marker }
}

function defaultIndex(): number | null {
  if (typeof window === 'undefined' || !window.history || !window.history.state) return null
  const idx = (window.history.state as { idx?: unknown }).idx
  return typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 ? idx : null
}

export function OverlayHostProvider({
  children,
  historyDriver,
  deepLinkResolver,
}: {
  children: ReactNode
  historyDriver?: OverlayHistoryDriver
  deepLinkResolver?: OverlayDeepLinkResolver
}): ReactElement {
  const [session, setSession] = useState<OverlaySession | null>(null)
  const [pendingLeave, setPendingLeave] = useState<OverlayLeaveRequest | null>(null)

  // Synchronous mirrors so a rapid same-tick sequence of API calls (and the coalescing
  // guard closure) always reads the freshly committed state, not stale React state.
  const sessionRef = useRef<OverlaySession | null>(null)
  const inFlightRef = useRef<Promise<OverlayTransitionResult> | null>(null)

  // Route-seam state.
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const suppressPopRef = useRef(false)
  const restoreCacheRef = useRef<Map<number, HostFrame>>(new Map())
  const didDeepLinkRef = useRef(false)

  // A stable default driver (built once) so the controller does not re-run the POP effect on
  // every render when no driver is injected. Tests inject an explicit driver.
  const defaultDriverRef = useRef<OverlayHistoryDriver | null>(null)
  if (defaultDriverRef.current === null) {
    defaultDriverRef.current = {
      index: defaultIndex,
      go: (delta: number) => navigate(delta),
    }
  }
  const driver = historyDriver ?? defaultDriverRef.current

  const commitSession = useCallback((next: OverlaySession | null) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  const activeEntry = useCallback(
    (): OverlayEntry | null => sessionRef.current?.frames.at(-1)?.entry ?? null,
    [],
  )

  // The ONE path into any leave-like transition. `commit` performs the session mutation;
  // it runs immediately for a clean (unguarded) entry, or after an `allow` decision.
  const requestLeave = useCallback(
    (intent: OverlayLeaveIntent, commit: () => void): Promise<OverlayTransitionResult> => {
      // A pending request coalesces every repeated action onto the same Promise: the guard
      // is not invoked again and no second transition commits.
      if (inFlightRef.current) return inFlightRef.current

      const guard = activeEntry()?.leaveGuard
      if (!guard) {
        commit()
        return Promise.resolve(COMMITTED)
      }

      const request: OverlayLeaveRequest = { id: createId('leave'), intent }
      const promise = (async (): Promise<OverlayTransitionResult> => {
        let decision: OverlayLeaveDecision
        try {
          decision = await guard(intent)
        } catch {
          // A rejected guard is treated as a deny: nothing unmounts, focus stays put.
          decision = { decision: 'deny' }
        }
        inFlightRef.current = null
        setPendingLeave(null)
        if (decision.decision === 'allow') {
          commit()
          return COMMITTED
        }
        return DENIED
      })()

      inFlightRef.current = promise
      setPendingLeave(request)
      return promise
    },
    [activeEntry],
  )

  // ── Route-seam helpers ──────────────────────────────────────────────────────
  // Push/replace a serializable marker onto the browser history for the active route-mode
  // session. `historyIndex` is stamped from the driver for observability (deny assertions,
  // the marker read-back); navigation logic is driven by marker DEPTHS, not absolute indices.
  const syncRouteMarker = useCallback(
    (depth: number, entryKey: string, replace: boolean) => {
      const s = sessionRef.current
      if (!s || s.mode !== 'route') return
      const idx = driver.index()
      const marker: OverlayHistoryMarker = {
        sessionId: s.id,
        depth,
        entryKey,
        mode: 'route',
        historyIndex: typeof idx === 'number' && idx >= 0 ? idx : 0,
      }
      // Stamp the marker onto the live top frame so a dirty browser-pop can report `from`.
      const frames = s.frames as HostFrame[]
      if (frames.length > 0) {
        const topIndex = frames.length - 1
        frames[topIndex] = { ...frames[topIndex], marker }
      }
      const path = location.pathname + location.search
      navigate(path, { state: withOverlayMarker(location.state, marker), replace })
    },
    [driver, navigate, location.pathname, location.search, location.state],
  )

  // A history move the controller initiates itself (internal Back, Close, browser-pop restore
  // / allow-land). The resulting POP is suppressed so the marker-sync effect does not
  // re-interpret it as a user gesture. The session is committed to match the target marker
  // before/after the move, so the effect would no-op anyway — the flag is belt-and-suspenders.
  const programmaticGo = useCallback(
    (delta: number) => {
      if (delta === 0) return
      suppressPopRef.current = true
      driver.go(delta)
    },
    [driver],
  )

  const clearRouteSeam = useCallback(() => {
    restoreCacheRef.current = new Map()
  }, [])

  // ── Browser POP sync (Task 3 step 3 + Task 3A steps 4-5) ────────────────────
  useEffect(() => {
    if (suppressPopRef.current) {
      // Our own history move landed — ignore it.
      suppressPopRef.current = false
      return
    }
    if (navigationType !== 'POP') return

    const active = sessionRef.current
    if (!active || active.mode !== 'route') return // ephemeral sessions have no URL contract

    const marker = readOverlayMarker(location.state)
    const sessionDepth = active.frames.length - 1

    // A marker from a DIFFERENT session cannot steal the active host (Task 3 step 3).
    if (marker && marker.sessionId !== active.id) return

    const targetDepth = marker ? marker.depth : -1 // -1 == marker-free location (closed)
    if (targetDepth === sessionDepth) return // already in sync

    // A guard is already deciding a transition — coalesce; never start a second guard.
    if (inFlightRef.current) return

    const delta = targetDepth - sessionDepth
    const direction: 'back' | 'forward' = delta < 0 ? 'back' : 'forward'
    const topFrame = active.frames.at(-1) as HostFrame | undefined
    const fromMarker = topFrame?.marker ?? null
    const activeEntryNow = topFrame?.entry

    const commit = () => {
      const cur = sessionRef.current
      if (!cur) return
      const curDepth = cur.frames.length - 1
      if (targetDepth < 0) {
        // Popped past the root marker → close the session entirely.
        clearRouteSeam()
        commitSession(null)
      } else if (targetDepth < curDepth) {
        // Browser Back: drop the popped frames but CACHE them so a matching Forward can restore.
        const removed = (cur.frames as HostFrame[]).slice(targetDepth + 1)
        const cache = new Map(restoreCacheRef.current)
        removed.forEach((f, i) => cache.set(targetDepth + 1 + i, f))
        restoreCacheRef.current = cache
        commitSession({ ...cur, frames: cur.frames.slice(0, targetDepth + 1) })
      } else {
        // Browser Forward: restore cached frames so no history entry is lost.
        const cache = restoreCacheRef.current
        const restored: HostFrame[] = []
        for (let d = curDepth + 1; d <= targetDepth; d += 1) {
          const f = cache.get(d)
          if (!f) break
          restored.push(f)
        }
        if (restored.length === targetDepth - curDepth) {
          commitSession({ ...cur, frames: [...cur.frames, ...restored] })
        }
        // If the forward target is not cached, the session stays put (best-effort); the
        // tenant-owned deep-link resolver is the long-term restore path.
      }
    }

    if (!activeEntryNow || !activeEntryNow.leaveGuard) {
      // Clean entry: the user's pop already landed on the target URL — just re-sync the
      // in-memory session to match the marker depth (no extra navigation).
      commit()
      return
    }

    // Dirty browser-pop TRANSACTION: restore the pre-pop URL so the dirty draft stays
    // visible while the guard decides, then consult the guard with the browser-pop intent.
    // On allow, commit the session change AND land on the target URL (the restore moved us
    // back to the session marker, so the allow must re-perform the original pop). The
    // one-use approval is `requestLeave`'s coalescing: once it resolves `pendingLeave`
    // clears, so the very next transition re-guards.
    if (fromMarker) {
      programmaticGo(-delta)
    }
    void requestLeave(
      {
        kind: 'browser-pop',
        direction,
        from: fromMarker as OverlayHistoryMarker,
        to: marker,
        delta,
      },
      () => {
        commit()
        programmaticGo(delta)
      },
    )
  }, [
    location,
    navigationType,
    requestLeave,
    commitSession,
    programmaticGo,
    clearRouteSeam,
    driver,
  ])

  // ── Deep-link restore on arrival (Task 5) ───────────────────────────────────
  // A hard load / fresh arrival on a URL carrying an `__mosOverlay` marker opens the
  // corresponding session via the tenant-supplied resolver. Runs once on mount; subsequent
  // in-app navigation is owned by the slots/API.
  useEffect(() => {
    if (didDeepLinkRef.current) return
    didDeepLinkRef.current = true
    if (sessionRef.current) return
    if (!deepLinkResolver) return
    const marker = readOverlayMarker(location.state)
    if (!marker || marker.mode === 'ephemeral') return
    const entry = deepLinkResolver(marker, location)
    if (!entry) return
    commitSession({ id: marker.sessionId, mode: marker.mode, frames: [makeFrame(entry, marker)] })
    // The URL already carries the marker — do not navigate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── API: openRoot ───────────────────────────────────────────────────────────
  const openRoot = useCallback(
    (entry: OverlayEntry, mode: OverlaySession['mode']): Promise<OverlayTransitionResult> => {
      const prev = sessionRef.current
      const prevWasRoute = prev?.mode === 'route'
      const commit = () => {
        commitSession({ id: createId('ovs'), mode, frames: [makeFrame(entry)] })
        clearRouteSeam()
        if (mode === 'route') {
          // Reflect a depth-0 marker for the new route session. If a route session was
          // already live, REPLACE its marker (no second history entry); otherwise PUSH one.
          syncRouteMarker(0, entry.key, prevWasRoute)
        } else if (prevWasRoute) {
          // Switched route → ephemeral: pop the now-orphaned route marker.
          programmaticGo(-1)
        }
      }
      const current = activeEntry()
      if (!current) {
        commit()
        return Promise.resolve(COMMITTED)
      }
      return requestLeave(
        { kind: 'replace', via: 'replace-root', from: summarize(current), to: summarize(entry) },
        commit,
      )
    },
    [activeEntry, commitSession, clearRouteSeam, requestLeave, syncRouteMarker, programmaticGo],
  )

  const replaceRoot = useCallback(
    (entry: OverlayEntry): Promise<OverlayTransitionResult> => {
      const prev = sessionRef.current
      const prevWasRoute = prev?.mode === 'route'
      const commit = () => {
        const current = sessionRef.current
        const mode = current?.mode ?? 'ephemeral'
        commitSession(
          current
            ? { ...current, frames: [makeFrame(entry)] }
            : { id: createId('ovs'), mode: 'ephemeral', frames: [makeFrame(entry)] },
        )
        clearRouteSeam()
        if (mode === 'route') syncRouteMarker(0, entry.key, true)
        else if (prevWasRoute) programmaticGo(-1)
      }
      const current = activeEntry()
      if (!current) {
        commit()
        return Promise.resolve(COMMITTED)
      }
      return requestLeave(
        { kind: 'replace', via: 'replace-root', from: summarize(current), to: summarize(entry) },
        commit,
      )
    },
    [activeEntry, commitSession, clearRouteSeam, requestLeave, syncRouteMarker, programmaticGo],
  )

  const push = useCallback(
    (entry: OverlayEntry): Promise<OverlayTransitionResult> => {
      const active = activeEntry()
      if (!active) return Promise.resolve(COMMITTED)
      const commit = () => {
        const current = sessionRef.current
        if (!current) return
        const existing = current.frames.findIndex((f) => f.entry.key === entry.key)
        if (existing >= 0) {
          // Pushing a key already in the stack pops back to that frame (dedupe).
          const nextFrames = current.frames.slice(0, existing + 1)
          commitSession({ ...current, frames: nextFrames })
          if (current.mode === 'route') {
            const backBy = current.frames.length - 1 - existing
            if (backBy > 0) programmaticGo(-backBy)
          }
          return
        }
        // Capture the current active element as the previous frame's return target.
        const invoker = captureFocus()
        const frames = (current.frames as HostFrame[]).map((f, i) =>
          i === current.frames.length - 1 ? { ...f, returnFocus: invoker ?? f.returnFocus } : f,
        )
        const newDepth = frames.length // depth of the new frame
        const nextFrame = makeFrame(entry)
        commitSession({ ...current, frames: [...frames, nextFrame] })
        if (current.mode === 'route') syncRouteMarker(newDepth, entry.key, false)
      }
      return requestLeave(
        { kind: 'replace', via: 'push', from: summarize(active), to: summarize(entry) },
        commit,
      )
    },
    [activeEntry, commitSession, requestLeave, syncRouteMarker, programmaticGo],
  )

  const replaceCurrent = useCallback(
    (entry: OverlayEntry): Promise<OverlayTransitionResult> => {
      const active = activeEntry()
      if (!active) return Promise.resolve(COMMITTED)
      const commit = () => {
        const current = sessionRef.current
        if (!current) return
        const top = current.frames.at(-1) as HostFrame | undefined
        const nextFrame: HostFrame = {
          entry,
          returnFocus: top?.returnFocus ?? null,
          marker: top?.marker,
        }
        commitSession({
          ...current,
          frames: [...current.frames.slice(0, -1), nextFrame],
        })
        if (current.mode === 'route') {
          const depth = current.frames.length - 1
          syncRouteMarker(depth, entry.key, true)
        }
      }
      return requestLeave(
        { kind: 'replace', via: 'replace-current', from: summarize(active), to: summarize(entry) },
        commit,
      )
    },
    [activeEntry, commitSession, requestLeave, syncRouteMarker],
  )

  const back = useCallback((): Promise<OverlayTransitionResult> => {
    const active = activeEntry()
    if (!active) return Promise.resolve(COMMITTED)
    const current = sessionRef.current
    const depth = (current?.frames.length ?? 1) - 1
    const commit = () => {
      const cur = sessionRef.current
      if (!cur) return
      // Pop exactly one frame; at depth 0 the root closes.
      if (cur.frames.length <= 1) {
        clearRouteSeam()
        commitSession(null)
        if (cur.mode === 'route') programmaticGo(-1) // historyDeltaForClose(0)
      } else {
        commitSession({ ...cur, frames: cur.frames.slice(0, -1) })
        if (cur.mode === 'route') programmaticGo(-1)
      }
    }
    return requestLeave(
      { kind: 'back', via: 'internal-back', from: summarize(active), depth },
      commit,
    )
  }, [activeEntry, commitSession, clearRouteSeam, requestLeave, programmaticGo])

  const close = useCallback(
    (via: 'explicit-close' | 'escape' = 'explicit-close'): Promise<OverlayTransitionResult> => {
      const active = activeEntry()
      if (!active) return Promise.resolve(COMMITTED)
      const current = sessionRef.current
      const mode = current?.mode
      const depth = (current?.frames.length ?? 1) - 1
      const commit = () => {
        clearRouteSeam()
        commitSession(null)
        if (mode === 'route') programmaticGo(historyDeltaForClose(depth))
      }
      return requestLeave({ kind: 'close', via, from: summarize(active) }, commit)
    },
    [activeEntry, commitSession, clearRouteSeam, requestLeave, programmaticGo],
  )

  const openPage = useCallback(
    (to: To): Promise<OverlayTransitionResult> => {
      const active = activeEntry()
      if (!active) return Promise.resolve(COMMITTED)
      // After a guarded leave commits, navigate to the canonical page (replacing the panel's
      // marker history slot so Back returns to the collection, not an orphan marker).
      return requestLeave(
        { kind: 'open-page', via: 'open-page', from: summarize(active), to },
        () => {
          clearRouteSeam()
          commitSession(null)
          navigate(to, { replace: true })
        },
      )
    },
    [activeEntry, clearRouteSeam, commitSession, requestLeave, navigate],
  )

  const api = useMemo<OverlayHostApi>(
    () => ({
      session,
      pendingLeave,
      openRoot,
      replaceRoot,
      push,
      replaceCurrent,
      back,
      close,
      openPage,
    }),
    [session, pendingLeave, openRoot, replaceRoot, push, replaceCurrent, back, close, openPage],
  )

  return <OverlayHostContext.Provider value={api}>{children}</OverlayHostContext.Provider>
}

export function useOverlayHost(): OverlayHostApi {
  const api = useContext(OverlayHostContext)
  if (!api) {
    throw new Error('useOverlayHost must be used inside <OverlayHostProvider> (V3 Issue 4).')
  }
  return api
}

/**
 * Non-throwing accessor for the ambient overlay host: returns the controller when an
 * `<OverlayHostProvider>` is above in the tree, otherwise `null`. Used by mounts that may
 * legitimately render without a host (e.g. an embedded collection with no record-opening).
 */
export function useOptionalOverlayHost(): OverlayHostApi | null {
  return useContext(OverlayHostContext)
}

/**
 * The ONLY mount allowed to render a physical `RecordPanelHost`. It renders the host when the
 * active session's top frame is owned by `owner`; otherwise it renders nothing. The shell slot
 * and a collection slot can coexist in the tree while exactly one physical host is in the DOM
 * (FR-V3-007 / AC-RPH-5 one-active-tenant invariant). `children` (the owning collection) always
 * render underneath.
 */
export function OverlayHostSlot({
  owner,
  children,
}: {
  owner: OverlayOwner
  children?: ReactNode
}): ReactElement {
  const { session, pendingLeave, close, back, openPage } = useOverlayHost()
  const top = session?.frames.at(-1)
  const active = top && top.entry.owner === owner ? top : null
  const canGoBack = (session?.frames.length ?? 0) > 1
  const pageTo = active?.entry.pageTo

  return (
    <span data-overlay-host-slot={owner} style={{ display: 'contents' }}>
      {children}
      {active && (
        <RecordPanelHost
          key={active.entry.key}
          label={active.entry.label}
          title={active.entry.title}
          owner={owner}
          entryKey={active.entry.key}
          focusKey={active.entry.key}
          canGoBack={canGoBack}
          transitionPending={pendingLeave !== null}
          onBack={canGoBack ? () => void back() : undefined}
          onOpenPage={pageTo ? () => void openPage(pageTo) : undefined}
          onClose={(via) => void close(via)}
          // The shell slot sits above the page Outlet (no page-level .record-split grid wrapper),
          // so the panel would render unpositioned (Luna audit B1: "bare .drawer aside, no 44%
          // track"). owner-shell gives RecordPanelHost a shell-specific right-anchored track at
          // desktop via .drawer-shell-split (reuses the minmax(360px, 44%) token, Rule 11 — one
          // width). Collection slots don't need this; their pages wrap the slot in .record-split.
          rootClassName={owner === 'shell' ? 'drawer-shell-split' : undefined}
        >
          {active.entry.content}
        </RecordPanelHost>
      )}
    </span>
  )
}
