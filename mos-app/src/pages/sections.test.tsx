import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import UpdatesPage from './UpdatesPage'
import OpsPage from './OpsPage'

// TasksPage is now a full list page (P2-1b); its section-level assertions moved to
// TasksPage.test.tsx (AC-060..067). The title + no-phase-wording tests below remain valid
// and are covered in AC-004 below.

vi.mock('../lib/db/tasks', () => ({ listTasks: vi.fn(() => new Promise(() => {})) }))
import TasksPage from './TasksPage'
import { AuthContext } from '../auth/context'
import type { PeopleRow, RolesRow } from '../lib/database.types'
import type { AuthState } from '../auth/context'

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
  viewer: { person: mockPerson, roles: [mockRole], isManager: false },
  signOut: async () => {},
}

// AC-007: section empty shells render correct copy with no roadmap/phase wording
describe('AC-007: Section empty shells', () => {
  it('TasksPage: title "Tasks" heading is present, no phase/roadmap wording', () => {
    // TasksPage now shows loading skeleton (data layer mocked to pending) but still
    // renders the "Tasks" h1 and has no phase wording.
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter>
          <TasksPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/phase|roadmap|Phase 2/i)
  })

  it('UpdatesPage: title "Weekly update" heading is present, no phase wording (P2-2b replaces placeholder)', () => {
    // P2-2b: UpdatesPage is now the live write-pane; placeholder copy is gone.
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Weekly update' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/phase|roadmap|Phase 2/i)
  })

  it('OpsPage: title "Ops", empty headline, explainer, no phase wording', () => {
    render(
      <MemoryRouter>
        <OpsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Ops' })).toBeInTheDocument()
    expect(screen.getByText('No ops events yet.')).toBeInTheDocument()
    expect(
      screen.getByText('Events from the floor will show up here as they\'re logged.'),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/phase|roadmap|coming soon|Phase 2/i)
  })
})

// FIX-3: Empty states are NOT text-centered (left-aligned per mockup anti-slop note)
describe('FIX-3: Empty state containers are left-aligned (not text-center)', () => {
  it('TasksPage assembly container does NOT have text-center class', () => {
    // TasksPage now renders a .assembly container (card assembly per design-plan).
    const { container } = render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter>
          <TasksPage />
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
    const emptyDiv = container.querySelector('.bg-card.border.border-border.rounded-md')
    expect(emptyDiv).toBeTruthy()
    expect(emptyDiv!.className).not.toMatch(/text-center/)
  })

  it('OpsPage empty container does NOT have text-center class', () => {
    const { container } = render(
      <MemoryRouter>
        <OpsPage />
      </MemoryRouter>,
    )
    const emptyDiv = container.querySelector('.bg-card.border.border-border.rounded-md')
    expect(emptyDiv).toBeTruthy()
    expect(emptyDiv!.className).not.toMatch(/text-center/)
  })
})

// AC-004 title portion: section pages set document.title
describe('AC-004: Document title per section page', () => {
  it('TasksPage sets document.title to "Tasks — Gordi MOS"', () => {
    render(
      <AuthContext.Provider value={authedState}>
        <MemoryRouter>
          <TasksPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(document.title).toBe('Tasks — Gordi MOS')
  })

  it('UpdatesPage sets document.title to "Weekly update — Gordi MOS" (P2-2b page title)', () => {
    render(
      <MemoryRouter>
        <UpdatesPage />
      </MemoryRouter>,
    )
    expect(document.title).toBe('Weekly update — Gordi MOS')
  })

  it('OpsPage sets document.title to "Ops — Gordi MOS"', () => {
    render(
      <MemoryRouter>
        <OpsPage />
      </MemoryRouter>,
    )
    expect(document.title).toBe('Ops — Gordi MOS')
  })
})
