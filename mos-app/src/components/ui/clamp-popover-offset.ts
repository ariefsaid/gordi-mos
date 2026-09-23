/**
 * clampPopoverGeometry (#621, consolidating #577) — the ONE horizontal-clamp helper for every
 * viewport-anchored popover in the app (help tip panel, the admin ⋯ menu, the signal category
 * picker, ...). Each of those grew its own copy of "shift left so the popover doesn't overflow
 * the right edge, floor it at a margin so it doesn't overflow the left edge" — this is the pure
 * math extracted from all three, plus the width clamp only `help-tip` had (a popover can itself
 * be wider than the viewport, e.g. a 288px panel on a 320px phone).
 *
 * Pure function: given where the popover would sit unclamped (`anchorLeft`) and how wide it wants
 * to be, returns the clamped `left` (same coordinate space as `anchorLeft` — viewport coordinates
 * for a `position: fixed` popover, anchor-local coordinates for a `position: absolute` one) and
 * the `maxWidth` the popover should render at, which is `popoverWidth` unless the viewport itself
 * is narrower than `popoverWidth + margin * 2`.
 */
export interface ClampPopoverGeometryArgs {
  /** Where the popover's left edge would land with no clamping, in the caller's coordinate space. */
  anchorLeft: number
  /** The popover's intended (unclamped) width. */
  popoverWidth: number
  /** `window.innerWidth` (or an emulated/stubbed value in tests). */
  viewportWidth: number
  /** Minimum gap kept from either viewport edge. */
  margin?: number
}

export interface ClampedPopoverGeometry {
  /** Clamped left edge, in the same coordinate space as `anchorLeft`. */
  left: number
  /** Width the popover should render at — `popoverWidth`, shrunk only if it can't fit at all. */
  maxWidth: number
}

export function clampPopoverGeometry({
  anchorLeft,
  popoverWidth,
  viewportWidth,
  margin = 8,
}: ClampPopoverGeometryArgs): ClampedPopoverGeometry {
  // Shrink the width first — a popover wider than the viewport (minus both margins) can never
  // fit regardless of left, so every subsequent bound is computed against the width it will
  // actually render at, not the width it wished for.
  const maxWidth = Math.max(0, Math.min(popoverWidth, viewportWidth - margin * 2))
  const maxLeft = viewportWidth - maxWidth - margin
  // Standard two-sided clamp. When the viewport is narrower than the (already-shrunk) popover
  // plus margins, `maxLeft` can fall below `margin` — `min(anchorLeft, maxLeft)` then lands below
  // margin too, so the outer `max(margin, …)` wins and the popover still starts on-screen rather
  // than being pushed past the left edge.
  const left = Math.max(margin, Math.min(anchorLeft, maxLeft))
  return { left, maxWidth }
}
