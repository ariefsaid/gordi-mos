import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ModalShell } from './modal-shell'

describe('ModalShell — one centered interaction contract', () => {
  it('owns dialog semantics and does not render a closed modal', () => {
    const { rerender } = render(
      <ModalShell open={false} onClose={vi.fn()} ariaLabel="Assign owner">
        <button type="button">Close</button>
      </ModalShell>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(
      <ModalShell open onClose={vi.fn()} ariaLabel="Assign owner">
        <button type="button">Close</button>
      </ModalShell>,
    )
    expect(screen.getByRole('dialog', { name: 'Assign owner' })).toHaveAttribute('aria-modal', 'true')
  })

  it('moves focus inside, traps Tab, closes on Escape, and returns focus', async () => {
    const user = userEvent.setup()
    function Fixture() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
          <ModalShell open={open} onClose={() => setOpen(false)} ariaLabel="Shared dialog">
            <button type="button">First</button>
            <button type="button">Last</button>
          </ModalShell>
        </>
      )
    }

    render(<Fixture />)
    const invoker = screen.getByRole('button', { name: 'Open dialog' })
    await user.click(invoker)
    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus())

    screen.getByRole('button', { name: 'Last' }).focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(invoker).toHaveFocus()
  })

  it('honors backdrop and dismissal policies', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <ModalShell open onClose={onClose} ariaLabel="Protected" closeOnBackdrop={false} closeOnEscape={false}>
        <button type="button">Done</button>
      </ModalShell>,
    )
    fireEvent.click(screen.getByTestId('modal-shell-scrim'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    rerender(
      <ModalShell open onClose={onClose} ariaLabel="Dismissible" closeOnBackdrop closeOnEscape>
        <button type="button">Done</button>
      </ModalShell>,
    )
    fireEvent.click(screen.getByTestId('modal-shell-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('exposes the shared surface and phone-mode grammar', () => {
    render(
      <ModalShell
        open
        onClose={vi.fn()}
        role="alertdialog"
        ariaLabelledBy="modal-title"
        ariaDescribedBy="modal-description"
        surface="sheet"
        phoneMode="fullscreen"
      >
        <h2 id="modal-title">Keep this password</h2>
        <p id="modal-description">It is shown once.</p>
      </ModalShell>,
    )
    const dialog = screen.getByRole('alertdialog', { name: 'Keep this password' })
    expect(dialog).toHaveAttribute('aria-describedby', 'modal-description')
    expect(dialog).toHaveAttribute('data-surface', 'sheet')
    expect(dialog).toHaveAttribute('data-phone-mode', 'fullscreen')
  })
})
