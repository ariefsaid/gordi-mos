// WipItemStepper tests — AC-020/021/022
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WipItemStepper } from './wip-item-stepper'
import type { KitchenLogLine } from '@/lib/db/kitchen-logs.types'

const BASE_LINE: KitchenLogLine = {
  wip_item_id: 'w1',
  qty_porsi: 0,
  notes: '',
  plan_qty: 10,
  dirty: false,
  error: '',
}

describe('WipItemStepper — AC-020/021/022', () => {
  it('displays the item name', () => {
    render(
      <WipItemStepper
        itemName="Nasi Goreng"
        line={BASE_LINE}
        onQtyChange={vi.fn()}
        onNotesChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
  })

  it('shows plan qty context', () => {
    render(
      <WipItemStepper
        itemName="Nasi Goreng"
        line={{ ...BASE_LINE, plan_qty: 12 }}
        onQtyChange={vi.fn()}
        onNotesChange={vi.fn()}
      />,
    )
    expect(screen.getByText(/plan/i)).toBeInTheDocument()
    expect(screen.getByText(/12/)).toBeInTheDocument()
  })

  it('calls onQtyChange(+1) when + button is clicked', () => {
    const onQtyChange = vi.fn()
    render(
      <WipItemStepper
        itemName="Nasi Goreng"
        line={{ ...BASE_LINE, qty_porsi: 5 }}
        onQtyChange={onQtyChange}
        onNotesChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /increase/i }))
    expect(onQtyChange).toHaveBeenCalledWith(6)
  })

  it('calls onQtyChange(-1) when - button is clicked (min 0)', () => {
    const onQtyChange = vi.fn()
    render(
      <WipItemStepper
        itemName="Nasi Goreng"
        line={{ ...BASE_LINE, qty_porsi: 5 }}
        onQtyChange={onQtyChange}
        onNotesChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /decrease/i }))
    expect(onQtyChange).toHaveBeenCalledWith(4)
  })

  it('does not decrement below 0', () => {
    const onQtyChange = vi.fn()
    render(
      <WipItemStepper
        itemName="Nasi Goreng"
        line={{ ...BASE_LINE, qty_porsi: 0 }}
        onQtyChange={onQtyChange}
        onNotesChange={vi.fn()}
      />,
    )
    const decBtn = screen.getByRole('button', { name: /decrease/i })
    expect(decBtn).toBeDisabled()
  })

  it('AC-020/021: shows note field when error is set', () => {
    render(
      <WipItemStepper
        itemName="Nasi Goreng"
        line={{ ...BASE_LINE, qty_porsi: 7, error: 'note required', dirty: true }}
        onQtyChange={vi.fn()}
        onNotesChange={vi.fn()}
      />,
    )
    // error message shown
    expect(screen.getByText(/note required/i)).toBeInTheDocument()
    // note textarea appears
    expect(screen.getByRole('textbox', { name: /note/i })).toBeInTheDocument()
  })

  it('calls onNotesChange when note input changes', () => {
    const onNotesChange = vi.fn()
    render(
      <WipItemStepper
        itemName="Nasi Goreng"
        line={{ ...BASE_LINE, qty_porsi: 7, error: 'note required', dirty: true }}
        onQtyChange={vi.fn()}
        onNotesChange={onNotesChange}
      />,
    )
    const noteInput = screen.getByRole('textbox', { name: /note/i })
    fireEvent.change(noteInput, { target: { value: 'kurang bahan' } })
    expect(onNotesChange).toHaveBeenCalledWith('kurang bahan')
  })

  it('does not show note textarea when no error and qty=0', () => {
    render(
      <WipItemStepper
        itemName="Nasi Goreng"
        line={BASE_LINE}
        onQtyChange={vi.fn()}
        onNotesChange={vi.fn()}
      />,
    )
    expect(screen.queryByRole('textbox', { name: /note/i })).toBeNull()
  })

  it('+ and - buttons have accessible labels including item name', () => {
    render(
      <WipItemStepper
        itemName="Nasi Goreng"
        line={BASE_LINE}
        onQtyChange={vi.fn()}
        onNotesChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /increase nasi goreng/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /decrease nasi goreng/i })).toBeInTheDocument()
  })

  it('touch targets are >= 44px via data attribute', () => {
    render(
      <WipItemStepper
        itemName="Nasi Goreng"
        line={BASE_LINE}
        onQtyChange={vi.fn()}
        onNotesChange={vi.fn()}
      />,
    )
    const incBtn = screen.getByRole('button', { name: /increase/i })
    expect(incBtn).toHaveAttribute('data-touch-target', 'true')
  })

  it('allows direct numeric input in the qty field', () => {
    const onQtyChange = vi.fn()
    render(
      <WipItemStepper
        itemName="Nasi Goreng"
        line={BASE_LINE}
        onQtyChange={onQtyChange}
        onNotesChange={vi.fn()}
      />,
    )
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity/i })
    fireEvent.change(qtyInput, { target: { value: '15' } })
    expect(onQtyChange).toHaveBeenCalledWith(15)
  })
})
