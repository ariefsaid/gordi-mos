import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))
vi.mock('@/lib/db/signals', () => ({ searchSignalsByBody: vi.fn() }))
vi.mock('@/lib/db/follow-ups', () => ({ searchFollowUpsByCounterparty: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ searchPeopleByName: vi.fn() }))
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
const features = vi.hoisted(() => ({ SHOW_FOLLOWUPS: false }))
vi.mock('@/config/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/features')>()),
  get SHOW_FOLLOWUPS() { return features.SHOW_FOLLOWUPS },
}))
vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { searchTasksByTitle, type TaskTitleRef } from '@/lib/db/tasks'
import { searchSignalsByBody } from '@/lib/db/signals'
import { searchFollowUpsByCounterparty } from '@/lib/db/follow-ups'
import { searchPeopleByName } from '@/lib/db/directory'
import { CommandMenu } from './command-menu'
import { readRecentTasks, pushRecentTask } from './recent-tasks'

const mockSearch = vi.mocked(searchTasksByTitle)
const mockSearchSignals = vi.mocked(searchSignalsByBody)
const mockSearchFollowUps = vi.mocked(searchFollowUpsByCounterparty)
const mockSearchPeople = vi.mocked(searchPeopleByName)
const mockUseAuth = vi.mocked(useAuth)

