// Pure placement decision for the attention menu (#768 round 5). The menu renders INLINE — the
// same mechanism as the neighbouring .signal-occurred-popover: position:absolute inside the
// pill's own wrapper — so it stacks inside whatever surface hosts the picker (the composer
// dialog, inside its focus trap, and the record panel alike). No portal, no fixed coordinates,
// no app z-tier: the only geometry JS decides is the vertical flip, because the pill row sits
// low in both host surfaces and a downward menu ran off-screen at 390 (round-4 defect: menu
// bottom 929.9 in an 844 viewport).
export const POPOVER_GAP_PX = 4
export const VIEWPORT_MARGIN_PX = 8

/** True when the menu should open ABOVE the trigger instead of below it.
 *
 * Downward is the default. Flipping up is only an improvement when the space above is REAL: the
 * host surfaces clip their content (the record panel's scroll container starts below its chrome
 * bar), so a flip that clears the viewport bottom by crossing the container's TOP edge trades an
 * off-screen menu for an invisible one. Both edges are the caller's folded numbers — the viewport
 * and the nearest clipping ancestor, whichever bites first. When neither direction fits, stay
 * down: a menu the page can scroll to beats a menu clipped out of existence.
 */
export function shouldFlipUp(
  triggerTop: number,
  triggerBottom: number,
  menuHeight: number,
  availableTop: number,
  availableBottom: number,
): boolean {
  const crossesBottom = triggerBottom + POPOVER_GAP_PX + menuHeight > availableBottom
  const fitsAbove = triggerTop - POPOVER_GAP_PX - menuHeight >= availableTop
  return crossesBottom && fitsAbove
}

/** True when opening rightward from the trigger's LEFT edge would push the menu past the
 * viewport's right edge (390: the wrapped pill row can start the pill at x≈205; a 220px menu
 * crosses a 390 viewport). The caller then anchors the menu's RIGHT edge to the trigger's right
 * edge instead — still trigger-anchored, on screen (the --pull-in modifier). */
export function shouldPullIn(triggerLeft: number, menuWidth: number, viewportWidth: number): boolean {
  return triggerLeft + menuWidth > viewportWidth - VIEWPORT_MARGIN_PX
}
