import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { I18nProvider } from '@/i18n/I18nProvider'
import { messages } from '@/i18n/messages'
import { DESTINATIONS, isLive, modulesByBU, navUtility, type Destination } from '@/shell/destinations'
import { visibleSections } from '@/shell/sections'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))
vi.mock('@/lib/db/signals', () => ({ searchSignalsByBody: vi.fn() }))
vi.mock('@/lib/db/follow-ups', () => ({ searchFollowUpsByCounterparty: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ searchPeopleByName: vi.fn() }))
vi.mock('@/lib/db/objectives', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/objectives')>()),
  searchObjectivesByName: vi.fn(),
}))
vi.mock('@/lib/db/work-lines', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/work-lines')>()),
  searchWorkLinesByName: vi.fn(),
}))
// The route-admission seam (OD-WAY-51), REAL by default — the same partial mock the
// app-shell-cafe-log-launcher tests use. Overridable per test because no persona is refused by
// /cafe today (the route carries no access-role gate; OD-WAY-51's remedy is to narrow the ROUTE,
// never to hide the link). The override both simulates the day the route narrows and proves the
// palette consults THIS seam rather than a private job-role gate.
const seam = vi.hoisted(() => ({
  override: null as null | ((path: string, accessRoles: string[]) => boolean),
}))
vi.mock('@/shell/destinations', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/shell/destinations')>()
  return {
    ...mod,
    viewerAdmittedToRoute: (path: string, accessRoles: string[]) =>
      seam.override ? seam.override(path, accessRoles) : mod.viewerAdmittedToRoute(path, accessRoles),
  }
})
// DD-WAY-36: scoped flag flip so one test can light the follow-up palette search without
// disturbing the darkness test below (default stays false).
const features = vi.hoisted(() => ({ SHOW_FOLLOWUPS: false, SHOW_ASSISTANT: true }))
vi.mock('@/config/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/features')>()),
  get SHOW_FOLLOWUPS() { return features.SHOW_FOLLOWUPS },
  get SHOW_ASSISTANT() { return features.SHOW_ASSISTANT },
}))
vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { searchTasksByTitle, type TaskTitleRef } from '@/lib/db/tasks'
import { searchSignalsByBody } from '@/lib/db/signals'
import { searchFollowUpsByCounterparty } from '@/lib/db/follow-ups'
import { searchPeopleByName } from '@/lib/db/directory'
import { searchObjectivesByName } from '@/lib/db/objectives'
import { searchWorkLinesByName } from '@/lib/db/work-lines'
import { CommandMenu } from './command-menu'
import { readRecentTasks, pushRecentTask } from './recent-tasks'

const mockSearch = vi.mocked(searchTasksByTitle)
const mockSearchSignals = vi.mocked(searchSignalsByBody)
const mockSearchFollowUps = vi.mocked(searchFollowUpsByCounterparty)
const mockSearchPeople = vi.mocked(searchPeopleByName)
const mockSearchObjectives = vi.mocked(searchObjectivesByName)
const mockSearchWorkLines = vi.mocked(searchWorkLinesByName)
const mockUseAuth = vi.mocked(useAuth)

function setAuth(accessRoles: string[] = ['admin']) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: { id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'U', email: null, archived_at: null, created_at: '', updated_at: '', must_change_password: false },
      roles: [], isManager: false, accessRoles, affiliated: [],
    },
    signOut: vi.fn(),
  })
}

// What the rail shows `accessRoles`, read from the rail's own accessors (the rail and the phone
// drawer render these same registries) and the English catalog — never from the palette.
function railLabels(accessRoles: string[]): string[] {
  const en = messages.en
  const out: string[] = []
  const add = (d: Destination) => {
    out.push(en[d.labelKey])
    for (const c of visibleSections(d.children ?? [], accessRoles)) out.push(c.labelKey ? en[c.labelKey] : c.label)
  }
  DESTINATIONS.filter((d) => isLive(d, accessRoles)).forEach(add)
  modulesByBU(accessRoles).flatMap((g) => g.items).forEach(add)
  navUtility(accessRoles).forEach(add)
  // Personal Profile lives in the user-chip menu, and the palette keeps its door to it.
  out.push(en['dest.profile'])
  return out
}

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

