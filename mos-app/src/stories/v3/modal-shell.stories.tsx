import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ModalShell, type ModalShellProps } from '@/components/ui/modal-shell'
import { Button } from '@/components/ui/button'

export const v3Matrix = {
  jobs: [
    'modal-shell.centered-focus-trap',
    'modal-shell.escape-and-focus-return',
    'modal-shell.sheet-surface',
    'modal-shell.phone-fullscreen',
  ],
  states: [
    'modal-shell.closed',
    'modal-shell.centered-open',
    'modal-shell.focus-trap-cycle',
    'modal-shell.sheet',
    'modal-shell.phone-fullscreen',
  ],
  responsive: ['desktop1280', 'intermediate', 'phone390'],
  canonicalImports: [
    { symbol: 'ModalShell', file: 'mos-app/src/components/ui/modal-shell.tsx', importPath: '@/components/ui/modal-shell' },
    { symbol: 'Button', file: 'mos-app/src/components/ui/button.tsx', importPath: '@/components/ui/button' },
  ],
  scope: { applicationMigration: false, representativeAcceptance: false, futureIssue4Host: false },
} as const

const meta = {
  title: 'Modal shell',
  excludeStories: /^v3Matrix$/,
  parameters: {
    docs: {
      description: {
        component:
          'The single interaction owner for centered/sheet dialogs: domain tenants supply content and dismissal policy; the shell owns focus capture, the Tab trap, Escape, the scrim, responsive geometry, and invoker focus return.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ModalHarness({
  surface = 'centered',
  phoneMode = 'centered',
  closeOnBackdrop = false,
  title,
  copy,
}: {
  surface?: ModalShellProps['surface']
  phoneMode?: ModalShellProps['phoneMode']
  closeOnBackdrop?: boolean
  title: string
  copy: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="v3-story-frame">
      <section className="v3-story-section" aria-labelledby="modal-shell-story-title">
        <h1 id="modal-shell-story-title" className="v3-story-section__title">{title}</h1>
        <p className="v3-story-section__copy">{copy}</p>
        <div className="v3-story-row">
          <Button variant="outline" onClick={() => setOpen(true)}>Open dialog</Button>
        </div>
        <ModalShell
          open={open}
          onClose={() => setOpen(false)}
          ariaLabelledBy="modal-shell-dialog-title"
          ariaDescribedBy="modal-shell-dialog-copy"
          surface={surface}
          phoneMode={phoneMode}
          closeOnBackdrop={closeOnBackdrop}
        >
          <div className="v3-story-stack">
            <h2 id="modal-shell-dialog-title" className="v3-story-section__title">Discard this draft?</h2>
            <p id="modal-shell-dialog-copy" className="v3-story-section__copy">
              The Roastery calibration note has unsaved edits. Keep editing to retain them, or
              discard to drop the draft.
            </p>
            <div className="v3-story-row">
              <Button variant="outline" onClick={() => setOpen(false)}>Keep editing</Button>
              <Button variant="destructive" onClick={() => setOpen(false)}>Discard draft</Button>
            </div>
          </div>
        </ModalShell>
      </section>
    </div>
  )
}

export const CenteredFocusTrap: Story = {
  render: () => (
    <ModalHarness
      title="Centered dialog and focus capture"
      copy="Opening moves focus to the first focusable control; Tab cycles inside the dialog and never escapes to the page underneath."
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open dialog' }))
    const dialog = await canvas.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // Focus lands on the first focusable control inside the dialog.
    const keep = canvas.getByRole('button', { name: 'Keep editing' })
    await waitFor(() => expect(keep).toHaveFocus())
    // Tab wraps: from the last control the trap cycles back to the first.
    await userEvent.tab()
    expect(canvas.getByRole('button', { name: 'Discard draft' })).toHaveFocus()
    await userEvent.tab()
    await waitFor(() => expect(keep).toHaveFocus())
  },
}

export const EscapeReturnsFocus: Story = {
  render: () => (
    <ModalHarness
      title="Escape closes, focus returns"
      copy="Escape closes the dialog (unless the tenant opts out) and focus returns to the invoker — the invoker-refocus contract every leave-guard tenant relies on."
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const invoker = canvas.getByRole('button', { name: 'Open dialog' })
    await userEvent.click(invoker)
    await canvas.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull())
    expect(invoker).toHaveFocus()
  },
}

export const SheetSurface: Story = {
  render: () => (
    <ModalHarness
      title="Sheet surface"
      copy="The same shell with the sheet geometry — one interaction owner, two surfaces; tenants never re-implement scrim or focus handling to get the sheet look."
      surface="sheet"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open dialog' }))
    const dialog = await canvas.findByRole('dialog')
    expect(dialog).toHaveAttribute('data-surface', 'sheet')
  },
}

export const PhoneFullscreen: Story = {
  render: () => (
    <ModalHarness
      title="Phone fullscreen mode"
      copy="On phone, a tenant that opts into fullscreen gets the full-viewport surface and a locked page scroll behind it."
      phoneMode="fullscreen"
    />
  ),
  parameters: { v3Viewport: 'phone390' },
  globals: { viewport: { value: 'phone390' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open dialog' }))
    const dialog = await canvas.findByRole('dialog')
    expect(dialog).toHaveAttribute('data-phone-mode', 'fullscreen')
  },
}
