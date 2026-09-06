import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ViewOptionsDisclosure } from '@/shell/view-options-disclosure'
import { CollectionToolbar } from './collection-toolbar'

// Desktop media-query behavior is explicit here; jsdom's setup default is phone-sized.
function stubDesktop() {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: true, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null,
  })))
}

// The shared viewport helper's 390px phone branch is the non-desktop media query.
function stubPhone390() {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width: 390px') ? true : false,
    media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null,
  })))
}

describe('CollectionToolbar — shared RecordCollection control grammar', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders one reusable presentation, view, search, filter, and saved-view surface', async () => {
    stubDesktop()
    const onPresentationChange = vi.fn()
    const onViewChange = vi.fn()
    const onSearchChange = vi.fn()
    const onFilterChange = vi.fn()
    const onApplySavedView = vi.fn()

    function Harness() {
      const [search, setSearch] = useState('')
      return (
        <CollectionToolbar
          presentation={{
            label: 'Presentation', value: 'table',
            options: [{ value: 'table', label: 'Table' }, { value: 'feed', label: 'Feed' }],
            onChange: onPresentationChange,
          }}
          views={{
            label: 'Views', value: 'all',
            options: [{ value: 'all', label: 'All' }, { value: 'attention', label: 'Needs attention' }],
            onChange: onViewChange,
          }}
          search={{
            label: 'Search records', placeholder: 'Search', value: search,
            onChange: (value) => { setSearch(value); onSearchChange(value) },
          }}
          filters={[{
            id: 'team', label: 'Team', value: '',
            options: [{ value: '', label: 'All teams' }, { value: 'ops', label: 'Operations' }],
            onChange: onFilterChange,
          }]}
          savedViews={{
            label: 'Saved views', selectedId: null, operation: 'idle',
            items: [{ id: 'mine', name: 'My view' }], onApply: onApplySavedView,
            onSave: vi.fn().mockResolvedValue(undefined),
          }}
        />
      )
    }

    render(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    )

    expect(screen.getByTestId('record-collection-toolbar')).toBeInTheDocument()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Feed' }))
    expect(onPresentationChange).toHaveBeenCalledWith('feed')

    await userEvent.click(screen.getByRole('button', { name: 'Needs attention' }))
    expect(onViewChange).toHaveBeenCalledWith('attention')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search records' }), 'freezer')
    expect(onSearchChange).toHaveBeenLastCalledWith('freezer')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Team' }), 'ops')
    expect(onFilterChange).toHaveBeenCalledWith('ops')

    // Saved views live as chips on the same single view axis as the presets — no native popup.
    await userEvent.click(screen.getByRole('button', { name: 'My view' }))
    expect(onApplySavedView).toHaveBeenCalledWith('mine')

    const saveTrigger = screen.getByRole('button', { name: /save view/i })
    await userEvent.click(saveTrigger)
    await userEvent.type(screen.getByRole('textbox', { name: /view name/i }), 'My view')
    await userEvent.keyboard('{Escape}')
    expect(saveTrigger).toHaveFocus()
  })

  it('removes presentation tabs from the phone DOM while retaining them on desktop', () => {
    const presentation = {
      label: 'Presentation', value: 'table' as const,
      options: [{ value: 'table' as const, label: 'Table' }, { value: 'feed' as const, label: 'Feed' }],
      onChange: vi.fn(),
    }
    const view = { label: 'Views', value: 'all' as const, options: [{ value: 'all' as const, label: 'All' }], onChange: vi.fn() }
    const { unmount } = render(<I18nProvider><CollectionToolbar presentation={presentation} views={view} /></I18nProvider>)
    expect(screen.queryByRole('tablist', { name: 'Presentation' })).toBeNull()
    unmount()
    stubDesktop()
    render(<I18nProvider><CollectionToolbar presentation={presentation} views={view} /></I18nProvider>)
    const tabs = screen.getByRole('tablist', { name: 'Presentation' })
    expect(within(tabs).getAllByRole('tab')).toHaveLength(2)
  })

  it('OD-WAY-89: exposes compact desktop options without a disclosure door', async () => {
    stubDesktop()
    render(<I18nProvider><CollectionToolbar
      presentation={{ label: 'Presentation', value: 'table', options: [{ value: 'table', label: 'Table' }], onChange: vi.fn() }}
      views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
      filters={[{ id: 'team', label: 'Team', value: '', options: [{ value: '', label: 'All teams' }], onChange: vi.fn() }, { id: 'group', label: 'Group', value: '', options: [{ value: '', label: 'All groups' }], onChange: vi.fn() }]}
      savedViews={{ label: 'Saved views', selectedId: null, operation: 'idle', items: [], onApply: vi.fn(), onSave: vi.fn() }}
      toggles={<span role="switch" aria-label="Attention">Attention</span>}
    /></I18nProvider>)

    expect(screen.queryByRole('button', { name: /view & filters/i })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Team' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Group' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save view/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Attention' })).toBeInTheDocument()
    expect(screen.queryByText('Team')).not.toBeInTheDocument()
  })

  it('at 390px, opens the outer View & filters door to reveal the E7 filter row', async () => {
    stubPhone390()
    function PhoneHarness() {
      const [open, setOpen] = useState(false)
      return (
        <ViewOptionsDisclosure
          open={open}
          onToggle={() => setOpen(value => !value)}
          label="View & filters"
          panelId="phone-toolbar-options"
        >
          <CollectionToolbar
            presentation={{ label: 'Presentation', value: 'table', options: [{ value: 'table', label: 'Table' }], onChange: vi.fn() }}
            views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
            filters={[{ id: 'team', label: 'Team', value: '', options: [{ value: '', label: 'All teams' }], onChange: vi.fn() }]}
          />
        </ViewOptionsDisclosure>
      )
    }

    render(<I18nProvider><PhoneHarness /></I18nProvider>)
    const trigger = screen.getByRole('button', { name: 'View & filters' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('combobox', { name: 'Team' })).not.toBeInTheDocument()

    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('group', { name: /view & filters/i })
    expect(within(panel).getByText('Team')).toBeInTheDocument()
    expect(within(panel).getByRole('combobox', { name: 'Team' })).toHaveValue('')
    expect(within(panel).getByRole('option', { name: 'All teams' })).toBeInTheDocument()
  })

  it('omits unsupported capabilities instead of rendering disabled decorative controls', () => {
    render(
      <I18nProvider>
        <CollectionToolbar
          presentation={{
            label: 'Presentation', value: 'feed',
            options: [{ value: 'feed', label: 'Feed' }], onChange: vi.fn(),
          }}
          views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
        />
      </I18nProvider>,
    )

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save view/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/soon/i)).not.toBeInTheDocument()
  })

  it('OD-REDESIGN-72/79: labels the single view axis with a visible "Saved view" label', () => {
    render(
      <I18nProvider>
        <CollectionToolbar
          presentation={{
            label: 'Presentation', value: 'table',
            options: [{ value: 'table', label: 'Table' }], onChange: vi.fn(),
          }}
          views={{
            label: 'Views', value: 'all',
            options: [{ value: 'all', label: 'All' }, { value: 'attention', label: 'Needs attention' }],
            onChange: vi.fn(),
          }}
          savedViews={{
            label: 'Saved views', selectedId: null, operation: 'idle',
            items: [{ id: 'mine', name: 'My view' }], onApply: vi.fn(),
            onSave: vi.fn().mockResolvedValue(undefined),
          }}
        />
      </I18nProvider>,
    )

    // The saved-view chips sit on the same single view axis as the presets and are visibly
    // labeled as a group — the E7/pre-E7 salvage anatomy, not unlabeled chips.
    const group = screen.getByRole('group', { name: 'Views' })
    expect(within(group).getByText('Saved view')).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'My view' })).toBeInTheDocument()
  })

  it('keeps the Saved view label when there are no user-saved views', () => {
    render(
      <I18nProvider>
        <CollectionToolbar
          presentation={{
            label: 'Presentation', value: 'table',
            options: [{ value: 'table', label: 'Table' }], onChange: vi.fn(),
          }}
          views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
          savedViews={{
            label: 'Saved views', selectedId: null, operation: 'idle',
            items: [], onApply: vi.fn(), onSave: vi.fn().mockResolvedValue(undefined),
          }}
        />
      </I18nProvider>,
    )

    expect(screen.getByText('Saved view')).toBeInTheDocument()
  })

  it('DO-20(c) (census objectives F5): a host WITHOUT the savedViews capability labels the view zone plain "View", never "Saved view"', () => {
    // The catalogs' Active/Archived toggle has saved views structurally disabled — promising
    // "Saved view" there mislabels the control (census R2, objectives F5).
    render(
      <I18nProvider>
        <CollectionToolbar
          presentation={{
            label: 'Presentation', value: 'table',
            options: [{ value: 'table', label: 'Table' }], onChange: vi.fn(),
          }}
          views={{
            label: 'Views', value: 'active',
            options: [{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }],
            onChange: vi.fn(),
          }}
        />
      </I18nProvider>,
    )

    const group = screen.getByRole('group', { name: 'Views' })
    expect(within(group).getByText('View')).toBeInTheDocument()
    expect(screen.queryByText('Saved view')).not.toBeInTheDocument()
  })
})