function renderMenu(onClose = vi.fn(), locale: 'en' | 'id' = 'en', onShareSignal = vi.fn()) {
  const utils = render(
    <I18nProvider initialLocale={locale}>
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
  features.SHOW_ASSISTANT = true
  localStorage.clear()
  vi.clearAllMocks()
  seam.override = null
  mockSearch.mockResolvedValue([])
  mockSearchSignals.mockResolvedValue([])
  mockSearchFollowUps.mockResolvedValue([])
  mockSearchPeople.mockResolvedValue([])
  mockSearchObjectives.mockResolvedValue([])
  mockSearchWorkLines.mockResolvedValue([])
  setAuth(['admin'])
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── AC-K07 ──────────────────────────────────────────────────────────────────
describe('CommandMenu (AC-K07): dialog semantics + Esc + return focus', () => {
  it('phone floor: the rendered combobox input carries the 44px tap target', () => {
    const buttonCss = readFileSync(resolve(process.cwd(), 'src/components/ui/Button.css'), 'utf8')
    renderMenu()
    const input = screen.getByRole('combobox')
    expect(input).toHaveClass('tap-floor')
    expect(buttonCss).toMatch(/@media \(max-width: 767\.98px\)[\s\S]*?\.tap-floor\s*\{[^}]*min-height:\s*44px/)
  })

  it('AC-K07: renders role=dialog with aria-modal and an accessible name', () => {
    renderMenu()
    const dialog = screen.getByRole('dialog', { name: 'Command menu' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveClass('modal-shell__surface')
    expect(screen.getAllByTestId('modal-shell-scrim')).toHaveLength(1)
  })

  it('AC-K07: centers the palette surface at the 390px phone viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    renderMenu()
    const surface = screen.getByRole('dialog', { name: 'Command menu' })

    expect(surface).toHaveAttribute('data-phone-mode', 'centered')
    expect(surface).toHaveClass('cm-modal-surface')
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

// ── AC-030..032: e7 palette contents and phone search-only mode ─────────────
describe('AC-030..032: desktop GO TO roots → ACT; phone search-only palette', () => {
  it('AC-030: rests on every destination the viewer can open (the catalog), then the universal actions', () => {
    renderMenu()
    const groups = screen.getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['GO TO', 'ACT'])
    expect(within(groups[0]).getAllByRole('option').map((option) => option.textContent)).toEqual(
      railLabels(['admin']),
    )
    // The destinations #1193 found missing, by name — not only by the catalog derivation above.
    for (const label of ['Signals', 'Tasks', 'Projects & Processes', 'Objectives', 'Log production', 'Log transfer', 'Plan', 'Stock', 'Review', 'Pushes', 'Admin Settings']) {
      expect(within(groups[0]).getByRole('option', { name: label })).toBeInTheDocument()
    }
    expect(within(groups[1]).getAllByRole('option')).toHaveLength(3)
  })

  it('AC-030: Go to follows what the rail shows this role — Admin Settings and the gated Café screens stay absent for a member', () => {
    setAuth(['member'])
    renderMenu()
    const goTo = within(screen.getByRole('group', { name: 'GO TO' }))
    expect(goTo.getAllByRole('option').map((option) => option.textContent)).toEqual(railLabels(['member']))
    expect(goTo.queryByRole('option', { name: 'Admin Settings' })).toBeNull()
    expect(goTo.queryByRole('option', { name: 'Pushes' })).toBeNull()
  })

  it('AC-030: Go to labels come from the catalog in Indonesian too', () => {
    renderMenu(vi.fn(), 'id')
    const goTo = within(screen.getByRole('group', { name: 'BUKA' }))
    expect(goTo.getByRole('option', { name: 'Tujuan' })).toBeInTheDocument()
    expect(goTo.getByRole('option', { name: 'Pengaturan Admin' })).toBeInTheDocument()
  })

  it('AC-031: typing obj searches declared children while keeping the shared placeholder', async () => {
    renderMenu()
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('placeholder', 'Search records and people')
    fireEvent.change(input, { target: { value: 'obj' } })
    expect(await screen.findByRole('option', { name: 'Objectives' })).toBeInTheDocument()
  })

  it('AC-031: the placeholder is translated in Indonesian too', () => {
    renderMenu(vi.fn(), 'id')
    expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', 'Cari rekaman dan orang')
  })

  it('AC-031: a person search result appears alongside record search results', async () => {
    mockSearchPeople.mockResolvedValue([{ id: 'p2', full_name: 'Cahya' }])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cah' } })
    expect(await screen.findByRole('option', { name: /Cahya/ })).toBeInTheDocument()
  })

  it('issue 748: a person hit is INERT — pressing it neither navigates nor closes the palette', async () => {
    mockSearchPeople.mockResolvedValue([{ id: 'p2', full_name: 'Cahya' }])
    const { onClose } = renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cah' } })
    const opt = await screen.findByRole('option', { name: /Cahya/ })
    fireEvent.click(opt)
    // shared.people has no record route, and the palette's only /profile route is the VIEWER'S
    // OWN — so the withheld target is a disabled row, not a dead press: the click is refused
    // outright (no navigation, no close), exactly like the other kinds-with-nowhere-to-land are
    // withheld rather than pointed at a bounce.
    expect(screen.getByTestId('location').textContent).toBe('/')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('issue 748: a person hit reads as disabled — aria-disabled, and the roving index skips it', async () => {
    mockSearch.mockResolvedValue([{ id: 't1', title: 'Restock cups', status: 'Open' }])
    mockSearchPeople.mockResolvedValue([{ id: 'p2', full_name: 'Cahya' }])
    renderMenu()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'cah' } })
    const person = await screen.findByRole('option', { name: /Cahya/ })
    expect(person).toHaveAttribute('aria-disabled', 'true')

    // Record-kind order is Tasks → People, so the task sits above the person. The roving index walks
    // ACTIVATABLE rows only: ↓ twice must still rest on the task — resting on (or passing through)
    // the person row would make Enter a dead press on a withheld target.
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const task = screen.getByRole('option', { name: /Restock cups/ })
    expect(input.getAttribute('aria-activedescendant')).toBe(task.id)
    expect(input.getAttribute('aria-activedescendant')).not.toBe(person.id)
  })

  // AC-032 keeps narrow typed searches results-only because navigation lives on the tab bar.
  // Issue #1487 requires the otherwise empty, search-only palette to explain its next step.
  // Width, not pointer modality, selects the shell and palette composition; #41 separately owns
  // the keyboard-hint footer.
  function stubViewport({ narrow, coarse }: { narrow: boolean; coarse: boolean }) {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('919.98') ? narrow : query.includes('coarse') ? coarse : false,
      media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }))
  }

  it.each([390, 768])('issue 1487: at %ipx the empty narrow palette explains how to search', (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    stubViewport({ narrow: true, coarse: false })
    renderMenu()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Start typing to search tasks, signals, and people.')
    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('AC-032: narrowing still yields record results, and never a GO TO / ACT group', async () => {
    stubViewport({ narrow: true, coarse: false })
    mockSearch.mockResolvedValue([{ id: 't1', title: 'Restock cups', status: 'Open' }])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o' } })
    expect(await screen.findByRole('option', { name: /Restock cups/i })).toBeInTheDocument()
    // "o" matches roots and children on desktop; narrow, none of them may surface — only the
    // readable Task result group remains.
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Task'])
  })

  it('AC-032: at ≥920 even a COARSE pointer gets GO TO / ACT — the branch is the shell width seam, not the pointer', () => {
    // The inverse probe: a touch device at desktop width is where a pointer-keyed branch and a
    // width-keyed one disagree, and the width seam wins — the device sees the rail at ≥920, so
    // its palette rests on the same GO TO roots (#41 keeps hiding the keyboard hints there).
    stubViewport({ narrow: false, coarse: true })
    renderMenu()
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['GO TO', 'ACT'])
  })

  // Go to asks the rail's own question (`isLive` + `visibleSections`, derived in
  // `goToDestinations`), so a destination the rail hides for a role is absent here too.
  it('AC-031: a destination the rail hides for the role is absent from Go to (Money is not for a member)', () => {
    setAuth(['member'])
    renderMenu()
    expect(screen.queryByRole('option', { name: /^Money$/i })).toBeNull()
    expect(screen.getByRole('option', { name: /^Café$/i })).toBeInTheDocument()
  })

  // #407/#755: the typed ACT filter reads the SAME shared list the phone `+` launcher renders.
  // Café capture is a WRITE, so a viewer with the write gate gets the entry even when route
  // admission is denied; route visibility is distinct from the capture write gate.
  it('issue 407: typing Log offers Café capture when the write gate admits, not the route', async () => {
    seam.override = vi.fn(() => false)
    setAuth(['ops_lead'])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Log' } })
    expect(await screen.findByRole('option', { name: /Log Café production/i })).toBeInTheDocument()
  })
})

// ── AC-015: universal actions (verb+object, stable order; no bare Create/Add/New) ──
describe('AC-015: universal actions — Ask Deputy · Share Signal · Create Task', () => {
  it.each(['search', 'launcher'] as const)('keeps creation available without an unavailable Deputy in %s mode', (mode) => {
    features.SHOW_ASSISTANT = false
    render(<I18nProvider><MemoryRouter>
      <CommandMenu open mode={mode} onClose={vi.fn()} onShareSignal={vi.fn()} />
    </MemoryRouter></I18nProvider>)
    expect(screen.queryByRole('option', { name: /Ask Deputy/i })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Share.*Signal/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Create.*Task/i })).toBeInTheDocument()
  })
  it('AC-015: lists the universal actions in stable order (verb+object)', () => {
    renderMenu()
    expect(screen.getByRole('option', { name: /Ask Deputy/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Share Signal/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Create Task/i })).toBeInTheDocument()
    // Stable order: Ask Deputy, Share Signal, Create Task
    const labels = screen.getAllByRole('option').map((o) => o.textContent ?? '')
    // Case-INSENSITIVE, like the queries above: the en label is "Create task", so v4's
    // case-sensitive /Create Task/ returned -1 and its ordering assertion FAILED loudly —
    // `expected 1 to be less than -1`. (Verified against the ported component during review;
    // an earlier version of this comment claimed it passed vacuously, which is wrong.)
    // The two floor assertions below are the real guard: they stop this ever going vacuous.
    const ask = labels.findIndex((l) => /Ask Deputy/i.test(l))
    const share = labels.findIndex((l) => /Share Signal/i.test(l))
    const task = labels.findIndex((l) => /Create task/i.test(l))
    expect(ask).toBeGreaterThanOrEqual(0)
    expect(task).toBeGreaterThanOrEqual(0)
    expect(ask).toBeLessThan(share)
    expect(share).toBeLessThan(task)
  })

  it('AC-015: no bare Create / Add / New action (forbidden — Rule 7)', () => {
    renderMenu()
    expect(screen.queryByRole('option', { name: /^Create$/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /^Add$/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /^New$/i })).toBeNull()
  })

  it('AC-015: Create Task activates → opens inline creation on Tasks + closes', () => {
    const { onClose } = renderMenu()
    fireEvent.click(screen.getByRole('option', { name: /Create Task/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/work/tasks?create=1')
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
  it('AC-016: Navigate items include live destinations and omit retired Events', () => {
    renderMenu()
    const nav = screen.getByRole('option', { name: /^Home$/i })
    expect(nav).toBeInTheDocument()
    // Navigate targets (href not exposed on option; assert labels present + activation navigates)
    expect(screen.getByRole('option', { name: /^Work$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Signals$/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Events$/i })).toBeNull()
    expect(screen.getByRole('option', { name: /^Inbox$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Café$/i })).toBeInTheDocument()
    // Admin alone has no revenue-view role, so Money is absent just as it is from the rail.
    expect(screen.queryByRole('option', { name: /^Money$/i })).toBeNull()
  })

  it('AC-016: old "My Week / Weekly updates / Daily Log" entries are absent', () => {
    renderMenu()
    expect(screen.queryByRole('option', { name: /My Week/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /Weekly updates/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /Daily Log/i })).toBeNull()
  })

  it('AC-016: Money is absent for a viewer with no revenue-view role (gated)', () => {
    setAuth([])
    renderMenu()
    expect(screen.queryByRole('option', { name: /^Money$/i })).toBeNull()
    // Other navigate items still present
    expect(screen.getByRole('option', { name: /^Home$/i })).toBeInTheDocument()
  })

  // AC-127 (ADR-0050 D8) / AC-326 (ADR-0051): the palette follows the Money route's viewer roles.
  it.each(['manager', 'supervisor', 'finance'])(
    'AC-127/AC-326: %s is offered Money',
    (role) => {
      setAuth([role])
      renderMenu()
      expect(screen.getByRole('option', { name: /^Money$/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /^Home$/i })).toBeInTheDocument()
    },
  )

  it.each(['admin', 'member'])(
    '%s without a revenue-view role is not offered Money',
    (role) => {
      setAuth([role])
      renderMenu()
      expect(screen.queryByRole('option', { name: /^Money$/i })).toBeNull()
      expect(screen.getByRole('option', { name: /^Home$/i })).toBeInTheDocument()
    },
  )

  it('AC-016: activating Work navigates to /work/tasks', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('option', { name: /^Work$/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/work/tasks')
  })
})

// ── Step 8 (catalog re-home) — AC-804/805/806: Navigate group exposes org-readable catalogs ─
describe('Step 8/AC-804/805/806: Navigate group exposes org-readable catalogs', () => {
  it('AC-804: admin sees both Projects & Processes and Objectives; activating each navigates and closes', async () => {
    setAuth(['admin'])
    const { onClose } = renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'projects' } })
    expect(await screen.findByRole('option', { name: /^Projects & Processes$/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /^Projects & Processes$/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/work/projects')
    expect(onClose).toHaveBeenCalled()
  })

  it('AC-804: activating Objectives navigates to /work/objectives and closes', async () => {
    setAuth(['admin'])
    const { onClose } = renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'objectives' } })
    fireEvent.click(await screen.findByRole('option', { name: /^Objectives$/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/work/objectives')
    expect(onClose).toHaveBeenCalled()
  })

  it('AC-805: ops_lead sees Projects & Processes and Objectives', async () => {
    setAuth(['ops_lead'])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o' } })
    expect(await screen.findByRole('option', { name: /^Projects & Processes$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Objectives$/i })).toBeInTheDocument()
  })

  it('AC-806: a plain member sees Projects & Processes and Objectives', async () => {
    setAuth([])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o' } })
    expect(await screen.findByRole('option', { name: /^Projects & Processes$/i })).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: /^Objectives$/i })).toBeInTheDocument()
  })
})

// ── default groups ──────────────────────────────────────────────────────────
describe('default groups (empty query): Recent + Actions + Navigate', () => {
  it('shows Navigate before Actions when the query is empty', () => {
    renderMenu()
    const groups = within(screen.getByRole('listbox')).getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['GO TO', 'ACT'])
    expect(screen.getByRole('option', { name: 'Ask Deputy: what needs my attention?' })).toBeInTheDocument()
  })

  it('renders command chrome through i18n for Indonesian', () => {
    renderMenu(vi.fn(), 'id')
    expect(screen.getByRole('dialog', { name: 'Menu perintah' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Tanya Deputi/i })).toBeInTheDocument()
    expect(screen.getByText('BUKA')).toBeInTheDocument()
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

// ── OD-REDESIGN-91 #15 / GAP-10: the phone `+` launcher opens the reduced create-set ──
describe('#15/GAP-10: launcher mode opens the REDUCED create-set (per OD-46)', () => {
  function renderLauncher(onShareSignal = vi.fn()) {
    return render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <LocationProbe />
          <Routes>
            <Route path="*" element={<CommandMenu open mode="launcher" onClose={vi.fn()} onShareSignal={onShareSignal} />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
  }

  it('#15: the default view is the universal Actions ONLY — no Navigate, no full palette', () => {
    renderLauncher()
    // The reduced create-set: the three universal actions.
    expect(screen.getByRole('option', { name: /Ask Deputy/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Share Signal/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Create Task/i })).toBeInTheDocument()
    // NOT the full palette: no GO TO group and none of its destinations.
    expect(screen.queryByText('GO TO')).toBeNull()
    expect(screen.queryByRole('option', { name: /^Home$/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /^Money$/i })).toBeNull()
  })

  it('#15: launcher mode never shows Recent (the reduced set is create-only)', () => {
    pushRecentTask({ id: 'r1', title: 'Recently opened task' })
    renderLauncher()
    expect(screen.queryByText('Recent')).toBeNull()
    expect(screen.queryByRole('option', { name: /Recently opened task/i })).toBeNull()
  })

  it('#15: search mode (the desktop ⌘K default) is UNCHANGED — Navigate still present', () => {
    // Regression guard: the reduction is scoped to launcher mode only.
    renderMenu()
    expect(screen.getByText('GO TO')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Home$/i })).toBeInTheDocument()
  })

  it('#15: typing in launcher mode still escalates to the shared record search (OD-46 "More")', async () => {
    mockSearch.mockResolvedValue([{ id: 't9', title: 'Finalise Q3 forecast', status: 'Open' }])
    renderLauncher()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'forecast' } })
    expect(await screen.findByRole('option', { name: /Finalise Q3 forecast/i })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Task' })).toBeInTheDocument()
  })
})

// ── AC-K04: typing loads the Task group ─────────────────────────────────────
describe('AC-K04: typing loads the Task group', () => {
  it('AC-K04: typing debounces, shows a skeleton, then renders Task options', async () => {
    let resolve!: (rows: { id: string; title: string; status: 'Open' }[]) => void
    mockSearch.mockReturnValue(new Promise((r) => { resolve = r }))
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'forecast' } })
    await waitFor(() => expect(screen.getByTestId('cm-records-skeleton')).toBeInTheDocument())
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('forecast'))
    resolve([{ id: 't1', title: 'Finalise Q3 forecast', status: 'Open' }])
    await waitFor(() => expect(screen.getByRole('group', { name: 'Task' })).toBeInTheDocument())
    expect(screen.getByRole('option', { name: /Finalise Q3 forecast/i })).toBeInTheDocument()
  })
})

