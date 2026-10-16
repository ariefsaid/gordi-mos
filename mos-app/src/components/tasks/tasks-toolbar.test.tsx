import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { TASK_COLLECTION_NEUTRAL_QUERY } from './task-collection-query'
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
    viewerOrgWide: true,
    buOptions: [{ id: 'bu-1', name: 'Café' }],
    personOptions: [{ id: 'person-1', full_name: 'Raka' }],
    savedViews: undefined,
    ...overrides,
  }
}

function renderToolbar(props: TasksToolbarProps = makeProps(), locale: 'en' | 'id' = 'en') {
  return render(<I18nProvider initialLocale={locale}><TasksToolbar {...props} /></I18nProvider>)
}

// The desktop long tail lives behind the surface's own door. "Reachable" is the contract these
// tests assert, so they open it the way a reader would rather than reaching past it.
function openFilters() {
  const trigger = screen.queryByRole('button', { name: /^filters & options|^filter & opsi/i })
  if (trigger?.getAttribute('aria-expanded') === 'false') fireEvent.click(trigger)
  return trigger
}

function scopeOptions(name = 'Task views') {
  fireEvent.click(screen.getByRole('combobox', { name }))
  return screen.getAllByRole('option').map((option) => option.textContent?.trim())
}

const savedViewItems = (extra: Record<string, unknown> = {}) => ({
  label: 'Saved views', selectedId: null, operation: 'idle' as const, error: null,
  items: [{ id: 'view-1', name: 'My queue' }], onLoad: vi.fn(), onApply: vi.fn(), onSave: vi.fn(),
  ...extra,
})

beforeEach(() => {
  matchMedia(true)
  localStorage.clear()
})

