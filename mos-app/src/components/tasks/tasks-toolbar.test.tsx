import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { PersistedCollectionView } from '@/lib/record-collection/collection-view-spec'
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
})

describe('TasksToolbar — queue-first disclosure', () => {
  it('keeps search and scope visible while advanced task configuration stays behind Filters', () => {
    const props = makeProps()
    renderToolbar(props)

    expect(screen.getByRole('tablist', { name: /task views/i })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.queryByRole('tab', { name: /completed/i })).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search tasks/i })).toBeInTheDocument()
    const filters = screen.getByRole('button', { name: /^filters$/i })
    expect(filters).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText(/business unit/i)).toBeNull()

    fireEvent.click(filters)

    expect(filters).toHaveAttribute('aria-expanded', 'true')
    const status = screen.getByRole('combobox', { name: /^status$/i })
    status.focus()
    fireEvent.click(status)
    fireEvent.click(screen.getByRole('option', { name: 'Done' }))
    expect(props.onQueryChange).toHaveBeenCalledWith({ status: 'Done' })
    expect(screen.getByRole('combobox', { name: /business unit/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /filter this queue/i })).toBeInTheDocument()
    expect(screen.getByText('Task')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Task' })).not.toBeInTheDocument()
  })

  it('applies all five filters through styled option menus and keeps Filters open on menu Escape', () => {
    const props = makeProps()
    renderToolbar(props)
    fireEvent.click(screen.getByRole('button', { name: /^filters$/i }))
    const select = (label: RegExp, option: string) => {
      const trigger = screen.getByRole('combobox', { name: label })
      trigger.focus()
      fireEvent.click(trigger)
      fireEvent.click(screen.getByRole('option', { name: option }))
      expect(trigger).toHaveFocus()
    }
    select(/^status$/i, 'Blocked')
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ status: 'Blocked' })
    select(/business unit/i, 'Café')
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ businessUnitId: 'bu-1' })
    select(/^person$/i, 'Raka')
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ personId: 'person-1' })
    select(/^group$/i, 'PIC')
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ groupBy: 'pic' })
    expect(localStorage.getItem('mos.tasks.groupBy')).toBe('owner')
    select(/^sort$/i, 'Due latest')
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ sort: 'due', direction: 'descending' })
    fireEvent.click(screen.getByRole('combobox', { name: /^sort$/i }))
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('region', { name: /filter this queue/i })).toBeInTheDocument()
  })

  it('states the active subset and clears it without hiding the queue', () => {
    const onClearFilters = vi.fn()
    renderToolbar(makeProps({
      activeQuery: { summary: 'My work · Person', hasActiveFilters: true },
      onClearFilters,
    }))

    expect(screen.getByRole('status')).toHaveTextContent('My work · Person')
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('closes Filters on Escape and returns focus to its trigger', () => {
    renderToolbar()
    const filters = screen.getByRole('button', { name: /^filters$/i })
    fireEvent.click(filters)

    fireEvent.keyDown(filters, { key: 'Escape' })

    expect(screen.queryByRole('region', { name: /filter this queue/i })).toBeNull()
    expect(filters).toHaveFocus()

    fireEvent.click(filters)
    const reopenedPanel = screen.getByRole('region', { name: /filter this queue/i })

    fireEvent.keyDown(reopenedPanel, { key: 'Escape' })

    expect(screen.queryByRole('region', { name: /filter this queue/i })).toBeNull()
    expect(filters).toHaveFocus()
  })

  it('surfaces saved-view load failures and retries the load', async () => {
    const onLoad = vi.fn()
    renderToolbar(makeProps({
      savedViews: {
        label: 'Saved views', selectedId: null, operation: 'error', error: 'Saved views unavailable.', items: [],
        onLoad, onApply: vi.fn(), onSave: vi.fn(),
      },
    }))

    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /^filters$/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Saved views are unavailable. Try again.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Saved views unavailable.')

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2))
  })

  it('retries a failed saved-view apply and keeps the saved-view error announced', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)
    const props = makeProps({
      savedViews: {
        label: 'Saved views', selectedId: null, operation: 'idle', error: null,
        items: [{ id: 'view-1', name: 'My queue' }],
        onLoad: vi.fn(), onApply, onSave: vi.fn(),
      },
    })
    const result = renderToolbar(props)
    fireEvent.click(screen.getByRole('button', { name: /^filters$/i }))
    fireEvent.click(screen.getByRole('button', { name: 'My queue' }))
    await waitFor(() => expect(onApply).toHaveBeenCalledWith('view-1'))

    result.rerender(
      <I18nProvider>
        <TasksToolbar
          {...makeProps({
            savedViews: {
              ...props.savedViews!,
              operation: 'error',
              error: 'Saved view could not be applied.',
            },
          })}
        />
      </I18nProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Saved views are unavailable. Try again.')

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2))
  })

  it('keeps a failed saved-view name open for retry, then closes only after success', async () => {
    let succeed = false
    const created = { id: 'view-1' } as unknown as PersistedCollectionView
    const onSave = vi.fn(async (): Promise<PersistedCollectionView | null> => succeed ? created : null)
    const savedViews = {
      label: 'Saved views', selectedId: null, operation: 'idle' as const, error: 'Could not save view.', items: [],
      onLoad: vi.fn(), onApply: vi.fn(), onSave,
    }
    renderToolbar(makeProps({ savedViews }))

    fireEvent.click(screen.getByRole('button', { name: /^filters$/i }))
    const saveTrigger = screen.getByRole('button', { name: /^save view$/i })
    fireEvent.click(saveTrigger)
    const input = screen.getByPlaceholderText(/view name/i)
    fireEvent.change(input, { target: { value: 'My queue' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(input).toHaveValue('My queue')
    expect(screen.getByRole('alert')).toHaveTextContent('Saved views are unavailable. Try again.')

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect(screen.getByDisplayValue('My queue')).toBeInTheDocument()

    succeed = true
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3))
    expect(screen.queryByDisplayValue('My queue')).toBeNull()
    expect(saveTrigger).toHaveAttribute('aria-expanded', 'false')
  })
})