// ── OD-REDESIGN-91 #4/B2: search spans and groups ALL readable kinds ────────
describe('#4/B2: ⌘K search spans Tasks + Signals + AR Follow-ups', () => {
  afterEach(() => { features.SHOW_FOLLOWUPS = false })
  it('#B2: a Signal hit appears in its kind group and navigates to /work/signals/:id', async () => {
    mockSearch.mockResolvedValue([])
    mockSearchSignals.mockResolvedValue([{ id: 's1', body: 'Fridge temperature high\nchecked at 8am' }])
    const { onClose } = renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fridge' } })
    const opt = await screen.findByRole('option', { name: /Fridge temperature high/i })
    // The kind heading is localized; the body remains collapsed to the first line.
    expect(screen.getByRole('group', { name: 'Signal' })).toContainElement(opt)
    expect(opt).not.toHaveTextContent('checked at 8am')
    fireEvent.click(opt)
    expect(screen.getByTestId('location')).toHaveTextContent('/work/signals/s1')
    expect(onClose).toHaveBeenCalled()
    // A Signal must NOT pollute the task-scoped Recent ring buffer.
    expect(readRecentTasks()).toHaveLength(0)
  })

  it('#B2: Tasks and Signals appear in their own kind groups', async () => {
    mockSearch.mockResolvedValue([{ id: 't1', title: 'Roast beans', status: 'Open' }])
    mockSearchSignals.mockResolvedValue([{ id: 's1', body: 'Grinder jammed' }])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'r' } })
    const task = await screen.findByRole('option', { name: /Roast beans/i })
    const signal = await screen.findByRole('option', { name: /Grinder jammed/i })
    expect(screen.getByRole('group', { name: 'Task' })).toContainElement(task)
    expect(screen.getByRole('group', { name: 'Signal' })).toContainElement(signal)
  })

  // DD-WAY-36 held that a follow-up hit lands on the Money queue rather than the deleted Work
  // path. The queue is available to Finance when SHOW_FOLLOWUPS is enabled; its read remains RLS-
  // governed and the record routes through the same ship-gate seam as every palette target.
  it('a Finance viewer can open a follow-up hit in the Money queue when enabled', async () => {
    features.SHOW_FOLLOWUPS = true
    setAuth(['finance'])
    mockSearch.mockResolvedValue([])
    mockSearchSignals.mockResolvedValue([])
    mockSearchFollowUps.mockResolvedValue([{ id: 'fu-1', counterparty: 'PT Acme' }])
    const { onClose } = renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'acme' } })
    await waitFor(() => expect(mockSearchFollowUps).toHaveBeenCalledWith('acme'))
    const followUp = await screen.findByRole('option', { name: /PT Acme/i })
    fireEvent.click(followUp)
    expect(screen.getByTestId('location')).toHaveTextContent('/money/follow-ups')
    expect(onClose).toHaveBeenCalled()
  })

  it('#B2/GAP-3: AR Follow-ups stay dark while SHOW_FOLLOWUPS is off — the search is never fired', async () => {
    mockSearch.mockResolvedValue([])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'acme' } })
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('acme'))
    await waitFor(() => expect(mockSearchSignals).toHaveBeenCalledWith('acme'))
    expect(mockSearchFollowUps).not.toHaveBeenCalled()
  })
})

