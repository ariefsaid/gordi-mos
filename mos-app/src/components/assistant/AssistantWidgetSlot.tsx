import { ChartFrame } from '@/components/dashboard/chart-frame'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { KPITile } from '@/components/dashboard/kpi-tile'
import { useIsDesktop } from '@/shell/use-is-desktop'
import type { AgentWidget, AgentWidgetCell, DataChartWidget, DataInsightWidget, DataTableWidget } from '@/lib/agent/widgets'

function formatCell(value: AgentWidgetCell): string {
  if (value === null) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function DataTableWidgetView({ widget }: { widget: DataTableWidget }) {
  const isDesktop = useIsDesktop()
  const columns: DataTableColumn<Record<string, AgentWidgetCell>>[] = widget.columns.map((column) => ({
    key: column.key,
    header: column.header,
    render: (row) => formatCell(row[column.key]),
  }))

  return (
    <div className="flex flex-col gap-2" style={{ width: '100%' }}>
      <h3 className="text-foreground font-semibold" style={{ fontSize: 'var(--mos-size-3)' }}>{widget.title}</h3>
      <DataTable
        columns={columns}
        rows={widget.rows}
        isDesktop={isDesktop}
        caption={widget.title}
      />
    </div>
  )
}

function DataInsightWidgetView({ widget }: { widget: DataInsightWidget }) {
  return (
    <KPITile
      label={widget.label ?? widget.title}
      value={formatCell(widget.value)}
      sub={widget.detail}
    />
  )
}

function DataChartWidgetView({ widget }: { widget: DataChartWidget }) {
  const isDesktop = useIsDesktop()
  // Normalize values to bar heights with zero baseline.
  const numericYValues = widget.points
    .map((p) => p[widget.yKey])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

  // Present unsupported data (no numeric series values) as a table fallback.
  if (numericYValues.length === 0) {
    return (
      <DataTableWidgetView
        widget={{
          kind: 'data_table',
          title: widget.title,
          columns: [
            { key: widget.xKey, header: widget.xKey },
            { key: widget.yKey, header: widget.yKey },
          ],
          rows: widget.points,
        }}
      />
    )
  }

  const hasPositive = numericYValues.some((v) => v > 0)
  const hasNegative = numericYValues.some((v) => v < 0)

  // Determine domain bounds including 0 for the baseline
  const maxVal = hasPositive ? Math.max(...numericYValues) : 0
  const minVal = hasNegative ? Math.min(...numericYValues) : 0
  const range = maxVal - minVal || 1 // avoid division by zero

  const barHeight = 120
  const barWidth = 24
  const gap = 12
  const svgHeight = barHeight + 20 // +20 for labels below
  const svgWidth = Math.max(0, widget.points.length * (barWidth + gap) - gap)

  // Zero baseline Y position in SVG coordinates (0 at top, barHeight at bottom)
  const zeroY = !hasPositive && !hasNegative
    ? barHeight
    : (maxVal / range) * barHeight

  return (
    <ChartFrame
      title={widget.title}
      ariaLabel={widget.title}
      tableFallback={
        <DataTable
          columns={[
            { key: widget.xKey, header: widget.xKey },
            { key: widget.yKey, header: widget.yKey, numeric: true, render: (row) => formatCell(row[widget.yKey]) },
          ]}
          rows={widget.points}
          isDesktop={isDesktop}
          caption={widget.title}
        />
      }
    >
      <svg
        role="img"
        aria-label={`${widget.title} bar chart`}
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="chart-frame-svg"
      >
        <title>{widget.title}</title>
        <line
          x1={0}
          y1={zeroY}
          x2={svgWidth}
          y2={zeroY}
          stroke="var(--border)"
          strokeWidth={1}
          data-testid="zero-baseline"
          className="chart-zero-baseline"
          aria-hidden="true"
        />
        {widget.points.map((point, idx) => {
          const x = idx * (barWidth + gap)
          const yVal = point[widget.yKey]
          const numericY = typeof yVal === 'number' && Number.isFinite(yVal) ? yVal : 0
          const height = (Math.abs(numericY) / range) * barHeight
          const y = numericY >= 0 ? zeroY - height : zeroY
          const xLabel = point[widget.xKey] != null ? String(point[widget.xKey]) : ''
          const yLabel = formatCell(yVal as AgentWidgetCell)

          return (
            <g key={idx}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                fill="var(--primary)"
                rx={2}
                role="graphics-symbol"
                aria-label={`${xLabel}: ${yLabel}`}
              />
              <text
                x={x + barWidth / 2}
                y={svgHeight - 4}
                textAnchor="middle"
                fontSize="10"
                fill="var(--muted-foreground)"
                className="tabular"
              >
                {xLabel.slice(0, 8)}
              </text>
            </g>
          )
        })}
      </svg>
    </ChartFrame>
  )
}

export function AssistantWidgetSlot({ widget }: { widget: AgentWidget }) {
  switch (widget.kind) {
    case 'data_table':
      return <DataTableWidgetView widget={widget} />
    case 'data_insight':
      return <DataInsightWidgetView widget={widget} />
    case 'data_chart':
      return <DataChartWidgetView widget={widget} />
  }
}
