// ConfirmDialog busy-reset regression (#624). Callers that toggle `open` rather than unmounting
// (component persists across close/reopen) previously left busy=true forever after a successful
// onConfirm: the next open re-render started with Working…, Cancel, backdrop and Escape all
// disabled — a page lock with no way out.
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

  // Stale-resolve race: the reset above (busy died with `open` going false) only covers a
  // confirm that already SETTLED. Close-while-PENDING is different — the first onConfirm's
  // promise is still in flight when the dialog reopens, and its eventual settle must not touch
  // the (by then unrelated) current render: no re-enabling buttons that are already enabled in
  // a way that masks a NEW attempt's busy state, and no painting the first attempt's error over
  // a second attempt in progress. The generation counter (confirm-dialog.tsx) is what closes
  // this: every confirm click bumps it, the open->false edge bumps it, and a settling promise
  // only applies setBusy/setError if its captured generation still matches.
  it('a close-while-pending reopen ignores the stale promise once it finally settles', async () => {
    const user = userEvent.setup()
    let rejectFirst!: (err: Error) => void
    const onConfirm = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectFirst = reject }))
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
    expect(screen.getByText(/working/i)).toBeInTheDocument()

    // Caller closes while the first onConfirm is still pending — never resolved, never rejected.
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

    // Reopen — a fresh attempt. Must be usable, not still marked busy from the first click.
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
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // The FIRST (now stale) promise finally settles — with an error, the sharpest version of
    // the race: without the generation check this would paint the stale error over the fresh,
    // untouched dialog.
    rejectFirst(new Error('stale failure from the first, abandoned attempt'))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    // Flush the microtask the rejected promise's `await onConfirm()` resumes on.
    await new Promise((resolve) => setTimeout(resolve, 0))

    // No state change from the stale settle: still usable, still no error.
    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /discard/i })).toBeEnabled()
    expect(screen.queryByText(/working/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