// ── #1193: the search reaches Objectives and Projects & Processes too ─────────
// The palette is one more RLS-governed reader: it shows what the two searches return, and both
// searches read through the viewer's session (see the db-layer and pgTAP contracts), so a record
// the viewer cannot read never reaches this component.
describe('issue 1193: ⌘K search finds Objectives and Projects & Processes', () => {
  it('an Objective hit carries the "Objective" kind and opens its record', async () => {
    mockSearchObjectives.mockResolvedValue([{ id: 'o1', name: 'Q3 Growth' }])
    const { onClose } = renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'growth' } })
    const opt = await screen.findByRole('option', { name: /Q3 Growth/ })
    expect(mockSearchObjectives).toHaveBeenCalledWith('growth')
    expect(screen.getByRole('group', { name: 'Objective' })).toContainElement(opt)
    fireEvent.click(opt)
    expect(screen.getByTestId('location')).toHaveTextContent('/work/objectives/o1')
    expect(onClose).toHaveBeenCalled()
    expect(readRecentTasks()).toHaveLength(0)
  })

  it('a Project and a Process each carry their own kind and open /work/projects/:id', async () => {
    mockSearchWorkLines.mockResolvedValue([
      { id: 'w1', name: 'New Menu Design', type: 'project' },
      { id: 'w2', name: 'Daily Menu Check', type: 'process' },
    ])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'menu' } })
    const project = await screen.findByRole('option', { name: /New Menu Design/ })
    const process = await screen.findByRole('option', { name: /Daily Menu Check/ })
    expect(screen.getByRole('group', { name: 'Project' })).toContainElement(project)
    expect(screen.getByRole('group', { name: 'Process' })).toContainElement(process)
    expect(mockSearchWorkLines).toHaveBeenCalledWith('menu')
    fireEvent.click(process)
    expect(screen.getByTestId('location')).toHaveTextContent('/work/projects/w2')
  })

  it('shows only what the reads return: a corpus the viewer cannot read adds no rows', async () => {
    // RLS answers an unreadable record with an empty result, never a placeholder row.
    mockSearchObjectives.mockResolvedValue([])
    mockSearchWorkLines.mockResolvedValue([{ id: 'w1', name: 'Barista development', type: 'project' }])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dev' } })
    await screen.findByRole('option', { name: /Barista development/ })
    const records = within(screen.getByRole('group', { name: 'Project' })).getAllByRole('option')
    expect(records.map((r) => r.textContent)).toEqual(['Barista development'])
  })

  it('kind labels follow the language: Tujuan, Proyek and Proses in Indonesian', async () => {
    mockSearchObjectives.mockResolvedValue([{ id: 'o1', name: 'Pertumbuhan' }])
    mockSearchWorkLines.mockResolvedValue([
      { id: 'w1', name: 'Pertumbuhan menu', type: 'project' },
      { id: 'w2', name: 'Pertumbuhan harian', type: 'process' },
    ])
    renderMenu(vi.fn(), 'id')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pertumbuhan' } })
    const objective = await screen.findByRole('option', { name: 'Pertumbuhan' })
    const project = screen.getByRole('option', { name: 'Pertumbuhan menu' })
    const process = screen.getByRole('option', { name: 'Pertumbuhan harian' })
    expect(screen.getByRole('group', { name: 'Tujuan' })).toContainElement(objective)
    expect(screen.getByRole('group', { name: 'Proyek' })).toContainElement(project)
    expect(screen.getByRole('group', { name: 'Proses' })).toContainElement(process)
  })

  it('a failing catalog search fails the group like any other corpus', async () => {
    mockSearchObjectives.mockRejectedValue(new Error('boom'))
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'growth' } })
    expect(await screen.findByText("Couldn't search records.")).toBeInTheDocument()
  })
})

