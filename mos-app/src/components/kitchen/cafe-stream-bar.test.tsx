// CafeStreamBar — the Café module's page-head STATEMENT (and, where the person is allowed one,
// its text-link switch). #781 / DESIGN.md § Compact capture row A2.
//
// The GRAMMAR asserted here, once, so the six surfaces do not each re-assert it:
//   1. the stream is named canonically (branch · activity, never the 'Bungur' alias);
//   2. the statement is TEXT in the head — no select control;
//   3. a switch, where the person is allowed one, is a text link beside the statement that
//      opens a picker of producing streams (Radiant · Kitchen never appears — it does not
//      produce);
//   4. a placeholder such as "Choose stream…" never renders — the caller hands a resolved
//      stream or renders the no-stream `blank` state instead;
//   5. Review's cross-stream job stays a first-class choice under the same picker (OD-WAY-48).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { ReactNode } from 'react'
import { CafeStreamBar } from './cafe-stream-bar'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

const RR = { id: 'b-rr', code: 'rumah_rames', name: 'Rumah Rames' }
const RAD = { id: 'b-rad', code: 'radiant', name: 'Radiant' }
const RR_KITCHEN: ProductionStream = { branch: RR, activity: 'kitchen', produces: true }
const RAD_BAR: ProductionStream = { branch: RAD, activity: 'bar', produces: true }
const PRODUCING = [RR_KITCHEN, RAD_BAR]

function wrap(node: ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>)
}

describe('CafeStreamBar — statement + switch', () => {
  it('states the stream in view as branch · activity, in the head\'s foreground voice', () => {
    wrap(<CafeStreamBar mode="statement" stream={RR_KITCHEN} options={PRODUCING} onChange={() => {}} />)
    expect(screen.getByText('Rumah Rames · Kitchen')).toBeInTheDocument()
  })

  it('the 238 ruling: names the stream by its CANONICAL branch name — never the Bungur alias', () => {
    // 'Bungur' names a transfer DESTINATION and the derived action label. One stream reading
    // under two names on two surfaces is the defect that ruling ended.
    wrap(<CafeStreamBar mode="statement" stream={RR_KITCHEN} options={PRODUCING} onChange={() => {}} />)
    expect(screen.getByTestId('cafe-stream').textContent).not.toMatch(/Bungur/)
  })

  it('renders the statement as TEXT — no select control in the head (DESIGN.md A2)', () => {
    wrap(<CafeStreamBar mode="statement" stream={RR_KITCHEN} options={PRODUCING} onChange={() => {}} />)
    expect(screen.queryByRole('combobox')).toBeNull()
    // The old placeholder is gone: the caller hands a resolved stream or the no-stream
    // `blank` state renders instead of an empty head.
    expect(screen.queryByText(/choose stream/i)).toBeNull()
  })

  it('offers a "switch" text link only when another producing stream is available', () => {
    wrap(<CafeStreamBar mode="statement" stream={RR_KITCHEN} options={[RR_KITCHEN]} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /production stream/i })).toBeNull()
  })

  it('the switch link opens a picker of the producing streams it was handed', () => {
    wrap(<CafeStreamBar mode="statement" stream={RR_KITCHEN} options={PRODUCING} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /production stream/i }))
    const listbox = screen.getByRole('listbox')
    const options = Array.from(listbox.querySelectorAll('[role="option"]')).map((el) => el.textContent)
    expect(options).toEqual(['Rumah Rames · Kitchen', 'Radiant · Bar'])
  })

  it('picking a stream hands it back and closes the picker', () => {
    const onChange = vi.fn()
    wrap(<CafeStreamBar mode="statement" stream={RR_KITCHEN} options={PRODUCING} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /production stream/i }))
    fireEvent.click(screen.getByRole('option', { name: /Radiant · Bar/i }))
    expect(onChange).toHaveBeenCalledWith(RAD_BAR)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('a read-only statement surface still SAYS which stream it is showing (no switch link)', () => {
    wrap(<CafeStreamBar mode="statement" stream={RAD_BAR} />)
    expect(screen.getByText('Radiant · Bar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /production stream/i })).toBeNull()
  })

  it('a cross-stream surface says "All streams" rather than naming a stream it is not scoped to', () => {
    wrap(<CafeStreamBar mode="statement" stream={null} allStreams />)
    expect(screen.getByText(/all streams/i)).toBeInTheDocument()
  })

  it('Review keeps "All streams" as a first-class CHOICE (OD-WAY-48 — reviewing across streams is its job)', () => {
    const onAllStreams = vi.fn()
    wrap(
      <CafeStreamBar
        mode="statement"
        stream={RR_KITCHEN}
        options={PRODUCING}
        onChange={() => {}}
        onAllStreams={onAllStreams}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /production stream/i }))
    fireEvent.click(screen.getByRole('option', { name: /all streams/i }))
    expect(onAllStreams).toHaveBeenCalled()
  })

  it('an empty picker does not render — the bar is a statement, and there is nothing to switch to', () => {
    wrap(<CafeStreamBar mode="statement" stream={null} options={[]} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /production stream/i })).toBeNull()
  })
})

// The LEGACY select mode — the six surfaces that have not adopted A2 yet still route
// through this file and see a native `<Select>`. Kept until Plan/Stock/Review/Pushes run
// the same design change; the assertions here pin the grammar as it currently ships.
describe('CafeStreamBar — legacy select mode', () => {
  it('renders a native select with the canonical option labels', () => {
    wrap(<CafeStreamBar stream={RR_KITCHEN} options={PRODUCING} onChange={() => {}} />)
    const picker = screen.getByRole('combobox', { name: /production stream/i }) as HTMLSelectElement
    expect(picker.selectedOptions[0].textContent).toBe('Rumah Rames · Kitchen')
  })

  it('an empty catalog disables the control instead of offering an empty menu', () => {
    wrap(<CafeStreamBar stream={null} options={[]} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: /production stream/i })).toBeDisabled()
  })
})
