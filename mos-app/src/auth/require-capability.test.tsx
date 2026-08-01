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

function renderGuard(initialEntry: string, capability: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<RequireCapability capability={capability} />}>
          <Route path="/objectives" element={<div data-testid="protected">Objectives</div>} />
          <Route path="/projects-processes" element={<div data-testid="protected">Projects</div>} />
        </Route>
        <Route path="/work/cascade" element={<div data-testid="cascade">Cascade</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireCapability', () => {
  it('AC-302: redirects a viewer without capabilities from /objectives to /work/cascade', () => {
    mockUseAuth.mockReturnValue(authed([]))
    renderGuard('/objectives', 'objective.manage')
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.getByTestId('cascade')).toBeInTheDocument()
  })

  it('AC-302: allows admin into /objectives', () => {
    mockUseAuth.mockReturnValue(authed(['admin']))
    renderGuard('/objectives', 'objective.manage')
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  it('AC-302: redirects ops_lead from /objectives without objective.manage', () => {
    mockUseAuth.mockReturnValue(authed(['ops_lead']))
    renderGuard('/objectives', 'objective.manage')
    expect(screen.getByTestId('cascade')).toBeInTheDocument()
  })

  it('AC-302: allows ops_lead into /projects-processes with workline.manage', () => {
    mockUseAuth.mockReturnValue(authed(['ops_lead']))
    renderGuard('/projects-processes', 'workline.manage')
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  it('AC-302: redirects while loading (no protected flash)', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as never)
    renderGuard('/objectives', 'objective.manage')
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.getByTestId('cascade')).toBeInTheDocument()
  })
})
