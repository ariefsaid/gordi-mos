// The shared record page pieces, record-agnostic: they take typed props and know nothing of a kind.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
    await user.keyboard('{ArrowUp}')
    expect(entries[0]).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(entries[2]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(entries[0]).toHaveFocus()
    await user.keyboard('{End}')
    expect(entries[2]).toHaveFocus()
    await user.keyboard('ar')
    expect(entries[2]).toHaveFocus()
    expect(within(menu).getByRole('separator')).toBeInTheDocument()
    await user.keyboard('{Home}{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('moves focus into the menu on the FIRST open, while the menu is already visible (a hidden element cannot take focus)', async () => {
    const user = userEvent.setup()
    const focusedWhile: string[] = []
    const realFocus = HTMLElement.prototype.focus
    const spy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      if (this.getAttribute('role') === 'menuitem') focusedWhile.push((this.closest('[role="menu"]') as HTMLElement).style.visibility)
      realFocus.call(this, options)
    })
    try {
      render(<RecordMenu items={items} label="More actions" />)
      await user.click(screen.getByRole('button', { name: 'More actions' }))
      await screen.findByRole('menu')
      expect(focusedWhile[0]).not.toBe('hidden')
    } finally {
      spy.mockRestore()
    }
  })

  it('Tab closes the menu and advances focus to the next control after its trigger', async () => {
    const user = userEvent.setup()
    render(<><RecordMenu items={items} label="More actions" /><button type="button">Next control</button></>)
    const trigger = screen.getByRole('button', { name: 'More actions' })
    await user.click(trigger)
    await user.keyboard('{Tab}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Next control' })).toHaveFocus()
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

