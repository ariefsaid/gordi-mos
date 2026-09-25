// CafeStreamBar — the ONE statement-and-switch every Café page head carries (#440), rewritten
// for #781: a REQUIRED bounded choice used to render as a full-width dropdown that read as a
// mandatory control on every visit (B4/B5/B12). What is asserted here is the GRAMMAR, once, so
// the surfaces do not each re-assert it: a resolved stream is STATED as text with a quiet
// "Switch" beside it only when another stream is actually offered, a session switch away from
// the person's own stream carries a "Back to <home>" action, a surface with no default at all
// says nothing in the head (CafeStreamChoices below owns that state instead), and a read-only
// surface still SAYS which stream it is showing.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { ReactNode } from 'react'
import { CafeStreamBar, CafeStreamChoices } from './cafe-stream-bar'
import { streamKey } from '@/lib/kitchen-action-label'
import { messages } from '@/i18n/messages'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

const RR = { id: 'b-rr', code: 'rumah_rames', name: 'Rumah Rames' }
const RAD = { id: 'b-rad', code: 'radiant', name: 'Radiant' }
const RR_KITCHEN: ProductionStream = { branch: RR, activity: 'kitchen', produces: true }
const RR_BAR: ProductionStream = { branch: RR, activity: 'bar', produces: true }
const RAD_BAR: ProductionStream = { branch: RAD, activity: 'bar', produces: true }
const RAD_KITCHEN: ProductionStream = { branch: RAD, activity: 'kitchen', produces: false }
const CATALOG = [RR_KITCHEN, RAD_BAR]

function wrap(node: ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>)
}

describe('CafeStreamBar', () => {
  it('states the stream in view as branch · activity, plain text — no control', () => {
    wrap(<CafeStreamBar options={[RR_KITCHEN]} stream={RR_KITCHEN} onChange={() => {}} />)
    expect(screen.getByText('Rumah Rames · Kitchen')).toBeInTheDocument()
    // With nothing else at this location there is nothing to switch to.
    expect(screen.queryByRole('button', { name: /switch/i })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('the 238 ruling: names the stream by its CANONICAL branch name — never the Bungur alias', () => {
    wrap(<CafeStreamBar options={[RR_KITCHEN]} stream={RR_KITCHEN} onChange={() => {}} />)
    expect(screen.queryByText(/Bungur/)).toBeNull()
  })

  it('item 1: offers a quiet Switch only when another stream at this location exists', () => {
    wrap(<CafeStreamBar options={CATALOG} stream={RR_KITCHEN} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /switch/i })).toBeInTheDocument()
  })

  it('Switch opens a picker listing this location\'s streams and hands the choice back', () => {
    const onChange = vi.fn()
    wrap(<CafeStreamBar options={CATALOG} stream={RR_KITCHEN} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /switch/i }))
    fireEvent.click(screen.getByText('Radiant · Bar'))
    expect(onChange).toHaveBeenCalledWith(RAD_BAR)
  })

  it('item 1: marks the person\'s own stream "Your Team" and a receiving-only one as such', () => {
    wrap(
      <CafeStreamBar
        options={[RR_KITCHEN, RAD_KITCHEN, RR_BAR]}
        stream={RR_BAR}
        homeStream={RR_KITCHEN}
        onChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /switch/i }))
    expect(screen.getByText(/Rumah Rames · Kitchen.*Your Team/)).toBeInTheDocument()
    expect(screen.getByText(/Radiant · Kitchen.*Receiving only/)).toBeInTheDocument()
  })

  it('coordinator follow-up to item 1: a current NON-home membership is marked "Your Team" and ranked ahead of streams the person does not belong to (home ranks first)', () => {
    wrap(
      <CafeStreamBar
        options={[RR_BAR, RAD_BAR, RR_KITCHEN, RAD_KITCHEN]}
        stream={RAD_KITCHEN}
        homeStream={RR_KITCHEN}
        myStreamKeys={new Set([streamKey(RAD.id, 'bar')])}
        onChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /switch/i }))
    expect(screen.getByText(/Radiant · Bar.*Your Team/)).toBeInTheDocument()
    const opts = screen.getAllByRole('option')
    expect(opts[0]).toHaveTextContent('Rumah Rames · Kitchen') // home, first
    expect(opts[1]).toHaveTextContent('Radiant · Bar') // current membership, second
    expect(opts[2]).toHaveTextContent('Rumah Rames · Bar') // neither — last
  })

  it('the Switch menu never offers the stream already in view', () => {
    wrap(<CafeStreamBar options={[RR_KITCHEN, RR_BAR, RAD_BAR]} stream={RR_BAR} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /switch/i }))
    const opts = screen.getAllByRole('option').map((o) => o.textContent)
    expect(opts).toEqual(['Rumah Rames · Kitchen', 'Radiant · Bar'])
  })

  it('item 3 / B4: a session switch away from home carries a "Back to <home>" action', () => {
    const onChange = vi.fn()
    wrap(<CafeStreamBar options={CATALOG} stream={RAD_BAR} homeStream={RR_KITCHEN} onChange={onChange} />)
    const back = screen.getByRole('button', { name: /back to rumah rames · kitchen/i })
    fireEvent.click(back)
    expect(onChange).toHaveBeenCalledWith(RR_KITCHEN)
  })

  it('viewing the home stream itself carries no "Back to" action', () => {
    wrap(<CafeStreamBar options={CATALOG} stream={RR_KITCHEN} homeStream={RR_KITCHEN} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /back to/i })).toBeNull()
  })

  it('FR-002 / B12: with no stream resolved the head says nothing — never a placeholder control', () => {
    const { container } = wrap(<CafeStreamBar options={CATALOG} stream={null} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('a read-only surface still SAYS which stream it is showing, with no Switch', () => {
    wrap(<CafeStreamBar options={CATALOG} stream={RAD_BAR} />)
    expect(screen.queryByRole('button')).toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: /switch/i }))
    fireEvent.click(screen.getByText(/all streams/i))
    expect(onAllStreams).toHaveBeenCalled()
  })
})

