import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))
vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { searchTasksByTitle } from '@/lib/db/tasks'
import { CommandMenu } from './command-menu'
import { readRecentTasks, pushRecentTask } from './recent-tasks'

const mockSearch = vi.mocked(searchTasksByTitle)
const mockUseAuth = vi.mocked(useAuth)

function setAuth(accessRoles: string[] = ['admin']) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: { id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'U', email: null, archived_at: null, created_at: '', updated_at: '' },
      roles: [], isManager: false, accessRoles,
    },
    signOut: vi.fn(),
  })
}

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
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
  setAuth(['admin'])
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
    const { unmount } = renderMenu()
    unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})

// ── AC-K02 / AC-K08 ───────────────────────────────────────────────────────────
describe('CommandMenu (AC-K02/AC-K08): combobox + listbox + keyboard', () => {
  it('AC-K02: opening focuses the search input', () => {
    renderMenu()
    expect(document.activeElement).toBe(screen.getByRole('combobox'))
  })

  it('AC-K08: input is a combobox controlling the listbox', () => {
    renderMenu()
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-controls', 'cm-list')
    expect(screen.getByRole('listbox')).toHaveAttribute('id', 'cm-list')
    expect(within(screen.getByRole('listbox')).getAllByRole('option').length).toBeGreaterThan(0)
  })

  it('AC-K08: ArrowDown moves aria-activedescendant; exactly one option aria-selected', () => {
    renderMenu()
    const input = screen.getByRole('combobox')
    const before = input.getAttribute('aria-activedescendant')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const after = input.getAttribute('aria-activedescendant')
    expect(after).toBeTruthy()
    expect(after).not.toBe(before)
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

// ── AC-015: universal actions (verb+object, stable order; no bare Create/Add/New) ──
describe('AC-015: universal actions — Ask Deputy · Share Signal · Create Task', () => {
  it('AC-015: lists the universal actions in stable order (verb+object)', () => {
    renderMenu()
    expect(screen.getByRole('option', { name: /Ask Deputy/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Share Signal/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Create Task/i })).toBeInTheDocument()
    // Stable order: Ask Deputy, Share Signal, Create Task
    const labels = screen.getAllByRole('option').map((o) => o.textContent)
    const ask = labels.findIndex((l) => /Ask Deputy/.test(l))
    const share = labels.findIndex((l) => /Share Signal/.test(l))
    const task = labels.findIndex((l) => /Create Task/.test(l))
    expect(ask).toBeLessThan(share)
    expect(share).toBeLessThan(task)
  })

  it('AC-015: no bare Create / Add / New action (forbidden — Rule 7)', () => {
    renderMenu()
    expect(screen.queryByRole('option', { name: /^Create$/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /^Add$/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /^New$/i })).toBeNull()
  })

  it('AC-015: Create Task activates → navigates to /work/tasks/new + closes', () => {
    const { onClose } = renderMenu()
    fireEvent.click(screen.getByRole('option', { name: /Create Task/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/work/tasks/new')
    expect(onClose).toHaveBeenCalled()
  })
})

// ── AC-016: Navigate group — new canonical routes; old entries absent ──────────
describe('AC-016: Navigate group points to the new canonical routes', () => {
  it('AC-016: Navigate items include Home, Work, Signals, Events, Inbox, Café, Money (admin)', () => {
    renderMenu()
    const nav = screen.getByRole('option', { name: /^Home$/i })
    expect(nav).toBeInTheDocument()
    // Navigate targets (href not exposed on option; assert labels present + activation navigates)
    expect(screen.getByRole('option', { name: /^Work$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Signals$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Events$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Inbox$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Café$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Money$/i })).toBeInTheDocument()
  })

  it('AC-016: old "My Week / Weekly updates / Daily Log" entries are absent', () => {
    renderMenu()
    expect(screen.queryByRole('option', { name: /My Week/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /Weekly updates/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /Daily Log/i })).toBeNull()
  })

  it('AC-016: Money is absent for a non-finance/admin viewer (gated)', () => {
    setAuth([])
    renderMenu()
    expect(screen.queryByRole('option', { name: /^Money$/i })).toBeNull()
    // Other navigate items still present
    expect(screen.getByRole('option', { name: /^Home$/i })).toBeInTheDocument()
  })

  it('AC-016: activating Work navigates to /work/tasks', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('option', { name: /^Work$/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/work/tasks')
  })
})

// ── default groups ──────────────────────────────────────────────────────────
describe('default groups (empty query): Recent + Actions + Navigate', () => {
  it('shows the Actions + Navigate groups when the query is empty', () => {
    renderMenu()
    expect(screen.getByText('Actions')).toBeInTheDocument()
    expect(screen.getByText('Navigate')).toBeInTheDocument()
  })

  it('shows the Recent group when the ring buffer has entries', () => {
    pushRecentTask({ id: 'r1', title: 'Recently opened task' })
    renderMenu()
    expect(screen.getByText('Recent')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Recently opened task/i })).toBeInTheDocument()
  })

  it('no Recent group when the buffer is empty', () => {
    renderMenu()
    expect(screen.queryByText('Recent')).toBeNull()
  })
})

// ── AC-K04: typing loads the Records group ──────────────────────────────────
describe('AC-K04: typing loads the Records group', () => {
  it('AC-K04: typing debounces, shows a skeleton, then renders Records options', async () => {
    let resolve!: (rows: { id: string; title: string; status: 'Open' }[]) => void
    mockSearch.mockReturnValue(new Promise((r) => { resolve = r }))
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'forecast' } })
    await waitFor(() => expect(screen.getByTestId('cm-records-skeleton')).toBeInTheDocument())
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('forecast'))
    resolve([{ id: 't1', title: 'Finalise Q3 forecast', status: 'Open' }])
    await waitFor(() => expect(screen.getByText('Records')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: /Finalise Q3 forecast/i })).toBeInTheDocument()
  })
})

// ── AC-K05: activating a record navigates to /work/tasks/:id ─────────────────
describe('AC-K05: activating a record navigates to /work/tasks/:id', () => {
  it('AC-K05: clicking a record navigates + closes + records it as Recent', async () => {
    mockSearch.mockResolvedValue([{ id: 't9', title: 'Finalise Q3 forecast', status: 'Open' }])
    const { onClose } = renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'forecast' } })
    const opt = await screen.findByRole('option', { name: /Finalise Q3 forecast/i })
    fireEvent.click(opt)
    expect(screen.getByTestId('location')).toHaveTextContent('/work/tasks/t9')
    expect(onClose).toHaveBeenCalled()
    expect(readRecentTasks()[0]).toEqual({ id: 't9', title: 'Finalise Q3 forecast' })
  })

  it('AC-K05: Enter activates the active record option', async () => {
    mockSearch.mockResolvedValue([{ id: 't9', title: 'Finalise Q3 forecast', status: 'Open' }])
    renderMenu()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'forecast' } })
    await screen.findByRole('option', { name: /Finalise Q3 forecast/i })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('location')).toHaveTextContent('/work/tasks/t9')
  })
})