describe('RecordMenu placement', () => {
  it('opens above its trigger when there is no room below, and below it otherwise', async () => {
    const user = userEvent.setup()
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 300, right: 340, width: 40, height: bottom - top, x: 300, y: top, toJSON: () => ({}) })
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120)
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const items = [{ id: 'a', label: 'One', onSelect: vi.fn() }, { id: 'b', label: 'Two', onSelect: vi.fn() }]
    try {
      spy.mockReturnValue(rect(748, 780) as DOMRect)
      const { unmount } = render(<RecordMenu items={items} label="More actions" />)
      await user.click(screen.getByRole('button', { name: 'More actions' }))
      expect(screen.getByRole('menu')).toHaveStyle({ top: '624px' })
      unmount()

      spy.mockReturnValue(rect(100, 132) as DOMRect)
      render(<RecordMenu items={items} label="More actions" />)
      await user.click(screen.getByRole('button', { name: 'More actions' }))
      expect(screen.getByRole('menu')).toHaveStyle({ top: '136px' })
    } finally {
      spy.mockRestore()
      height.mockRestore()
    }
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

  it('moves About and folded History into a side column on a wide page', async () => {
    const user = userEvent.setup()
    const load = vi.fn(() => <p>entries</p>)
    setWide(true)
    wrap(
      <RecordPageLayout label="Record" mode="page" headingLevel={1} header={<h1>Title</h1>} about={{ title: 'About', node: <RecordAbout items={[{ key: 'k', label: 'Business Unit', value: 'Retail Ops' }]} /> }} history={{ title: 'History', node: <Probe load={load} /> }}>
        <RecordSection id="s" title="Section">rows</RecordSection>
      </RecordPageLayout>,
    )
    const aside = screen.getByRole('complementary')
    expect(within(aside).getByText('Retail Ops')).toBeInTheDocument()
    const toggle = within(aside).getByRole('button', { name: 'History' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(aside).queryByText('entries')).toBeNull()
    expect(load).not.toHaveBeenCalled()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(aside).getByText('entries')).toBeInTheDocument()
    expect(load).toHaveBeenCalledOnce()
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

  it('draws a destructive state as the lost-tone pill', () => {
    wrap(<RecordPageHeader {...base} facts={[{ type: 'state', key: 's', label: 'Blocked', tone: 'destructive' }]} />)
    expect(screen.getByText('Blocked').closest('.pill')).toHaveClass('pill--destructive')
  })

  it('draws an outline primary quietly, and a primary by default', () => {
    const { rerender } = wrap(<RecordPageHeader {...base} facts={[]} primary={{ label: 'Mark complete', variant: 'outline', onClick: vi.fn() }} />)
    expect(screen.getByRole('button', { name: 'Mark complete' })).toHaveClass('btn-outline')
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(0)
    rerender(<I18nProvider><RecordPageHeader {...base} facts={[]} primary={{ label: 'Mark complete', onClick: vi.fn() }} /></I18nProvider>)
    expect(screen.getByRole('button', { name: 'Mark complete' })).toHaveClass('btn-primary')
  })

  it('carries a person hint as an accessible description, not a visible line', () => {
    const facts: RecordFact[] = [
      { type: 'person', key: 's', role: 'neutral', hint: 'inherited from Weekly promo', field: field({ key: 'supervisor', label: 'Supervisor', control: 'person', value: 'p1', displayValue: 'Dewi Director' }) },
    ]
    wrap(<RecordPageHeader {...base} facts={facts} />)
    const chip = screen.getByRole('listitem')
    expect(chip).toHaveAttribute('title', 'inherited from Weekly promo')
    expect(within(chip).getByText('inherited from Weekly promo')).toHaveClass('sr-only')
  })

  it('lets a group go without a visible label', () => {
    const facts: RecordFact[] = [
      { type: 'group', key: 'ctx', fields: [field({ key: 'a', label: 'Project/Process', displayValue: 'Weekly promo' }), field({ key: 'b', label: 'Objective', displayValue: 'Q4 growth' })] },
    ]
    wrap(<RecordPageHeader {...base} facts={facts} />)
    expect(document.querySelector('.rp-fact__key')).toBeNull()
    // Each field keeps its own name for assistive tech; only the shared visible label is gone.
    expect(screen.getByRole('list', { name: 'Key facts' })).toHaveTextContent(/Project\/Process.*Weekly promo.*Objective.*Q4 growth/)
  })
})

describe('RecordPageLayout record kind and history count', () => {
  it('names the record kind on its root and counts History in the disclosure', () => {
    wrap(
      <RecordPageLayout label="Record" kind="task" mode="page" headingLevel={1} header={<h1>Title</h1>} history={{ title: 'History', count: 4, node: <p>entries</p> }}>
        <RecordSection id="s" title="Section">rows</RecordSection>
      </RecordPageLayout>,
    )
    expect(screen.getByRole('region', { name: 'Record' })).toHaveAttribute('data-record-kind', 'task')
    expect(screen.getByRole('button', { name: /History/ })).toHaveTextContent('History4')
  })

  it('counts History in the folded side-column disclosure on a wide page', async () => {
    const user = userEvent.setup()
    setWide(true)
    wrap(
      <RecordPageLayout label="Record" mode="page" headingLevel={1} header={<h1>Title</h1>} history={{ title: 'History', count: 4, node: <p>entries</p> }}>
        <RecordSection id="s" title="Section">rows</RecordSection>
      </RecordPageLayout>,
    )
    const aside = screen.getByRole('complementary')
    const toggle = within(aside).getByRole('button', { name: /History/ })
    expect(toggle).toHaveTextContent('History4')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(aside).queryByText('entries')).toBeNull()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(aside).getByText('entries')).toBeInTheDocument()
  })

  it('renders no History when none is given, narrow or wide', () => {
    wrap(<RecordPageLayout label="Record" mode="page" headingLevel={1} header={<h1>Title</h1>}>x</RecordPageLayout>)
    expect(screen.queryByRole('button', { name: /History/ })).toBeNull()
    setWide(true)
    wrap(<RecordPageLayout label="Other" mode="page" headingLevel={1} header={<h1>Title</h1>}>x</RecordPageLayout>)
    expect(screen.queryByRole('heading', { name: /History/ })).toBeNull()
  })

  it('leaves the kind attribute off when none is given', () => {
    wrap(<RecordPageLayout label="Record" mode="page" headingLevel={1} header={<h1>Title</h1>} history={{ title: 'History', node: null }}>x</RecordPageLayout>)
    expect(screen.getByRole('region', { name: 'Record' })).not.toHaveAttribute('data-record-kind')
  })
})