describe('issue 1205: kind previews and keyboard-reachable disclosure', () => {
  it('shows a localized first hit per kind and expands in place with ArrowDown + Enter', async () => {
    mockSearch.mockResolvedValue([
      { id: 't1', title: 'Order new beans', status: 'Open' },
      { id: 't2', title: 'Organize the shelf', status: 'Open' },
    ])
    mockSearchSignals.mockResolvedValue([
      { id: 's1', body: 'Oven fan needs cleaning' },
      { id: 's2', body: 'Oil delivery is late' },
    ])
    mockSearchObjectives.mockResolvedValue([
      { id: 'o1', name: 'Outcome: safer shifts' },
      { id: 'o2', name: 'Onboarding checklist' },
    ])
    mockSearchWorkLines.mockResolvedValue([
      { id: 'p1', name: 'Open the new café', type: 'project' },
      { id: 'p2', name: 'Order seasonal menu', type: 'project' },
      { id: 'w1', name: 'Opening checklist', type: 'process' },
      { id: 'w2', name: 'Onboarding routine', type: 'process' },
    ])
    mockSearchPeople.mockResolvedValue([
      { id: 'person1', full_name: 'Olivia' },
      { id: 'person2', full_name: 'Omar' },
    ])
    const { onClose } = renderMenu(vi.fn(), 'id')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o' } })

    const input = screen.getByRole('combobox')
    const previewNames = [
      'Order new beans',
      'Outcome: safer shifts',
      'Open the new café',
      'Opening checklist',
      'Oven fan needs cleaning',
      'Olivia',
    ]
    for (const name of previewNames) {
      expect(await screen.findByRole('option', { name })).toBeInTheDocument()
    }
    const kinds = ['Tugas', 'Tujuan', 'Proyek', 'Proses', 'Sinyal', 'Orang']
    expect(screen.getAllByRole('group').map((group) => group.getAttribute('aria-label')).slice(0, kinds.length)).toEqual(kinds)
    for (const label of kinds) {
      expect(screen.getByRole('group', { name: label })).toBeInTheDocument()
      expect(within(screen.getByRole('group', { name: label })).getByRole('option', { name: 'Tampilkan semua (2)' })).toBeInTheDocument()
    }
    expect(screen.queryByRole('option', { name: /Organize the shelf/ })).toBeNull()
    expect(screen.queryByRole('option', { name: /Oil delivery/ })).toBeNull()
    expect(screen.queryByRole('option', { name: /Onboarding checklist/ })).toBeNull()

    const showAllTasks = within(screen.getByRole('group', { name: 'Tugas' })).getByRole('option', { name: 'Tampilkan semua (2)' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', showAllTasks.id)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByRole('option', { name: 'Organize the shelf' })).toBeInTheDocument()
    const showFewer = screen.getByRole('option', { name: 'Tampilkan lebih sedikit' })
    expect(input).toHaveAttribute('aria-activedescendant', showFewer.id)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent('/')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.queryByRole('option', { name: 'Organize the shelf' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('location')).toHaveTextContent('/work/tasks/t1')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not add a disclosure when a kind has only one match', async () => {
    mockSearch.mockResolvedValue([{ id: 't1', title: 'One task', status: 'Open' }])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'one' } })

    const task = await screen.findByRole('group', { name: 'Task' })
    expect(within(task).getByRole('option', { name: 'One task' })).toBeInTheDocument()
    expect(within(task).queryByRole('option', { name: /Show all/ })).toBeNull()
  })
})

