import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { CollectionToolbar } from './collection-toolbar'

// The lean-row disclosure trigger is desktop-only (min-width:768px). jsdom's setup default is
// matches:false (phone → panel expanded); stub matches:true to exercise the collapsed door.
function stubDesktop() {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: true, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null,
  })))
}

describe('CollectionToolbar — shared RecordCollection control grammar', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders one reusable presentation, view, search, filter, and saved-view surface', async () => {
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

  it('OD-REDESIGN-84.1: filters/group/sort are disclosed behind ONE "View & filters" door and a dot flags a non-default shape', async () => {
    // Desktop grammar: the lean row shows only search + the one trigger. Phone hosts expose the
    // identical door via their outer wrapper (matchMedia default → panel already expanded there).
    stubDesktop()
    const onGroupChange = vi.fn()
    render(
      <I18nProvider>
        <CollectionToolbar
          presentation={{
            label: 'Presentation', value: 'table',
            options: [{ value: 'table', label: 'Table' }], onChange: vi.fn(),
          }}
          views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
          filters={[
            {
              id: 'team', label: 'Team', value: '',
              options: [{ value: '', label: 'All teams' }], onChange: vi.fn(),
            },
            {
              id: 'tasks-group', label: 'Group', value: 'team',
              options: [{ value: '', label: 'None' }, { value: 'team', label: 'Team' }],
              onChange: onGroupChange,
            },
          ]}
        />
      </I18nProvider>,
    )

    // Collapsed: the domain filter AND the view-shape select both live behind the one door.
    expect(screen.queryByRole('combobox', { name: 'Team' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument()

    const trigger = screen.getByRole('button', { name: /view & filters/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // A non-default filter (Group=team) is hidden, so the trigger carries the active dot.
    expect(document.querySelector('.collection-toolbar__options-dot')).toBeInTheDocument()

    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('combobox', { name: 'Team' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), '')
    expect(onGroupChange).toHaveBeenCalledWith('')
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

// I3 (issue #379): the ONE desktop "View & filters" door closes on Escape with focus on the
// trigger. Covers every CollectionToolbar consumer (Tasks, Signals archive, the catalogs).
describe('CollectionToolbar — I3 "View & filters" Escape (issue #379)', () => {
  afterEach(() => vi.unstubAllGlobals())

  function renderToolbar(extra?: Partial<React.ComponentProps<typeof CollectionToolbar>>) {
    return render(
      <I18nProvider>
        <CollectionToolbar
          presentation={{ label: 'Presentation', value: 'table', options: [{ value: 'table', label: 'Table' }], onChange: vi.fn() }}
          views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
          filters={[{
            id: 'team', label: 'Team', value: '',
            options: [{ value: '', label: 'All teams' }, { value: 'ops', label: 'Operations' }],
            onChange: vi.fn(),
          }]}
          savedViews={extra?.savedViews}
        />
      </I18nProvider>,
    )
  }

  it('Escape on the open trigger closes the disclosure; focus stays on the trigger', async () => {
    stubDesktop()
    renderToolbar()
    const trigger = screen.getByRole('button', { name: /view & filters/i })
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('combobox', { name: 'Team' })).not.toBeInTheDocument()
  })

  it('Escape inside the disclosed panel closes it and returns focus to the trigger', async () => {
    stubDesktop()
    renderToolbar()
    await userEvent.click(screen.getByRole('button', { name: /view & filters/i }))
    const select = screen.getByRole('combobox', { name: 'Team' })
    select.focus()
    fireEvent.keyDown(select, { key: 'Escape' })
    const trigger = screen.getByRole('button', { name: /view & filters/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('Escape in the save-view input closes ONLY the save row — the disclosure stays open', async () => {
    stubDesktop()
    renderToolbar({
      savedViews: {
        label: 'Saved views', selectedId: null, operation: 'idle',
        items: [{ id: 'mine', name: 'My view' }], onApply: vi.fn(),
        onSave: vi.fn().mockResolvedValue(undefined),
      },
    })
    await userEvent.click(screen.getByRole('button', { name: /view & filters/i }))
    await userEvent.click(screen.getByRole('button', { name: /save view/i }))
    const input = screen.getByRole('textbox', { name: /view name/i })
    input.focus()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: /view name/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view & filters/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /save view/i })).toHaveFocus()
  })

  it('Escape on the Save view trigger while its row is open closes the row, not the disclosure', async () => {
    stubDesktop()
    renderToolbar({
      savedViews: {
        label: 'Saved views', selectedId: null, operation: 'idle',
        items: [{ id: 'mine', name: 'My view' }], onApply: vi.fn(),
        onSave: vi.fn().mockResolvedValue(undefined),
      },
    })
    await userEvent.click(screen.getByRole('button', { name: /view & filters/i }))
    const saveTrigger = screen.getByRole('button', { name: /save view/i })
    await userEvent.click(saveTrigger)
    fireEvent.keyDown(saveTrigger, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: /view name/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view & filters/i })).toHaveAttribute('aria-expanded', 'true')
  })
})