describe('TasksToolbar — OD-WAY-89 collection grammar', () => {
  // #749 AC-011 (W-G step 2): the system view set reads All · My work · Team work · Overdue,
  // and the viewer's own saved views follow them in that same list.
  it('AC-011: the view list reads All · My work · Team work · Overdue, then the viewer\'s saved views', () => {
    renderToolbar(makeProps({ savedViews: savedViewItems() }))
    expect(scopeOptions()).toEqual(['All', 'My work', 'Team work', 'Overdue', 'My queue'])
  })

  // #749: both locales carry the new view label (EN "Team work").
  it('AC-011: the ID locale carries the Team work view as "Pekerjaan tim"', () => {
    renderToolbar(makeProps(), 'id')
    const labels = scopeOptions('Tampilan tugas')
    expect(labels).toContain('Pekerjaan tim')
    expect(labels).not.toContain('Team work')
  })

  // OD-TASK-3 (#1200): the same `view=all` state is NAMED by the viewer's authority — the view
  // reads "Relevant" for a non-org-wide viewer and "All" only for an org-wide one (admin).
  it('OD-TASK-3: the All view reads Relevant for a non-org-wide viewer and All for an org-wide one', () => {
    const { unmount } = renderToolbar(makeProps({ viewerOrgWide: false }))
    const relevant = scopeOptions()
    expect(relevant).toContain('Relevant')
    expect(relevant).not.toContain('All')
    unmount()
    renderToolbar(makeProps({ viewerOrgWide: true }))
    const all = scopeOptions()
    expect(all).toContain('All')
    expect(all).not.toContain('Relevant')
  })

  it('choosing a view reports it, and choosing a saved view applies it', () => {
    const props = makeProps({ savedViews: savedViewItems() })
    renderToolbar(props)
    fireEvent.click(screen.getByRole('combobox', { name: 'Task views' }))
    fireEvent.click(screen.getByRole('option', { name: 'My work' }))
    expect(props.onViewChange).toHaveBeenCalledWith('my-work')
    fireEvent.click(screen.getByRole('combobox', { name: 'Task views' }))
    fireEvent.click(screen.getByRole('option', { name: 'My queue' }))
    expect(props.savedViews!.onApply).toHaveBeenCalledWith('view-1')
  })

  // The desktop long tail sits behind one door; search, the view list, Sort and Group stay in the
  // bar. Every control stays reachable.
  it('puts the desktop long tail behind one door and keeps search, view, sort and group exposed', () => {
    renderToolbar(makeProps({ savedViews: savedViewItems() }))

    expect(screen.getByTestId('record-collection-toolbar')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Task views' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search tasks/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /^sort$/i })).toHaveTextContent('Due soonest')
    expect(screen.getByRole('combobox', { name: /^group$/i })).toHaveTextContent('None')
    // The rest is reachable through the door, never dropped.
    expect(screen.queryByRole('combobox', { name: /business unit/i })).toBeNull()
    openFilters()
    expect(screen.getByRole('combobox', { name: /business unit/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /business unit/i })).toHaveTextContent('All units')
    expect(screen.getByRole('combobox', { name: /^status$/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /^person$/i })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /^fields$/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /include archived/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save view$/i })).toBeInTheDocument()
  })

  it('on a phone only Sort stays in the bar; Group and the field list move behind the door', () => {
    matchMedia(false)
    renderToolbar(makeProps())
    expect(screen.getByRole('combobox', { name: /^sort$/i })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /^group$/i })).toBeNull()
    openFilters()
    expect(screen.getByRole('combobox', { name: /^group$/i })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /^fields$/i })).toBeNull()
  })

  it('shows an attention shortcut per exception and applies it', () => {
    const props = makeProps({ attentionCounts: { overdue: 2, blocked: 1, total: 3 } })
    renderToolbar(props)
    const group = screen.getByRole('group', { name: '3 tasks need attention' })
    fireEvent.click(within(group).getByRole('button', { name: '2 overdue' }))
    expect(props.onOverdueFilter).toHaveBeenCalledTimes(1)
    fireEvent.click(within(group).getByRole('button', { name: '1 blocked' }))
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ overdueOnly: false, status: 'Blocked' })
  })

  it('shows no attention shortcuts when nothing needs attention', () => {
    renderToolbar(makeProps({ overdueCount: 0, attentionCounts: { overdue: 0, blocked: 0, total: 0 } }))
    expect(screen.queryByRole('group', { name: /need attention/i })).toBeNull()
  })

  it('keeps group, status, business unit, person, sort and fields independently reachable', () => {
    const props = makeProps()
    renderToolbar(props)
    openFilters()

    fireEvent.click(screen.getByRole('combobox', { name: /^group$/i }))
    fireEvent.click(screen.getByRole('option', { name: 'PIC' }))
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ groupBy: 'pic' })
    expect(localStorage.getItem('mos.tasks.groupBy')).toBe('owner')

    fireEvent.click(screen.getByRole('combobox', { name: /^status$/i }))
    fireEvent.click(screen.getByRole('option', { name: 'Blocked' }))
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

    fireEvent.click(screen.getByRole('checkbox', { name: 'Business Unit' }))
    expect(props.onFieldToggle).toHaveBeenLastCalledWith('businessUnit', true)
    fireEvent.click(screen.getByRole('checkbox', { name: /include archived/i }))
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ includeArchived: true })
  })

  it('shows each active filter as a removable chip carrying its full value', () => {
    const businessUnit = 'Gordi HQ Retail Operations and Customer Experience'
    const person = 'Bulan Barista with a deliberately long display name'
    const props = makeProps({
      query: {
        ...TASK_COLLECTION_NEUTRAL_QUERY,
        businessUnitId: 'bu-1',
        personId: 'person-1',
        status: 'In Progress',
      },
      buOptions: [{ id: 'bu-1', name: businessUnit }],
      personOptions: [{ id: 'person-1', full_name: person }],
    })
    renderToolbar(props)
    expect(screen.getByText(`Business Unit: ${businessUnit}`)).toBeInTheDocument()
    expect(screen.getByText(`Person: ${person}`)).toBeInTheDocument()
    expect(screen.getByText('Status: In Progress')).toBeInTheDocument()
  })

  // #1030: an opened control that shows only its value ("Anyone", "All units", "Due soonest") is
  // unlabeled for a sighted reader; every dropdown in the door names what it filters or orders.
  it('names every control in the Filters & options door, in both locales', () => {
    const expected = {
      en: { businessUnit: 'Business Unit', person: 'Person', sort: 'Sort', status: 'Status', group: 'Group' },
      id: { businessUnit: 'Unit Bisnis', person: 'Orang', sort: 'Urutkan', status: 'Status', group: 'Kelompok' },
    }
    for (const locale of ['en', 'id'] as const) {
      const { unmount } = renderToolbar(makeProps(), locale)
      openFilters()
      const label = expected[locale]
      for (const name of [label.businessUnit, label.person, label.sort, label.status, label.group]) {
        expect(screen.getByRole('combobox', { name })).toBeInTheDocument()
      }
      unmount()
    }
  })

  it('offers Clear all once more than one filter is active', () => {
    const onClearFilters = vi.fn()
    renderToolbar(makeProps({
      query: { ...TASK_COLLECTION_NEUTRAL_QUERY, businessUnitId: 'bu-1', personId: 'person-1' },
      onClearFilters,
    }))
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('removes a single active filter from its chip', () => {
    const props = makeProps({ query: { ...TASK_COLLECTION_NEUTRAL_QUERY, personId: 'person-1' } })
    renderToolbar(props)
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(props.onQueryChange).toHaveBeenLastCalledWith({ personId: null })
  })
})

