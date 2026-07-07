import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
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
      <h3 className="text-foreground font-semibold" style={{ fontSize: 14 }}>{widget.title}</h3>
      <DataTable
        columns={columns}
        rows={widget.rows}
        isDesktop={isDesktop}
        caption={widget.title}
        emptyLabel="No rows to show."
      />
    </div>
  )
}

function DataInsightWidgetView({ widget }: { widget: DataInsightWidget }) {
  return (
    <div className="rounded-md border border-border bg-secondary" style={{ padding: '0.75rem' }}>
      <h3 className="text-foreground font-semibold" style={{ fontSize: 14 }}>{widget.title}</h3>
      <div className="text-foreground tabular" style={{ fontSize: 22, marginTop: '0.25rem' }}>{formatCell(widget.value)}</div>
      {widget.label && <div className="text-muted-foreground" style={{ fontSize: 12 }}>{widget.label}</div>}
      {widget.detail && <p className="text-muted-foreground" style={{ fontSize: 13, marginTop: '0.375rem' }}>{widget.detail}</p>}
    </div>
  )
}

function DataChartWidgetView({ widget }: { widget: DataChartWidget }) {
  return (
    <div className="rounded-md border border-border bg-secondary" style={{ padding: '0.75rem' }}>
      <h3 className="text-foreground font-semibold" style={{ fontSize: 14 }}>{widget.title}</h3>
      <DataTable
        columns={[
          { key: widget.xKey, header: widget.xKey },
          { key: widget.yKey, header: widget.yKey },
        ]}
        rows={widget.points}
        isDesktop
        caption={widget.title}
      />
    </div>
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
