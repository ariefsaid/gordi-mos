/**
 * OD-63 / Rule 4 — Signal record URL: split drawer vs full canonical page.
 *
 * The Signal record has two URLs (unlike a Task, which reuses one path):
 *   • `/work/signals?record=<id>` — the in-list split drawer (fast triage; the
 *     archive/feed list stays live beside the panel).
 *   • `/work/signals/<id>` — the full standalone canonical PAGE.
 *
 * A normal in-list click is an in-app SPA navigation onto `?record=<id>` and stays
 * in the drawer. But a DIRECT hard load / refresh / new-tab / shared deep-link onto
 * `?record=<id>` should escalate to the canonical page — mirroring the Task's
 * task-page-mode hard-load detection. We capture, ONCE at module load, whether the
 * hard document load that booted the SPA landed on `?record=<id>`; the archive page
 * redirects that id to `/work/signals/<id>`.
 *
 * How "direct open" is detected: a real browser records exactly ONE
 * PerformanceNavigationTiming entry for the hard document load (type
 * navigate/reload/back_forward); in-app SPA navigations never create a new one.
 * jsdom (vitest) exposes no such entry, so the boot capture is null there — which
 * keeps `?record=` deep-links in drawer mode in unit tests, while a real browser
 * hard-load escalates to the page (proven by the e2e).
 */

type BootNavigation = Pick<PerformanceNavigationTiming, 'type'>

const BOOT_NAV =
  typeof performance !== 'undefined'
    ? (performance.getEntriesByType('navigation')[0] as unknown as BootNavigation | undefined)
    : undefined

/**
 * Read the `?record=<id>` a hard-navigation timing entry landed on (on the Signals
 * archive route), or null. Arguments are injectable so the detection is deterministic
 * in unit tests; the default capture below is the only module-level browser observation.
 */
export function readBootSignalRecordId(
  navigation: BootNavigation | undefined = BOOT_NAV,
  pathname: string | null = typeof window !== 'undefined' ? window.location.pathname : null,
  search: string | null = typeof window !== 'undefined' ? window.location.search : null,
): string | null {
  if (!navigation) return null // non-browser / jsdom — cannot be a hard load
  // navigate = typed URL / new tab / external link; reload = refresh; back_forward =
  // browser back/forward into the SPA from outside. All are hard (re)loads onto the URL.
  if (navigation.type !== 'navigate' && navigation.type !== 'reload' && navigation.type !== 'back_forward') {
    return null
  }
  // Match the Signals archive route suffix (basename-agnostic — window.location.pathname
  // carries the /mos prefix; the archive canonical route ends at /work/signals).
  if (!pathname || !/\/work\/signals\/?$/.test(pathname)) return null
  const id = new URLSearchParams(search ?? '').get('record')
  return id || null
}

/** The `?record=` id the SPA hard-loaded onto (archive route), or null. */
export const BOOT_SIGNAL_RECORD_ID = readBootSignalRecordId()
