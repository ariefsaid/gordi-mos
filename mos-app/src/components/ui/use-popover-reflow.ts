import { useEffect } from 'react'

/**
 * usePopoverReflow (#621) — the scroll/resize listener pair three popovers each wired up by hand
 * (help tip, the admin ⋯ menu, the signal category picker). Scroll is capture-phase so it fires
 * for a scroll on ANY ancestor, not just `window` (a popover inside a scrollable panel moves when
 * that panel scrolls, not only on a page-level scroll).
 *
 * What "reflow" means is the caller's choice, passed as `onReflow` — re-measure and reposition
 * (help tip, the category picker) or simply dismiss (the admin ⋯ menu, which has no live
 * repositioning and closes rather than drift). Listeners attach only while `active` is true.
 */
export function usePopoverReflow(active: boolean, onReflow: () => void) {
  useEffect(() => {
    if (!active) return
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => {
      window.removeEventListener('scroll', onReflow, true)
      window.removeEventListener('resize', onReflow)
    }
  }, [active, onReflow])
}
