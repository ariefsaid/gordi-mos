/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { To } from 'react-router-dom'
import { RecordPanelHost } from './record-panel-host'
import type {
  OverlayEntrySummary,
  OverlayLeaveDecision,
  OverlayLeaveGuard,
  OverlayLeaveIntent,
  OverlayLeaveRequest,
  OverlayOwner,
  OverlayTransitionResult,
} from './overlay-navigation'

// V3 Issue 4 — the ONE shared overlay controller. It owns the active session, the internal
// linked-record stack, the no-double-panel invariant, and the single domain-neutral
// asynchronous leave-guard transaction. Every leave-like action (Close, Escape, internal
// Back, root/current replacement, related-record push, page promotion) flows through one
// `requestLeave(intent, commit)` path: a clean entry commits synchronously; a guarded entry
// awaits its tenant-owned `leaveGuard(intent)` and either commits (allow) or leaves the frame
// and focus in place (deny). Repeated actions while a request is pending coalesce onto the one
// in-flight Promise so the guard is never invoked twice for the same transition.
//
// The controller stores React content only at the presentation boundary. It owns NO domain
// dirty state, Deputy state, notification data, or confirmation copy — those belong to the
// active tenant's `leaveGuard`.
//
// SCOPE (this checkpoint): the in-memory session + the direct-API leave-guard transaction are
// implemented and fully tested. Router history-marker synchronization and the browser
// back/forward POP transaction (the `browser-pop` leave intent, already typed in
// overlay-navigation.ts) are NOT wired here yet — they land with their own RouterProvider/POP
// red tests (plan Task 3 step 3 + Task 3A steps 3-5) and the Task/Signal route seam (Task 5).

export type OverlayTenant = 'record' | 'deputy' | 'quick'

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

function makeFrame(entry: OverlayEntry): OverlayFrame {
  return { entry, returnFocus: captureFocus() }
}

export function OverlayHostProvider({ children }: { children: ReactNode }): ReactElement {
  const [session, setSession] = useState<OverlaySession | null>(null)
  const [pendingLeave, setPendingLeave] = useState<OverlayLeaveRequest | null>(null)

  // Synchronous mirrors so a rapid same-tick sequence of API calls (and the coalescing
  // guard closure) always reads the freshly committed state, not stale React state.
  const sessionRef = useRef<OverlaySession | null>(session)
  const inFlightRef = useRef<Promise<OverlayTransitionResult> | null>(null)

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

  const openRoot = useCallback(
    (entry: OverlayEntry, mode: OverlaySession['mode']): Promise<OverlayTransitionResult> => {
      const commit = () =>
        commitSession({ id: createId('ovs'), mode, frames: [makeFrame(entry)] })
      const active = activeEntry()
      if (!active) {
        // A fresh open has no current entry to guard — commit synchronously.
        commit()
        return Promise.resolve(COMMITTED)
      }
      // A second root open replaces the current tenant through the guarded transition,
      // keeping exactly one physical host.
      return requestLeave(
        { kind: 'replace', via: 'replace-root', from: summarize(active), to: summarize(entry) },
        commit,
      )
    },
    [activeEntry, commitSession, requestLeave],
  )

  const replaceRoot = useCallback(
    (entry: OverlayEntry): Promise<OverlayTransitionResult> => {
      const commit = () =>
        commitSession(
          sessionRef.current
            ? { ...sessionRef.current, frames: [makeFrame(entry)] }
            : { id: createId('ovs'), mode: 'ephemeral', frames: [makeFrame(entry)] },
        )
      const active = activeEntry()
      if (!active) {
        commit()
        return Promise.resolve(COMMITTED)
      }
      return requestLeave(
        { kind: 'replace', via: 'replace-root', from: summarize(active), to: summarize(entry) },
        commit,
      )
    },
    [activeEntry, commitSession, requestLeave],
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
          commitSession({ ...current, frames: current.frames.slice(0, existing + 1) })
          return
        }
        // Capture the current active element as the previous frame's return target.
        const invoker = captureFocus()
        const frames = current.frames.map((f, i) =>
          i === current.frames.length - 1 ? { ...f, returnFocus: invoker ?? f.returnFocus } : f,
        )
        commitSession({ ...current, frames: [...frames, { entry, returnFocus: invoker }] })
      }
      return requestLeave(
        { kind: 'replace', via: 'push', from: summarize(active), to: summarize(entry) },
        commit,
      )
    },
    [activeEntry, commitSession, requestLeave],
  )

  const replaceCurrent = useCallback(
    (entry: OverlayEntry): Promise<OverlayTransitionResult> => {
      const active = activeEntry()
      if (!active) return Promise.resolve(COMMITTED)
      const commit = () => {
        const current = sessionRef.current
        if (!current) return
        commitSession({
          ...current,
          frames: [
            ...current.frames.slice(0, -1),
            { entry, returnFocus: current.frames.at(-1)?.returnFocus ?? null },
          ],
        })
      }
      return requestLeave(
        { kind: 'replace', via: 'replace-current', from: summarize(active), to: summarize(entry) },
        commit,
      )
    },
    [activeEntry, commitSession, requestLeave],
  )

  const back = useCallback((): Promise<OverlayTransitionResult> => {
    const active = activeEntry()
    if (!active) return Promise.resolve(COMMITTED)
    const depth = (sessionRef.current?.frames.length ?? 1) - 1
    const commit = () => {
      const current = sessionRef.current
      if (!current) return
      // Pop exactly one frame; at depth 0 the root closes.
      commitSession(
        current.frames.length <= 1 ? null : { ...current, frames: current.frames.slice(0, -1) },
      )
    }
    return requestLeave(
      { kind: 'back', via: 'internal-back', from: summarize(active), depth },
      commit,
    )
  }, [activeEntry, commitSession, requestLeave])

  const close = useCallback(
    (via: 'explicit-close' | 'escape' = 'explicit-close'): Promise<OverlayTransitionResult> => {
      const active = activeEntry()
      if (!active) return Promise.resolve(COMMITTED)
      return requestLeave({ kind: 'close', via, from: summarize(active) }, () =>
        commitSession(null),
      )
    },
    [activeEntry, commitSession, requestLeave],
  )

  const openPage = useCallback(
    (to: To): Promise<OverlayTransitionResult> => {
      const active = activeEntry()
      if (!active) return Promise.resolve(COMMITTED)
      // The host only leaves the panel; the route seam (Task 5) performs the navigation to
      // the canonical page. The target is carried on the typed intent for the guard.
      return requestLeave(
        { kind: 'open-page', via: 'open-page', from: summarize(active), to },
        () => commitSession(null),
      )
    },
    [activeEntry, commitSession, requestLeave],
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
        >
          {active.entry.content}
        </RecordPanelHost>
      )}
    </span>
  )
}
