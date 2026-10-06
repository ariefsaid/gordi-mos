// The day chart's plot geometry, shared by the chart (to draw) and its pointer handling (to find
// the day under a click or tap from the pointer's own position).

/** The plot's horizontal geometry: the y-axis band on the left, a small gutter on the right. */
export const Y_AXIS_WIDTH = 68
export const PLOT_MARGIN = { top: 8, right: 4, bottom: 0, left: 0 }

/** The day index under `x` (px from the chart's left edge) in a chart `width` px wide holding
 *  `count` equal day bands, or null outside the plot. */
export function dayAt(x: number, width: number, count: number): number | null {
  const left = PLOT_MARGIN.left + Y_AXIS_WIDTH
  const plot = width - left - PLOT_MARGIN.right
  if (count === 0 || plot <= 0 || x < left || x >= left + plot) return null
  return Math.min(count - 1, Math.floor(((x - left) / plot) * count))
}
