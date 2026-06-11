import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../auth/useAuth')
import { useAuth } from '../auth/useAuth'

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

function renderMyWeek(auth = nonManagerViewer) {
  mockUseAuth.mockReturnValue(auth)
  return render(
    <MemoryRouter>
      <MyWeek />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// AC-011: My Week task-table frame (empty)
describe('AC-011: Empty task-table frame', () => {
  it('shows "My tasks" card head', () => {
    renderMyWeek()
    expect(screen.getByText('My tasks')).toBeInTheDocument()
  })

  it('shows subtitle "Where you\'re Responsible or Accountable · off track first"', () => {
    renderMyWeek()
    expect(
      screen.getByText("Where you're Responsible or Accountable · off track first"),
    ).toBeInTheDocument()
  })

  it('has "All tasks →" link targeting /tasks', () => {
    renderMyWeek()
    const link = screen.getByRole('link', { name: /All tasks/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/tasks')
  })

  it('renders the 5 column headers: Task / Status / Owner / Due / Activity', () => {
    renderMyWeek()
    const headers = screen.getAllByRole('columnheader')
    const headerTexts = headers.map((h) => h.textContent?.trim())
    expect(headerTexts).toContain('Task')
    expect(headerTexts).toContain('Status')
    expect(headerTexts).toContain('Owner')
    expect(headerTexts).toContain('Due')
    expect(headerTexts).toContain('Activity')
    expect(headers).toHaveLength(5)
  })

  it('shows empty row copy with no group headers', () => {
    renderMyWeek()
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
  it('update strip shows no-update copy with Due Fri phrase and link to /updates', () => {
    renderMyWeek()
    expect(
      screen.getByText('No weekly update for this week yet.'),
    ).toBeInTheDocument()
    // "Due Fri" substring present in the explainer
    expect(screen.getByText(/Due Fri /)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Open Updates/i })
    expect(link.getAttribute('href')).toBe('/updates')
  })

  it('ops strip shows no-ops copy and link to /ops', () => {
    renderMyWeek()
    expect(
      screen.getByText('No ops events logged today.'),
    ).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Today on Ops/i })
    expect(link.getAttribute('href')).toBe('/ops')
  })

  it('no amber/needs-me state in the empty strips', () => {
    renderMyWeek()
    // No amber draft pill element in the strips
    const container = document.body
    expect(container.querySelector('.strip-pill.draft')).toBeNull()
    // No "Needs sign-off" or "needs your sign-off" text (the specific needs-me marker)
    expect(screen.queryByText(/needs your sign-off|sign-off needed/i)).toBeNull()
  })
})

// AC-013: Team module is manager-conditional
describe('AC-013: Team module manager-conditional', () => {
  it('(a) shows team module for manager viewers', () => {
    renderMyWeek(managerViewer)
    // The overline label starts with "Your team"
    const overline = screen.getAllByText(/Your team/i)
    expect(overline.length).toBeGreaterThan(0)
    expect(screen.getByText('Nothing from your team yet.')).toBeInTheDocument()
  })

  it('(b) hides team module for non-manager viewers', () => {
    renderMyWeek(nonManagerViewer)
    // No team overline at all
    const matches = screen.queryAllByText(/Your team/i)
    expect(matches).toHaveLength(0)
    expect(screen.queryByText('Nothing from your team yet.')).toBeNull()
  })
})

// FIX-1: Mobile strip reflow — strips have flex-wrap and text element has min-width
describe('FIX-1: Mobile strip reflow — structural layout guards', () => {
  it('weekly-update strip container has flex-wrap class (not fixed row)', () => {
    const { container } = renderMyWeek()
    const updateSection = container.querySelector('[aria-label="My weekly update"]')
    expect(updateSection).toBeTruthy()
    expect(updateSection!.className).toMatch(/flex-wrap/)
  })

  it('ops strip container has flex-wrap class (not fixed row)', () => {
    const { container } = renderMyWeek()
    const opsSection = container.querySelector('[aria-label="Today on the floor"]')
    expect(opsSection).toBeTruthy()
    expect(opsSection!.className).toMatch(/flex-wrap/)
  })

  it('weekly-update strip text element has a min-w class preventing width starvation', () => {
    const { container } = renderMyWeek()
    const updateSection = container.querySelector('[aria-label="My weekly update"]')
    // The flex-1 text span should have min-w to prevent it collapsing word-per-word
    const textEl = updateSection!.querySelector('.flex-1')
    expect(textEl).toBeTruthy()
    expect(textEl!.className).toMatch(/min-w-\[/)
  })
})

// FIX-2: Card-head reflow — allows wrap, title never breaks mid-phrase
describe('FIX-2: Card-head reflow — structural layout guards', () => {
  it('card head container has flex-wrap class', () => {
    const { container } = renderMyWeek()
    const cardHead = container.querySelector('[aria-label="My tasks this week"] div')
    expect(cardHead).toBeTruthy()
    expect(cardHead!.className).toMatch(/flex-wrap/)
  })

  it('"My tasks" title has whitespace-nowrap to prevent mid-phrase break', () => {
    const { container } = renderMyWeek()
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

  it('(a) Wed 10 Jun 2026 12:00 WIB: subtitle contains correct week range and today', () => {
    vi.setSystemTime(new Date('2026-06-10T05:00:00Z'))
    renderMyWeek()
    const subtitle = screen.getByText(/Week of/)
    expect(subtitle.textContent).toContain('Week of 8–14 Jun 2026')
    expect(subtitle.textContent).toContain('Wed 10 Jun')
    expect(subtitle.textContent).toContain('what needs you, your update, and today on the floor')
  })

  it('(b) Mon boundary: 2026-06-08T16:30:00Z = Mon 8 Jun 00:30 WIB', () => {
    vi.setSystemTime(new Date('2026-06-08T16:30:00Z'))
    renderMyWeek()
    const subtitle = screen.getByText(/Week of/)
    expect(subtitle.textContent).toContain('Week of 8–14 Jun 2026')
    expect(subtitle.textContent).toContain('Mon 8 Jun')
  })
})