describe('TasksToolbar — saved view persistence states', () => {
  it('surfaces saved-view load failures and retries the load', async () => {
    const onLoad = vi.fn()
    renderToolbar(makeProps({
      savedViews: savedViewItems({ operation: 'error', error: 'Saved views unavailable.', items: [], onLoad }),
    }))

    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('alert')).toHaveTextContent('Saved views are unavailable. Try again.')
    // Named for the read it re-issues: the saved-view retry and the collection retry can be on
    // screen together, and both were called "Try again" with nothing telling them apart.
    fireEvent.click(screen.getByRole('button', { name: /retry saved views/i }))
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2))
  })

  it('retries a failed saved-view apply while keeping the error announced', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)
    const savedViews = savedViewItems({ onApply })
    const result = renderToolbar(makeProps({ savedViews }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Task views' }))
    fireEvent.click(screen.getByRole('option', { name: 'My queue' }))
    await waitFor(() => expect(onApply).toHaveBeenCalledWith('view-1'))

    result.rerender(
      <I18nProvider>
        <TasksToolbar {...makeProps({ savedViews: { ...savedViews, operation: 'error', error: 'Saved view could not be applied.' } })} />
      </I18nProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Saved views are unavailable. Try again.')
    fireEvent.click(screen.getByRole('button', { name: /retry saved views/i }))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2))
  })

  it('keeps a failed saved-view name open for retry, then closes after success', async () => {
    let succeed = false
    const onSave = vi.fn(async () => succeed ? undefined : null)
    const savedViews = savedViewItems({ error: 'Could not save view.', items: [], onSave })
    renderToolbar(makeProps({ savedViews }))
    openFilters()

    fireEvent.click(screen.getByRole('button', { name: /^save view$/i }))
    const input = screen.getByRole('textbox', { name: /view name/i })
    fireEvent.change(input, { target: { value: 'My queue' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(screen.getByDisplayValue('My queue')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /retry saved views/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    succeed = true
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3))
    expect(screen.queryByDisplayValue('My queue')).toBeNull()
  })

  it('retries the same failed saved-view name after the save form is closed', async () => {
    const onSave = vi.fn().mockResolvedValue(null)
    renderToolbar(makeProps({
      savedViews: savedViewItems({ operation: 'error', error: 'Could not save view.', items: [], onSave }),
    }))
    openFilters()

    fireEvent.click(screen.getByRole('button', { name: /^save view$/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /view name/i }), { target: { value: 'My queue' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('My queue'))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('textbox', { name: /view name/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /retry saved views/i }))
    await waitFor(() => expect(onSave).toHaveBeenNthCalledWith(2, 'My queue'))
  })
})
