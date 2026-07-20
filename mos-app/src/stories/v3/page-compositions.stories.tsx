import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'

export const v3Matrix = {
  jobs: [
    "page-composition.workspace",
    "page-composition.focused-record",
    "page-composition.management",
  ],
  states: [],
  responsive: ["desktop1280", "intermediate", "phone390"],
  canonicalImports: [
    { symbol: "Button", file: "mos-app/src/components/ui/button.tsx", importPath: "@/components/ui/button" },
    { symbol: "PageFrame", file: "mos-app/src/shell/page-frame.tsx", importPath: "@/shell/page-frame" },
    { symbol: "PageHead", file: "mos-app/src/shell/page-head.tsx", importPath: "@/shell/page-head" },
    { symbol: "DataTable", file: "mos-app/src/components/dashboard/data-table.tsx", importPath: "@/components/dashboard/data-table" },
  ],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Page composition',
  excludeStories: /^v3Matrix$/,
  parameters: { docs: { description: { component: 'Static reference compositions for the three shared page families. These are not route implementations or acceptance of representative application screens.' } } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

type WorkRow = {
  id: string
  title: string
  owner: string
  status: string
}

const rows: WorkRow[] = [
  { id: 'task-roastery-071', title: 'Confirm Roastery calibration notes', owner: 'Aisyah Rahman', status: 'In Progress' },
  { id: 'task-cafe-044', title: 'Reconcile Café dispatch quantities', owner: 'Putri Lestari', status: 'Open' },
  { id: 'task-finance-019', title: 'Review weekly cash position', owner: 'Budi Santoso', status: 'Blocked' },
]

const columns: DataTableColumn<WorkRow>[] = [
  { key: 'title', header: 'Task', cardLabel: '', render: (row) => <strong>{row.title}</strong> },
  { key: 'owner', header: 'Owner', cardLabel: 'Owner' },
  { key: 'status', header: 'Status', cardLabel: 'Status' },
]

export const Workspace: Story = {
  render: () => (
    <PageFrame variant="data">
      <PageHead
        title="My tasks"
        subtitle="The work that needs your attention across Gordi today."
        meta="11 tasks · 2 blocked"
        variant="content"
        count={11}
        action={<Button variant="primary">Create task</Button>}
      />
      <DataTable columns={columns} rows={rows} isDesktop caption="My tasks" />
    </PageFrame>
  ),
}

export const FocusedRecord: Story = {
  render: () => (
    <PageFrame variant="prose">
      <PageHead title="Confirm Roastery calibration notes" subtitle="Task · Roastery · Due today" meta="In Progress" />
      <section className="v3-story-section" aria-labelledby="focused-record-title">
        <h2 id="focused-record-title" className="v3-story-section__title">Record details</h2>
        <p className="v3-story-section__copy">A focused record composition keeps the task identity, current status, owner, and next action in one readable surface.</p>
        <div className="v3-story-row">
          <span className="v3-story-label">Owner</span><span>Aisyah Rahman</span>
          <span className="v3-story-label">Due</span><span>Today, 16:00</span>
        </div>
        <Button variant="outline">Mark ready for review</Button>
      </section>
    </PageFrame>
  ),
}

export const Management: Story = {
  render: () => (
    <PageFrame variant="prose">
      <PageHead title="People and access" subtitle="Manage who can act on Gordi workspaces." meta="12 people" variant="content" count={12} action={<Button variant="outline">Invite person</Button>} />
      <DataTable
        columns={[
          { key: 'owner', header: 'Person', cardLabel: '', render: (row: WorkRow) => <strong>{row.owner}</strong> },
          { key: 'title', header: 'Current responsibility', cardLabel: 'Responsibility' },
          { key: 'status', header: 'Access', cardLabel: 'Access' },
        ]}
        rows={rows}
        isDesktop
        caption="People and access"
      />
    </PageFrame>
  ),
}