// ── OD-REDESIGN-91 #41 (G5): ⌘K keyboard hints hide on a coarse pointer ───────
describe('#41: keyboard hints hide on touch (coarse pointer)', () => {
  function stubCoarsePointer(coarse: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('coarse') ? coarse : false,
        media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }),
    })
  }

  // Restore the fine-pointer default so later suites aren't left on a coarse stub.
  afterEach(() => stubCoarsePointer(false))

  it('#41: a fine pointer keeps the footer hints and the esc chip', () => {
    stubCoarsePointer(false)
    const { container } = renderMenu()
    expect(container.querySelector('.cm-foot')).not.toBeNull()
    // Two esc chips on a fine pointer: the input chip + the footer hint.
    expect(container.querySelectorAll('.cm-foot-key')).not.toHaveLength(0)
    expect(Array.from(container.querySelectorAll('.cm-foot-key')).some((k) => k.textContent === 'esc')).toBe(true)
  })

  it('#41: a coarse pointer hides the footer hints and the esc chip', () => {
    stubCoarsePointer(true)
    const { container } = renderMenu()
    // No footer and no key chips at all when there is no keyboard to press.
    expect(container.querySelector('.cm-foot')).toBeNull()
    expect(container.querySelectorAll('.cm-foot-key')).toHaveLength(0)
  })

  // `useIsCoarsePointer` only tests `(pointer: coarse)` — a device that reports a fine
  // pointer but no hover (`(hover: none)`) sails past that JS check, so the CSS rule is the
  // independent second guard the JS branch above cannot cover.
  it('the stylesheet hides the footer hints under (hover: none), (pointer: coarse) independently of the JS check', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/command/command-menu.css'), 'utf8')
    const block = css.split('@media (hover: none), (pointer: coarse) {')[1]?.split('}\n}')[0] ?? ''
    expect(block).toMatch(/\.cm-foot,/)
    expect(block).toMatch(/display:\s*none;/)
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
    await waitFor(() => expect(screen.getByRole('group', { name: 'Task' })).toBeInTheDocument())
    expect(screen.getByRole('option', { name: /New task result/i })).toBeInTheDocument()
    resolveOld([{ id: 'old-1', title: 'Old stale result', status: 'Open' }])
    await waitFor(() => expect(screen.getByRole('option', { name: /New task result/i })).toBeInTheDocument())
    expect(screen.queryByRole('option', { name: /Old stale result/i })).toBeNull()
  })
})