// ── AC-K06: scoped search failure ───────────────────────────────────────────
describe('AC-K06: scoped search failure', () => {
  it("AC-K06: a search failure shows \"Couldn't search records.\" but Navigate still works", async () => {
    mockSearch.mockRejectedValue(new Error('boom'))
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'forecast' } })
    await waitFor(() => expect(screen.getByText("Couldn't search records.")).toBeInTheDocument())
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'home' } })
    const nav = await screen.findByRole('option', { name: /^Home$/i })
    fireEvent.click(nav)
    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })
})

// ── AC-K04 (race safety) ─────────────────────────────────────────────────────
describe('AC-K04: stale response cannot clobber newer query results', () => {
  it('a slow first response does not overwrite the results of a faster second query', async () => {
    let resolveOld!: (rows: { id: string; title: string; status: 'Open' }[]) => void
    const slowPromise = new Promise<{ id: string; title: string; status: 'Open' }[]>((r) => { resolveOld = r })
    const fastResult = [{ id: 'new-1', title: 'New task result', status: 'Open' as const }]
    mockSearch.mockReturnValueOnce(slowPromise).mockResolvedValue(fastResult)

    renderMenu()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'old' } })
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('old'))
    fireEvent.change(input, { target: { value: 'new' } })
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('new'))
    await waitFor(() => expect(screen.getByText('Records')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: /New task result/i })).toBeInTheDocument()
    resolveOld([{ id: 'old-1', title: 'Old stale result', status: 'Open' }])
    await waitFor(() => expect(screen.getByRole('option', { name: /New task result/i })).toBeInTheDocument())
    expect(screen.queryByRole('option', { name: /Old stale result/i })).toBeNull()
  })
})

// ── AC-K09: no-bleed + muted group labels ───────────────────────────────────
describe('AC-K09: no-bleed + muted group labels', () => {
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
    expect(screen.getByText('Actions').className).toMatch(/text-muted-foreground/)
  })
})
