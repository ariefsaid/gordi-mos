// WipItemStepper tests — AC-020/021/022
//
// v4 (2026-07-27): the −/+ stepper was replaced by a single typed numeric field (production
// is entered as a total, "mostly 10-20+", not incremented — see wip-item-stepper.tsx). These
// tests were rewritten to the new interaction: the goals they protect are unchanged (a user
// can enter the quantity they produced and is told when it diverges from plan), only the
// STEPS changed — typing into the field instead of clicking −/+, and the variance-note gate
// asserted on blur rather than on every keystroke.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { WipItemStepper } from './wip-item-stepper'
import { needsVarianceNote, VARIANCE_NOTE_CUE } from '@/lib/kitchen-gates'
import type { ItemUnitOption, KitchenLogLine, KitchenMovement } from '@/lib/db/kitchen-logs.types'

// v4 drove this component with the three label literals. They are derived, not stored
// (DD-WAY-13), so the component takes the MOVEMENT instead — the thing that actually
// decides whether a line consumes stock. Every assertion below is v4's, unchanged.
const PRODUCE: KitchenMovement = { action: 'produce', destinationBranchId: null }
const TRANSFER_RADIANT: KitchenMovement = {
  action: 'transfer', destinationBranchId: 'branch-radiant',
}

const BASE_LINE: KitchenLogLine = {
  wip_item_id: 'w1',
  item_unit_id: 'u-porsi',
  qty_porsi: 0,
  notes: '',
  plan_qty: 10,
  stok: 0,
  tersedia: 0,
  dirty: false,
  error: '',
  capError: '',
}

// The offered units (#234): the reader delivers the default first, then transferable
// alternates (FR-032 filtering happens THERE — this component only renders what it is
// handed, asserted in kitchen-logs.test.ts).
const UNIT_PORSI: ItemUnitOption = { id: 'u-porsi', name: 'porsi', is_default: true }
const UNIT_BOTOL: ItemUnitOption = { id: 'u-botol', name: 'botol', is_default: false }

function renderStepper(
  over: {
    line?: Partial<KitchenLogLine>
    movement?: KitchenMovement
    onQtyChange?: () => void
    onNotesChange?: () => void
    itemName?: string
    dense?: boolean
    alreadyLogged?: number
    unitOptions?: ItemUnitOption[]
    onUnitChange?: (id: string) => void
  } = {},
) {
  return render(
    <WipItemStepper
      itemName={over.itemName ?? 'Nasi Goreng'}
      line={{ ...BASE_LINE, ...over.line }}
      movement={over.movement ?? PRODUCE}
      onQtyChange={over.onQtyChange ?? vi.fn()}
      onNotesChange={over.onNotesChange ?? vi.fn()}
      dense={over.dense}
      alreadyLogged={over.alreadyLogged}
      unitOptions={over.unitOptions}
      onUnitChange={over.onUnitChange}
    />,
  )
}

