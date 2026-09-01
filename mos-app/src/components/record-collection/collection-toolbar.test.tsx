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

  it('keeps phone options available for the host outer disclosure with visible labels', () => {
    render(<I18nProvider><CollectionToolbar
      presentation={{ label: 'Presentation', value: 'table', options: [{ value: 'table', label: 'Table' }], onChange: vi.fn() }}
      views={{ label: 'Views', value: 'all', options: [{ value: 'all', label: 'All' }], onChange: vi.fn() }}
      filters={[{ id: 'team', label: 'Team', value: '', options: [{ value: '', label: 'All teams' }], onChange: vi.fn() }]}
    /></I18nProvider>)
    expect(screen.queryByRole('button', { name: /view & filters/i })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Team' })).toBeInTheDocument()
    expect(screen.getByText('Team')).toBeInTheDocument()
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
    const group = screen.getByRole('group', { name: /view & filters/i })
    const select = screen.getByRole('combobox', { name: 'Team' })
    const save = screen.getByRole('button', { name: /save view/i })
    select.focus(); await userEvent.keyboard('{ArrowDown}'); expect(select).toHaveFocus()
    save.focus(); await userEvent.keyboard('{ArrowUp}'); expect(select).toHaveFocus()
    expect(group).toBeInTheDocument()
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
