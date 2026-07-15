/**
 * OD-63 / Rule 4 — Task record URL: split drawer vs full canonical page.
 *
 * A `/work/tasks/:id` route renders as a full standalone canonical PAGE when the
 * viewer arrived by a direct/new-tab/refresh (a hard document load onto the
 * record) or via the explicit "Open full page" escalation from the split drawer.
 * A normal in-list click (in-app SPA navigation) keeps the split drawer for fast
 * triage. The SAME renderer (TaskSurface) is reused with presentation
 * "panel" | "page" (Rule 11) — only the surrounding shell changes.
 *
 * How "direct open" is detected: a real browser records exactly ONE
 * PerformanceNavigationTiming entry for the hard document load that booted the
 * SPA (type navigate/reload/back_forward); in-app SPA navigations never create a
 * new one. We capture, ONCE at module load, whether that hard load landed directly
 * on a record path. jsdom (vitest) exposes no such entry, so the boot capture is
 * null there — which keeps direct-render unit tests in panel mode (drawer) while a
 * real browser direct-load opens the full page (proven by the e2e).
 */

const BOOT_NAV =
  typeof performance !== 'undefined'
    ? (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
    : undefined

function readBootRecordId(): string | null {
  if (!BOOT_NAV) return null // non-browser / jsdom — cannot be a hard load
  // navigate = typed URL / new tab / external link; reload = refresh; back_forward =
  // browser back/forward into the SPA from outside. All are hard (re)loads onto the URL.
  if (BOOT_NAV.type !== 'navigate' && BOOT_NAV.type !== 'reload' && BOOT_NAV.type !== 'back_forward') {
    return null
  }
  const m =
    typeof window !== 'undefined'
      ? window.location.pathname.match(/\/work\/tasks\/([^/?#]+)$/)
      : null
  // `new` is the create route, not a record — never a standalone page host.
  if (!m || m[1] === 'new') return null
  return m[1]
}

/** The record id the SPA hard-loaded onto, or null (booted elsewhere / in-app nav). */
const BOOT_DIRECT_RECORD_ID = readBootRecordId()

export type TaskPageModeInput = {
  taskId: string | null | undefined
  isNew: boolean
  /** react-router `location.state` — the "Open full page" button sets `{ taskSurface: 'page' }`. */
  state?: unknown
}

/**
 * True when the current `/work/tasks/:id` should render as a standalone full
 * canonical page instead of the in-list split drawer.
 *
 * @param bootRecordId test seam — the hard-load record id captured at boot.
 *   Defaults to the real capture; pass an explicit value in unit tests.
 */
export function isTaskPageMode(
  { taskId, isNew, state }: TaskPageModeInput,
  bootRecordId: string | null = BOOT_DIRECT_RECORD_ID,
): boolean {
  if (!taskId || isNew) return false
  if (isPageState(state)) return true // explicit "Open full page" escalation
  return bootRecordId === taskId // direct/new-tab/refresh onto this record
}

function isPageState(state: unknown): boolean {
  return (
    !!state &&
    typeof state === 'object' &&
    (state as { taskSurface?: unknown }).taskSurface === 'page'
  )
}
