import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { useListboxPopover } from './use-listbox-popover'

// GAP-8 (OD-91 #13): the shared listbox keyboard contract. These prove the contract once, at the
// hook level; the pickers that route through it inherit it (person-picker, category, mention).

function Harness({
  items, onSelect, onClose, isDisabled, manageFocus,
}: {
  items: string[]
  onSelect: (i: number) => void
  onClose: () => void
  isDisabled?: (i: number) => boolean
  manageFocus?: boolean
}) {
  const { listboxProps, getOptionProps, activeIndex } = useListboxPopover({
    itemCount: items.length, onSelect, onClose, isDisabled, manageFocus,
  })
  return (
    <div {...listboxProps} aria-label="options">
      {items.map((label, i) => (
        <div key={label} {...getOptionProps(i)} aria-selected={i === activeIndex}>{label}</div>
      ))}
    </div>
  )
}

describe('useListboxPopover', () => {
  it('opens with the first option active and exposes aria-activedescendant', () => {
    render(<Harness items={['A', 'B', 'C']} onSelect={vi.fn()} onClose={vi.fn()} />)
    const listbox = screen.getByRole('listbox')
    const a = screen.getByText('A')
    expect(listbox).toHaveAttribute('aria-activedescendant', a.id)
    expect(a).toHaveAttribute('aria-selected', 'true')
  })

  it('ArrowDown/ArrowUp wrap; Home/End jump to the ends', () => {
    render(<Harness items={['A', 'B', 'C']} onSelect={vi.fn()} onClose={vi.fn()} />)
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    expect(screen.getByText('B')).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(listbox, { key: 'ArrowUp' })
    fireEvent.keyDown(listbox, { key: 'ArrowUp' }) // wraps past A to C
    expect(screen.getByText('C')).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(listbox, { key: 'Home' })
    expect(screen.getByText('A')).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(listbox, { key: 'End' })
    expect(screen.getByText('C')).toHaveAttribute('aria-selected', 'true')
  })

  it('Enter and Space select the active option', () => {
    const onSelect = vi.fn()
    render(<Harness items={['A', 'B']} onSelect={onSelect} onClose={vi.fn()} />)
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    fireEvent.keyDown(listbox, { key: 'Enter' })
    expect(onSelect).toHaveBeenLastCalledWith(1)
    fireEvent.keyDown(listbox, { key: ' ' })
    expect(onSelect).toHaveBeenLastCalledWith(1)
  })

  it('Escape closes and does not bubble to a host handler', () => {
    const onClose = vi.fn()
    const hostEscape = vi.fn()
    render(
      <div onKeyDown={(e) => { if (e.key === 'Escape') hostEscape() }}>
        <Harness items={['A']} onSelect={vi.fn()} onClose={onClose} />
      </div>,
    )
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(hostEscape).not.toHaveBeenCalled()
  })

  it('skips disabled options during navigation and never selects them', () => {
    const onSelect = vi.fn()
    // B (index 1) is disabled → the cursor opens on A, ArrowDown skips B to C.
    render(<Harness items={['A', 'B', 'C']} onSelect={onSelect} onClose={vi.fn()} isDisabled={(i) => i === 1} />)
    const listbox = screen.getByRole('listbox')
    expect(screen.getByText('A')).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    expect(screen.getByText('C')).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(listbox, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('takes focus on open and returns it to the opener on close (listbox idiom)', () => {
    function Toggle() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>open</button>
          {open && <Harness items={['A']} onSelect={vi.fn()} onClose={() => setOpen(false)} />}
        </>
      )
    }
    render(<Toggle />)
    const opener = screen.getByRole('button', { name: 'open' })
    opener.focus()
    fireEvent.click(opener)
    // The listbox takes focus on open…
    expect(screen.getByRole('listbox')).toHaveFocus()
    // …and Escape returns focus to the opener when the popover unmounts.
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(opener).toHaveFocus()
  })

  it('manageFocus:false (combobox idiom) does not steal focus from the caller', () => {
    render(
      <>
        <input aria-label="q" />
        <Harness items={['A']} onSelect={vi.fn()} onClose={vi.fn()} manageFocus={false} />
      </>,
    )
    const input = screen.getByLabelText('q')
    input.focus()
    // The listbox mounts but does NOT pull focus off the input (the combobox driver keeps it).
    expect(input).toHaveFocus()
    expect(screen.getByRole('listbox')).not.toHaveFocus()
  })
})