// ── CMDK-1: session state resets on close → reopen ───────────────────────────
describe('CMDK-1: palette resets to the default view on close→reopen', () => {
  it('CMDK-1: a typed query + record results are cleared after close, so reopen shows the default view', async () => {
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
    expect(screen.getByText('ACT')).toBeInTheDocument()
    expect(screen.getByText('GO TO')).toBeInTheDocument()
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
    expect(screen.getByText('ACT').className).toMatch(/text-muted-foreground/)
  })
})

// ── #479: the child rung is a RELATIONSHIP, so it is drawn only while both ends are rendered ──
// The rung (indent + muted step) says "this row hangs under the one above it".
// `child: true` is a registry fact — "Work declares this" — and survives filtering; the LICENCE to
// show the rung does not, because the query and the ship gate can each remove the parent. A child
// cue with nothing above it points at a row that is not there, which is worse than saying nothing.
describe('Issue 479 — the child rung only claims a parent that is on screen', () => {
  const childRows = () =>
    Array.from(document.querySelectorAll('[role="option"][data-child="true"]'))

  it('a filtered result that lost its parent row wears no rung', async () => {
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'objectives' } })
    // Precondition, or this asserts nothing: the row IS there and the Work parent is NOT.
    expect(await screen.findByRole('option', { name: /^Objectives$/i })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /^Work$/i })).toBeNull()

    expect(childRows()).toHaveLength(0)
  })

  it('issue 748 delta: the typed view keeps Work’s children adjacent to the Work row — no unrelated row between', async () => {
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o' } })
    expect(await screen.findByRole('option', { name: /^Work$/i })).toBeTruthy()
    // "o" keeps Work, its children Projects & Processes and Objectives, and the other roots whose
    // names hold an "o". The children are emitted DIRECTLY beneath the Work row — the run of
    // rows the Child rung describes is unbroken by construction, so an unrelated root parked
    // between the parent and its children cannot render.
    const navigate = screen.getByRole('group', { name: 'GO TO' })
    const labels = within(navigate).getAllByRole('option').map((option) => option.textContent)
    const work = labels.indexOf('Work')
    expect(labels.slice(work, work + 3)).toEqual(['Work', 'Projects & Processes', 'Objectives'])
  })

  it('a FILTERED result that kept its parent keeps the rung', async () => {
    // The two tests above assert the rung disappears when the parent goes. Nothing asserted it
    // SURVIVES — so "clear every rung whenever the query is non-empty", the fix a developer
    // reaches for after an orphaned-rung report, passed the whole suite while every child lost
    // its indent and aria-describedby on the first keystroke.
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o' } })
    // Precondition: "o" keeps BOTH ends on screen — Work and its children.
    expect(await screen.findByRole('option', { name: /^Work$/i })).toBeTruthy()
    // EVERY surviving child: clearing the rung for all children would hide the broken relationship.

    // EVERY surviving child, not just the first: clearing the rung for all children except
    // /work/tasks passed 90/90 while query "o" rendered Work · Projects & Processes · Objectives
    // with both children stripped of their indent and aria-describedby.
    // Selected by TARGET, not by the rung marker: childRows() matches [data-child="true"], so
    // asserting data-child on its results cannot come out red — a cleared rung leaves the
    // selector rather than failing the check. Rows are found by where they point instead.
    const workRows = Array.from(
      document.querySelectorAll<HTMLElement>('[role="option"][data-to^="/work/"]'),
    ).filter((el) => el.getAttribute('data-to') !== '/work/tasks?create=1')
    expect(workRows.length).toBeGreaterThan(1)
    for (const row of workRows.slice(1)) {
      expect(row.getAttribute('data-child')).toBe('true')
      expect(row.getAttribute('aria-describedby')).toBe('n-work')
    }
  })

  it('a filter keeping the parent and TWO children keeps both rungs', async () => {
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o' } })
    expect(await screen.findByRole('option', { name: /^Work$/i })).toBeTruthy()
    // By target, like its neighbour: childRows() selects [data-child="true"], so asserting
    // data-child on its results cannot come out red — a cleared rung leaves the selector.
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>('[role="option"][data-to^="/work/"]'),
    ).filter((el) => el.getAttribute('data-to') !== '/work/tasks?create=1')
    expect(rows.length).toBeGreaterThan(2)
    for (const row of rows.slice(1)) expect(row.getAttribute('data-child')).toBe('true')
  })

  it('in a matching view every child wears the rung AND points at the rendered Work row', async () => {
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o' } })
    const work = await screen.findByRole('option', { name: /^Work$/i })
    const children = childRows()
    expect(children.length).toBeGreaterThan(0)

    for (const row of children) {
      // `option` does not take aria-level (ARIA 1.2 puts it on treeitem/listitem/row), and there
      // is no tree here — so the rung reaches assistive tech as a description pointing at the
      // parent row itself, which is the same relationship the indent draws.
      const describedBy = row.getAttribute('aria-describedby')
      expect(describedBy).toBe(work.id)
      expect(document.getElementById(describedBy!)).toBe(work)
    }
  })
})