describe('CafeStreamChoices — the no-default one-step choice (item 2, B5)', () => {
  it('renders every location stream as its own one-click button', () => {
    const onChoose = vi.fn()
    wrap(<CafeStreamChoices options={CATALOG} onChoose={onChoose} />)
    fireEvent.click(screen.getByRole('button', { name: /rumah rames · kitchen/i }))
    expect(onChoose).toHaveBeenCalledWith(RR_KITCHEN)
  })

  it('lists and marks the person\'s own Team stream first', () => {
    wrap(<CafeStreamChoices options={[RAD_BAR, RR_KITCHEN]} homeStream={RR_KITCHEN} onChoose={() => {}} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toHaveTextContent('Rumah Rames · Kitchen')
    expect(buttons[0]).toHaveTextContent('Your Team')
  })

  it('coordinator follow-up: a Krishna-like person (no default, current member of a stream elsewhere) sees it marked "Your Team" and first — marking is not defaulting', () => {
    wrap(
      <CafeStreamChoices
        options={[RAD_BAR, RR_KITCHEN]}
        homeStream={null}
        myStreamKeys={new Set([streamKey(RR.id, 'kitchen')])}
        onChoose={() => {}}
      />,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toHaveTextContent('Rumah Rames · Kitchen')
    expect(buttons[0]).toHaveTextContent('Your Team')
  })

  it('marks a receiving-only stream so it is not mistaken for a producing choice', () => {
    wrap(<CafeStreamChoices options={[RAD_KITCHEN]} onChoose={() => {}} />)
    expect(screen.getByRole('button', { name: /radiant · kitchen/i })).toHaveTextContent('Receiving only')
  })

  it('one click selects — there is no separate "open" step', () => {
    const onChoose = vi.fn()
    wrap(<CafeStreamChoices options={CATALOG} onChoose={onChoose} />)
    // A single fireEvent.click is the whole interaction (B5: the old CTA needed two).
    fireEvent.click(screen.getByRole('button', { name: /radiant · bar/i }))
    expect(onChoose).toHaveBeenCalledTimes(1)
    expect(onChoose).toHaveBeenCalledWith(RAD_BAR)
  })
})

describe('the no-default hint names the menu as each locale shows it', () => {
  it.each(['en', 'id'] as const)('%s: the Admin destination label appears in the path', (locale) => {
    expect(messages[locale]['cafe.stream.noDefaultHint']).toContain(`(${messages[locale]['dest.admin']} →`)
  })
})
