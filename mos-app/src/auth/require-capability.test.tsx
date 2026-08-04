import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('./use-auth')
import { useAuth } from './use-auth'
import { RequireCapability } from './require-capability'

const mockUseAuth = vi.mocked(useAuth)

function authed(accessRoles: string[]) {
  return {
    status: 'authenticated' as const,
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'U', email: null,
        must_change_password: false,
        archived_at: null, created_at: '', updated_at: '',
      },
      roles: [],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  }
}

// The harness mounts BOTH the surviving bounce target (/tasks — reachable by every authenticated
// viewer) and the deleted cascade path, so a test can tell the two destinations apart. `dead`
// rendering at all means the guard still points at a route the app no longer serves (#179, OD-WAY-32).
function renderGuard(initialEntry: string, capability: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<RequireCapability capability={capability} />}>
          <Route path="/work/objectives" element={<div data-testid="protected">Objectives</div>} />
          <Route path="/work/projects-processes" element={<div data-testid="protected">Projects</div>} />
        </Route>
        <Route path="/tasks" element={<div data-testid="tasks">Tasks</div>} />
        <Route path="/work/cascade" element={<div data-testid="dead">Cascade</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireCapability', () => {
  it('AC-002 (#179): a viewer without the capability lands on /tasks, never on the cut cascade path', () => {
    mockUseAuth.mockReturnValue(authed([]))
    renderGuard('/work/objectives', 'objective.manage')
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.getByTestId('tasks')).toBeInTheDocument()
    expect(screen.queryByTestId('dead')).not.toBeInTheDocument()
  })

  it('AC-302: allows admin into /work/objectives', () => {
    mockUseAuth.mockReturnValue(authed(['admin']))
    renderGuard('/work/objectives', 'objective.manage')
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  it('AC-302: redirects ops_lead from /work/objectives without objective.manage', () => {
    mockUseAuth.mockReturnValue(authed(['ops_lead']))
    renderGuard('/work/objectives', 'objective.manage')
    expect(screen.getByTestId('tasks')).toBeInTheDocument()
    expect(screen.queryByTestId('dead')).not.toBeInTheDocument()
  })

  it('AC-302: allows ops_lead into /work/projects-processes with workline.manage', () => {
    mockUseAuth.mockReturnValue(authed(['ops_lead']))
    renderGuard('/work/projects-processes', 'workline.manage')
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  it('AC-302: redirects while loading (no protected flash)', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as never)
    renderGuard('/work/objectives', 'objective.manage')
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.getByTestId('tasks')).toBeInTheDocument()
    expect(screen.queryByTestId('dead')).not.toBeInTheDocument()
  })
})
