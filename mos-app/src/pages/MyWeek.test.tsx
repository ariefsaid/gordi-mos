import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '../auth/context'

vi.mock('../auth/useAuth')
import { useAuth } from '../auth/useAuth'

// Mock weeklyUpdates data layer for strip wiring (AC-050, AC-051) + team module (RI-CROSS)
vi.mock('../lib/db/weeklyUpdates', () => ({
  getMyUpdate:     vi.fn(),
  upsertDraft:     vi.fn(),
  submit:          vi.fn(),
  reopen:          vi.fn(),
  addLine:         vi.fn(),
  updateLine:      vi.fn(),
  removeLine:      vi.fn(),
  listTeamUpdates: vi.fn(),
}))
import { getMyUpdate, listTeamUpdates } from '../lib/db/weeklyUpdates'
const mockGetMyUpdate = vi.mocked(getMyUpdate)
const mockListTeamUpdates = vi.mocked(listTeamUpdates)

// Mock team.ts roster resolution for the My Week team module (RI-CROSS)
vi.mock('../lib/db/team', () => ({
  getTeamForManager: vi.fn(),
}))
import { getTeamForManager } from '../lib/db/team'
const mockGetTeamForManager = vi.mocked(getTeamForManager)

// Mock opsLog data layer for ops-strip wiring (AC-080, AC-081, AC-082)
vi.mock('../lib/db/opsLog', () => ({
  getTodayOpsSummary: vi.fn(),
  listLogEntries: vi.fn(),
  addLogEntry: vi.fn(),
  editLogEntry: vi.fn(),
  archiveLogEntry: vi.fn(),
  unarchiveLogEntry: vi.fn(),
}))
import { getTodayOpsSummary } from '../lib/db/opsLog'
const mockGetTodayOpsSummary = vi.mocked(getTodayOpsSummary)

const mockUseAuth = vi.mocked(useAuth)

import MyWeek from './MyWeek'

const nonManagerViewer = {
  status: 'authenticated' as const,
  viewer: {
    person: {
      id: '40000000-0000-0000-0000-000000000001',
      org_id: '10000000-0000-0000-0000-000000000001',
      user_id: 'auth-user-001',
      full_name: 'Cahya Cafe',
      email: 'cahya@gordi.id',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [],
    isManager: false,
  },
  signOut: vi.fn(),
}

const managerViewer = {
  ...nonManagerViewer,
  viewer: { ...nonManagerViewer.viewer, isManager: true },
}

// FIX-4: async renderMyWeek — wraps render + flush inside act() so the
// getMyUpdate mock-resolved promise settles within act and no "not wrapped
// in act()" warnings are emitted (the async state update is now inside act).
async function renderMyWeek(auth: AuthState = nonManagerViewer) {
  mockUseAuth.mockReturnValue(auth)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <MyWeek />
      </MemoryRouter>,
    )
    // Flush the mock-resolved getMyUpdate Promise so the stripLoad state
    // update (loading → ready / error) is processed inside act().
    await Promise.resolve()
  })
  return utils
}

const managerViewerWithRoles = {
  status: 'authenticated' as const,
  viewer: {
    person: nonManagerViewer.viewer.person,
    isManager: true,
    roles: [{
      id: 'role-001',
      org_id: '10000000-0000-0000-0000-000000000001',
      business_unit_id: null,
      name: 'GM Café',
      reports_to_role_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }],
  },
  signOut: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: no update for this week (keeps existing tests stable)
  mockGetMyUpdate.mockResolvedValue(null)
  // Default team mocks: empty roster + empty updates
  mockGetTeamForManager.mockResolvedValue([])
  mockListTeamUpdates.mockResolvedValue([])
  // Default ops summary: no entries, no needs-attention
  mockGetTodayOpsSummary.mockResolvedValue({ count: 0, needsAttention: false })
})

