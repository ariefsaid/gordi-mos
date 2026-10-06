// DayRevenueChart — one branch's revenue per day as bars, with the same weekday a week earlier as a
// dashed line (shape, not hue), a labelled rupiah axis and date ticks. MOS owns the interaction:
// the chart is one focus stop; ←/→ move a day, Home/End jump to the ends, and a click picks the
// day under the pointer. Those set the caller's selected day (the Branch page keeps it in ?d=).
// Hovering only previews: the readout line above the plot — the chart's tooltip, announced
// politely — follows the pointer and returns to the selected day when it leaves. Recharts draws
// the marks only (its keyboard layer and cursor are off, so there is one focus stop and one marker).
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
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
  // Keys act on the latest index at once, not on the URL's next render, so a held arrow never
  // skips a day.
  const indexRef = useRef(selectedIndex)
  useEffect(() => { indexRef.current = selectedIndex }, [selectedIndex])
  const [hover, setHover] = useState<number | null>(null)
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
    const clamped = Math.min(days.length - 1, Math.max(0, next))
    if (clamped !== indexRef.current) {
      indexRef.current = clamped
      onSelect(days[clamped].date)
    }
  }
  const at = (state: { activeTooltipIndex?: number | string | null } | null | undefined) => {
    const i = Number(state?.activeTooltipIndex)
    return Number.isInteger(i) && days[i] ? i : null
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
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
            barCategoryGap="20%"
            accessibilityLayer={false}
            onMouseMove={(state) => setHover(at(state))}
            onMouseLeave={() => setHover(null)}
            onClick={(state) => {
              const i = at(state)
              if (i !== null && i !== indexRef.current) {
                indexRef.current = i
                onSelect(days[i].date)
              }
            }}
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
              width={68}
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
