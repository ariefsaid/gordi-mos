import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useIsDesktop } from '@/shell/use-is-desktop'

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
  pic: string
  supervisor: string
  status: string
}

const rows: WorkRow[] = [
  { id: 'task-roastery-071', title: 'Confirm Roastery calibration notes', pic: 'Aisyah Rahman', supervisor: 'Putri Lestari', status: 'In Progress' },
  { id: 'task-cafe-044', title: 'Reconcile Café dispatch quantities', pic: 'Putri Lestari', supervisor: 'Budi Santoso', status: 'Open' },
  { id: 'task-finance-019', title: 'Review weekly cash position', pic: 'Budi Santoso', supervisor: 'Nadia Pratama', status: 'Blocked' },
]

const columns: DataTableColumn<WorkRow>[] = [
  { key: 'title', header: 'Task', cardLabel: '', render: (row) => <strong>{row.title}</strong> },
  { key: 'pic', header: 'PIC', cardLabel: 'PIC' },
  { key: 'supervisor', header: 'Supervisor', cardLabel: 'Supervisor' },
  { key: 'status', header: 'Status', cardLabel: 'Status' },
]

function WorkspaceComposition() {
  const isDesktop = useIsDesktop()
  return (
    <PageFrame variant="data">
      <PageHead
        title="My tasks"
        subtitle="The work that needs your attention across Gordi today."
        meta="11 tasks · 2 blocked"
        variant="content"
        count={11}
        action={<Button variant="primary">Create task</Button>}
      />
      <div data-testid="page-composition-branch" data-branch={isDesktop ? 'desktop' : 'phone'}>
        <DataTable columns={columns} rows={rows} isDesktop={isDesktop} caption="My tasks" />
      </div>
    </PageFrame>
  )
}

export const Workspace: Story = {
  render: () => <WorkspaceComposition />,
  parameters: { v3Viewport: 'desktop1280' },
  globals: { viewport: { value: 'desktop1280' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('page-composition-branch')).toHaveAttribute('data-branch', 'desktop')
    await expect(canvas.getByRole('table', { name: 'My tasks' })).toBeVisible()
    await expect(canvasElement.querySelector('.dt-card')).toBeNull()
  },
}

export const WorkspaceIntermediate: Story = {
  render: () => <WorkspaceComposition />,
  parameters: { v3Viewport: 'intermediate' },
  globals: { viewport: { value: 'intermediate' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('page-composition-branch')).toHaveAttribute('data-branch', 'desktop')
    await expect(canvas.getByRole('table', { name: 'My tasks' })).toBeVisible()
  },
}

export const WorkspacePhone: Story = {
  render: () => <WorkspaceComposition />,
  parameters: { v3Viewport: 'phone390' },
  globals: { viewport: { value: 'phone390' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvasElement.querySelector('table')).toBeNull()
    await expect(canvasElement.querySelector('.dt-card')).not.toBeNull()
    await expect(canvas.getByText('Confirm Roastery calibration notes')).toBeVisible()
  },
}

export const FocusedRecord: Story = {
  render: () => (
    <PageFrame variant="prose">
      <PageHead title="Confirm Roastery calibration notes" subtitle="Task · Roastery · Due today" meta="In Progress" />
      <section className="v3-story-section" aria-labelledby="focused-record-title">
        <h2 id="focused-record-title" className="v3-story-section__title">Record details</h2>
        <p className="v3-story-section__copy">A focused record composition keeps the task identity, current status, PIC, Supervisor, and next action in one readable surface.</p>
        <div className="v3-story-row">
          <span className="v3-story-label">PIC</span><span>Aisyah Rahman</span>
          <span className="v3-story-label">Supervisor</span><span>Putri Lestari</span>
          <span className="v3-story-label">Due</span><span>Today, 16:00</span>
        </div>
        <Button variant="outline">Mark ready for review</Button>
      </section>
    </PageFrame>
  ),
}

function ManagementComposition() {
  const isDesktop = useIsDesktop()
  const people = [
    { id: 'person-aisyah', person: 'Aisyah Rahman', responsibility: 'Roastery calibration', access: 'Operator' },
    { id: 'person-putri', person: 'Putri Lestari', responsibility: 'Café dispatch', access: 'Supervisor' },
    { id: 'person-budi', person: 'Budi Santoso', responsibility: 'Cash position review', access: 'Finance' },
  ]
  return (
    <PageFrame variant="prose">
      <PageHead title="People and access" subtitle="Manage who can act on Gordi workspaces." meta="12 people" variant="content" count={12} action={<Button variant="outline">Invite person</Button>} />
      <DataTable
        columns={[
          { key: 'person', header: 'Person', cardLabel: '', render: (row) => <strong>{row.person}</strong> },
          { key: 'responsibility', header: 'Current responsibility', cardLabel: 'Responsibility' },
          { key: 'access', header: 'Access', cardLabel: 'Access' },
        ]}
        rows={people}
        isDesktop={isDesktop}
        caption="People and access"
      />
    </PageFrame>
  )
}

export const Management: Story = {
  render: () => <ManagementComposition />,
}
