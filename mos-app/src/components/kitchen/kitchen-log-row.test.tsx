// KitchenLogRow — one desktop <tr> (plan §4.1 N6, §8.1). 50px dense row.
// Cells: Dish (name+category) · Plan · Stock · <QtyCell> · <Pill> status.
// Reveals a second <tr class="klr-note-row"> with the note <textarea> when
// line.error && line.dirty (FR-022). Mirrors task-row.tsx conventions.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { KitchenLogRow } from './kitchen-log-row'
import type { WipItemOption, KitchenLogLine } from '@/lib/db/kitchen-logs.types'

const ITEM: WipItemOption = { id: 'w1', name: 'Ayam Bakar', category: 'Main' }

function line(over: Partial<KitchenLogLine> = {}): KitchenLogLine {
  return {
    wip_item_id: 'w1',
    qty_porsi: 0,
    notes: '',
    plan_qty: 20,
    stok: 5,
    tersedia: 9,
    dirty: false,
    error: '',
    capError: '',
    ...over,
  }
}

function renderRow(over: Partial<KitchenLogLine> = {}) {
  return render(
    <table><tbody>
      <KitchenLogRow
        item={ITEM}
        line={line(over)}
        actionType="Production"
        onQtyChange={() => {}}
        onNotesChange={() => {}}
      />
    </tbody></table>,
  )
}

describe('KitchenLogRow — cells', () => {
  it('renders the dish name + category sub-label', () => {
    renderRow()
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByText('Main')).toBeInTheDocument()
  })

  it('renders the plan qty (tabular)', () => {
    renderRow({ plan_qty: 20 })
    // plan qty appears in its own cell (qty 0, so the qty-cell input shows 0)
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('renders the stock qty (tabular)', () => {
    renderRow({ stok: 5 })
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders a QtyCell for the made-today entry', () => {
    renderRow({ qty_porsi: 12 })
    expect(screen.getByRole('spinbutton', { name: /quantity for ayam bakar/i })).toHaveValue(12)
  })

  it('wires onQtyChange through the QtyCell', () => {
    const onQtyChange = vi.fn()
    render(
      <table><tbody>
        <KitchenLogRow item={ITEM} line={line({ qty_porsi: 3 })} actionType="Production" onQtyChange={onQtyChange} onNotesChange={() => {}} />
      </tbody></table>,
    )
    fireEvent.click(screen.getByRole('button', { name: /increase ayam bakar quantity/i }))
    expect(onQtyChange).toHaveBeenCalledWith(4)
  })
})

describe('KitchenLogRow — status Pill (kitchenStatus §6.1)', () => {
  it('on-plan → success "On plan"', () => {
    renderRow({ plan_qty: 20, qty_porsi: 20 })
    expect(screen.getByText('On plan')).toBeInTheDocument()
  })

  it('over → warning "Over +n"', () => {
    renderRow({ plan_qty: 20, qty_porsi: 25 })
    expect(screen.getByText('Over +5')).toBeInTheDocument()
  })

  it('under → destructive "Under −n"', () => {
    renderRow({ plan_qty: 20, qty_porsi: 12 })
    expect(screen.getByText('Under −8')).toBeInTheDocument()
  })

  it('off-plan logged (plan=0, made>0) → neutral "Logged"', () => {
    renderRow({ plan_qty: 0, qty_porsi: 7 })
    expect(screen.getByText('Logged')).toBeInTheDocument()
  })
})

describe('KitchenLogRow — variance note (FR-022)', () => {
  it('does NOT render the note textarea when not error/dirty', () => {
    renderRow({ qty_porsi: 5, dirty: false, error: '' })
    expect(screen.queryByRole('textbox', { name: /note for ayam bakar/i })).toBeNull()
  })

  it('reveals the note textarea when line.error && line.dirty', () => {
    renderRow({ qty_porsi: 5, dirty: true, error: 'Catatan wajib — di luar rencana' })
    const note = screen.getByRole('textbox', { name: /note for ayam bakar/i })
    expect(note).toBeInTheDocument()
    expect(screen.getByText(/catatan wajib/i)).toBeInTheDocument()
  })

  it('wires onNotesChange through the textarea', () => {
    const onNotesChange = vi.fn()
    render(
      <table><tbody>
        <KitchenLogRow item={ITEM} line={line({ qty_porsi: 5, dirty: true, error: 'Catatan wajib — di luar rencana' })} actionType="Production" onQtyChange={() => {}} onNotesChange={onNotesChange} />
      </tbody></table>,
    )
    fireEvent.change(screen.getByRole('textbox', { name: /note for ayam bakar/i }), { target: { value: 'extra batch' } })
    expect(onNotesChange).toHaveBeenCalledWith('extra batch')
  })
})
