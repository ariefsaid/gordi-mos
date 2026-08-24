import type { Meta, StoryObj } from '@storybook/react-vite'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { StatusPill } from '@/components/tasks/status-pill'
import { useIsDesktop } from '@/shell/use-is-desktop'

export const v3Matrix = {
  jobs: [
    "dense-collection.realistic-gordi-records",
    "dense-collection.viewport-matrix",
    "dense-collection.state-matrix",
  ],
  states: [
    "collection.ready",
    "collection.loading",
    "collection.empty",
    "collection.filtered-empty",
    "collection.error",
  ],
  responsive: ["desktop1280", "intermediate", "phone390"],
  canonicalImports: [
    { symbol: "DataTable", file: "mos-app/src/components/dashboard/data-table.tsx", importPath: "@/components/dashboard/data-table" },
    { symbol: "StatusPill", file: "mos-app/src/components/tasks/status-pill.tsx", importPath: "@/components/tasks/status-pill" },
  ],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Dense collection anatomy',
  excludeStories: /^v3Matrix$/,
  parameters: { docs: { description: { component: 'One canonical DataTable renders the desktop table or phone cards. The fixture is realistic Gordi operations data and the responsive branch is owned by the production hook.' } } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

type CollectionRow = {
  id: string
  task: string
  pic: string
  supervisor: string
  status: 'Open' | 'In Progress' | 'Blocked' | 'Done'
  due: string
}

const rows: CollectionRow[] = [
  { id: 'task-071', task: 'Confirm Roastery calibration notes', pic: 'Aisyah Rahman', supervisor: 'Putri Lestari', status: 'In Progress', due: 'Today' },
  { id: 'task-044', task: 'Reconcile Café dispatch quantities', pic: 'Putri Lestari', supervisor: 'Budi Santoso', status: 'Open', due: 'Tomorrow' },
  { id: 'task-019', task: 'Review weekly cash position', pic: 'Budi Santoso', supervisor: 'Nadia Pratama', status: 'Blocked', due: 'Fri 24 Jul' },
  { id: 'task-006', task: 'Publish Monday branch briefing', pic: 'Nadia Pratama', supervisor: 'Aisyah Rahman', status: 'Done', due: 'Completed' },
]

const columns: DataTableColumn<CollectionRow>[] = [
  { key: 'task', header: 'Task', cardLabel: '', render: (row) => <strong>{row.task}</strong> },
  { key: 'pic', header: 'PIC', cardLabel: 'PIC' },
  { key: 'supervisor', header: 'Supervisor', cardLabel: 'Supervisor' },
  { key: 'status', header: 'Status', cardLabel: 'Status', render: (row) => <StatusPill status={row.status} /> },
  { key: 'due', header: 'Due', cardLabel: 'Due' },
]

function CollectionSpecimen({ state = 'ready', emptyLabel = 'No tasks match this view.' }: { state?: 'ready' | 'loading' | 'empty' | 'error'; emptyLabel?: string }) {
  const isDesktop = useIsDesktop()
  return (
    <div className="v3-story-frame v3-story-frame--wide">
      <section className="v3-story-section" aria-labelledby="dense-collection-title">
        <h1 id="dense-collection-title" className="v3-story-section__title">Tasks collection</h1>
        <p className="v3-story-section__copy">{isDesktop ? 'Desktop/intermediate table branch' : 'Phone card branch'} · live viewport regime from the canonical responsive hook</p>
        <DataTable
          columns={columns}
          rows={state === 'ready' ? rows : []}
          state={state}
          emptyLabel={emptyLabel}
          onRetry={() => undefined}
          isDesktop={isDesktop}
          caption="Gordi task collection"
        />
      </section>
    </div>
  )
}

export const ReadyDesktop: Story = {
  render: () => <CollectionSpecimen />,
  parameters: { v3Viewport: 'desktop1280' },
  globals: { viewport: { value: 'desktop1280' } },
}

export const ReadyIntermediate: Story = {
  render: () => <CollectionSpecimen />,
  parameters: { v3Viewport: 'intermediate' },
  globals: { viewport: { value: 'intermediate' } },
}

export const ReadyPhone: Story = {
  render: () => <CollectionSpecimen />,
  parameters: { v3Viewport: 'phone390' },
  globals: { viewport: { value: 'phone390' } },
}

export const Loading: Story = {
  render: () => <CollectionSpecimen state="loading" />,
}

export const Empty: Story = {
  render: () => <CollectionSpecimen state="empty" emptyLabel="No open Gordi tasks remain." />,
}

export const FilteredEmpty: Story = {
  render: () => <CollectionSpecimen state="empty" emptyLabel="No Gordi tasks match status Blocked and PIC Aisyah Rahman." />,
}

export const Error: Story = {
  render: () => <CollectionSpecimen state="error" />,
}