// #233 / FR-014, AC-006: the running "already logged N" — today's recorded actuals for
// this item + movement on the selected stream, shown beside the row. Comes from the
// DATABASE (submitted rows), never from the typed-but-unsaved quantity (DD-7's line).
// #234 / FR-020/021, AC-005: the fixed unit + the deliberate "change unit" affordance.
// The row shows its bound unit as MASTER DATA (text, not an input) on the common path;
// only an item with MORE than one offered unit gets the small change-unit button, and
// choosing an alternate re-binds the line via onUnitChange (the id IS the ERP coordinate,
// FR-022). Offerability filtering (FR-032/AC-015) is the READER's, owned in
// kitchen-logs.test.ts — this component renders exactly what it is handed.
describe('WipItemStepper — fixed unit + change-unit affordance (FR-020/021, AC-005)', () => {
  it('AC-005: an item with two offered units renders the change-unit affordance', () => {
    renderStepper({ unitOptions: [UNIT_PORSI, UNIT_BOTOL], onUnitChange: vi.fn() })
    expect(
      screen.getByRole('button', { name: /change unit for nasi goreng/i }),
    ).toBeInTheDocument()
  })

  it('AC-005: an item with exactly ONE offered unit renders NO affordance — the unit is fixed text', () => {
    renderStepper({ unitOptions: [UNIT_PORSI], onUnitChange: vi.fn() })
    expect(
      screen.queryByRole('button', { name: /change unit/i }),
    ).not.toBeInTheDocument()
    // the fixed unit still names itself beside the qty (FR-020) — text, never a control
    expect(screen.getByText('porsi')).toBeInTheDocument()
  })

  it('FR-021: the picker is BEHIND the click — no unit selector exists until the affordance is pressed', async () => {
    const user = userEvent.setup()
    renderStepper({ unitOptions: [UNIT_PORSI, UNIT_BOTOL], onUnitChange: vi.fn() })
    expect(
      screen.queryByRole('combobox', { name: /unit for nasi goreng/i }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /change unit for nasi goreng/i }))
    expect(
      screen.getByRole('combobox', { name: /unit for nasi goreng/i }),
    ).toBeInTheDocument()
  })

  it('AC-005: selecting the alternate re-binds the line (onUnitChange gets the item-unit id) and the picker closes', async () => {
    const user = userEvent.setup()
    const onUnitChange = vi.fn()
    renderStepper({ unitOptions: [UNIT_PORSI, UNIT_BOTOL], onUnitChange })
    await user.click(screen.getByRole('button', { name: /change unit for nasi goreng/i }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: /unit for nasi goreng/i }),
      'u-botol',
    )
    expect(onUnitChange).toHaveBeenCalledWith('u-botol')
    expect(
      screen.queryByRole('combobox', { name: /unit for nasi goreng/i }),
    ).not.toBeInTheDocument()
  })

  it('FR-020: a line bound to the alternate wears THAT unit as its label', () => {
    renderStepper({
      unitOptions: [UNIT_PORSI, UNIT_BOTOL],
      onUnitChange: vi.fn(),
      line: { item_unit_id: 'u-botol' },
    })
    expect(
      screen.getByRole('button', { name: /change unit for nasi goreng/i }),
    ).toHaveTextContent('botol')
  })

  it('a null/stale binding falls back to the item\'s OWN default unit — never the hardcoded porsi label', () => {
    // 'pack' deliberately differs from the translated fallback so a regression to the
    // hardcoded string cannot pass this test.
    const UNIT_PACK: ItemUnitOption = { id: 'u-pack', name: 'pack', is_default: true }
    renderStepper({
      unitOptions: [UNIT_PACK, UNIT_BOTOL],
      onUnitChange: vi.fn(),
      line: { item_unit_id: null },
    })
    expect(
      screen.getByRole('button', { name: /change unit for nasi goreng/i }),
    ).toHaveTextContent('pack')
  })

  it('hosts that predate unit wiring keep the incumbent fixed label — no affordance, porsi text', () => {
    renderStepper()
    expect(screen.queryByRole('button', { name: /change unit/i })).not.toBeInTheDocument()
    expect(screen.getByText('porsi')).toBeInTheDocument()
  })
})

describe('WipItemStepper — already-logged actuals (FR-014, AC-006)', () => {
  it('renders "logged N" when something has been logged today', () => {
    renderStepper({ alreadyLogged: 4 })
    const meta = document.querySelector('.kls-meta')
    expect(meta?.textContent).toMatch(/logged\s*4/)
  })

  it('renders nothing at 0 — a quiet row stays quiet', () => {
    renderStepper({ alreadyLogged: 0 })
    expect(document.querySelector('.kls-meta')).toBeNull()
  })

  it('a transfer row shows both the already-logged count and the tersedia context', () => {
    renderStepper({ movement: TRANSFER_RADIANT, alreadyLogged: 3, line: { tersedia: 7 } })
    const meta = document.querySelector('.kls-meta')
    expect(meta?.textContent).toMatch(/logged\s*3/)
    expect(meta?.textContent).toMatch(/avail\s*7/)
  })
})