function setAuth(accessRoles: string[] = ['admin']) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: { id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'U', email: null, archived_at: null, created_at: '', updated_at: '', must_change_password: false },
      roles: [], isManager: false, accessRoles, affiliated: [], canReadCafePushes: false
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
  seam.override = null
  mockSearch.mockResolvedValue([])
  mockSearchSignals.mockResolvedValue([])
  mockSearchFollowUps.mockResolvedValue([])
  mockSearchPeople.mockResolvedValue([])
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
describe('AC-030..032: desktop GO TO roots → ACT; phone search only', () => {
  it('AC-030: rests on destination roots only, then exactly three universal actions', () => {
    renderMenu()
    const groups = screen.getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['GO TO', 'ACT'])
    expect(within(groups[0]).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Home', 'Work', 'Inbox', 'Café', 'Personal Profile',
    ])
    expect(within(groups[0]).queryByText('Signals')).toBeNull()
    expect(within(groups[1]).getAllByRole('option')).toHaveLength(3)
  })

  it('AC-031: typing obj searches declared children while keeping the shared placeholder', async () => {
    renderMenu()
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('placeholder', 'Search tasks, signals, people')
    fireEvent.change(input, { target: { value: 'obj' } })
    expect(await screen.findByRole('option', { name: 'Objectives' })).toBeInTheDocument()
  })

  it('AC-031: the placeholder names all three searched corpora in Indonesian too', () => {
    renderMenu(vi.fn(), 'id')
    expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', 'Cari tugas, sinyal, orang')
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

    // Records order is Tasks → People, so the task sits above the person. The roving index walks
    // ACTIVATABLE rows only: ↓ twice must still rest on the task — resting on (or passing through)
    // the person row would make Enter a dead press on a withheld target.
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const task = screen.getByRole('option', { name: /Restock cups/ })
    expect(input.getAttribute('aria-activedescendant')).toBe(task.id)
    expect(input.getAttribute('aria-activedescendant')).not.toBe(person.id)
  })

  // Asserting ANY group, not the two current labels: a name-based query passed vacuously against
  // the pre-#748 palette (whose groups were labelled Navigate/Actions, so "no GO TO group" was
  // trivially true while the phone palette still listed the whole rail). The audit's phone ruling
  // is results-only — navigation lives on the tab bar, actions on the `+` launcher — so NO group
  // belongs in the phone DOM, whatever the labels are called this week.
  //
  // AC-032 keys on the shell's WIDTH seam, not the pointer (#748 delta): the bottom tab bar and
  // the `+` launcher render below 920px because `useIsNarrow()` says so, and the palette branches
  // on the SAME helper — search-only when narrow, GO TO/ACT otherwise. Pointer modality keeps its
  // own, separate job (#41): hiding the keyboard-hint footer.
  function stubViewport({ narrow, coarse }: { narrow: boolean; coarse: boolean }) {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('919.98') ? narrow : query.includes('coarse') ? coarse : false,
      media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }))
  }

  it('AC-032: at 390 with a FINE pointer the palette is search-only — no group of any name in the DOM', () => {
    stubViewport({ narrow: true, coarse: false })
    renderMenu()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('AC-032: narrowing still yields record results, and never a GO TO / ACT group', async () => {
    stubViewport({ narrow: true, coarse: false })
    mockSearch.mockResolvedValue([{ id: 't1', title: 'Restock cups', status: 'Open' }])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o' } })
    expect(await screen.findByRole('option', { name: /Restock cups/i })).toBeInTheDocument()
    // "o" matches roots and children on desktop; narrow, none of them may surface — the one
    // group the typed view may carry is Records, the results themselves.
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Records'])
  })

  it('AC-032: at ≥920 even a COARSE pointer gets GO TO / ACT — the branch is the shell width seam, not the pointer', () => {
    // The inverse probe: a touch device at desktop width is where a pointer-keyed branch and a
    // width-keyed one disagree, and the width seam wins — the device sees the rail at ≥920, so
    // its palette rests on the same GO TO roots (#41 keeps hiding the keyboard hints there).
    stubViewport({ narrow: false, coarse: true })
    renderMenu()
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['GO TO', 'ACT'])
  })

  // #748 delta: the Café root asks the ONE route-admission question (OD-WAY-51), like the
  // launcher's Café action — a viewer the /cafe ROUTE refuses gets no row, absent rather than
  // present-and-bouncing. No persona is refused today (the route carries no access-role gate),
  // so the seam is overridden — which also proves the palette consults the seam itself and not
  // some private gate.
  it('AC-031: the Café root follows route admission — a viewer the /cafe route refuses gets no row', () => {
    const denied = vi.fn(() => false)
    seam.override = denied
    renderMenu()
    expect(screen.queryByRole('option', { name: /^Café$/i })).toBeNull()
    // The gate takes only the Café root; the other GO TO roots are untouched.
    expect(screen.getByRole('option', { name: /^Home$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Work$/i })).toBeInTheDocument()
    // …and the absence came from the admission seam, asked about the Café root's own route.
    expect(denied).toHaveBeenCalledWith('/cafe', ['admin'])
  })

  // #407/#755: the typed ACT filter reads the SAME shared list the phone `+` launcher renders.
  // Café capture is a WRITE, so a viewer with the write gate gets the entry even when route
  // admission is denied; OD-WAY-51 admits /cafe/log to READ, not to authorize capture.
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
    expect(screen.queryByRole('option', { name: /^Signals$/i })).toBeNull()
    expect(screen.queryByRole('option', { name: /^Events$/i })).toBeNull()
    expect(screen.getByRole('option', { name: /^Inbox$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Café$/i })).toBeInTheDocument()
    // #444: Money was asserted PRESENT here for this (admin) viewer. The palette is a navigation
    // surface like the rail, so it must not offer a door the router has closed.
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

  // AC-127 (ADR-0050 D8) / AC-326 (ADR-0051) — the financial and revenue-only VIEW tiers. The
  // palette used to offer Money to each of these four, matching the /money route and rail gate.
  // #444 ship-gates /money above every role, and the rule the palette follows is unchanged: it
  // offers exactly what the router admits, so the entry is gone for all four. The VIEW-tier
  // policy itself stays asserted on the destination registry (`destinations.test.ts`), and
  // deleting /money from SHIP_GATED_PATHS restores this entry with no edit to the palette.
  it.each(['manager', 'supervisor', 'finance', 'admin'])(
    'AC-127/AC-326 (issue 444): %s is offered no Money entry while /money is ship-gated',
    (role) => {
      setAuth([role])
      renderMenu()
      expect(screen.queryByRole('option', { name: /^Money$/i })).toBeNull()
      // …and they still get a palette, so this is not passing on an empty render.
      expect(screen.getByRole('option', { name: /^Home$/i })).toBeInTheDocument()
    },
  )

  it('AC-016: activating Work navigates to /work/tasks', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('option', { name: /^Work$/i }))
    expect(screen.getByTestId('location')).toHaveTextContent('/work/tasks')
  })
})

