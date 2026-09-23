// CafeStreamBar — the ONE statement-and-switch every Café page head carries (#440).
//
// What is asserted here is the GRAMMAR, once, so the six surfaces do not each re-assert it:
// the stream is named canonically (branch · activity), a surface that cannot switch still
// SAYS what it is showing, and a cross-stream surface says that instead of naming a stream
// it is not scoped to.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { ReactNode } from 'react'
import { CafeStreamBar } from './cafe-stream-bar'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

const RR = { id: 'b-rr', code: 'rumah_rames', name: 'Rumah Rames' }
const RAD = { id: 'b-rad', code: 'radiant', name: 'Radiant' }
const RR_KITCHEN: ProductionStream = { branch: RR, activity: 'kitchen' }
const RAD_BAR: ProductionStream = { branch: RAD, activity: 'bar' }
const CATALOG = [RR_KITCHEN, RAD_BAR]

function wrap(node: ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>)
}

describe('CafeStreamBar', () => {
  it('states the stream in view as branch · activity', () => {
    wrap(<CafeStreamBar options={CATALOG} stream={RR_KITCHEN} onChange={() => {}} />)
    const picker = screen.getByRole('combobox', { name: /production stream/i })
    expect(picker).toHaveAttribute('id', 'cafe-stream')
    expect(picker).toHaveTextContent('Rumah Rames · Kitchen')
  })

  it('keeps the stream trigger id when the selected stream and options rerender', () => {
    const view = wrap(<CafeStreamBar options={CATALOG} stream={RR_KITCHEN} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: /production stream/i })).toHaveAttribute('id', 'cafe-stream')

    view.rerender(
      <I18nProvider>
        <CafeStreamBar options={[RAD_BAR]} stream={RAD_BAR} onChange={() => {}} />
      </I18nProvider>,
    )

    expect(screen.getByRole('combobox', { name: /production stream/i })).toHaveAttribute('id', 'cafe-stream')
    expect(screen.getByRole('combobox', { name: /production stream/i })).toHaveTextContent('Radiant · Bar')
  })

  it('the 238 ruling: names the stream by its CANONICAL branch name — never the Bungur alias', () => {
    // 'Bungur' names a transfer DESTINATION and the derived action label. One stream reading
    // under two names on two surfaces is the defect that ruling ended.
    wrap(<CafeStreamBar options={CATALOG} stream={RR_KITCHEN} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: /production stream/i })).not.toHaveTextContent(/Bungur/)
  })

  it('switching hands the chosen stream back', () => {
    const onChange = vi.fn()
    wrap(<CafeStreamBar options={CATALOG} stream={RR_KITCHEN} onChange={onChange} />)
    fireEvent.click(screen.getByRole('combobox', { name: /production stream/i }))
    fireEvent.click(screen.getByRole('option', { name: 'Radiant · Bar' }))
    expect(onChange).toHaveBeenCalledWith(RAD_BAR)
  })

  it('FR-002: with no stream resolved it holds a placeholder and offers no stream as chosen', () => {
    wrap(<CafeStreamBar options={CATALOG} stream={null} onChange={() => {}} />)
    const picker = screen.getByRole('combobox', { name: /production stream/i })
    expect(picker).toHaveTextContent(/choose stream/i)
  })

  it('a read-only surface still SAYS which stream it is showing', () => {
    wrap(<CafeStreamBar options={CATALOG} stream={RAD_BAR} />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Radiant · Bar')).toBeInTheDocument()
  })

  it('a cross-stream surface says "All streams" rather than naming a stream it is not scoped to', () => {
    wrap(<CafeStreamBar options={[]} stream={null} allStreams />)
    expect(screen.getByText(/all streams/i)).toBeInTheDocument()
  })

  it('Review keeps "All streams" as a first-class CHOICE (OD-WAY-48 — reviewing across streams is its job)', () => {
    const onAllStreams = vi.fn()
    wrap(
      <CafeStreamBar
        options={CATALOG}
        stream={RR_KITCHEN}
        onChange={() => {}}
        onAllStreams={onAllStreams}
      />,
    )
    fireEvent.click(screen.getByRole('combobox', { name: /production stream/i }))
    fireEvent.click(screen.getByRole('option', { name: /all streams/i }))
    expect(onAllStreams).toHaveBeenCalled()
  })

  it('an empty catalog disables the control instead of offering an empty menu', () => {
    wrap(<CafeStreamBar options={[]} stream={null} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: /production stream/i })).toBeDisabled()
  })
})