describe('WipItemStepper — AC-020/021/022', () => {
  it('displays the item name', () => {
    renderStepper()
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
  })

  // v4: plan is no longer a separate caption — it is the qty field's greyed placeholder anchor.
  it('shows the plan qty as the field placeholder (the greyed anchor), not as restated text', () => {
    renderStepper({ line: { plan_qty: 12 } })
    expect(screen.getByRole('spinbutton', { name: /quantity/i })).toHaveAttribute('placeholder', '12')
  })

  it('falls back to a "0" placeholder when there is no plan for this action_type', () => {
    renderStepper({ line: { plan_qty: 0 } })
    expect(screen.getByRole('spinbutton', { name: /quantity/i })).toHaveAttribute('placeholder', '0')
  })

  // v4: `stok` is dropped from the stepper (both layouts already render Stock as their own
  // column/field) — only `tersedia` (availability) remains, and only for stock-consuming actions.
  it('shows avail (tersedia) context only for transfer actions (cafe-1: English session → English labels)', () => {
    renderStepper({ line: { stok: 3, tersedia: 9 }, movement: TRANSFER_RADIANT })
    expect(screen.getByText(/avail/i)).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('hides avail context for Production', () => {
    renderStepper({ line: { stok: 3, tersedia: 9 }, movement: PRODUCE })
    expect(screen.queryByText(/avail/i)).toBeNull()
  })

  // v4: blank at rest — a blank field means "nothing entered yet" and must stay
  // distinguishable from a deliberate zero (never coerced to the string "0").
  it('is blank at rest (qty=0 renders an empty field, not "0")', () => {
    renderStepper({ line: { qty_porsi: 0 } })
    expect(screen.getByRole('spinbutton', { name: /quantity/i })).toHaveValue(null)
  })

  it('renders the typed quantity once a value is staged', () => {
    renderStepper({ line: { qty_porsi: 15 } })
    expect(screen.getByRole('spinbutton', { name: /quantity/i })).toHaveValue(15)
  })

  it('allows direct numeric input in the qty field', () => {
    const onQtyChange = vi.fn()
    renderStepper({ onQtyChange })
    fireEvent.change(screen.getByRole('spinbutton', { name: /quantity/i }), { target: { value: '15' } })
    expect(onQtyChange).toHaveBeenCalledWith(15)
  })

  // v4: no decrement button to floor at 0 — the field itself rejects a negative typed value
  // (the −/+ stepper's "does not decrement below 0" floor, ported to the typed control).
  it('rejects a typed negative value — the qty never goes below 0', () => {
    const onQtyChange = vi.fn()
    renderStepper({ onQtyChange })
    fireEvent.change(screen.getByRole('spinbutton', { name: /quantity/i }), { target: { value: '-5' } })
    expect(onQtyChange).not.toHaveBeenCalled()
  })

  // v4: clearing the field back to blank reports 0 (an intentional "nothing staged"), not NaN.
  it('clearing the field back to blank reports qty 0', () => {
    const onQtyChange = vi.fn()
    renderStepper({ line: { qty_porsi: 5 }, onQtyChange })
    fireEvent.change(screen.getByRole('spinbutton', { name: /quantity/i }), { target: { value: '' } })
    expect(onQtyChange).toHaveBeenCalledWith(0)
  })

  // v4: the note field + the invalid-border cue reveal on BLUR, never on every keystroke —
  // typing "18" against a plan of 25 must not flag at the first digit.
  it('AC-020/021: does NOT reveal the note field while still typing (before blur)', () => {
    renderStepper({ line: { qty_porsi: 7, error: 'Catatan wajib — di luar rencana', dirty: true } })
    expect(screen.queryByRole('textbox', { name: /note/i })).toBeNull()
  })

  it('AC-020/021: reveals the note field on BLUR (cafe-1: rendered localized, not the raw ID gate constant)', () => {
    renderStepper({ line: { qty_porsi: 7, error: 'Catatan wajib — di luar rencana', dirty: true } })
    fireEvent.blur(screen.getByRole('spinbutton', { name: /quantity/i }))
    expect(screen.getByText(/note required — off plan/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /note/i })).toBeInTheDocument()
  })

  it('AC-022: shows the transfer-availability cap cue when capError is set (cafe-1: localized)', () => {
    renderStepper({
      line: { qty_porsi: 9, tersedia: 9, capError: 'Stok kurang — produksi dulu', dirty: true },
      movement: TRANSFER_RADIANT,
    })
    expect(screen.getByText(/insufficient stock — produce first/i)).toBeInTheDocument()
  })

  it('calls onNotesChange when note input changes', () => {
    const onNotesChange = vi.fn()
    renderStepper({
      line: { qty_porsi: 7, error: 'Catatan wajib — di luar rencana', dirty: true },
      onNotesChange,
    })
    fireEvent.blur(screen.getByRole('spinbutton', { name: /quantity/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /note/i }), { target: { value: 'kurang bahan' } })
    expect(onNotesChange).toHaveBeenCalledWith('kurang bahan')
  })

  it('does not show note textarea when no error and qty=0', () => {
    renderStepper()
    expect(screen.queryByRole('textbox', { name: /note/i })).toBeNull()
  })

  // v4: the accessible name lives on the field itself (no separate +/− controls to label).
  it('the qty field carries an accessible name including the item name', () => {
    renderStepper({ itemName: 'Nasi Goreng' })
    expect(screen.getByLabelText('Quantity produced for Nasi Goreng')).toBeInTheDocument()
  })

  // v4: the touch-target floor now lives on the typed field (formerly the +/− buttons) —
  // same `data-touch-target` proxy convention used elsewhere (DataTable cards, Button.css).
  it('touch target floor: the qty field carries data-touch-target="true"', () => {
    renderStepper()
    expect(screen.getByRole('spinbutton', { name: /quantity/i })).toHaveAttribute('data-touch-target', 'true')
  })

  // cafe-3: dense (desktop DataTable cell) drops the bordered/full-width card box;
  // the default (phone card) keeps it.
  it('cafe-3: dense=true drops the .kls-card bordered-box class, keeps content', () => {
    renderStepper({ dense: true, itemName: 'Ayam Bakar' })
    const card = screen.getByRole('spinbutton', { name: /quantity/i }).closest('.kls-card')
    expect(card).toHaveClass('kls-dense')
  })

  it('cafe-3: dense omitted (phone card floor) keeps the bordered card box', () => {
    renderStepper({ itemName: 'Ayam Bakar' })
    const card = screen.getByRole('spinbutton', { name: /quantity/i }).closest('.kls-card')
    expect(card).not.toHaveClass('kls-dense')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DD-18 regression guard — satisfying the required-note gate must not destroy the
// field that satisfies it.
//
// Live-reproduced 2026-07-28 at 375×812: `showNote` was gated on `error !== ''`, and `error` is
// the UNSATISFIED gate (the page stamps VARIANCE_NOTE_CUE only while `notes` is empty). So the
// FIRST keystroke inside the textarea cleared `error`, `showNote` went false, and the textarea
// unmounted mid-typing with focus dumped to <body>. Submit then unblocked on that one-character
// note — the surface was shipping "b" as a variance explanation.
//
// The two halves are guarded TOGETHER on purpose: a test that only proved the field survives
// typing would also pass on a version that re-nags on every keystroke, which is precisely the
// behaviour DD-8 removed. Both must hold at once.
//
// Both use a stateful harness because the bug only exists in the PARENT CONTRACT: qty/notes are
// controlled by the page, and the page's `gateLine` clears `error` the instant a note has any
// content. The harness composes the app's OWN gate (needsVarianceNote + VARIANCE_NOTE_CUE from
// lib/kitchen-gates) exactly as kitchen-log-page.tsx's gateLine does — it reproduces the
// contract, it does not re-implement the rule.
// ─────────────────────────────────────────────────────────────────────────────
function StagedLineHarness({
  planQty = 19,
  movement = PRODUCE,
}: { planQty?: number; movement?: KitchenMovement }) {
  const [line, setLine] = useState<KitchenLogLine>({ ...BASE_LINE, plan_qty: planQty })
  // The page's gateLine (kitchen-log-page.tsx), same composition: an unstaged line has no gate,
  // and the cue is stamped ONLY while the required note is still empty.
  function gate(next: KitchenLogLine): KitchenLogLine {
    if (next.qty_porsi <= 0) return { ...next, error: '', capError: '' }
    return {
      ...next,
      error: needsVarianceNote(next, movement) && !next.notes.trim() ? VARIANCE_NOTE_CUE : '',
    }
  }
  return (
    <WipItemStepper
      itemName="Nasi Goreng"
      line={line}
      movement={movement}
      onQtyChange={qty => setLine(prev => gate({ ...prev, qty_porsi: qty, dirty: qty > 0 }))}
      onNotesChange={notes => setLine(prev => gate({ ...prev, notes }))}
    />
  )
}

describe('WipItemStepper — DD-18: the variance-note field survives being filled in', () => {
  it('DD-18(a): a floor worker can write a whole variance note — the field stays mounted and keeps focus across every keystroke', async () => {
    const user = userEvent.setup()
    render(<StagedLineHarness planQty={19} />)

    // The worker types what they actually produced (7 against a plan of 19) and moves on.
    const qty = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    fireEvent.change(qty, { target: { value: '7' } })
    fireEvent.blur(qty)

    // The gate asks for an explanation, so they start writing it.
    const note = screen.getByRole('textbox', { name: /note for nasi goreng/i })
    await user.click(note)
    await user.keyboard('bahan habis sejak pagi')

    // The goal: the sentence they came to write is written. The field is the SAME element
    // throughout (never remounted), still holds the caret, and holds the whole note — not the
    // single character that survived the gate destroying its own control.
    const stillThere = screen.getByRole('textbox', { name: /note for nasi goreng/i })
    expect(stillThere).toBe(note)
    expect(stillThere).toHaveValue('bahan habis sejak pagi')
    expect(document.activeElement).toBe(note)
  })

  it('DD-18(b)/DD-8: typing an off-plan quantity does NOT reveal the note field before blur (the reveal stays blur-gated, never per keystroke)', () => {
    render(<StagedLineHarness planQty={19} />)
    const qty = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })

    // Mid-entry — "1" on the way to "19" is already off-plan, and must not shove a mandatory
    // textarea into the row while the number is still being typed.
    fireEvent.change(qty, { target: { value: '1' } })
    expect(screen.queryByRole('textbox', { name: /note for nasi goreng/i })).toBeNull()
    fireEvent.change(qty, { target: { value: '7' } })
    expect(screen.queryByRole('textbox', { name: /note for nasi goreng/i })).toBeNull()

    // Only once the field is done does the gate ask for the note.
    fireEvent.blur(qty)
    expect(screen.getByRole('textbox', { name: /note for nasi goreng/i })).toBeInTheDocument()
  })
})
