// Pure positioning helpers for the ⋯ popover menu.
// Extracted to a non-component file so the react-refresh rule doesn't fire.

/**
 * Returns true if opening the menu below the trigger would clip past the
 * viewport bottom edge (with a small margin). When true, position ABOVE.
 */
export function shouldFlipUp(
  triggerRect: { bottom: number; top: number },
  menuHeight: number,
  viewportHeight: number,
  margin = 8,
): boolean {
  return triggerRect.bottom + menuHeight > viewportHeight - margin
}
