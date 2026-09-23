import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { ViewTabs } from '@/components/ui/view-tabs'
import { RecordPanelHost } from '@/shell/record-panel-host'
import { useIsDesktop } from '@/shell/use-is-desktop'

export const v3Matrix = {
  jobs: [
    "accessibility.runnable-a11y",
    "accessibility.runtime-proof",
    "accessibility.keyboard-focus",
  ],
  states: ["button.focus-visible"],
  responsive: ["desktop1280", "intermediate", "phone390"],
  canonicalImports: [
    { symbol: "Button", file: "mos-app/src/components/ui/button.tsx", importPath: "@/components/ui/button" },
    { symbol: "ViewTabs", file: "mos-app/src/components/ui/view-tabs.tsx", importPath: "@/components/ui/view-tabs" },
    { symbol: "RecordPanelHost", file: "mos-app/src/shell/record-panel-host.tsx", importPath: "@/shell/record-panel-host" },
    { symbol: "DataTable", file: "mos-app/src/components/dashboard/data-table.tsx", importPath: "@/components/dashboard/data-table" },
  ],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Accessibility and responsive proof',
  excludeStories: /^v3Matrix$/,
  parameters: {
    a11y: { test: 'error' },
    docs: { description: { component: 'Runnable accessibility and keyboard proof for the current canonical primitives. Automated checks are rendered DOM checks and do not alone certify WCAG AA.' } },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

type ProofRow = { id: string; task: string; pic: string; supervisor: string; due: string }

const proofRows: ProofRow[] = [
  { id: 'handoff-071', task: 'Confirm Roastery calibration notes', pic: 'Aisyah Rahman', supervisor: 'Putri Lestari', due: 'Today' },
  { id: 'handoff-044', task: 'Reconcile Café dispatch quantities', pic: 'Putri Lestari', supervisor: 'Budi Santoso', due: 'Tomorrow' },
]

const proofColumns: DataTableColumn<ProofRow>[] = [
  { key: 'task', header: 'Task', cardLabel: '', render: (row) => <strong>{row.task}</strong> },
  { key: 'pic', header: 'PIC', cardLabel: 'PIC' },
  { key: 'supervisor', header: 'Supervisor', cardLabel: 'Supervisor' },
  { key: 'due', header: 'Due', cardLabel: 'Due' },
]

function RuntimeResponsiveProof() {
  const isDesktop = useIsDesktop()
  return (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="a11y-runtime-title">
        <h1 id="a11y-runtime-title" className="v3-story-section__title">Runtime and viewport proof</h1>
        <p className="v3-story-section__copy">The Gordi task queue reads the production font and token entrypoints while the canonical collection changes shape at the real phone breakpoint.</p>
        <div data-testid="responsive-proof-branch" data-branch={isDesktop ? 'desktop' : 'phone'}>
          <DataTable columns={proofColumns} rows={proofRows} isDesktop={isDesktop} caption="Morning handoff tasks" />
        </div>
      </section>
    </div>
  )
}

async function assertResponsiveProof(canvasElement: HTMLElement, expectedBranch: 'desktop' | 'phone') {
  const canvas = within(canvasElement)
  await expect(canvas.getByRole('heading', { name: 'Runtime and viewport proof' })).toBeVisible()
  await expect(window.matchMedia('(min-width: 768px)').matches).toBe(expectedBranch === 'desktop')
  await expect(canvas.getByTestId('responsive-proof-branch')).toHaveAttribute('data-branch', expectedBranch)
  if (expectedBranch === 'desktop') {
    await expect(canvas.getByRole('table', { name: 'Morning handoff tasks' })).toBeVisible()
    await expect(canvasElement.querySelector('.dt-card')).toBeNull()
  } else {
    await expect(canvasElement.querySelector('table')).toBeNull()
    await expect(canvasElement.querySelector('.dt-card')).not.toBeNull()
  }
  await expect(document.fonts).toBeDefined()
}

export const RuntimeAndViewport: Story = {
  render: () => <RuntimeResponsiveProof />,
  parameters: { v3Viewport: 'desktop1280' },
  globals: { viewport: { value: 'desktop1280' } },
  play: async ({ canvasElement }) => assertResponsiveProof(canvasElement, 'desktop'),
}

export const RuntimeIntermediate: Story = {
  render: () => <RuntimeResponsiveProof />,
  parameters: { v3Viewport: 'intermediate' },
  globals: { viewport: { value: 'intermediate' } },
  play: async ({ canvasElement }) => assertResponsiveProof(canvasElement, 'desktop'),
}

export const RuntimePhone: Story = {
  render: () => <RuntimeResponsiveProof />,
  parameters: { v3Viewport: 'phone390' },
  globals: { viewport: { value: 'phone390' } },
  play: async ({ canvasElement }) => assertResponsiveProof(canvasElement, 'phone'),
}

function KeyboardJourney() {
  const [active, setActive] = useState('table')
  const [opened, setOpened] = useState(false)
  return (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="a11y-keyboard-title">
        <h1 id="a11y-keyboard-title" className="v3-story-section__title">Keyboard journey</h1>
        <ViewTabs
          ariaLabel="Collection view"
          tabs={[{ id: 'table', label: 'Table' }, { id: 'queue', label: 'Queue' }, { id: 'board', label: 'Board', soon: true }]}
          active={active}
          onChange={setActive}
        />
        <Button variant="primary" onClick={() => setOpened(true)}>Review task details</Button>
        {opened && (
          <RecordPanelHost label="Roastery calibration task" onClose={() => setOpened(false)}>
            <div className="v3-record-panel-specimen">
              <h2 className="v3-record-panel-specimen__title">Roastery calibration task</h2>
              <Button variant="outline" onClick={() => setOpened(false)}>Close task details</Button>
            </div>
          </RecordPanelHost>
        )}
      </section>
    </div>
  )
}

export const KeyboardJourneys: Story = {
  render: () => <KeyboardJourney />,
  parameters: { v3Viewport: 'phone390' },
  globals: { viewport: { value: 'phone390' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: 'Table' }))
    await userEvent.keyboard('{ArrowRight}')
    await expect(canvas.getByRole('tab', { name: 'Queue' })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Review task details' }))
    const panel = canvas.queryByRole('complementary', { name: 'Roastery calibration task' })
      ?? canvas.getByRole('dialog', { name: 'Roastery calibration task' })
    await expect(panel).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Close task details' }))
    await expect(canvas.queryByRole('complementary', { name: 'Roastery calibration task' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('dialog', { name: 'Roastery calibration task' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Review task details' })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Review task details' }))
    await expect(canvas.getByRole('dialog', { name: 'Roastery calibration task' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect(canvas.queryByRole('complementary', { name: 'Roastery calibration task' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('dialog', { name: 'Roastery calibration task' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Review task details' })).toHaveFocus()
  },
}