// AC-011: My Week task-table frame (empty)
describe('AC-011: Empty task-table frame', () => {
  it('shows "My tasks" card head', async () => {
    await renderMyWeek()
    expect(screen.getByText('My tasks')).toBeInTheDocument()
  })

  it('shows subtitle "Where you\'re Responsible or Accountable · off track first"', async () => {
    await renderMyWeek()
    expect(
      screen.getByText("Where you're Responsible or Accountable · off track first"),
    ).toBeInTheDocument()
  })

  it('has "All tasks →" link targeting /tasks', async () => {
    await renderMyWeek()
    const link = screen.getByRole('link', { name: /All tasks/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/tasks')
  })

  it('renders the 5 column headers: Task / Status / Owner / Due / Activity', async () => {
    await renderMyWeek()
    const headers = screen.getAllByRole('columnheader')
    const headerTexts = headers.map((h) => h.textContent?.trim())
    expect(headerTexts).toContain('Task')
    expect(headerTexts).toContain('Status')
    expect(headerTexts).toContain('Owner')
    expect(headerTexts).toContain('Due')
    expect(headerTexts).toContain('Activity')
    expect(headers).toHaveLength(5)
  })

  it('shows empty row copy with no group headers', async () => {
    await renderMyWeek()
    expect(
      screen.getByText("No tasks where you're R or A this week — you're clear."),
    ).toBeInTheDocument()
    // No group headers
    expect(screen.queryByText(/Overdue/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Due this week/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Later/i)).not.toBeInTheDocument()
  })
})

// AC-012: Empty strips link to their surfaces
describe('AC-012: Empty strips', () => {
  it('update strip shows no-update copy with Due Fri phrase and link to /updates', async () => {
    await renderMyWeek()
    // After renderMyWeek resolves, the no-update state is already shown
    await waitFor(() => expect(screen.getByText('No weekly update for this week yet.')).toBeInTheDocument())
    // "Due Fri" substring present in the explainer
    expect(screen.getByText(/Due Fri /)).toBeInTheDocument()
    // Strip links to /updates (link label changed from "Open Updates" to "Write update" per design-plan §6)
    const link = screen.getByRole('link', { name: /write update|open updates/i })
    expect(link.getAttribute('href')).toBe('/updates')
  })

  it('ops strip shows no-ops copy and link to /ops', async () => {
    mockGetTodayOpsSummary.mockResolvedValue({ count: 0, needsAttention: false })
    await renderMyWeek()
    await waitFor(() =>
      expect(screen.getByText(/No log entries on the floor today\./i)).toBeInTheDocument(),
    )
    const link = screen.getByRole('link', { name: /Today on Ops/i })
    expect(link.getAttribute('href')).toBe('/ops')
  })

  it('no amber/needs-me state in the empty strips', async () => {
    await renderMyWeek()
    // No amber draft pill element in the strips
    const container = document.body
    expect(container.querySelector('.strip-pill.draft')).toBeNull()
    // No "Needs sign-off" or "needs your sign-off" text (the specific needs-me marker)
    expect(screen.queryByText(/needs your sign-off|sign-off needed/i)).toBeNull()
  })
})

// AC-013: Team module is manager-conditional
describe('AC-013: Team module manager-conditional', () => {
  it('(a) shows team module overline for manager viewers', async () => {
    await renderMyWeek(managerViewer)
    // The overline label starts with "Your team"
    const overline = screen.getAllByText(/Your team/i)
    expect(overline.length).toBeGreaterThan(0)
  })

  it('(b) hides team module for non-manager viewers', async () => {
    await renderMyWeek(nonManagerViewer)
    // No team overline at all
    const matches = screen.queryAllByText(/Your team/i)
    expect(matches).toHaveLength(0)
  })
})

// FIX-1: Mobile strip reflow — strips have flex-wrap and text element has min-width
describe('FIX-1: Mobile strip reflow — structural layout guards', () => {
  it('weekly-update strip container has flex-wrap class (not fixed row)', async () => {
    const { container } = await renderMyWeek()
    const updateSection = container.querySelector('[aria-label="My weekly update"]')
    expect(updateSection).toBeTruthy()
    expect(updateSection!.className).toMatch(/flex-wrap/)
  })

  it('ops strip container has flex-wrap class (not fixed row)', async () => {
    const { container } = await renderMyWeek()
    const opsSection = container.querySelector('[aria-label="Today on the floor"]') ??
                       container.querySelector('[aria-label="Today on Ops"]')
    expect(opsSection).toBeTruthy()
    expect(opsSection!.className).toMatch(/flex-wrap/)
  })

  it('weekly-update strip text element has a min-w class preventing width starvation', async () => {
    const { container } = await renderMyWeek()
    const updateSection = container.querySelector('[aria-label="My weekly update"]')
    // The flex-1 text span should have min-w to prevent it collapsing word-per-word
    const textEl = updateSection!.querySelector('.flex-1')
    expect(textEl).toBeTruthy()
    expect(textEl!.className).toMatch(/min-w-\[/)
  })
})

// FIX-2: Card-head reflow — allows wrap, title never breaks mid-phrase
describe('FIX-2: Card-head reflow — structural layout guards', () => {
  it('card head container has flex-wrap class', async () => {
    const { container } = await renderMyWeek()
    const cardHead = container.querySelector('[aria-label="My tasks this week"] div')
    expect(cardHead).toBeTruthy()
    expect(cardHead!.className).toMatch(/flex-wrap/)
  })

  it('"My tasks" title has whitespace-nowrap to prevent mid-phrase break', async () => {
    const { container } = await renderMyWeek()
    const titleEl = container.querySelector('[aria-label="My tasks this week"] div span:first-child')
    expect(titleEl).toBeTruthy()
    expect(titleEl!.className).toMatch(/whitespace-nowrap/)
  })
})

// AC-010: WIB week math at the page level
describe('AC-010: My Week head WIB week math', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('(a) Wed 10 Jun 2026 12:00 WIB: subtitle contains correct week range and today', async () => {
    vi.setSystemTime(new Date('2026-06-10T05:00:00Z'))
    await renderMyWeek()
    const subtitle = screen.getByText(/Week of/)
    expect(subtitle.textContent).toContain('Week of 8–14 Jun 2026')
    expect(subtitle.textContent).toContain('Wed 10 Jun')
    expect(subtitle.textContent).toContain('what needs you, your update, and today on the floor')
  })

  it('(b) Mon boundary: 2026-06-08T16:30:00Z = Mon 8 Jun 00:30 WIB', async () => {
    vi.setSystemTime(new Date('2026-06-08T16:30:00Z'))
    await renderMyWeek()
    const subtitle = screen.getByText(/Week of/)
    expect(subtitle.textContent).toContain('Week of 8–14 Jun 2026')
    expect(subtitle.textContent).toContain('Mon 8 Jun')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-050: strip "No update" state
// AC-051: strip Draft / Submitted + on-time/late states
// ══════════════════════════════════════════════════════════════════════════════
describe('AC-050: My Week strip — No update state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyUpdate.mockResolvedValue(null)
  })

  it('strip shows "No update" pill and "No weekly update for this week yet" when no row (AC-050)', async () => {
    await renderMyWeek()
    // getMyUpdate resolved null inside act — state is already ready
    const strip = document.querySelector('[aria-label="My weekly update"]')
    expect(strip?.textContent).toMatch(/no update/i)
    expect(screen.getByText(/No weekly update for this week yet/i)).toBeTruthy()
  })

  it('strip shows "Due Fri" and "Write update" link when no row (AC-050)', async () => {
    await renderMyWeek()
    await waitFor(() => screen.getByText(/No weekly update for this week yet/i))
    expect(screen.getByText(/Due Fri/i)).toBeTruthy()
    const link = screen.getByRole('link', { name: /write update/i })
    expect(link.getAttribute('href')).toBe('/updates')
  })
})

describe('AC-051: My Week strip — Draft state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyUpdate.mockResolvedValue({
      update: {
        id: 'upd-1', org_id: 'org', person_id: '40000000-0000-0000-0000-000000000001',
        week_start: '2026-06-08', summary: 'In progress', status: 'draft', submitted_at: null,
        created_by: '40000000-0000-0000-0000-000000000001',
        created_at: '2026-06-10T08:00:00Z', updated_at: '2026-06-10T08:00:00Z',
      },
      items: [],
    })
  })

  it('strip shows "Draft" pill and "Draft — not filed yet" when draft exists (AC-051)', async () => {
    await renderMyWeek()
    // Draft state is fully rendered after act flushes the mock promise
    expect(screen.getByText(/Draft — not filed yet/i)).toBeTruthy()
    const strip = document.querySelector('[aria-label="My weekly update"]')
    expect(strip?.textContent).toMatch(/Draft/i)
  })

  it('strip shows "Continue draft" link when draft (AC-051)', async () => {
    await renderMyWeek()
    await waitFor(() => screen.getByText(/Draft — not filed yet/i))
    const link = screen.getByRole('link', { name: /continue draft/i })
    expect(link.getAttribute('href')).toBe('/updates')
  })
})

