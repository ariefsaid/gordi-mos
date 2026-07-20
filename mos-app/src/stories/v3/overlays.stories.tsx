import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { CommandMenu } from '@/components/command/command-menu'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RowMenu } from '@/components/tasks/row-menu'
import { RecordPanelHost } from '@/shell/record-panel-host'

export const v3Matrix = {
  jobs: [
    "overlay.command-search",
    "overlay.confirmation",
    "overlay.anchored-menu",
    "overlay.current-record-panel-shell",
  ],
  states: ["overlay.current-host-shell"],
  responsive: ["desktop1280", "intermediate", "phone390"],
  canonicalImports: [
    { symbol: "CommandMenu", file: "mos-app/src/components/command/command-menu.tsx", importPath: "@/components/command/command-menu" },
    { symbol: "Button", file: "mos-app/src/components/ui/button.tsx", importPath: "@/components/ui/button" },
    { symbol: "ConfirmDialog", file: "mos-app/src/components/ui/confirm-dialog.tsx", importPath: "@/components/ui/confirm-dialog" },
    { symbol: "RowMenu", file: "mos-app/src/components/tasks/row-menu.tsx", importPath: "@/components/tasks/row-menu" },
    { symbol: "RecordPanelHost", file: "mos-app/src/shell/record-panel-host.tsx", importPath: "@/shell/record-panel-host" },
  ],
  debt: ["RecordPanelHost remains the current shell; desktop split Esc behavior is intentionally non-modal, and any I2 host unification is owned by Issue 4."],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Overlay anatomy',
  excludeStories: /^v3Matrix$/,
  parameters: { docs: { description: { component: 'Current overlay primitives only: centered command/search, centered confirmation, anchored row menu, and the current RecordPanelHost shell. Future Issue 4 host behavior is deliberately not represented.' } } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CommandSearch: Story = {
  render: () => <CommandMenu open onClose={() => undefined} onShareSignal={() => undefined} />,
}

export const Confirmation: Story = {
  render: () => (
    <ConfirmDialog
      open
      title="Archive the Café dispatch task?"
      body="This removes the task from the active queue. The record remains available in the archive."
      confirmLabel="Archive task"
      cancelLabel="Keep task"
      tone="destructive"
      onConfirm={async () => undefined}
      onCancel={() => undefined}
    />
  ),
}

export const AnchoredMenu: Story = {
  render: () => (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="overlay-menu-title">
        <h1 id="overlay-menu-title" className="v3-story-section__title">Task row actions</h1>
        <div className="v3-story-row">
          <span>Confirm Roastery calibration notes</span>
          <RowMenu taskId="task-roastery-071" recordSearch="?from=storybook" />
        </div>
      </section>
    </div>
  ),
}

function RecordPanelShellJourney() {
  const [open, setOpen] = useState(false)
  return (
    <div className="v3-story-frame v3-story-frame--wide">
      <section className="v3-story-section" aria-labelledby="overlay-panel-title">
        <h1 id="overlay-panel-title" className="v3-story-section__title">Current record-panel shell</h1>
        <p className="v3-story-section__copy">Review a current Gordi task in the shared host. The desktop split remains non-modal; narrower regimes use the current modal sheet. Future host migration remains Issue 4.</p>
        <Button variant="primary" onClick={() => setOpen(true)}>Review calibration task</Button>
        {open && (
          <RecordPanelHost
            label="Roastery calibration task"
            title="Confirm Roastery calibration notes"
            onClose={() => setOpen(false)}
            onOpenPage={() => undefined}
          >
            <div className="v3-record-panel-specimen">
              <h2 className="v3-record-panel-specimen__title">Confirm Roastery calibration notes</h2>
              <p className="v3-record-panel-specimen__copy">Aisyah Rahman is checking the calibration notes before the next batch is released to the Café team.</p>
              <Button variant="outline">Open task page</Button>
            </div>
          </RecordPanelHost>
        )}
      </section>
    </div>
  )
}

async function assertRecordPanelJourney(canvasElement: HTMLElement, regime: 'desktop' | 'modal') {
  const canvas = within(canvasElement)
  const trigger = canvas.getByRole('button', { name: 'Review calibration task' })
  await userEvent.click(trigger)
  if (regime === 'desktop') {
    await expect(canvas.getByRole('complementary', { name: 'Roastery calibration task' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect(canvas.getByRole('complementary', { name: 'Roastery calibration task' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Close' }))
  } else {
    await expect(canvas.getByRole('dialog', { name: 'Roastery calibration task' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Close' }))
  }
  await expect(canvas.queryByRole('complementary', { name: 'Roastery calibration task' })).not.toBeInTheDocument()
  await expect(canvas.queryByRole('dialog', { name: 'Roastery calibration task' })).not.toBeInTheDocument()
  await expect(trigger).toHaveFocus()

  if (regime === 'modal') {
    await userEvent.click(trigger)
    await expect(canvas.getByRole('dialog', { name: 'Roastery calibration task' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect(canvas.queryByRole('dialog', { name: 'Roastery calibration task' })).not.toBeInTheDocument()
    await expect(trigger).toHaveFocus()
  }
}

export const CurrentRecordPanelShell: Story = {
  render: () => <RecordPanelShellJourney />,
  parameters: { v3Viewport: 'desktop1280' },
  globals: { viewport: { value: 'desktop1280' } },
  play: async ({ canvasElement }) => assertRecordPanelJourney(canvasElement, 'desktop'),
}

export const CurrentRecordPanelShellIntermediate: Story = {
  render: () => <RecordPanelShellJourney />,
  parameters: { v3Viewport: 'intermediate' },
  globals: { viewport: { value: 'intermediate' } },
  play: async ({ canvasElement }) => assertRecordPanelJourney(canvasElement, 'modal'),
}

export const CurrentRecordPanelShellPhone: Story = {
  render: () => <RecordPanelShellJourney />,
  parameters: { v3Viewport: 'phone390' },
  globals: { viewport: { value: 'phone390' } },
  play: async ({ canvasElement }) => assertRecordPanelJourney(canvasElement, 'modal'),
}
