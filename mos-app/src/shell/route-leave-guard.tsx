// RouteLeaveGuard — the route-level unsaved-changes guard for full PAGES (GAP-4 / OD-REDESIGN-91
// #9). It is the page-route sibling of the overlay/record seam `dirtyLeaveGuard` (which guards
// record drawers via OverlayEntry.leaveGuard): this one guards a whole route so that leaving with
// unsaved work asks the user to stay or discard, instead of silently dropping it (the live-
// reproduced Kitchen Log "20 dishes vanish on navigate" loss).
//
// When `when` is true, an in-app SPA navigation to a DIFFERENT path — or a browser Back — is
// intercepted and the user is asked to stay or discard via window.confirm (kitchen's OQ-4
// native-confirm v1 pattern; a same-path search-param change is never blocked). react-router's
// useBlocker requires a DATA router (createBrowserRouter, which the app uses). Under a non-data
// router (e.g. a bare <MemoryRouter> unit harness) useBlocker throws, so the blocking hook is
// mounted only when a data-router context is actually present; otherwise the guard is inert.
import { useCallback, useContext, useEffect } from 'react'
import { UNSAFE_DataRouterContext, useBlocker, type BlockerFunction } from 'react-router-dom'

export interface RouteLeaveGuardProps {
  /** True while the page holds unsaved work that a navigation would discard. */
  when: boolean
  /** The stay/discard prompt (window.confirm): OK = discard-and-leave, Cancel = stay. */
  message: string
}

export function RouteLeaveGuard({ when, message }: RouteLeaveGuardProps) {
  // useContext is always called (hook-safe); the blocking hook lives in a child that only mounts
  // when a data router is present, so useBlocker is never called outside a data router.
  const inDataRouter = useContext(UNSAFE_DataRouterContext) != null
  return inDataRouter ? <BlockingGuard when={when} message={message} /> : null
}

function BlockingGuard({ when, message }: RouteLeaveGuardProps) {
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname,
    [when],
  )
  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    const leave = typeof window !== 'undefined' ? window.confirm(message) : true
    if (leave) blocker.proceed()
    else blocker.reset()
  }, [blocker, message])

  return null
}