describe('CollectionToolbar — Fields chooser', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows Fields and toggles an optional column while retaining decision columns', async () => {
    stubDesktop()
    const onToggle = vi.fn()
    render(<I18nProvider><CollectionToolbar
      presentation={{ label: 'Presentation', value: 'table', options: [{ value: 'table', label: 'Table' }], onChange: vi.fn() }}
      views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
      fields={{
        label: 'Fields', options: [
          { value: 'title', label: 'Title', required: true },
          { value: 'pic', label: 'PIC', required: true },
          { value: 'supervisor', label: 'Supervisor', required: true },
          { value: 'status', label: 'Status', required: true },
          { value: 'due', label: 'Due', required: true },
          { value: 'businessUnit', label: 'Business Unit', required: false },
        ], visible: ['title', 'pic', 'supervisor', 'status', 'due'], onToggle,
      }}
    /></I18nProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Fields' }))
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(6)
    expect(checkboxes.filter((checkbox) => checkbox.hasAttribute('disabled'))).toHaveLength(5)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Business Unit' }))
    expect(onToggle).toHaveBeenCalledWith('businessUnit', true)
  })
})

describe('Ticket #743 toolbar acceptance', () => {
  afterEach(() => vi.unstubAllGlobals())

  // AC-008 (#743 r3): a filter may carry an anchored popover of CHECKBOX choices — the Fields-
  // chooser pattern. The control itself stays ONE dropdown-class control in the row; the
  // popover's boxes are not toolbar controls (they exist only while the popover is open), and
  // the choices fire independently — coexistence is the host's data model (see the Tasks AC-008
  // journey), the grammar only guarantees independent onChange wiring.
  it('AC-008: a filter popover keeps its checkbox choices off the toolbar row; the trigger stays one dropdown control', async () => {
    stubDesktop()
    const onBlocked = vi.fn()
    const onArchived = vi.fn()
    render(<I18nProvider><CollectionToolbar
      presentation={{ label: 'Presentation', value: 'table', options: [{ value: 'table', label: 'Table' }], onChange: vi.fn() }}
      views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
      filters={[{
        id: 'status', label: 'Status', display: 'Blocked',
        popover: { choices: [
          { key: 'blocked', label: 'Blocked', checked: true, onChange: onBlocked },
          { key: 'archived', label: 'Include archived', checked: false, onChange: onArchived },
        ] },
      }]}
    /></I18nProvider>)
    // The trigger is the ONE dropdown-class control; closed, the row holds zero checkboxes.
    const trigger = screen.getByRole('button', { name: 'Status' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger.closest('.collection-toolbar__select')).toBeInTheDocument()
    const row = screen.getAllByTestId('collection-toolbar-row')[1]
    expect(row.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)

    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('group', { name: 'Status' })
    expect(within(menu).getByRole('checkbox', { name: 'Blocked' })).toBeChecked()
    expect(within(menu).getByRole('checkbox', { name: 'Include archived' })).not.toBeChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Include archived' }))
    expect(onArchived).toHaveBeenCalledWith(true)
    expect(onBlocked).not.toHaveBeenCalled()

    // Toggling the checked status choice clears it (back to any) — the exclusive side.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Blocked' }))
    expect(onBlocked).toHaveBeenCalledWith(false)

    // Closed again → the boxes are gone from the row.
    await userEvent.click(trigger)
    expect(row.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
  })

  it('AC-003: no switcher while one presentation is live; the segment renders at row 1 when two are', () => {
    stubDesktop()
    const views = { label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }
    const { rerender } = render(
      <I18nProvider><CollectionToolbar
        presentation={{ label: 'Presentation', value: 'table', options: [{ value: 'table', label: 'Table' }], onChange: vi.fn() }}
        views={views}
      /></I18nProvider>,
    )
    // Table is the Task collection's only live desktop presentation: no strip at all.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()

    rerender(
      <I18nProvider><CollectionToolbar
        presentation={{
          label: 'Presentation', value: 'table', onChange: vi.fn(),
          options: [{ value: 'table', label: 'Table' }, { value: 'card', label: 'Card' }],
        }}
        views={views}
      /></I18nProvider>,
    )
    const tablist = screen.getByRole('tablist', { name: 'Presentation' })
    // The segment lives in ROW 1 (views · presentation), never in the query row.
    expect(tablist.closest('[data-testid="collection-toolbar-row"]'))
      .toBe(screen.getAllByTestId('collection-toolbar-row')[0])
  })

  it('AC-006: Fields chooser — Business unit · Project/Process · Objective · Last activity toggleable; the decision five locked', async () => {
    stubDesktop()
    const onToggle = vi.fn()
    render(<I18nProvider><CollectionToolbar
      presentation={{ label: 'Presentation', value: 'table', options: [{ value: 'table', label: 'Table' }], onChange: vi.fn() }}
      views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
      fields={{ label: 'Fields', options: [
        { value: 'title', label: 'Task', required: true }, { value: 'pic', label: 'PIC', required: true },
        { value: 'supervisor', label: 'Supervisor', required: true }, { value: 'status', label: 'Status', required: true },
        { value: 'due', label: 'Due', required: true }, { value: 'businessUnit', label: 'Business unit' },
        { value: 'workline', label: 'Project/Process' }, { value: 'objective', label: 'Objective' },
        { value: 'activity', label: 'Last activity' },
      ], visible: ['title', 'pic', 'supervisor', 'status', 'due'], onToggle }}
    /></I18nProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Fields' }))

    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(9)
    const locked = boxes.filter((box) => box.hasAttribute('disabled'))
    expect(locked).toHaveLength(5)
    const optional = boxes.filter((box) => !box.hasAttribute('disabled'))
    expect(optional.map((box) => box.closest('label')?.textContent)).toEqual([
      'Business unit', 'Project/Process', 'Objective', 'Last activity',
    ])
    await userEvent.click(optional[0])
    expect(onToggle).toHaveBeenCalledWith('businessUnit', true)
  })

  it('AC-007: Save view opens an anchored popover (name field + Save); the toolbar gains no row; Escape closes and restores focus', async () => {
    stubDesktop()
    render(<I18nProvider><CollectionToolbar
      presentation={{ label: 'Presentation', value: 'table', options: [{ value: 'table', label: 'Table' }], onChange: vi.fn() }}
      views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
      savedViews={{ label: 'Saved views', selectedId: null, operation: 'idle', items: [], onApply: vi.fn(), onSave: vi.fn() }}
      filters={[{ id: 'status', label: 'Status', value: '', options: [{ value: '', label: 'Any' }], onChange: vi.fn() }]}
    /></I18nProvider>)
    expect(screen.getAllByTestId('collection-toolbar-row')).toHaveLength(2)

    const trigger = screen.getByRole('button', { name: /save view/i })
    await userEvent.click(trigger)
    // Anchored: the popover shares the trigger's relative save-zone, so it cannot grow a row.
    const popover = screen.getByRole('group', { name: /save current view/i })
    expect(popover).toHaveClass('collection-toolbar__save')
    expect(popover.parentElement).toHaveClass('collection-toolbar__save-zone')
    expect(screen.getByRole('textbox', { name: /view name/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getAllByTestId('collection-toolbar-row')).toHaveLength(2)

    fireEvent.keyDown(screen.getByRole('textbox', { name: /view name/i }), { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: /view name/i })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

describe('CollectionToolbar — desktop keyboard and nested save behavior', () => {
  afterEach(() => vi.unstubAllGlobals())

  function renderToolbar() {
    return render(<I18nProvider><CollectionToolbar
      presentation={{ label: 'Presentation', value: 'table', options: [{ value: 'table', label: 'Table' }], onChange: vi.fn() }}
      views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
      filters={[{ id: 'team', label: 'Team', value: '', options: [{ value: '', label: 'All teams' }, { value: 'ops', label: 'Operations' }], onChange: vi.fn() }]}
      savedViews={{ label: 'Saved views', selectedId: null, operation: 'idle', items: [], onApply: vi.fn(), onSave: vi.fn() }}
    /></I18nProvider>)
  }

  it('traverses desktop controls without stealing native select keys', async () => {
    stubDesktop(); renderToolbar()
    const select = screen.getByRole('combobox', { name: 'Team' })
    const save = screen.getByRole('button', { name: /save view/i })
    select.focus(); await userEvent.keyboard('{ArrowDown}'); expect(select).toHaveFocus()
    save.focus(); await userEvent.keyboard('{ArrowUp}'); expect(select).toHaveFocus()
  })

  it('Escape closes only the nested save row and keeps desktop options visible', async () => {
    stubDesktop(); renderToolbar()
    const save = screen.getByRole('button', { name: /save view/i })
    await userEvent.click(save)
    const input = screen.getByRole('textbox', { name: /view name/i })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: /view name/i })).not.toBeInTheDocument()
    expect(save).toHaveFocus()
    expect(screen.getByRole('combobox', { name: 'Team' })).toBeInTheDocument()
  })

  it('Escape on a focused desktop select leaves the options row rendered', () => {
    stubDesktop(); renderToolbar()
    const select = screen.getByRole('combobox', { name: 'Team' }); select.focus()
    fireEvent.keyDown(select, { key: 'Escape' })
    expect(screen.getByRole('combobox', { name: 'Team' })).toBeInTheDocument()
  })
})
