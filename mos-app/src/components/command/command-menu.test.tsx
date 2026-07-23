import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))
vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { searchTasksByTitle, type TaskTitleRef } from '@/lib/db/tasks'
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

function renderMenu(onClose = vi.fn(), locale: 'en' | 'id' = 'en', onShareSignal = vi.fn()) {
  localStorage.setItem('mos.locale', locale)
  const utils = render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <LocationProbe />
        <Routes>
          <Route path="*" element={<CommandMenu open onClose={onClose} onShareSignal={onShareSignal} />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
  return { ...utils, onClose, onShareSignal }
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
    expect(dialog).toHaveClass('modal-shell__surface')
    expect(screen.getAllByTestId('modal-shell-scrim')).toHaveLength(1)
  })

  it('AC-K07: Esc closes the menu', () => {
    const onClose = vi.fn()
    renderMenu(onClose)
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
  })

  it('AC-K07: Tab stays in the combobox and Arrow navigation scrolls the active option without moving focus', () => {
    renderMenu()
    const input = screen.getByRole('combobox')
    const options = screen.getAllByRole('option')
    const nextOption = options[1]
    const scrollIntoView = vi.fn()
    Object.defineProperty(nextOption, 'scrollIntoView', { configurable: true, value: scrollIntoView })

    fireEvent.keyDown(input, { key: 'Tab' })
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    expect(document.activeElement).toBe(input)
    expect(input).toHaveAttribute('aria-activedescendant', nextOption.id)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(screen.getByRole('listbox')).toHaveAttribute('tabindex', '-1')
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
    const listbox = screen.getByRole('listbox')
    expect(listbox).toHaveAttribute('id', 'cm-list')
    const groups = within(listbox).getAllByRole('group')
    expect(groups.length).toBeGreaterThan(0)
    expect(groups.every((group) => within(group).getAllByRole('option').length > 0)).toBe(true)
    expect(within(listbox).getAllByRole('option').every((option) => {
      return option.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])').length === 0
    })).toBe(true)
    expect(document.activeElement).toBe(input)
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
    expect(document.activeElement).toBe(input)
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
    const labels = screen.getAllByRole('option').map((o) => o.textContent ?? '')
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

  // AC-428 (C2 — FR-417): Share Signal opens the composer, never navigates to a route. Every
  // entry point (⌘K, the mobile Action Launcher which itself opens ⌘K, the Home feed row)
  // dispatches the SAME command — command-menu's job here is just: call it, don't navigate.
  it('AC-428: Share Signal calls onShareSignal, does NOT navigate, and closes the palette', () => {
    const before = '/'
    const { onClose, onShareSignal } = renderMenu()
    expect(screen.getByTestId('location')).toHaveTextContent(before)

    fireEvent.click(screen.getByRole('option', { name: /Share Signal/i }))

    expect(onShareSignal).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('location')).toHaveTextContent(before) // no route change
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

// ── Step 8 (catalog re-home) — AC-804/805/806: Navigate group is capability-gated ─────────────
describe('Step 8/AC-804/805/806: Navigate group surfaces catalog manage-mode per capability', () => {
  it('AC-804: admin sees both Projects & Processes and Objectives; activating each navigates and closes', () => {
    setAuth(['admin'])
    const { onClose } = renderMenu()
    expect(screen.getByRole('option', { name: /^Projects & Processes$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Objectives$/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /^Projects & Processes$/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/work/projects')
    expect(onClose).toHaveBeenCalled()
  })

  it('AC-804: activating Objectives navigates to /work/objectives and closes', () => {
    setAuth(['admin'])
    const { onClose } = renderMenu()
    fireEvent.click(screen.getByRole('option', { name: /^Objectives$/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/work/objectives')
    expect(onClose).toHaveBeenCalled()
  })

  it('AC-805: ops_lead (workline.manage only) sees Projects & Processes but not Objectives', () => {
    setAuth(['ops_lead'])
    renderMenu()
    expect(screen.getByRole('option', { name: /^Projects & Processes$/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Objectives$/i })).toBeNull()
  })

  it('AC-806: a plain member sees neither, and the pre-existing Navigate items are unaffected', () => {
    setAuth([])
    renderMenu()
    expect(screen.queryByRole('option', { name: /^Projects & Processes$/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /^Objectives$/i })).toBeNull()
    expect(screen.getByRole('option', { name: /^Home$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Work$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Signals$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Events$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Inbox$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Café$/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Money$/i })).toBeNull()
  })
})

// ── default groups ──────────────────────────────────────────────────────────
describe('default groups (empty query): Recent + Actions + Navigate', () => {
  it('shows the Actions + Navigate groups when the query is empty', () => {
    renderMenu()
    expect(screen.getByText('Actions')).toBeInTheDocument()
    expect(screen.getByText('Navigate')).toBeInTheDocument()
  })

  it('renders command chrome through i18n for Indonesian', () => {
    renderMenu(vi.fn(), 'id')
    expect(screen.getByRole('dialog', { name: 'Menu perintah' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Tanya Deputi/i })).toBeInTheDocument()
    expect(screen.getByText('Navigasi')).toBeInTheDocument()
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
    expect(document.activeElement).toBe(input)
  })
})

describe('AC-K08: listbox ownership remains valid through search states', () => {
  it.each([
    ['en', 'Searching records'],
    ['id', 'Mencari rekaman'],
  ] as const)('localizes the loading option for %s without changing combobox ownership', async (locale, loadingLabel) => {
    let resolveSearch!: (rows: TaskTitleRef[]) => void
    mockSearch.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve }))
    renderMenu(vi.fn(), locale)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'forecast' } })

    const loading = await screen.findByRole('option', { name: loadingLabel })
    const listbox = screen.getByRole('listbox')
    expect(input).toHaveAttribute('aria-controls', 'cm-list')
    expect(listbox).toHaveAttribute('id', 'cm-list')
    expect(loading).toHaveAttribute('aria-disabled', 'true')
    expect(document.activeElement).toBe(input)
    resolveSearch([])
  })

  it('keeps the first ready option active when ArrowDown is pressed during loading', async () => {
    let resolveSearch!: (rows: TaskTitleRef[]) => void
    mockSearch.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve }))
    renderMenu()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'forecast' } })
    await screen.findByRole('option', { name: 'Searching records' })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).not.toHaveAttribute('aria-activedescendant')

    resolveSearch([{ id: 't9', title: 'Finalise Q3 forecast', status: 'Open' }])
    const option = await screen.findByRole('option', { name: /Finalise Q3 forecast/i })
    expect(input).toHaveAttribute('aria-activedescendant', option.id)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('location')).toHaveTextContent('/work/tasks/t9')
  })

  it('keeps zero results inside the controlled listbox as a non-activatable option', async () => {
    mockSearch.mockResolvedValue([])
    renderMenu()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'forecast' } })

    const empty = await screen.findByRole('option', { name: 'No matches for “forecast”.' })
    const listbox = screen.getByRole('listbox')
    expect(input).toHaveAttribute('aria-controls', 'cm-list')
    expect(listbox).toHaveAttribute('id', 'cm-list')
    expect(empty).toHaveAttribute('aria-disabled', 'true')
    expect(input).not.toHaveAttribute('aria-activedescendant')
    expect(document.activeElement).toBe(input)
  })
})

