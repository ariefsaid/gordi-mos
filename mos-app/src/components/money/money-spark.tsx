/* eslint-disable react-refresh/only-export-components */
// MoneySpark — a daily-revenue sparkline that names its start and end values, so the shape is never
// read without a scale. Neutral ink: the accent colour is for selection and actions, not data.
import { sparklinePoints } from '@/lib/money-branch-table'
import { formatIDRCompact } from '@/lib/sales-dashboard'
import './money-spark.css'

/** "17,6 → 14,3 jt" when both ends share a unit; each side in full compact form otherwise. */
export function sparkEnds(values: readonly (number | null)[]): { start: number; end: number; text: string } | null {
  const received = values.filter((v): v is number => v !== null)
  if (received.length < 2) return null
  const start = received[0]
  const end = received[received.length - 1]
  const a = formatIDRCompact(start)
  const b = formatIDRCompact(end)
  const unit = (s: string) => s.split(' ').at(-1)
  if (unit(a) === unit(b) && /^(-)?Rp [\d.,]+ \S+$/.test(a)) {
    return { start, end, text: `${a.replace(/^-?Rp /, '').replace(/ \S+$/, '')} → ${b.replace(/^-?Rp /, '')}` }
  }
  return { start, end, text: `${a} → ${b}` }
}

export function MoneySpark({ values, width = 64, height = 24, showEnds = true }: {
  values: readonly (number | null)[]
  width?: number
  height?: number
  showEnds?: boolean
}) {
  const trend = sparklinePoints(values, width, height)
  if (!trend) return null
  const ends = showEnds ? sparkEnds(values) : null
  return (
    <span className="money-spark">
      <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <polyline points={trend.points} fill="none" stroke="var(--text-light)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={trend.end.x} cy={trend.end.y} r="3" fill="var(--foreground)" />
      </svg>
      {ends && <span className="money-spark__ends tabular">{ends.text}</span>}
    </span>
  )
}
