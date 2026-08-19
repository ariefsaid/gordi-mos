// I5 inline-edit primitive (OD-REDESIGN-22 · interaction-contract.md class I5).
// The owner-locked law: Enter / Tab / click-outside COMMITS; Escape DISCARDS and
// restores the saved value. These tests drive the contract through a real <input>
// harness (fireEvent keyboard/blur/change), asserting behavior, never internals.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useInlineCommit } from './use-inline-commit'

// A minimal text/number field wired to the primitive — the shape every retrofit
// consumer (PlanQtyCell, PlanQtyStepper) follows.
function NumberField(props: {
  value: number
  onCommit: (next: number) => void | Promise<void>
  disabled?: boolean
  rollbackMessage?: string
}) {
  const ic = useInlineCommit<number>({
    value: props.value,
    onCommit: props.onCommit,
    disabled: props.disabled,
    rollbackMessage: props.rollbackMessage ?? 'Couldn’t save — reverted.',
  })
  return (
    <div>
      <input
        aria-label="qty"
        type="number"
        value={ic.draft}
        disabled={props.disabled || ic.pending}
        aria-busy={ic.pending || undefined}
        onChange={e => ic.setDraft(Number(e.target.value))}
        onKeyDown={ic.onKeyDown}
        onBlur={ic.onBlur}
      />
      <button type="button" aria-label="dec" onClick={() => ic.commit(ic.draft - 1)}>−</button>
      {ic.error && (
        <span role="alert">
          Couldn’t save
          <button type="button" aria-label="retry" onClick={ic.retry}>Retry</button>
        </span>
      )}
      <span role="status" aria-live="polite">{ic.liveMessage}</span>
    </div>
  )
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('useInlineCommit — commit gestures (Enter / Tab / click-outside)', () => {
  it('AC-I5-1: Enter commits the current draft', () => {
    const onCommit = vi.fn()
    render(<NumberField value={5} onCommit={onCommit} />)
    const input = screen.getByLabelText('qty')
    fireEvent.change(input, { target: { value: '17' } })
    expect(onCommit).not.toHaveBeenCalled() // typing alone does NOT commit
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith(17)
  })

  it('AC-I5-2: blur commits the current draft (covers Tab + click-outside)', () => {
    const onCommit = vi.fn()
    render(<NumberField value={5} onCommit={onCommit} />)
    const input = screen.getByLabelText('qty')
    fireEvent.change(input, { target: { value: '9' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith(9)
  })

  it('does not commit when the draft is unchanged (no needless write)', () => {
    const onCommit = vi.fn()
    render(<NumberField value={5} onCommit={onCommit} />)
    const input = screen.getByLabelText('qty')
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commit(override) commits a programmatic value (stepper ±) and syncs the draft', () => {
    const onCommit = vi.fn()
    render(<NumberField value={5} onCommit={onCommit} />)
    fireEvent.click(screen.getByLabelText('dec'))
    expect(onCommit).toHaveBeenCalledWith(4)
    expect(screen.getByLabelText('qty')).toHaveValue(4)
  })
})

describe('useInlineCommit — Escape DISCARDS (OD-REDESIGN-22)', () => {
  it('AC-I5-3: Escape restores the saved value and does NOT commit', () => {
    const onCommit = vi.fn()
    render(<NumberField value={5} onCommit={onCommit} />)
    const input = screen.getByLabelText('qty')
    fireEvent.change(input, { target: { value: '42' } })
    expect(input).toHaveValue(42)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue(5) // saved value restored
    expect(onCommit).not.toHaveBeenCalled() // discard, never commit
  })

  it('a blur after Escape is a no-op (draft already equals saved)', () => {
    const onCommit = vi.fn()
    render(<NumberField value={5} onCommit={onCommit} />)
    const input = screen.getByLabelText('qty')
    fireEvent.change(input, { target: { value: '42' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('useInlineCommit — async pending + rollback (reuses the I6 optimistic idiom)', () => {
  it('AC-I5-4: the field is aria-busy + disabled while an async commit is pending', async () => {
    const d = deferred<void>()
    render(<NumberField value={5} onCommit={() => d.promise} />)
    const input = screen.getByLabelText('qty')
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'))
    expect(input).toBeDisabled()
    d.resolve()
    await waitFor(() => expect(input).not.toHaveAttribute('aria-busy'))
  })

  it('suppresses the blur delivered after Enter while an async commit is pending', async () => {
    const deferredCommit = deferred<void>()
    const onCommit = vi.fn(() => deferredCommit.promise)
    render(<NumberField value={5} onCommit={onCommit} />)
    const input = screen.getByLabelText('qty')
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledTimes(1)
      expect(input).toBeDisabled()
    })
    fireEvent.blur(input)
    await Promise.resolve()
    expect(onCommit).toHaveBeenCalledTimes(1)
    deferredCommit.resolve()
    await waitFor(() => expect(input).not.toBeDisabled())
  })

  it('AC-I5-5: a rejected commit rolls the draft back to saved AND announces via role=status', async () => {
    const d = deferred<void>()
    render(<NumberField value={5} onCommit={() => d.promise} rollbackMessage="Couldn’t save — reverted." />)
    const input = screen.getByLabelText('qty')
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    d.reject(new Error('write failed'))
    await waitFor(() => expect(input).toHaveValue(5)) // rolled back
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/reverted/i))
  })
})

// OD-REDESIGN-22: a failed autosave must show a VISIBLE error + retry — not sr-only only —
// and preserve the user's attempt so Retry re-sends the SAME value (fixes D-C1/DIV-G1).
describe('useInlineCommit — visible error + retry (OD-REDESIGN-22)', () => {
  it('AC-I5-6: a rejected commit exposes a VISIBLE error (role=alert), not only the sr-only announce', async () => {
    const d = deferred<void>()
    render(<NumberField value={5} onCommit={() => d.promise} />)
    const input = screen.getByLabelText('qty')
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.queryByRole('alert')).toBeNull() // no error before the write settles
    d.reject(new Error('write failed'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('AC-I5-7: Retry re-sends the SAME attempted value (the preserved attempt), not the rolled-back saved value', async () => {
    const first = deferred<void>()
    const attempts: number[] = []
    const onCommit = vi.fn((next: number) => {
      attempts.push(next)
      return attempts.length === 1 ? first.promise : Promise.resolve()
    })
    render(<NumberField value={5} onCommit={onCommit} />)
    const input = screen.getByLabelText('qty')
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    first.reject(new Error('write failed'))
    await waitFor(() => expect(input).toHaveValue(5)) // rolled back to saved
    fireEvent.click(await screen.findByLabelText('retry'))
    await waitFor(() => expect(attempts).toEqual([8, 8])) // Retry re-sent the attempt, not 5
  })

  it('AC-I5-8: a successful Retry clears the visible error', async () => {
    const first = deferred<void>()
    let call = 0
    const onCommit = () => { call += 1; return call === 1 ? first.promise : Promise.resolve() }
    render(<NumberField value={5} onCommit={onCommit} />)
    const input = screen.getByLabelText('qty')
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    first.reject(new Error('write failed'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('retry'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('AC-I5-9: Escape (cancel) clears a shown error', async () => {
    const d = deferred<void>()
    render(<NumberField value={5} onCommit={() => d.promise} />)
    const input = screen.getByLabelText('qty')
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    d.reject(new Error('write failed'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

describe('useInlineCommit — external value sync', () => {
  it('resets the draft when the committed value changes upstream (and no edit is in flight)', () => {
    const { rerender } = render(<NumberField value={5} onCommit={() => {}} />)
    expect(screen.getByLabelText('qty')).toHaveValue(5)
    rerender(<NumberField value={12} onCommit={() => {}} />)
    expect(screen.getByLabelText('qty')).toHaveValue(12)
  })

  // #345 regression — the flake's exact mechanism, made deterministic. In the app the
  // surface's data-load commit comes from a promise continuation (not act), so React
  // commits the DOM in one scheduler task and flushes the MOUNT passive effects in a
  // later one. A keystroke landing in that window (slow device / starved CI runner —
  // or a user typing right as the grid paints) used to be CLOBBERED: the hook's [value]
  // sync effect ran its mount invocation AFTER the keystroke and setDraft(value), so
  // the follow-up blur committed draft === value → silent no-op, the edit lost.
  // The test opens the same window on purpose: a concurrent-lane mount outside act,
  // caught at the commit by MutationObserver — before the passive-flush task — then
  // the keystroke and blur are delivered inside the window. The typed value must survive.
  it('issue 345: a keystroke delivered before the mount effects flush is not clobbered by the initial sync', async () => {
    const onCommit = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    try {
      // A concurrent-lane mount OUTSIDE act — the same lane as the page's non-act
      // data-load commit (the "not wrapped in act" warning is the point: the app's own
      // fetch continuation is not wrapped either). React commits the DOM in a scheduler
      // task and flushes the mount passive effects in a LATER one.
      root.render(<NumberField value={0} onCommit={onCommit} />)
      // Catch the commit in a MutationObserver microtask — after the DOM lands, before
      // the passive-flush task runs. This is the window the starved runner opened.
      const input = await new Promise<HTMLInputElement>((resolve, reject) => {
        const timer = setTimeout(() => { mo.disconnect(); reject(new Error('input never rendered')) }, 5000)
        const mo = new MutationObserver(() => {
          const el = host.querySelector('input')
          if (el) { clearTimeout(timer); mo.disconnect(); resolve(el) }
        })
        mo.observe(host, { childList: true, subtree: true })
      })
      // The keystroke + blur inside the pre-effect window, delivered the same way the
      // page tests deliver them. The buggy sync effect's mount invocation then lands
      // AFTER the keystroke's setDraft in the same batch and wipes it.
      fireEvent.change(input, { target: { value: '15' } })
      fireEvent.blur(input)
      // However the pending mount effects interleave, the typed draft must survive
      // and the blur must have committed it.
      await waitFor(() => expect(onCommit).toHaveBeenCalledWith(15))
    } finally {
      flushSync(() => root.unmount())
      host.remove()
    }
  })
})
