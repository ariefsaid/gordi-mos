// ConfirmDialog tests — TDD, design-plan §4.7.
// Covers: item 2 (confirm dialogs for reset/disable/archive), 4 (focus management).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './confirm-dialog'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ConfirmDialog', () => {
  it('renders title, body, and action button', () => {
    render(
      <ConfirmDialog
        open
        title="Reset password?"
        body="Their current password will stop working."
        confirmLabel="Reset password"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Reset password?')).toBeInTheDocument()
    expect(screen.getByText(/their current password will stop working/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('calls onConfirm when action button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(
      <ConfirmDialog
        open
        title="Reset password?"
        body="Their current password will stop working."
        confirmLabel="Reset password"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Archive Budi Santoso?"
        body="They drop out of the directory and lose access, but nothing is deleted."
        confirmLabel="Archive"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows submitting state during async onConfirm', async () => {
    const user = userEvent.setup()
    let resolve!: () => void
    const onConfirm = vi.fn(() => new Promise<void>((res) => { resolve = res }))
    render(
      <ConfirmDialog
        open
        title="Disable login?"
        body="They won't be able to log in until you enable it again."
        confirmLabel="Disable"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^disable$/i }))
    // Should show Working… and disable buttons
    expect(screen.getByText(/working/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()

    resolve()
  })

  it('renders error state on onConfirm rejection', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockRejectedValue(new Error('server error'))
    render(
      <ConfirmDialog
        open
        title="Archive Budi Santoso?"
        body="They drop out of the directory."
        confirmLabel="Archive"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /archive/i }))
    await screen.findByRole('alert')
    // Dialog stays open to retry
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not render when open=false', () => {
    render(
      <ConfirmDialog
        open={false}
        title="Archive?"
        body="test"
        confirmLabel="Archive"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('calls onCancel on Esc key', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Disable login?"
        body="They won't be able to log in."
        confirmLabel="Disable"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )

    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })

  it('has role=dialog with aria-modal', () => {
    render(
      <ConfirmDialog
        open
        title="Archive?"
        body="Nothing is deleted."
        confirmLabel="Archive"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  // Focus management (item 4)
  it('moves focus into the dialog on open', async () => {
    render(
      <ConfirmDialog
        open
        title="Archive?"
        body="Nothing is deleted."
        confirmLabel="Archive"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    // After open, focus should be on Cancel button (default safe — not autofocus destructive)
    await waitFor(() => {
      const cancelBtn = screen.getByRole('button', { name: /cancel/i })
      expect(document.activeElement).toBe(cancelBtn)
    })
  })
})
