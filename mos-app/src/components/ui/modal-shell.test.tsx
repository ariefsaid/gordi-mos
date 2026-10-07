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

  it('lets the top nested dialog own Tab instead of the parent dialog', async () => {
    const user = userEvent.setup()
    render(
      <ModalShell open onClose={() => {}} ariaLabel="Outer dialog">
        <button type="button">Outer first</button>
        <ModalShell open onClose={() => {}} ariaLabel="Inner dialog">
          <button type="button">Inner first</button>
          <button type="button">Inner last</button>
        </ModalShell>
        <button type="button">Outer last</button>
      </ModalShell>,
    )

    const innerFirst = screen.getByRole('button', { name: 'Inner first' })
    const innerLast = screen.getByRole('button', { name: 'Inner last' })
    innerLast.focus()
    await user.tab()
    expect(innerFirst).toHaveFocus()

    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(innerLast).toHaveFocus()
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

  it('wraps Tab both ways, leaves Escape dismissal intact, inerts the app, and restores focus', async () => {
    const user = userEvent.setup()
    const appRoot = document.createElement('div')
    appRoot.id = 'root'
    const overlayRoot = document.createElement('div')
    overlayRoot.id = 'overlay-root'
    document.body.append(appRoot, overlayRoot)

    function Fixture() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
          <ModalShell open={open} onClose={() => setOpen(false)} ariaLabel="Layered dialog">
            <input aria-label="First" />
            <select aria-label="Middle"><option>Option</option></select>
            <button type="button" aria-disabled="true">Unavailable</button>
            <textarea aria-label="Last" />
          </ModalShell>
        </>
      )
    }

    const view = render(<Fixture />, { container: appRoot })
    try {
      const opener = screen.getByRole('button', { name: 'Open dialog' })
      await user.click(opener)
      const first = screen.getByRole('textbox', { name: 'First' })
      const last = screen.getByRole('textbox', { name: 'Last' })
      await waitFor(() => expect(first).toHaveFocus())
      expect(appRoot).toHaveAttribute('inert')

      last.focus()
      await user.tab()
      expect(first).toHaveFocus()

      first.focus()
      await user.keyboard('{Shift>}{Tab}{/Shift}')
      expect(last).toHaveFocus()

      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog', { name: 'Layered dialog' })).not.toBeInTheDocument()
      expect(appRoot).not.toHaveAttribute('inert')
      expect(opener).toHaveFocus()
    } finally {
      view.unmount()
      appRoot.remove()
      overlayRoot.remove()
    }
  })

  it('keeps Tab inside when focus sits on a control the trap cannot list', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">Behind</button>
        <ModalShell open onClose={() => {}} ariaLabel="Busy dialog">
          <ul tabIndex={0} aria-label="Lines"><li>Line</li></ul>
          <button type="button" disabled>Back</button>
          <button type="button" aria-disabled="true">Working</button>
        </ModalShell>
      </>,
    )
    const busy = screen.getByRole('button', { name: 'Working' })
    busy.focus()

    await user.tab()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    await user.tab({ shift: true })
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
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

  it('consumes Escape when the top modal is non-dismissible', async () => {
    const user = userEvent.setup()
    function Fixture() {
      return (
        <>
          <ModalShell open onClose={vi.fn()} ariaLabel="Underlying dialog">
            <button type="button">Underlying action</button>
          </ModalShell>
          <ModalShell open onClose={vi.fn()} ariaLabel="Protected top" closeOnEscape={false}>
            <button type="button">Protected action</button>
          </ModalShell>
        </>
      )
    }

    render(<Fixture />)
    const bubbledEscape = vi.fn()
    document.addEventListener('keydown', bubbledEscape)
    try {
      await user.keyboard('{Escape}')
      expect(screen.getByRole('dialog', { name: 'Protected top' })).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Underlying dialog' })).toBeInTheDocument()
      expect(bubbledEscape).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', bubbledEscape)
    }
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
  it('Escape closes only the topmost of two open modal shells', async () => {
    function Fixture() {
      const [underlyingOpen, setUnderlyingOpen] = useState(true)
      const [topOpen, setTopOpen] = useState(true)
      return (
        <>
          <ModalShell open={underlyingOpen} onClose={() => setUnderlyingOpen(false)} ariaLabel="Underlying dialog">
            <p>Underlying content</p>
          </ModalShell>
          <ModalShell open={topOpen} onClose={() => setTopOpen(false)} ariaLabel="Top dialog">
            <p>Top content</p>
          </ModalShell>
        </>
      )
    }

    render(<Fixture />)
    expect(screen.getAllByTestId('modal-shell-scrim')).toHaveLength(2)

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Top dialog' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Underlying dialog' })).toBeInTheDocument()
    expect(screen.getAllByTestId('modal-shell-scrim')).toHaveLength(1)

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Underlying dialog' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('modal-shell-scrim')).not.toBeInTheDocument()
  })

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