// ── AC-K06: scoped search failure ───────────────────────────────────────────
describe('AC-K06: scoped search failure', () => {
  it("AC-K06: a search failure shows \"Couldn't search records.\" but Navigate still works", async () => {
    mockSearch.mockRejectedValue(new Error('boom'))
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'forecast' } })
    await waitFor(() => expect(screen.getByText("Couldn't search records.")).toBeInTheDocument())
    expect(screen.getByRole('listbox')).toHaveAttribute('id', 'cm-list')
    expect(screen.getByRole('option', { name: "Couldn't search records." })).toHaveAttribute('aria-disabled', 'true')
    expect(document.activeElement).toBe(screen.getByRole('combobox'))
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

// ── CMDK-1: session state resets on close → reopen ───────────────────────────
describe('CMDK-1: palette resets to the default view on close→reopen', () => {
  it('CMDK-1: a typed query + record results are cleared after close, so reopen shows the default view', async () => {
    localStorage.setItem('mos.locale', 'en')
    mockSearch.mockResolvedValue([{ id: 't1', title: 'Some searched task', status: 'Open' }])
    const onClose = vi.fn()
    const { rerender } = render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="*" element={<CommandMenu open onClose={onClose} onShareSignal={vi.fn()} />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
    // Type a query → the record-search group appears and the default groups are filtered out.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'searched' } })
    await screen.findByRole('option', { name: /Some searched task/i })

    // Close (open=false) then reopen (open=true) — the host keeps the component mounted.
    rerender(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="*" element={<CommandMenu open={false} onClose={onClose} onShareSignal={vi.fn()} />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
    rerender(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="*" element={<CommandMenu open onClose={onClose} onShareSignal={vi.fn()} />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )

    // The query is empty again and the default view (Actions/Navigate groups) is back, with the
    // stale record result gone.
    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(screen.getByText('Actions')).toBeInTheDocument()
    expect(screen.getByText('Navigate')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Some searched task/i })).toBeNull()
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
