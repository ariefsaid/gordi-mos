// ConfirmDialog busy-reset regression (#624). The always-mounted caller style (open toggles,
// component never unmounts — task-drawer.tsx's two sites) previously left busy=true forever
// after a successful onConfirm: the next open re-render started with Working…, Cancel,
// backdrop and Escape all disabled — a page lock with no way out.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './confirm-dialog'

describe('ConfirmDialog busy reset (always-mounted caller style)', () => {
  it('re-enables Cancel and the confirm button on reopen after a successful confirm', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()

    const { rerender } = render(
      <ConfirmDialog
        open
        title="Discard changes?"
        body="Unsaved edits will be lost."
        confirmLabel="Discard"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: /discard/i }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())

    // Caller reacts to the resolved confirm by flipping `open` false — WITHOUT unmounting
    // (the always-mounted style: `open={pendingIntent !== null}` in task-drawer.tsx).
    rerender(
      <ConfirmDialog
        open={false}
        title="Discard changes?"
        body="Unsaved edits will be lost."
        confirmLabel="Discard"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Reopen (e.g. the user triggers the leave-intent again).
    rerender(
      <ConfirmDialog
        open
        title="Discard changes?"
        body="Unsaved edits will be lost."
        confirmLabel="Discard"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /discard/i })).toBeEnabled()
    expect(screen.queryByText(/working/i)).not.toBeInTheDocument()
  })
})
