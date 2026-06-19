import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
vi.mock('../components/weekly/weekly-update-write-pane', () => ({
  WeeklyUpdateWritePane: () => <section aria-label="My weekly update">Write pane</section>,
}))
vi.mock('../components/weekly/weekly-update-review-pane', () => ({
  WeeklyUpdateReviewPane: () => <section aria-label="My team updates">Review pane</section>,
}))
vi.mock('../lib/db/team', () => ({ getTeamForManager: vi.fn(() => Promise.resolve([])) }))

import { UpdatesPage } from './updates-page'
import { OpsPage } from './ops-page'

// The /tasks page-shell oracles below were re-homed from the deleted TasksPage host onto
// the LIVE /tasks surface (TasksLayout → TasksWorkspace). AC-004 (document.title) +
// AC-007 (Tasks heading, no phase/roadmap wording) + the assembly left-align check are now
// proven against the real page the user sees.

vi.mock('../lib/db/tasks', () => ({ listTasks: vi.fn(() => new Promise(() => {})), getTaskTitlesByIds: vi.fn(() => Promise.resolve([])) }))
// OpsPage needs these mocked (P2-3b — real page, not placeholder)
vi.mock('../lib/db/ops-log', () => ({
  listLogEntries: vi.fn(() => new Promise(() => {})), // stays loading
  addLogEntry: vi.fn(),
  editLogEntry: vi.fn(),
  archiveLogEntry: vi.fn(),
  unarchiveLogEntry: vi.fn(),
  getTodayOpsSummary: vi.fn(() => new Promise(() => {})),
}))
vi.mock('../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(() => new Promise(() => {})),
  getPeople: vi.fn(() => new Promise(() => {})),
}))
// useAuth needed for OpsPage (viewer context)
vi.mock('../auth/use-auth', () => ({
  useAuth: vi.fn(() => ({
    status: 'authenticated',
    viewer: {
      person: { id: 'p1', org_id: 'org1', user_id: 'u1', full_name: 'Test', email: null, archived_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      roles: [],
      isManager: false,
      accessRoles: [],
    },
    signOut: () => {},
  })),
}))
import { TasksLayout } from './tasks-layout'
import { AuthContext } from '@/auth/context'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { AuthState } from '@/auth/context'

const mockPerson: PeopleRow = {
  id: 'p1', org_id: 'org', user_id: 'u1', full_name: 'Test User',
  email: null, archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const mockRole: RolesRow = {
  id: 'r1', org_id: 'org', business_unit_id: null, name: 'CEO',
  reports_to_role_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: mockPerson, roles: [mockRole], isManager: false, accessRoles: [] },
  signOut: async () => {},
}

// AC-007: section empty shells render correct copy with no roadmap/phase wording
describe('AC-007: Section empty shells', () => {
  it('AC-007: live /tasks page shows the "Tasks" heading, no phase/roadmap wording', () => {
    // Re-homed onto the LIVE /tasks surface (TasksLayout). listTasks is mocked pending so
    // the table stays loading, but the "Tasks" h1 + zero phase/roadmap wording hold.
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks']}>
          <TasksLayout />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/phase|roadmap|Phase 2/i)
  })

  it('UpdatesPage: title "Weekly Updates" heading is present, no phase wording (P2-2b replaces placeholder)', () => {
    // P2-2b: UpdatesPage is now the live write-pane; placeholder copy is gone.
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Weekly Updates' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/phase|roadmap|Phase 2/i)
  })

  it('OpsPage: title "Daily Log" heading is present, no phase wording (P2-3b replaces placeholder)', () => {
    // OpsPage is now the live feed page (P2-3b); placeholder copy is gone.
    // It starts loading — the heading is visible immediately.
    render(
      <MemoryRouter>
        <OpsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Daily Log' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/phase|roadmap|coming soon|Phase 2/i)
    // Must not contain old placeholder text
    expect(document.body.textContent).not.toMatch(/No ops events yet/)
  })
})

// FIX-3: Empty states are NOT text-centered (left-aligned per mockup anti-slop note)
describe('FIX-3: Empty state containers are left-aligned (not text-center)', () => {
  it('FIX-3: live /tasks assembly container does NOT have text-center class', () => {
    // Re-homed onto the LIVE /tasks surface (TasksLayout → TasksWorkspace .assembly).
    const { container } = render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks']}>
          <TasksLayout />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    const assembly = container.querySelector('.assembly')
    expect(assembly).toBeTruthy()
    expect(assembly!.className).not.toMatch(/text-center/)
  })

  it('UpdatesPage empty container does NOT have text-center class', () => {
    const { container } = render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    )
    const emptyDiv = container.querySelector('[aria-label="My weekly update"]')
    expect(emptyDiv).toBeTruthy()
    expect(emptyDiv!.className).not.toMatch(/text-center/)
  })

  it('OpsPage assembly container does NOT have text-center class (P2-3b live feed)', () => {
    // OpsPage now renders an ops-assembly container (card assembly, left-aligned).
    const { container } = render(
      <MemoryRouter>
        <OpsPage />
      </MemoryRouter>,
    )
    const assembly = container.querySelector('.ops-assembly')
    expect(assembly).toBeTruthy()
    expect(assembly!.className).not.toMatch(/text-center/)
  })
})

// AC-004 title portion: section pages set document.title
describe('AC-004: Document title per section page', () => {
  it('AC-004: the live /tasks page (TasksLayout) sets document.title to "Tasks — Gordi MOS"', () => {
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/tasks']}>
          <TasksLayout />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(document.title).toBe('Tasks — Gordi MOS')
  })

  it('UpdatesPage sets document.title to "Weekly Updates — Gordi MOS" (P2-2b page title)', () => {
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    )
    expect(document.title).toBe('Weekly Updates — Gordi MOS')
  })

  it('OpsPage sets document.title to "Daily Log — Gordi MOS" (P2-3b)', () => {
    render(
      <MemoryRouter>
        <OpsPage />
      </MemoryRouter>,
    )
    expect(document.title).toBe('Daily Log — Gordi MOS')
  })
})
