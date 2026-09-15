import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { TASK_COLLECTION_NEUTRAL_QUERY } from './task-collection-adapter'
import { TasksToolbar } from './tasks-toolbar'
import type { TasksToolbarProps } from './tasks-toolbar'

function matchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('768') ? matches : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function makeProps(overrides: Partial<TasksToolbarProps> = {}): TasksToolbarProps {
  return {
    query: TASK_COLLECTION_NEUTRAL_QUERY,
    onQueryChange: vi.fn(),
    onViewChange: vi.fn(),
    onPresentationChange: vi.fn(),
    onFieldToggle: vi.fn(),
    overdueCount: 3,
    onOverdueFilter: vi.fn(),
    onClearOverdue: vi.fn(),
    onClearFilters: vi.fn(),
    activeQuery: { summary: 'All', hasActiveFilters: false },
    buOptions: [{ id: 'bu-1', name: 'Café' }],
    personOptions: [{ id: 'person-1', full_name: 'Raka' }],
    savedViews: undefined,
    ...overrides,
  }
}

function renderToolbar(props: TasksToolbarProps = makeProps()) {
  return render(<I18nProvider><TasksToolbar {...props} /></I18nProvider>)
}

beforeEach(() => {
  matchMedia(true)
  localStorage.clear()
})

describe('TasksToolbar — OD-WAY-89 collection grammar', () => {
  it('exposes the e7 desktop two-row grammar without a Filters door', () => {
    const savedViews = {
      label: 'Saved views', selectedId: null, operation: 'idle' as const, error: null,
      items: [{ id: 'view-1', name: 'My queue' }], onApply: vi.fn(), onSave: vi.fn(),
    }
    renderToolbar(makeProps({ savedViews }))

    expect(screen.getByTestId('record-collection-toolbar')).toBeInTheDocument()
    expect(screen.getAllByTestId('collection-toolbar-row')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My queue' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search tasks/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /group/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /business unit/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /group/i })).toHaveTextContent('Group: None')
    expect(screen.getByRole('combobox', { name: /business unit/i })).toHaveTextContent('All units')
    expect(screen.getByRole('button', { name: /status/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /person/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /sort/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /sort/i })).toHaveTextContent('Due soonest')
    expect(screen.getByRole('button', { name: /^fields$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save view$/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /attention/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /attention/i })).toHaveTextContent('3 need attention')
    expect(screen.queryByRole('button', { name: /^filters$/i })).not.toBeInTheDocument()
  })

  it('keeps group, domain, status, person, sort, fields, and attention controls independently reachable', () => {
    const props = makeProps()
    renderToolbar(props)

    fireEvent.click(screen.getByRole('combobox', { name: /^group$/i }))
    fireEvent.click(screen.getByRole('option', { name: 'PIC' }))
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ groupBy: 'pic' })
    expect(localStorage.getItem('mos.tasks.groupBy')).toBe('owner')

    fireEvent.click(screen.getByRole('button', { name: /^status$/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Blocked' }))
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ status: 'Blocked' })

    fireEvent.click(screen.getByRole('combobox', { name: /business unit/i }))
    fireEvent.click(screen.getByRole('option', { name: 'Café' }))
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ businessUnitId: 'bu-1' })

    fireEvent.click(screen.getByRole('combobox', { name: /^person$/i }))
    fireEvent.click(screen.getByRole('option', { name: 'Raka' }))
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ personId: 'person-1' })

    fireEvent.click(screen.getByRole('combobox', { name: /^sort$/i }))
    fireEvent.click(screen.getByRole('option', { name: 'Due latest' }))
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ sort: 'due', direction: 'descending' })

    fireEvent.click(screen.getByRole('button', { name: /^fields$/i }))
    expect(screen.getByRole('group', { name: /^fields$/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox', { name: /attention/i }))
    fireEvent.click(screen.getByRole('option', { name: /overdue/i }))
    expect(props.onOverdueFilter).toHaveBeenCalledTimes(1)
  })

  it('keeps full selected filter values discoverable within the compact desktop grammar', () => {
    const businessUnit = 'Gordi HQ Retail Operations and Customer Experience'
    const person = 'Bulan Barista with a deliberately long display name'
    renderToolbar(makeProps({
      query: {
        ...TASK_COLLECTION_NEUTRAL_QUERY,
        businessUnitId: 'bu-1',
        personId: 'person-1',
        status: 'In Progress',
      },
      buOptions: [{ id: 'bu-1', name: businessUnit }],
      personOptions: [{ id: 'person-1', full_name: person }],
    }))

    const businessUnitTrigger = screen.getByRole('combobox', { name: /business unit/i })
    const personTrigger = screen.getByRole('combobox', { name: /person/i })
    const statusTrigger = screen.getByRole('button', { name: /^status$/i })
    expect(businessUnitTrigger).toHaveAttribute('data-full-value', businessUnit)
    expect(businessUnitTrigger).toHaveTextContent(businessUnit)
    expect(personTrigger).toHaveAttribute('data-full-value', person)
    expect(personTrigger).toHaveTextContent(person)
    expect(statusTrigger).toHaveAttribute('data-full-value', 'In Progress')
    expect(statusTrigger).toHaveTextContent('In Progress')
  })

  it('offers a compact clear action when an active subset is selected', () => {
    const onClearFilters = vi.fn()
    renderToolbar(makeProps({
      activeQuery: { summary: 'My work · Person', hasActiveFilters: true },
      onClearFilters,
    }))

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })
})

