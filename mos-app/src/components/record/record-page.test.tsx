// The shared record page pieces, record-agnostic: they take typed props and know nothing of a kind.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { RecordFieldSpec } from '@/components/records/record-viewer.types'
import { RecordMenu } from './record-menu'
import { RecordPageHeader, type RecordFact } from './record-page-header'
import { RecordAbout, RecordDisclosure, RecordGetStarted, RecordPageLayout, RecordSection } from './record-page-layout'

function setWide(wide: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: wide && query.includes('1280'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
  })) as never
}

beforeEach(() => setWide(false))

const wrap = (node: React.ReactNode) => render(<I18nProvider>{node}</I18nProvider>)

describe('RecordMenu', () => {
  const items = [
    { id: 'copy', label: 'Copy link', onSelect: vi.fn() },
    { id: 'ask', label: 'Ask Deputy', onSelect: vi.fn() },
    { id: 'archive', label: 'Archive', onSelect: vi.fn(), separatorBefore: true, destructive: true },
  ]

  it('renders nothing below two items, and a single action can lower the floor', () => {
    const { container, rerender } = render(<RecordMenu items={[items[0]]} label="More actions" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<RecordMenu items={[items[0]]} label="More actions" minItems={1} />)
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
  })

  it('opens in a portal, moves with arrows and type-ahead, runs an item, and returns focus', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<RecordMenu items={[{ ...items[0], onSelect }, items[1], items[2]]} label="More actions" />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    await user.click(trigger)
    const menu = screen.getByRole('menu', { name: 'More actions' })
    expect(menu.parentElement).toBe(document.body)
    expect(menu.closest('[data-escape-layer="nested"]')).toBe(menu)
    const entries = within(menu).getAllByRole('menuitem')
    expect(entries[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(entries[1]).toHaveFocus()
    await user.keyboard('ar')
    expect(entries[2]).toHaveFocus()
    expect(within(menu).getByRole('separator')).toBeInTheDocument()
    await user.keyboard('{Home}{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('Tab closes the menu with focus on the trigger, so the browser\'s next Tab stop is the control after it', async () => {
    const user = userEvent.setup()
    render(<RecordMenu items={items} label="More actions" />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    await user.click(trigger)
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0], { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('Escape closes it and gives focus back to the trigger; the destructive item is text, not a fill', async () => {
    const user = userEvent.setup()
    render(<RecordMenu items={items} label="More actions" />)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    await user.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveClass('rp-menu__item--destructive')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})

describe('RecordGetStarted', () => {
  it('renders nothing for an empty list and makes only the first row primary', () => {
    const { container, rerender } = wrap(<RecordGetStarted title="Get started" items={[]} />)
    expect(container).toBeEmptyDOMElement()
    rerender(
      <I18nProvider>
        <RecordPageLayoutFixture>
          <RecordGetStarted title="Get this started" why="Why" items={[
            { id: 'a', label: 'First', reason: 'Because', action: { label: 'Do first', onClick: vi.fn() } },
            { id: 'b', label: 'Second', reason: 'Because too', action: { label: 'Do second', onClick: vi.fn() } },
          ]} />
        </RecordPageLayoutFixture>
      </I18nProvider>,
    )
    expect(screen.getByRole('button', { name: 'Do first' })).toHaveClass('btn-primary')
    expect(screen.getByRole('button', { name: 'Do second' })).toHaveClass('btn-outline')
  })
})

function RecordPageLayoutFixture({ children }: { children: React.ReactNode }) {
  return <RecordPageLayout label="Record" mode="page" headingLevel={1} header={<h1>Title</h1>} history={{ title: 'History', node: <p>entries</p> }}>{children}</RecordPageLayout>
}

describe('RecordPageLayout', () => {
  it('folds History closed under the sections on a narrow page, and mounts it only when opened', async () => {
    const user = userEvent.setup()
    const load = vi.fn(() => <p>entries</p>)
    wrap(
      <RecordPageLayout label="Record" mode="page" headingLevel={1} header={<h1>Title</h1>} history={{ title: 'History', node: <Probe load={load} /> }}>
        <RecordSection id="s" title="Section">rows</RecordSection>
      </RecordPageLayout>,
    )
    expect(load).not.toHaveBeenCalled()
    const toggle = screen.getByRole('button', { name: 'History' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('entries')).toBeInTheDocument()
  })

  it('moves About and History into a side column on a wide page, History open', () => {
    setWide(true)
    wrap(
      <RecordPageLayout label="Record" mode="page" headingLevel={1} header={<h1>Title</h1>} about={{ title: 'About', node: <RecordAbout items={[{ key: 'k', label: 'Business Unit', value: 'Retail Ops' }]} /> }} history={{ title: 'History', node: <p>entries</p> }}>
        <RecordSection id="s" title="Section">rows</RecordSection>
      </RecordPageLayout>,
    )
    const aside = screen.getByRole('complementary')
    expect(within(aside).getByText('Retail Ops')).toBeInTheDocument()
    expect(within(aside).getByText('entries')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull()
  })

  it('keeps the side column off a panel, whatever the viewport', () => {
    setWide(true)
    wrap(
      <RecordPageLayout label="Record" mode="panel" headingLevel={2} header={<h2>Title</h2>} history={{ title: 'History', node: <p>entries</p> }}>
        <RecordSection id="s" title="Section">rows</RecordSection>
      </RecordPageLayout>,
    )
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
  })

  it('sits sections one rung under the record title', () => {
    wrap(
      <RecordPageLayout label="Record" mode="panel" headingLevel={2} header={<h2>Title</h2>} history={{ title: 'History', node: null }}>
        <RecordSection id="s" title="Section" count={3} action={{ label: 'Add thing', onClick: vi.fn() }}>rows</RecordSection>
      </RecordPageLayout>,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Section' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add thing' })).toHaveClass('btn-ghost')
  })
})

function Probe({ load }: { load: () => React.ReactNode }) {
  return <>{load()}</>
}

describe('RecordDisclosure', () => {
  it('renders its children only while open', async () => {
    const user = userEvent.setup()
    wrap(<RecordDisclosure title="More"><p>inside</p></RecordDisclosure>)
    expect(screen.queryByText('inside')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByText('inside')).toBeInTheDocument()
  })
})

describe('RecordPageHeader', () => {
  const field = (over: Partial<RecordFieldSpec>): RecordFieldSpec => ({
    key: 'k', label: 'Label', control: 'text', value: 'v', displayValue: 'v', editable: false, ...over,
  })
  const base = {
    title: field({ key: 'name', label: 'Name', value: 'A record', displayValue: 'A record' }),
    headingLevel: 1 as const,
    menuLabel: 'More actions',
    factsLabel: 'Key facts',
    onCommitField: vi.fn(async () => {}),
  }

  it('spells the role out beside the person, and a ghost prompt reads as a prompt', () => {
    const facts: RecordFact[] = [
      { type: 'state', key: 's', label: 'Active', tone: 'neutral' },
      { type: 'person', key: 'a', role: 'accountable', field: field({ key: 'accountable', label: 'Accountable', control: 'person', value: 'p1', displayValue: 'Dewi Director' }) },
      { type: 'person', key: 'r', role: 'responsible', field: field({ key: 'responsible', label: 'Responsible', control: 'person', value: null, displayValue: '+ Set Responsible', editable: true }) },
      { type: 'group', key: 'p', label: 'Period', fields: [field({ key: 'q', label: 'Quarter', value: '4', displayValue: 'Q4' }), field({ key: 'y', label: 'Period', value: 2026, displayValue: '2026' })] },
    ]
    wrap(<RecordPageHeader {...base} facts={facts} />)
    const strip = screen.getByRole('list', { name: 'Key facts' })
    expect(strip).toHaveTextContent(/Accountable\s*·\s*Dewi Director/)
    expect(strip).toHaveTextContent('Q4')
    expect(strip).toHaveTextContent('2026')
    expect(within(strip).getByRole('button', { name: 'Edit Responsible' })).toHaveTextContent('+ Set Responsible')
    expect(screen.getByRole('heading', { level: 1, name: 'A record' })).toBeInTheDocument()
  })

  it('has at most one primary action, and none when none is given', () => {
    const onClick = vi.fn()
    const { rerender } = wrap(<RecordPageHeader {...base} facts={[]} primary={{ label: 'Add task', onClick }} />)
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1)
    rerender(<I18nProvider><RecordPageHeader {...base} facts={[]} /></I18nProvider>)
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(0)
  })

  it('shows the one read-only line when given', () => {
    wrap(<RecordPageHeader {...base} facts={[]} note="View only · Dewi (Accountable) sets targets." />)
    expect(screen.getByRole('note')).toHaveTextContent('View only')
  })
})
