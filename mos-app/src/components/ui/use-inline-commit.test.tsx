// I5 inline-edit primitive (OD-REDESIGN-22 · interaction-contract.md class I5).
// The owner-locked law: Enter / Tab / click-outside COMMITS; Escape DISCARDS and
// restores the saved value. These tests drive the contract through a real <input>
// harness (fireEvent keyboard/blur/change), asserting behavior, never internals.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

describe('useInlineCommit — external value sync', () => {
  it('resets the draft when the committed value changes upstream (and no edit is in flight)', () => {
    const { rerender } = render(<NumberField value={5} onCommit={() => {}} />)
    expect(screen.getByLabelText('qty')).toHaveValue(5)
    rerender(<NumberField value={12} onCommit={() => {}} />)
    expect(screen.getByLabelText('qty')).toHaveValue(12)
  })
})