describe('TasksToolbar — saved view persistence states', () => {
  it('surfaces saved-view load failures and retries the load', async () => {
    const onLoad = vi.fn()
    renderToolbar(makeProps({
      savedViews: {
        label: 'Saved views', selectedId: null, operation: 'error', error: 'Saved views unavailable.', items: [],
        onLoad, onApply: vi.fn(), onSave: vi.fn(),
      },
    }))

    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('alert')).toHaveTextContent('Saved views are unavailable. Try again.')
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2))
  })

  it('retries a failed saved-view apply while keeping the error announced', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)
    const savedViews = {
      label: 'Saved views', selectedId: null, operation: 'idle' as const, error: null,
      items: [{ id: 'view-1', name: 'My queue' }], onLoad: vi.fn(), onApply, onSave: vi.fn(),
    }
    const result = renderToolbar(makeProps({ savedViews }))
    fireEvent.click(screen.getByRole('button', { name: 'My queue' }))
    await waitFor(() => expect(onApply).toHaveBeenCalledWith('view-1'))

    result.rerender(
      <I18nProvider>
        <TasksToolbar {...makeProps({ savedViews: { ...savedViews, operation: 'error', error: 'Saved view could not be applied.' } })} />
      </I18nProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Saved views are unavailable. Try again.')
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2))
  })

  it('keeps a failed saved-view name open for retry, then closes after success', async () => {
    let succeed = false
    const onSave = vi.fn(async () => succeed ? undefined : null)
    const savedViews = {
      label: 'Saved views', selectedId: null, operation: 'idle' as const, error: 'Could not save view.', items: [],
      onLoad: vi.fn(), onApply: vi.fn(), onSave,
    }
    renderToolbar(makeProps({ savedViews }))

    fireEvent.click(screen.getByRole('button', { name: /^save view$/i }))
    const input = screen.getByRole('textbox', { name: /view name/i })
    fireEvent.change(input, { target: { value: 'My queue' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(screen.getByDisplayValue('My queue')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    succeed = true
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3))
    expect(screen.queryByDisplayValue('My queue')).toBeNull()
  })

  it('retries the same failed saved-view name after the save form is closed', async () => {
    const onSave = vi.fn().mockResolvedValue(null)
    renderToolbar(makeProps({
      savedViews: {
        label: 'Saved views', selectedId: null, operation: 'error', error: 'Could not save view.', items: [],
        onLoad: vi.fn(), onApply: vi.fn(), onSave,
      },
    }))

    fireEvent.click(screen.getByRole('button', { name: /^save view$/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /view name/i }), { target: { value: 'My queue' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('My queue'))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('textbox', { name: /view name/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(onSave).toHaveBeenNthCalledWith(2, 'My queue'))
  })
})
