/**
 * Return the audit capture to the top-left of the app-owned scroll regions.
 *
 * The shell keeps page content in a bounded <main>, so resetting only the browser window can
 * leave a phone capture starting halfway down the previous route. Keep this callback self-contained
 * because Playwright serializes it into the page before each screenshot.
 */
export function resetAuditScroll(): void {
  window.scrollTo(0, 0)

  const targets = new Set<HTMLElement>()
  const add = (element: Element | null) => {
    if (element) targets.add(element as HTMLElement)
  }

  add(document.scrollingElement)
  add(document.documentElement)
  add(document.body)

  // Record drawers and future collection surfaces may own their own scroll container. Reset every
  // element that is actually displaced so a new scroll owner cannot silently produce a mid-content
  // screenshot just because its class was absent from a hard-coded allowlist.
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    if (element.scrollTop !== 0 || element.scrollLeft !== 0) add(element)
  })

  for (const target of targets) {
    target.scrollTop = 0
    target.scrollLeft = 0
  }
}