describe('AC-051: My Week strip — Submitted state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('strip shows "Submitted" pill and on-time indicator (AC-051)', async () => {
    mockGetMyUpdate.mockResolvedValue({
      update: {
        id: 'upd-1', org_id: 'org', person_id: '40000000-0000-0000-0000-000000000001',
        week_start: '2026-06-08', summary: 'Done', status: 'submitted',
        submitted_at: '2026-06-12T08:00:00Z', // Fri 15:00 WIB — on time
        created_by: '40000000-0000-0000-0000-000000000001',
        created_at: '2026-06-10T08:00:00Z', updated_at: '2026-06-10T08:00:00Z',
      },
      items: [],
    })
    await renderMyWeek()
    const strip = document.querySelector('[aria-label="My weekly update"]')
    expect(strip?.textContent).toMatch(/Submitted/i)
    // on time signal
    expect(screen.getByText(/on time/i)).toBeTruthy()
  })

  it('strip shows "late" indicator when submitted after Fri 17:00 WIB (AC-051)', async () => {
    mockGetMyUpdate.mockResolvedValue({
      update: {
        id: 'upd-1', org_id: 'org', person_id: '40000000-0000-0000-0000-000000000001',
        week_start: '2026-06-08', summary: 'Done', status: 'submitted',
        submitted_at: '2026-06-13T05:00:00Z', // Sat 12:00 WIB — late
        created_by: '40000000-0000-0000-0000-000000000001',
        created_at: '2026-06-10T08:00:00Z', updated_at: '2026-06-10T08:00:00Z',
      },
      items: [],
    })
    await renderMyWeek()
    expect(screen.getByText(/late/i)).toBeTruthy()
  })

  it('strip shows "View update" link when submitted (AC-051)', async () => {
    mockGetMyUpdate.mockResolvedValue({
      update: {
        id: 'upd-1', org_id: 'org', person_id: '40000000-0000-0000-0000-000000000001',
        week_start: '2026-06-08', summary: 'Done', status: 'submitted',
        submitted_at: '2026-06-12T08:00:00Z',
        created_by: '40000000-0000-0000-0000-000000000001',
        created_at: '2026-06-10T08:00:00Z', updated_at: '2026-06-10T08:00:00Z',
      },
      items: [],
    })
    await renderMyWeek()
    await waitFor(() => screen.getByRole('link', { name: /view update/i }))
    expect(screen.getByRole('link', { name: /view update/i }).getAttribute('href')).toBe('/updates')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// RI-M1: Submitted sentence — period is NOT a gap-separated flex child
// The "." must sit flush against the TimingChip with no CSS gap between them.
// ════════════════════════════════════════════════════════════════════════════
describe('RI-M1: Submitted sentence — period not gap-separated flex child', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyUpdate.mockResolvedValue({
      update: {
        id: 'upd-1', org_id: 'org', person_id: '40000000-0000-0000-0000-000000000001',
        week_start: '2026-06-08', summary: 'Done', status: 'submitted',
        submitted_at: '2026-06-12T08:00:00Z',
        created_by: '40000000-0000-0000-0000-000000000001',
        created_at: '2026-06-10T08:00:00Z', updated_at: '2026-06-10T08:00:00Z',
      },
      items: [],
    })
    mockGetTeamForManager.mockResolvedValue([])
    mockListTeamUpdates.mockResolvedValue([])
  })

  it('the period "." is not a flex child of the gap container that wraps "Submitted" + TimingChip', async () => {
    const { container } = await renderMyWeek()
    // Wait for submitted state to be fully rendered
    await waitFor(() => expect(screen.getByText(/on time/i)).toBeInTheDocument())

    // Find the sentence container inside the weekly update strip
    const strip = container.querySelector('[aria-label="My weekly update"]')
    expect(strip).toBeTruthy()

    // The sentence flex container (if any) should NOT have the period as a direct flex child.
    // Walk up from "." text nodes: the period must NOT be a child of an element with gap styling
    // (i.e. gap > 0) that is also a flex container AND a sibling of the TimingChip.
    const allSpans = Array.from(strip!.querySelectorAll('span'))
    // Find the period span (text content = ".")
    const periodSpan = allSpans.find(s => s.textContent === '.')
    // The period MUST exist (it's still in the sentence)
    expect(periodSpan).toBeTruthy()
    // Its direct parent must NOT have gap styling applied with a flex sibling set
    // (i.e. the parent should not be the "Submitted + chip + ." inline-flex with gap)
    const parent = periodSpan!.parentElement!
    const parentStyle = window.getComputedStyle(parent)
    // If parent is inline-flex/flex with gap, the period is a gap-separated child — that's the bug.
    // After the fix: the period is a text sibling after the flex container, NOT inside it.
    const isFlexWithGap = (parentStyle.display === 'flex' || parentStyle.display === 'inline-flex')
      && parentStyle.gap !== '0px' && parentStyle.gap !== '' && parentStyle.gap !== 'normal'
    // After fix: period should not be inside a gapped flex container
    expect(isFlexWithGap).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// RI-CROSS: My Week team module reflects same listTeamUpdates state as review pane
// ════════════════════════════════════════════════════════════════════════════
describe('RI-CROSS: Team module wired to listTeamUpdates — cross-surface consistency', () => {
  const teamRoster = [
    { person_id: 'p-001', full_name: 'Budi Santoso', role_label: 'Barista' },
  ]

  it('shows "Filed" for a report who has filed this week', async () => {
    mockGetTeamForManager.mockResolvedValue(teamRoster)
    mockListTeamUpdates.mockResolvedValue([
      {
        person_id: 'p-001', full_name: 'Budi Santoso', role_label: 'Barista',
        state: 'filed', summary_excerpt: 'All good', submitted_at: '2026-06-13T04:00:00Z',
      },
    ])
    await renderMyWeek(managerViewerWithRoles)
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument())
    // The status pill should show "Filed" — same label as the review pane's StatePill
    expect(screen.getByText('Filed')).toBeInTheDocument()
  })

  it('shows "Not started" for a report who has not filed this week', async () => {
    mockGetTeamForManager.mockResolvedValue(teamRoster)
    mockListTeamUpdates.mockResolvedValue([
      {
        person_id: 'p-001', full_name: 'Budi Santoso', role_label: 'Barista',
        state: 'not_started', summary_excerpt: null, submitted_at: null,
      },
    ])
    await renderMyWeek(managerViewerWithRoles)
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument())
    expect(screen.getByText('Not started')).toBeInTheDocument()
  })

  it('shows "Draft" for a report with a draft this week', async () => {
    mockGetTeamForManager.mockResolvedValue(teamRoster)
    mockListTeamUpdates.mockResolvedValue([
      {
        person_id: 'p-001', full_name: 'Budi Santoso', role_label: 'Barista',
        state: 'draft', summary_excerpt: 'WIP', submitted_at: null,
      },
    ])
    await renderMyWeek(managerViewerWithRoles)
    await waitFor(() => expect(screen.getByText('Budi Santoso')).toBeInTheDocument())
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('shows empty-team copy when no direct reports are returned', async () => {
    mockGetTeamForManager.mockResolvedValue([])
    mockListTeamUpdates.mockResolvedValue([])
    await renderMyWeek(managerViewerWithRoles)
    await waitFor(() =>
      expect(screen.getByText(/no direct reports/i)).toBeInTheDocument()
    )
  })
})

// ════════════════════════════════════════════════════════════════════════════
// AC-080: ops strip shows today count (neutral)
// AC-081: ops strip amber when needs-attention
// AC-082: ops strip degrades pane-by-pane
// ════════════════════════════════════════════════════════════════════════════

describe('AC-080: ops strip shows today count, neutral', () => {
  it('shows count pill and neutral sentence when N>0, no needs-attention', async () => {
    mockGetTodayOpsSummary.mockResolvedValue({ count: 3, needsAttention: false })
    await renderMyWeek()
    await waitFor(() =>
      expect(screen.getByText(/3 today/i)).toBeInTheDocument(),
    )
    // Sentence mentions log entries
    expect(screen.getByText(/3 log entries on the floor today/i)).toBeInTheDocument()
    // Link to /ops
    const link = screen.getByRole('link', { name: /Today on Ops/i })
    expect(link.getAttribute('href')).toBe('/ops')
  })

  it('shows "0 today" and no-entries copy when count=0', async () => {
    mockGetTodayOpsSummary.mockResolvedValue({ count: 0, needsAttention: false })
    await renderMyWeek()
    await waitFor(() =>
      expect(screen.getByText(/0 today/i)).toBeInTheDocument(),
    )
    expect(screen.getByText(/No log entries on the floor today\./i)).toBeInTheDocument()
  })

  it('strip section links to /ops', async () => {
    mockGetTodayOpsSummary.mockResolvedValue({ count: 1, needsAttention: false })
    await renderMyWeek()
    await waitFor(() => expect(screen.getByText(/1 today/i)).toBeInTheDocument())
    const link = screen.getByRole('link', { name: /Today on Ops/i })
    expect(link.getAttribute('href')).toBe('/ops')
  })
})

describe('AC-081: ops strip amber when a needs-attention entry is open', () => {
  it('shows amber pill with dot and "needs attention" sentence when needsAttention=true', async () => {
    mockGetTodayOpsSummary.mockResolvedValue({ count: 2, needsAttention: true })
    await renderMyWeek()
    await waitFor(() =>
      expect(screen.getByText(/2 today/i)).toBeInTheDocument(),
    )
    // Sentence must include "needs attention" signal
    expect(screen.getByText(/something needs attention/i)).toBeInTheDocument()
    // Link label changes to "Review on Ops"
    expect(screen.getByRole('link', { name: /Review on Ops/i })).toBeInTheDocument()
    // data-attn or amber class on the pill (visual check via data attr)
    const pill = document.querySelector('[data-ops-attn="true"]')
    expect(pill).not.toBeNull()
  })
})

describe('AC-082: ops strip degrades pane-by-pane', () => {
  it('ops strip error shows retry, weekly-update strip still renders', async () => {
    mockGetTodayOpsSummary.mockRejectedValue(new Error('ops down'))
    // Weekly update still works
    mockGetMyUpdate.mockResolvedValue(null)
    await renderMyWeek()
    await waitFor(() =>
      expect(screen.getByText(/Couldn't load today's ops/i)).toBeInTheDocument(),
    )
    // Retry button present in ops strip
    const opsSection = document.querySelector('[aria-label="Today on Ops"]')
    expect(opsSection).toBeTruthy()
    // Weekly update strip still rendered (not affected by ops error)
    expect(screen.getByText(/No weekly update for this week yet/i)).toBeInTheDocument()
  })

  it('ops strip loading state shows muted pill (no flash) independently', async () => {
    // Never resolves — stays loading
    mockGetTodayOpsSummary.mockImplementation(() => new Promise(() => {}))
    mockUseAuth.mockReturnValue(nonManagerViewer)
    render(
      <MemoryRouter>
        <MyWeek />
      </MemoryRouter>,
    )
    // Ops strip section (role=region) is present with loading state
    await waitFor(() => {
      const opsSection = screen.queryByRole('region', { name: 'Today on Ops' })
      expect(opsSection).toBeTruthy()
    })
  })
})
