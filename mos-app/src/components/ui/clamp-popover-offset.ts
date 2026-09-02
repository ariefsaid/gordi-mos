/**
 * clampPopoverOffset (#577) — the anchor-relative `left` shift that keeps a `left:0`-anchored
 * popover fully inside the viewport. Every listbox popover in the app (category picker, mention
 * picker, ...) opens flush with its anchor's left edge via CSS (`left: 0`); that is correct until
 * the anchor itself sits close enough to the viewport's right edge that the popover's own width
 * pushes it past the edge — e.g. a right-column feed row, where the anchor can be within a few px
 * of the window edge. Returns 0 (the CSS default, unmodified) when the popover already fits.
 */
export interface ClampPopoverOffsetArgs {
  /** The anchor's `getBoundingClientRect().left`, in viewport coordinates. */
  anchorLeft: number
  /** The popover's rendered width. */
  popoverWidth: number
  /** `window.innerWidth` (or an emulated/stubbed value in tests). */
  viewportWidth: number
  /** Minimum gap kept from either viewport edge. */
  margin?: number
}

export function clampPopoverOffset({
  anchorLeft,
  popoverWidth,
  viewportWidth,
  margin = 8,
}: ClampPopoverOffsetArgs): number {
  const maxLeft = viewportWidth - popoverWidth - margin
  // maxLeft can fall below `margin` on a viewport narrower than the popover itself; the lower
  // clamp (`margin`) wins so the popover still starts on-screen rather than being pushed negative.
  const clampedAbsoluteLeft = Math.min(anchorLeft, Math.max(margin, maxLeft))
  return clampedAbsoluteLeft - anchorLeft
}
