// WipItemStepper tests — AC-020/021/022
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WipItemStepper } from './wip-item-stepper'
import type { KitchenActionType, KitchenLogLine } from '@/lib/db/kitchen-logs.types'

const BASE_LINE: KitchenLogLine = {
  wip_item_id: 'w1',
  qty_porsi: 0,
  notes: '',
  plan_qty: 10,
  stok: 0,
  tersedia: 0,
  dirty: false,
  error: '',
  capError: '',
}

function renderStepper(
  over: {
    line?: Partial<KitchenLogLine>
    actionType?: KitchenActionType
    onQtyChange?: () => void
    onNotesChange?: () => void
    itemName?: string
  } = {},
) {
  return render(
    <WipItemStepper
      itemName={over.itemName ?? 'Nasi Goreng'}
      line={{ ...BASE_LINE, ...over.line }}
      actionType={over.actionType ?? 'Production'}
      onQtyChange={over.onQtyChange ?? vi.fn()}
      onNotesChange={over.onNotesChange ?? vi.fn()}
    />,
  )
}

describe('WipItemStepper — AC-020/021/022', () => {
  it('displays the item name', () => {
    renderStepper()
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
  })

  it('shows plan qty context', () => {
    renderStepper({ line: { plan_qty: 12 } })
    expect(screen.getByText(/plan/i)).toBeInTheDocument()
    expect(screen.getByText(/12/)).toBeInTheDocument()
  })

  it('shows stok + tersedia context only for transfer actions', () => {
    renderStepper({ line: { stok: 3, tersedia: 9 }, actionType: 'Transfer to Radiant' })
    expect(screen.getByText(/stok/i)).toBeInTheDocument()
    expect(screen.getByText(/tersedia/i)).toBeInTheDocument()
  })

  it('hides stok/tersedia for Production', () => {
    renderStepper({ line: { stok: 3, tersedia: 9 }, actionType: 'Production' })
    expect(screen.queryByText(/tersedia/i)).toBeNull()
  })

  it('calls onQtyChange(+1) when + button is clicked', () => {
    const onQtyChange = vi.fn()
    renderStepper({ line: { qty_porsi: 5 }, onQtyChange })
    fireEvent.click(screen.getByRole('button', { name: /increase/i }))
    expect(onQtyChange).toHaveBeenCalledWith(6)
  })

  it('calls onQtyChange(-1) when - button is clicked (min 0)', () => {
    const onQtyChange = vi.fn()
    renderStepper({ line: { qty_porsi: 5 }, onQtyChange })
    fireEvent.click(screen.getByRole('button', { name: /decrease/i }))
    expect(onQtyChange).toHaveBeenCalledWith(4)
  })

  it('does not decrement below 0', () => {
    renderStepper({ line: { qty_porsi: 0 } })
    expect(screen.getByRole('button', { name: /decrease/i })).toBeDisabled()
  })

  it('AC-020/021: shows note field when error is set', () => {
    renderStepper({ line: { qty_porsi: 7, error: 'Catatan wajib — di luar rencana', dirty: true } })
    expect(screen.getByText(/catatan wajib/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /note/i })).toBeInTheDocument()
  })

  it('AC-022: shows the transfer-availability cap cue when capError is set', () => {
    renderStepper({
      line: { qty_porsi: 9, tersedia: 9, capError: 'Stok kurang — produksi dulu', dirty: true },
      actionType: 'Transfer to Radiant',
    })
    expect(screen.getByText(/stok kurang — produksi dulu/i)).toBeInTheDocument()
  })

  it('calls onNotesChange when note input changes', () => {
    const onNotesChange = vi.fn()
    renderStepper({
      line: { qty_porsi: 7, error: 'Catatan wajib — di luar rencana', dirty: true },
      onNotesChange,
    })
    fireEvent.change(screen.getByRole('textbox', { name: /note/i }), { target: { value: 'kurang bahan' } })
    expect(onNotesChange).toHaveBeenCalledWith('kurang bahan')
  })

  it('does not show note textarea when no error and qty=0', () => {
    renderStepper()
    expect(screen.queryByRole('textbox', { name: /note/i })).toBeNull()
  })

  it('+ and - buttons have accessible labels including item name', () => {
    renderStepper()
    expect(screen.getByRole('button', { name: /increase nasi goreng/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /decrease nasi goreng/i })).toBeInTheDocument()
  })

  it('touch targets are >= 44px via data attribute', () => {
    renderStepper()
    expect(screen.getByRole('button', { name: /increase/i })).toHaveAttribute('data-touch-target', 'true')
  })

  it('allows direct numeric input in the qty field', () => {
    const onQtyChange = vi.fn()
    renderStepper({ onQtyChange })
    fireEvent.change(screen.getByRole('spinbutton', { name: /quantity/i }), { target: { value: '15' } })
    expect(onQtyChange).toHaveBeenCalledWith(15)
  })
})
