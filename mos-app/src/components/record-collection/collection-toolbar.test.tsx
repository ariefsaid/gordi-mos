import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { CollectionToolbar } from './collection-toolbar'

describe('CollectionToolbar — shared RecordCollection control grammar', () => {
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

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Saved views' }), 'mine')
    expect(onApplySavedView).toHaveBeenCalledWith('mine')
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
})
