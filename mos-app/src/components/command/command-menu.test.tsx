import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))
import { searchTasksByTitle } from '@/lib/db/tasks'
import { CommandMenu } from './command-menu'
import { readRecentTasks, pushRecentTask } from './recent-tasks'

const mockSearch = vi.mocked(searchTasksByTitle)

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

function renderMenu(onClose = vi.fn()) {
  const utils = render(
    <MemoryRouter initialEntries={['/']}>
      <LocationProbe />
      <Routes>
        <Route path="*" element={<CommandMenu open onClose={onClose} />} />
      </Routes>
    </MemoryRouter>,
  )
  return { ...utils, onClose }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockSearch.mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

// ── AC-K07 ──────────────────────────────────────────────────────────────────
describe('CommandMenu (AC-K07): dialog semantics + Esc + return focus', () => {
  it('AC-K07: renders role=dialog with aria-modal and an accessible name', () => {
    renderMenu()
    const dialog = screen.getByRole('dialog', { name: 'Command menu' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('AC-K07: Esc closes the menu', () => {
    const onClose = vi.fn()
    renderMenu(onClose)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('AC-K07: focus returns to the invoking trigger on unmount', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)
    const { unmount } = renderMenu()
    unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})

// ── AC-K02 / AC-K08 ───────────────────────────────────────────────────────────
describe('CommandMenu (AC-K02/AC-K08): combobox + listbox + keyboard activedescendant', () => {
  it('AC-K02: opening focuses the search input', () => {
    renderMenu()
    expect(document.activeElement).toBe(screen.getByRole('combobox'))
  })

  it('AC-K08: input is a combobox controlling the listbox; body is a listbox of options', () => {
    renderMenu()
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-controls', 'cm-list')
    const listbox = screen.getByRole('listbox')
    expect(listbox).toHaveAttribute('id', 'cm-list')
    expect(within(listbox).getAllByRole('option').length).toBeGreaterThan(0)
  })

  it('AC-K08: ArrowDown moves aria-activedescendant; focus stays in the input', () => {
    renderMenu()
    const input = screen.getByRole('combobox')
    const before = input.getAttribute('aria-activedescendant')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const after = input.getAttribute('aria-activedescendant')
    expect(after).toBeTruthy()
    expect(after).not.toBe(before)
    expect(document.activeElement).toBe(input)
    // The active option is reflected via aria-selected on exactly one option.
    const selected = screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe(after)
  })

  it('AC-K08: Home/End jump to first/last option', () => {
    renderMenu()
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'End' })
    const options = screen.getAllByRole('option')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[options.length - 1].id)
    fireEvent.keyDown(input, { key: 'Home' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id)
  })
})

// ── AC-K03 ──────────────────────────────────────────────────────────────────
describe('CommandMenu (AC-K03): default (empty query) groups', () => {
  it('AC-K03: shows Quick actions + Navigate when the query is empty', () => {
    renderMenu()
    expect(screen.getByText('Quick actions')).toBeInTheDocument()
    expect(screen.getByText('Navigate')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /New task/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Write weekly update/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Add Daily Log entry/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /My Week/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Tasks$/i })).toBeInTheDocument()
  })

  it('AC-K03: shows the Recent group when the ring buffer has entries', () => {
    pushRecentTask({ id: 'r1', title: 'Recently opened task' })
    renderMenu()
    expect(screen.getByText('Recent')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Recently opened task/i })).toBeInTheDocument()
  })

  it('AC-K03: no Recent group when the buffer is empty', () => {
    renderMenu()
    expect(screen.queryByText('Recent')).toBeNull()
  })
})

// ── AC-K04 ──────────────────────────────────────────────────────────────────
describe('CommandMenu (AC-K04): typing loads the Records group', () => {
  it('AC-K04: typing debounces, shows a skeleton, then renders Records options', async () => {
    let resolve!: (rows: { id: string; title: string; status: 'Open' }[]) => void
    mockSearch.mockReturnValue(new Promise((r) => { resolve = r }))
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'forecast' } })

    // Skeleton while pending (loading status, set immediately).
    await waitFor(() => expect(screen.getByTestId('cm-records-skeleton')).toBeInTheDocument())
    // The actual search fires after the ~150ms debounce.
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('forecast'))

    resolve([{ id: 't1', title: 'Finalise Q3 forecast', status: 'Open' }])
    await waitFor(() => expect(screen.getByText('Records')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: /Finalise Q3 forecast/i })).toBeInTheDocument()
  })

  it('AC-K04: Navigate options also filter to the typed query', async () => {
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'week' } })
    await waitFor(() => expect(screen.getByRole('option', { name: /My Week/i })).toBeInTheDocument())
    // "Tasks" does not match "week" → filtered out.
    expect(screen.queryByRole('option', { name: /^Tasks$/i })).toBeNull()
  })
})

// ── AC-K05 ──────────────────────────────────────────────────────────────────
describe('CommandMenu (AC-K05): activating a record navigates to /tasks/:id', () => {
  it('AC-K05: clicking a record option navigates + closes + records it as Recent', async () => {
    mockSearch.mockResolvedValue([{ id: 't9', title: 'Finalise Q3 forecast', status: 'Open' }])
    const { onClose } = renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'forecast' } })
    const opt = await screen.findByRole('option', { name: /Finalise Q3 forecast/i })
    fireEvent.click(opt)
    expect(screen.getByTestId('location')).toHaveTextContent('/tasks/t9')
    expect(onClose).toHaveBeenCalled()
    expect(readRecentTasks()[0]).toEqual({ id: 't9', title: 'Finalise Q3 forecast' })
  })

  it('AC-K05: Enter activates the active record option', async () => {
    mockSearch.mockResolvedValue([{ id: 't9', title: 'Finalise Q3 forecast', status: 'Open' }])
    renderMenu()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'forecast' } })
    await screen.findByRole('option', { name: /Finalise Q3 forecast/i })
    // First option is active by default; Enter activates it.
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('location')).toHaveTextContent('/tasks/t9')
  })
})

// ── AC-K06 ──────────────────────────────────────────────────────────────────
describe('CommandMenu (AC-K06): scoped search failure', () => {
  it('AC-K06: a search failure shows "Couldn\'t search records." but Navigate still works', async () => {
    mockSearch.mockRejectedValue(new Error('boom'))
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'forecast' } })
    await waitFor(() => expect(screen.getByText("Couldn't search records.")).toBeInTheDocument())
    // Navigate is unaffected — a navigate option is present and activatable.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'week' } })
    const nav = await screen.findByRole('option', { name: /My Week/i })
    fireEvent.click(nav)
    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })
})

// ── AC-K09 ──────────────────────────────────────────────────────────────────
describe('CommandMenu (AC-K09): no-bleed + muted group labels', () => {
  it('AC-K09: long record titles truncate and carry a title attribute', async () => {
    const long = 'A very very very long task title that should ellipsize rather than wrap or bleed out of the row'
    mockSearch.mockResolvedValue([{ id: 't1', title: long, status: 'Open' }])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'long' } })
    const opt = await screen.findByRole('option', { name: new RegExp(long.slice(0, 12)) })
    const label = opt.querySelector('.cm-item-label') as HTMLElement
    expect(label).not.toBeNull()
    expect(label.className).toMatch(/truncate/)
    expect(label).toHaveAttribute('title', long)
  })

  it('AC-K09: group labels use the muted-foreground token class', () => {
    renderMenu()
    const label = screen.getByText('Quick actions')
    expect(label.className).toMatch(/text-muted-foreground/)
  })
})
