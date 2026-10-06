// DayRevenueChart — one branch's revenue per day as bars, with the same weekday a week earlier as a
// dashed line (shape, not hue), a labelled rupiah axis and date ticks. MOS owns the interaction:
// the chart is one focus stop; ←/→ move a day, Home/End jump to the ends, and a click or tap picks
// the day under the pointer. Those set the caller's selected day (the Branch page keeps it in ?d=).
// A mouse hovering only previews: the readout line above the plot — the chart's tooltip, announced
// politely — follows it and returns to the selected day when it leaves. The day under the pointer
// is read from the pointer's own position, so a tap with no hover before it picks the right day.
// Recharts draws the marks only (its keyboard layer and cursor are off: one focus stop, one marker).
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { formatIDR } from '@/lib/format/money'
import { formatIDRCompact, signedChange } from '@/lib/sales-dashboard'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import type { BranchDay } from '@/lib/money-branch-page'
import { PLOT_MARGIN, Y_AXIS_WIDTH, dayAt } from './day-chart-geometry'
import './day-revenue-chart.css'

export interface DayRevenueChartProps {
  days: BranchDay[]
  /** The selected day's date; it must be one of `days`. */
  selected: string
  onSelect: (date: string) => void
  /** The chart's accessible name, e.g. "Gordi HQ revenue per day". */
  label: string
}

/** A missing day's stub, as a share of the tallest bar: visible, never mistaken for a figure. */
const STUB_SHARE = 0.08

export function DayRevenueChart({ days, selected, onSelect, label }: DayRevenueChartProps) {
  const t = useT()
  const { locale } = useI18n()
  const readoutId = useId()
  const hintId = useId()
  const patternId = `money-missing-${useId().replace(/:/g, '')}`
  const selectedIndex = Math.max(0, days.findIndex((d) => d.date === selected))
  // Keys and taps act on the latest index at once, not on the URL's next render, so a held arrow
  // never stops short. The prop takes over only once it reaches the day last asked for (or when
  // nothing is pending), so a render from an earlier URL never writes an older day back.
  const indexRef = useRef(selectedIndex)
  const pendingRef = useRef<string | null>(null)
  if (pendingRef.current === null || pendingRef.current === selected || !days.some((d) => d.date === pendingRef.current)) {
    pendingRef.current = null
    indexRef.current = selectedIndex
  }
  const [hover, setHover] = useState<number | null>(null)
  // A pick is a primary press that starts and ends on the plot: a right click, or a drag released
  // here, picks nothing.
  const pressRef = useRef(false)
  const choose = (i: number) => {
    if (i === indexRef.current) return
    indexRef.current = i
    pendingRef.current = days[i].date
    onSelect(days[i].date)
  }
  const index = selectedIndex
  const max = Math.max(1, ...days.map((d) => Math.max(d.value ?? 0, d.compare ?? 0)))
  const data = days.map((d) => ({ ...d, stub: d.value === null ? max * STUB_SHARE : null }))
  const ticks = [0, max / 2, max]

  const day = days[hover ?? index]
  const readout = day ? readoutText(day) : ''
  function readoutText(d: BranchDay): string {
    const date = formatWeekdayDayMonth(d.date, locale)
    if (d.value === null) return t('money.chart.readout.missing', { date })
    if (d.compare === null) return t('money.chart.readout.noCompare', { date, value: formatIDR(d.value) })
    const change = d.compare > 0 ? signedChange(d.value / d.compare - 1).text : null
    return change
      ? t('money.chart.readout', { date, value: formatIDR(d.value), compare: formatIDR(d.compare), change })
      : t('money.chart.readout.zeroCompare', { date, value: formatIDR(d.value), compare: formatIDR(d.compare) })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = indexRef.current
    const next = event.key === 'ArrowLeft' ? current - 1
      : event.key === 'ArrowRight' ? current + 1
        : event.key === 'Home' ? 0
          : event.key === 'End' ? days.length - 1
            : null
    if (next === null) return
    event.preventDefault()
    setHover(null)
    choose(Math.min(days.length - 1, Math.max(0, next)))
  }
  const pointerDay = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return dayAt(event.clientX - rect.left, rect.width, days.length)
  }
  const anyMissing = days.some((d) => d.value === null)

  return (
    <figure className="money-chart">
      <p id={readoutId} className="money-chart__readout tabular" aria-live="polite">{readout}</p>
      <div
        className="money-chart__plot"
        role="group"
        tabIndex={0}
        aria-label={label}
        aria-describedby={`${readoutId} ${hintId}`}
        onKeyDown={onKeyDown}
        // Recharts' inner layers take focus on a click; the named group keeps it, so the keys and
        // the one focus ring stay on the chart.
        onFocus={(event) => { if (event.target !== event.currentTarget) event.currentTarget.focus({ preventScroll: true }) }}
        onPointerDown={(event) => { pressRef.current = event.button === 0 }}
        onPointerCancel={() => { pressRef.current = false }}
        onPointerMove={(event) => { if (event.pointerType === 'mouse') setHover(pointerDay(event)) }}
        onPointerLeave={() => { setHover(null); pressRef.current = false }}
        onPointerUp={(event) => {
          const pressed = pressRef.current
          pressRef.current = false
          const i = pressed ? pointerDay(event) : null
          if (i !== null) choose(i)
          // A tap leaves no pointer behind to leave: the readout returns to the chosen day.
          if (event.pointerType !== 'mouse') setHover(null)
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={PLOT_MARGIN}
            barCategoryGap="20%"
            accessibilityLayer={false}
          >
            <defs>
              <pattern id={patternId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="4" stroke="var(--muted-foreground)" strokeWidth="1.5" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              interval="preserveStartEnd"
              minTickGap={16}
              tick={{ fill: 'var(--muted-foreground)' }}
              tickFormatter={(date: string) => formatWeekdayDayMonth(date, locale).replace(/^\S+,?\s/, '')}
            />
            <YAxis
              ticks={ticks}
              domain={[0, max]}
              width={Y_AXIS_WIDTH}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted-foreground)' }}
              tickFormatter={(v: number) => formatIDRCompact(v)}
            />
            <Bar dataKey="value" stackId="day" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell
                  key={d.date}
                  fill="var(--primary)"
                  fillOpacity={i === index ? 1 : 0.55}
                />
              ))}
            </Bar>
            <Bar dataKey="stub" stackId="day" fill={`url(#${patternId})`} isAnimationActive={false} />
            <Line
              dataKey="compare"
              type="linear"
              stroke="var(--muted-foreground)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="money-chart__legend">
        <span className="money-chart__entry">
          <span className="money-chart__key money-chart__key--bar" aria-hidden="true" />
          {t('money.chart.legend.revenue')}
        </span>
        <span className="money-chart__entry">
          <span className="money-chart__key money-chart__key--line" aria-hidden="true" />
          {t('money.chart.legend.compare')}
        </span>
        {anyMissing && (
          <span className="money-chart__entry">
            <span className="money-chart__key money-chart__key--missing" aria-hidden="true" />
            {t('money.chart.legend.missing')}
          </span>
        )}
        <span id={hintId} className="sr-only">{t('money.chart.keys')}</span>
      </figcaption>
    </figure>
  )
}
