// DailyRevenueChart — sales composition rendered inside ChartFrame (design-plan §2.2,
// Q2 resolved: stacked bars/day, colored by channel). Inline SVG — NO charting
// dependency. Two hues only (primary=POS, violet=B2B; a third channel falls back to
// muted-foreground rather than inventing a new hue — flag to owner if that recurs).
// Purely decorative (aria-hidden): the ChartFrame `tableFallback` slot carries the
// WCAG 1.1.1/1.4.1 text/table equivalent, so channels are distinguished by label
// there, not by hue alone.
import type { DailySeriesPoint } from '@/lib/sales-dashboard'
import './daily-revenue-chart.css'

const CHANNEL_CLASS: Record<string, string> = {
  POS: 'drc-bar-pos',
  B2B: 'drc-bar-b2b',
}

const WIDTH = 600
const HEIGHT = 160
const PADDING = 8

export interface DailyRevenueChartProps {
  series: DailySeriesPoint[]
}

export function DailyRevenueChart({ series }: DailyRevenueChartProps) {
  if (series.length === 0) return <div className="drc" aria-hidden="true" />

  const maxTotal = Math.max(...series.map(p => p.total), 1)
  const usableWidth = WIDTH - PADDING * 2
  const barSlot = usableWidth / series.length
  const barWidth = Math.min(barSlot * 0.6, 40)

  return (
    <div>
      <svg
        className="drc"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} className="drc-axis" />
        {series.map((point, i) => {
          const x = PADDING + i * barSlot + (barSlot - barWidth) / 2
          let yCursor = HEIGHT - PADDING
          const channels = Object.entries(point.byChannel)
          return (
            <g key={point.date} data-chart-day={point.date}>
              {channels.map(([channel, amount]) => {
                const segHeight = ((HEIGHT - PADDING * 2) * amount) / maxTotal
                yCursor -= segHeight
                return (
                  <rect
                    key={channel}
                    data-chart-segment={channel}
                    x={x}
                    y={yCursor}
                    width={barWidth}
                    height={segHeight}
                    className={CHANNEL_CLASS[channel] ?? 'drc-bar-other'}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>
      <div className="drc-legend">
        <span className="drc-legend-item">
          <span className="drc-legend-dot drc-legend-dot--pos" /> POS
        </span>
        <span className="drc-legend-item">
          <span className="drc-legend-dot drc-legend-dot--b2b" /> B2B
        </span>
      </div>
    </div>
  )
}
