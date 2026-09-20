import { useEffect, useRef, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModalShell } from './modal-shell'
import { Picker } from './picker'

describe('ModalShell — one centered interaction contract', () => {
  // Restores real timers unconditionally, regardless of whether the fake-timers test below threw
  // — a leaked fake-timer stub outlives its own test and hangs every unrelated timer-driven test
  // that shares this worker afterward.
  afterEach(() => { vi.useRealTimers() })

  it('dismisses a nested Picker before closing the modal', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ModalShell open onClose={onClose} ariaLabel="Share Signal">
        <Picker
          label="Owning Team"
          value=""
          options={[
            { value: 'team-a', label: 'Gordi HQ Kitchen' },
            { value: 'team-b', label: 'Radiant Kitchen' },
          ]}
          onChange={vi.fn()}
        />
      </ModalShell>,
    )

    await user.click(screen.getByRole('combobox', { name: 'Owning Team' }))
    expect(screen.getByRole('listbox', { name: 'Owning Team' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox', { name: 'Owning Team' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Share Signal' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Owning Team' })).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
  })

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

  it('focuses an explicit initialFocusRef target instead of the first focusable descendant', async () => {
    function Fixture() {
      const textareaRef = useRef<HTMLTextAreaElement>(null)
      return (
        <ModalShell open onClose={vi.fn()} ariaLabel="Share a Signal" initialFocusRef={textareaRef}>
          <button type="button">Close</button>
          <textarea ref={textareaRef} aria-label="What happened?" />
        </ModalShell>
      )
    }
    render(<Fixture />)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'What happened?' })).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveFocus()
  })

  // The target for initialFocusRef is not always mounted on the same render that flips `open`
  // true — a caller can gate the dialog's own mount behind an async condition (an authority
  // check, a data fetch) it does not control. The ref only needs to be populated by the time the
  // dialog actually appears; ModalShell reads it fresh on that render, not on `open`'s first edge.
  it('honors initialFocusRef even when the dialog mounts on a later, timer-gated render', async () => {
    vi.useFakeTimers()
    function DelayedFixture() {
      const [ready, setReady] = useState(false)
      const textareaRef = useRef<HTMLTextAreaElement>(null)
      useEffect(() => {
        const id = setTimeout(() => setReady(true), 50)
        return () => clearTimeout(id)
      }, [])
      if (!ready) return null
      return (
        <ModalShell open onClose={vi.fn()} ariaLabel="Share a Signal" initialFocusRef={textareaRef}>
          <button type="button">Close</button>
          <textarea ref={textareaRef} aria-label="What happened?" />
        </ModalShell>
      )
    }
    render(<DelayedFixture />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await act(async () => { vi.advanceTimersByTime(60) })

    expect(screen.getByRole('textbox', { name: 'What happened?' })).toHaveFocus()
    vi.useRealTimers()
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

  // A confirm opened OVER another modal (e.g. the Signal composer's discard confirm) must
  // dim that modal with its own scrim, not just sit on the page-level one. Each ModalShell
  // instance renders its own fixed, full-viewport `.modal-shell__scrim`; nested here, the
  // confirm's copy mounts strictly after the composer's in document order, so it paints over
  // the composer with no ancestor between them (position: fixed, no transform) to confine it.
  it('a nested ModalShell (a confirm over another dialog) renders its own scrim above the outer one', () => {
    render(
      <ModalShell open onClose={vi.fn()} ariaLabel="Share Signal">
        <p>Composer content</p>
        <ModalShell open onClose={vi.fn()} ariaLabel="Discard this Signal?">
          <p>Your draft will be lost if you leave this composer.</p>
        </ModalShell>
      </ModalShell>,
    )
    const scrims = screen.getAllByTestId('modal-shell-scrim')
    expect(scrims).toHaveLength(2)
    // DOM order: the confirm's scrim is a descendant of the composer's, so with equal z-index
    // and no ancestor transform, it paints last — on top.
    expect(scrims[0].contains(scrims[1])).toBe(true)
    expect(screen.getByRole('dialog', { name: 'Share Signal' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Discard this Signal?' })).toBeInTheDocument()
  })
})
