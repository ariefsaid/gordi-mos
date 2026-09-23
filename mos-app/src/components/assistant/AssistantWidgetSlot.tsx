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
      <h3 className="text-foreground font-semibold" style={{ fontSize: 'var(--font-size-body)' }}>{widget.title}</h3>
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
  // Normalize values to bar heights (max = 100% of chart height).
  const numericYValues = widget.points
    .map((p) => p[widget.yKey])
    .filter((v): v is number => typeof v === 'number')
  const maxY = Math.max(...numericYValues, 1) // avoid division by zero

  const barHeight = 120
  const barWidth = 24
  const gap = 12
  const svgHeight = barHeight + 20 // +20 for labels below
  const svgWidth = widget.points.length * (barWidth + gap) - gap

  return (
    <ChartFrame
      title={widget.title}
      ariaLabel={widget.title}
      tableFallback={
        <DataTable
          columns={[
            { key: widget.xKey, header: widget.xKey },
            { key: widget.yKey, header: widget.yKey },
          ]}
          rows={widget.points}
          isDesktop
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
        {widget.points.map((point, idx) => {
          const x = idx * (barWidth + gap)
          const yVal = point[widget.yKey]
          const numericY = typeof yVal === 'number' ? yVal : 0
          const height = (numericY / maxY) * barHeight
          const y = barHeight - height
          const xLabel = String(point[widget.xKey])
          const yLabel = String(yVal)

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
