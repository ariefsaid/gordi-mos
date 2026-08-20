import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// The /tasks page-shell oracles below were re-homed from the deleted TasksPage host onto
// the LIVE /tasks surface (TasksLayout → TasksWorkspace). AC-004 (document.title) +
// AC-007 (Tasks heading, no phase/roadmap wording) + the assembly left-align check are now
// proven against the real page the user sees.
//
// Ported for #192 (Tasks): the surface now lives at /work/tasks (not the retired /tasks) and
// TasksWorkspace requires OverlayHostProvider (the shared record-panel host, Stage 2). Both are
// architectural requirements of the CURRENT app, not a v4-vs-dev disagreement about what these
// three assertions should check — mirrors the render harness pages/tasks-layout.test.tsx already
// uses for the same component.

vi.mock('../lib/db/tasks', () => ({ listTasks: vi.fn(() => new Promise(() => {})), getTaskTitlesByIds: vi.fn(() => Promise.resolve([])) }))
vi.mock('../lib/db/objectives', () => ({ listObjectives: vi.fn(() => new Promise(() => {})) }))
vi.mock('../lib/db/work-lines', () => ({ listWorkLines: vi.fn(() => new Promise(() => {})) }))
vi.mock('../lib/comments/postComment', () => ({
  listComments: vi.fn(() => new Promise(() => {})),
  postComment: vi.fn(),
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
import { OverlayHostProvider } from '@/shell/overlay-host'

// Ported for #192 (Tasks): TasksWorkspace mounts under OverlayHostSlot/useOverlayHost (Stage 2's
// shared record-panel host) and lives at /work/tasks, not the bare /tasks path a direct <TasksLayout
// /> mount used before the port. Matches pages/tasks-layout.test.tsx's own render harness.
function renderTasksLayout() {
  return render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter initialEntries={['/work/tasks']}>
        <OverlayHostProvider>
          <Routes>
            <Route path="/work/tasks" element={<TasksLayout />} />
          </Routes>
        </OverlayHostProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

const mockPerson: PeopleRow = {
  id: 'p1', org_id: 'org', user_id: 'u1', full_name: 'Test User',
  email: null, must_change_password: false, archived_at: null,
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
    // Re-homed onto the LIVE /work/tasks surface (TasksLayout). listTasks is mocked pending so
    // the table stays loading, but the "Tasks" h1 + zero phase/roadmap wording hold.
    renderTasksLayout()
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/phase|roadmap|Phase 2/i)
  })


})

// FIX-3: Empty states are NOT text-centered (left-aligned per mockup anti-slop note)
describe('FIX-3: Empty state containers are left-aligned (not text-center)', () => {
  it('FIX-3: live /tasks assembly container does NOT have text-center class', () => {
    // Re-homed onto the LIVE /work/tasks surface (TasksLayout → TasksWorkspace .assembly).
    const { container } = renderTasksLayout()
    const assembly = container.querySelector('.assembly')
    expect(assembly).toBeTruthy()
    expect(assembly!.className).not.toMatch(/text-center/)
  })


})

// AC-004 title portion: section pages set document.title
describe('AC-004: Document title per section page', () => {
  it('AC-004: the live /tasks page (TasksLayout) sets document.title to "Tasks — Gordi MOS"', () => {
    renderTasksLayout()
    expect(document.title).toBe('Tasks — Gordi MOS')
  })


})