// ── Step 8 (catalog re-home) — AC-804/805/806: Navigate group is capability-gated ─────────────
describe('Step 8/AC-804/805/806: Navigate group surfaces catalog manage-mode per capability', () => {
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

  it('AC-805: ops_lead (workline.manage) sees Projects & Processes; Objectives is ungated (OD-V4-1)', async () => {
    setAuth(['ops_lead'])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o' } })
    expect(await screen.findByRole('option', { name: /^Projects & Processes$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Objectives$/i })).toBeInTheDocument()
  })

  // OD-V4-1 (owner-ratified 2026-07-27): Objectives carry NO read gate — the SELECT policy on
  // mos.objectives has no role check, the rail dropped the gate in #188 and the router followed.
  // v4's own test file still asserted the retired gate here (its component already pushed the
  // entry ungated), so it was contradicting the component it tested. The ruling wins.
  it('AC-806: a plain member sees no Projects & Processes but DOES see Objectives (OD-V4-1)', async () => {
    setAuth([])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'objectives' } })
    expect(screen.queryByRole('option', { name: /^Projects & Processes$/i })).toBeNull()
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
    localStorage.setItem('mos.locale', 'en')
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
    expect(screen.getByText('Records')).toBeInTheDocument()
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

// ── OD-REDESIGN-91 #4/B2: the Records group spans ALL kinds ──────────────────
describe('#4/B2: ⌘K search spans Tasks + Signals + AR Follow-ups', () => {
  afterEach(() => { features.SHOW_FOLLOWUPS = false })
  it('#B2: a Signal hit appears under Records, carries the "Signal" kind, and navigates to /work/signals/:id', async () => {
    mockSearch.mockResolvedValue([])
    mockSearchSignals.mockResolvedValue([{ id: 's1', body: 'Fridge temperature high\nchecked at 8am' }])
    const { onClose } = renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fridge' } })
    const opt = await screen.findByRole('option', { name: /Fridge temperature high/i })
    // Rows carry their kind — the muted kind label rides the row (collapsed to the first line).
    expect(opt).toHaveTextContent('Signal')
    expect(opt).not.toHaveTextContent('checked at 8am')
    expect(screen.getByText('Records')).toBeInTheDocument()
    fireEvent.click(opt)
    expect(screen.getByTestId('location')).toHaveTextContent('/work/signals/s1')
    expect(onClose).toHaveBeenCalled()
    // A Signal must NOT pollute the task-scoped Recent ring buffer.
    expect(readRecentTasks()).toHaveLength(0)
  })

  it('#B2: Tasks and Signals coexist in one Records group, each labelled by kind', async () => {
    mockSearch.mockResolvedValue([{ id: 't1', title: 'Roast beans', status: 'Open' }])
    mockSearchSignals.mockResolvedValue([{ id: 's1', body: 'Grinder jammed' }])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'r' } })
    const task = await screen.findByRole('option', { name: /Roast beans/i })
    const signal = await screen.findByRole('option', { name: /Grinder jammed/i })
    expect(task).toHaveTextContent('Task')
    expect(signal).toHaveTextContent('Signal')
  })

  // DD-WAY-36 held that a follow-up hit lands on the Money queue rather than the deleted Work
  // path. #444 ship-gates the whole /money subtree, so the hit has nowhere to land and the
  // palette must not render it: a Records ROW pointing at a closed route is the same defect as a
  // Navigate entry pointing at one, and the gate is applied at the seam every row passes through
  // precisely so a record hit cannot slip past it.
  it('issue 444: a follow-up hit is not offered at all while the Money queue is ship-gated', async () => {
    features.SHOW_FOLLOWUPS = true
    mockSearch.mockResolvedValue([])
    mockSearchSignals.mockResolvedValue([])
    mockSearchFollowUps.mockResolvedValue([{ id: 'fu-1', counterparty: 'PT Acme' }])
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'acme' } })
    // The search still FIRES (SHOW_FOLLOWUPS is on) — this is the palette declining to offer the
    // result, not the read being switched off, which is a different flag and a different test.
    await waitFor(() => expect(mockSearchFollowUps).toHaveBeenCalledWith('acme'))
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: /PT Acme/i })).toBeNull(),
    )
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
// The rung (indent + hairline guide + muted step) says "this row hangs under the one above it".
// `child: true` is a registry fact — "Work declares this" — and survives filtering; the LICENCE to
// draw the rung does not, because the query and the ship gate can each remove the parent. A guide
// with nothing above it points at a row that is not there, which is worse than saying nothing.
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
    // "o" keeps Home · Work · Projects & Processes · Objectives · Inbox · Personal Profile. The
    // children are emitted DIRECTLY beneath the Work row, before the surviving roots — the run of
    // rows the Child rung describes is unbroken by construction, so the pre-delta shape (an
    // unrelated root such as Inbox or Personal Profile parked between the parent and its
    // children) cannot render.
    const navigate = screen.getByRole('group', { name: 'GO TO' })
    expect(within(navigate).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Home', 'Work', 'Projects & Processes', 'Objectives', 'Inbox', 'Personal Profile',
    ])
  })

  it('a FILTERED result that kept its parent keeps the rung', async () => {
    // The two tests above assert the rung disappears when the parent goes. Nothing asserted it
    // SURVIVES — so "clear every rung whenever the query is non-empty", the fix a developer
    // reaches for after an orphaned-rung report, passed the whole suite while every child lost
    // its indent, hairline and aria-describedby on the first keystroke.
    renderMenu()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o' } })
    // Precondition: "o" keeps BOTH ends on screen — Work and its children.
    expect(await screen.findByRole('option', { name: /^Work$/i })).toBeTruthy()
    // EVERY surviving child: clearing the rung for all children would hide the broken relationship.

    // EVERY surviving child, not just the first: clearing the rung for all children except
    // /work/tasks passed 90/90 while query "o" rendered Work · Projects & Processes · Objectives
    // with both children stripped of their indent, hairline and aria-describedby.
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
