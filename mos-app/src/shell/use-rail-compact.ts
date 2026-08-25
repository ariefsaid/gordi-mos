import { useIsNarrow } from './use-is-narrow'
import { useIsSplitWidth } from './use-is-split-width'
import { useRailCollapsePref } from './use-rail-collapse-pref'

export interface RailCompactState {
  /** The rail is not mounted at all — below `rail-collapse` (920px) the drawer is the nav. */
  isNarrow: boolean
  /** Render the icon-only rail (either regime — width-driven or user-chosen). */
  compact: boolean
  /**
   * The user's choice can change anything right now — true only at or above `rail-compact`
   * (1100px), where the full rail is what a preference-free viewer would get.
   */
  collapsible: boolean
}

/**
 * The ONE place that decides whether the rail renders icon-only (#442).
 *
 * Two regimes feed one answer, and **the width regime wins.** Between 920px and 1099.98px the rail
 * is icon-only because 232px of labels does not fit (OD-REDESIGN-84.2 / P1-1) — that is a
 * measurement, not a taste, so a stored "expanded" preference does not get to overrule it. At or
 * above 1100px the labels do fit, nobody is forced either way, and the preference decides.
 *
 * Below 920px there is no rail to compact; `compact` is meaningless there and the caller branches
 * on `isNarrow` first.
 *
 * It exists as a hook rather than as two copies of `!isNarrow && !isSplit` because there were
 * already two copies — `app-shell.tsx` (grid column) and `top-bar.tsx` (brand column, which draws
 * the header divider on the rail's boundary). Adding a third input to a duplicated expression is
 * how the divider ends up on the wrong side of the rail edge.
 */
export function useRailCompact(): RailCompactState {
  const isNarrow = useIsNarrow()
  const isSplit = useIsSplitWidth()
  const { collapsed } = useRailCollapsePref()
  const collapsible = !isNarrow && isSplit
  // !isSplit → the 920–1099.98px band: compact regardless of what is stored.
  const compact = !isNarrow && (!isSplit || collapsed)
  return { isNarrow, compact, collapsible }
}
