import { useEffect, useState } from 'react'

/**
 * Whether a record may open as a split (list beside panel). Decided by the CONTENT TRACK width
 * (the space the page actually has beside the sidebar and its gutters), not the viewport, so a
 * collapsed or docked rail, a docked Deputy panel and the 1760px cap are all accounted for.
 *
 * The split needs both halves to be usable at once: the list keeps one-line rows with Task,
 * Status, PIC and Due (TASKS_SPLIT_LIST_MIN_PX), and the record panel keeps at least
 * RECORD_PANEL_MIN_PX (index.css --record-panel-w floor; keep both literals equal). Below that the
 * record opens as the full page.
 */
const RECORD_PANEL_MIN_PX = 480
const TASKS_SPLIT_LIST_MIN_PX = 700
const TASKS_SPLIT_GAP_PX = 12
const TASKS_SPLIT_MIN_TRACK_PX =
  TASKS_SPLIT_LIST_MIN_PX + TASKS_SPLIT_GAP_PX + RECORD_PANEL_MIN_PX
/** The page-frame content max (shell/page-families.css). */
const TRACK_MAX_PX = 1760

/** The page frame's side gutter at this viewport (mirrors shell/page-families.css). */
function frameGutter(): number {
  return window.innerWidth >= 1280 ? 32 : window.innerWidth >= 768 ? 24 : 16
}

/**
 * Current content-track width in px, from the shell's content region. `includeDocked: false` reads
 * the shell main's full box instead, which a docked side panel (Deputy, Bell) does not shrink, so
 * a panel host can decide without reacting to its own docking.
 */
function readTrackWidth(includeDocked = true): number {
  const el = includeDocked
    ? document.getElementById('main-content')
    : document.querySelector<HTMLElement>('[data-shell-main]')
  const w = el ? el.clientWidth : window.innerWidth
  return Math.min(TRACK_MAX_PX, Math.max(0, w - frameGutter() * 2))
}

function useTrackWidth(includeDocked = true): number {
  const [width, setWidth] = useState<number>(() => readTrackWidth(includeDocked))
  useEffect(() => {
    const el = includeDocked
      ? document.getElementById('main-content')
      : document.querySelector<HTMLElement>('[data-shell-main]')
    const update = () => setWidth(readTrackWidth(includeDocked))
    update()
    window.addEventListener('resize', update)
    let ro: ResizeObserver | undefined
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update)
      ro.observe(el)
    }
    return () => {
      window.removeEventListener('resize', update)
      ro?.disconnect()
    }
  }, [includeDocked])
  return width
}

/** Synchronous first read (no wrong-branch flash); follows the track as it resizes. */
export function useIsSplitWidth(minTrack: number = TASKS_SPLIT_MIN_TRACK_PX): boolean {
  return useTrackWidth() >= minTrack
}

/**
 * The same decision for every other list + record-panel page (Signals, Objectives, Projects &
 * Processes, People, Pending bills, Inbox) and the shared panel host: a split only where the
 * track holds list + panel. Otherwise the record opens as the host's modal sheet.
 */
export function useIsRecordSplit(): boolean {
  const wideViewport = useWideViewport()
  return useTrackWidth(false) >= TASKS_SPLIT_MIN_TRACK_PX && wideViewport
}

function useWideViewport(): boolean {
  const QUERY = '(min-width: 1100px)'
  const [wide, setWide] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const on = (e: MediaQueryListEvent) => setWide(e.matches)
    mql.addEventListener('change', on)
    return () => mql.removeEventListener('change', on)
  }, [])
  return wide
}
