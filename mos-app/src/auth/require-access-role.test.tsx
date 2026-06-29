// RequireAccessRole guard tests (OD-C-2). Generic anyOf gate nested under
// ProtectedRoute: a session holding ANY listed role sees the outlet, else → /.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('./use-auth')
import { useAuth } from './use-auth'
import { RequireAccessRole } from './require-access-role'

const mockUseAuth = vi.mocked(useAuth)

function authed(accessRoles: string[]) {
  return {
    status: 'authenticated' as const,
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'U', email: null,
        archived_at: null, created_at: '', updated_at: '',
      },
      roles: [],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  }
}

function renderGuard(anyOf: string[]) {
  return render(
    <MemoryRouter initialEntries={['/catalog']}>
      <Routes>
        <Route element={<RequireAccessRole anyOf={anyOf} />}>
          <Route path="/catalog" element={<div data-testid="content">Catalog</div>} />
        </Route>
        <Route path="/" element={<div data-testid="home">Home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAccessRole', () => {
  it('shows the outlet when the viewer holds the single required role', () => {
    mockUseAuth.mockReturnValue(authed(['admin']))
    renderGuard(['admin'])
    expect(screen.getByTestId('content')).toBeInTheDocument()
  })

  it('shows the outlet when the viewer holds ANY of the allowed roles', () => {
    mockUseAuth.mockReturnValue(authed(['ops_lead']))
    renderGuard(['ops_lead', 'admin'])
    expect(screen.getByTestId('content')).toBeInTheDocument()
  })

  it('redirects to / when the viewer holds none of the allowed roles', () => {
    mockUseAuth.mockReturnValue(authed(['member']))
    renderGuard(['ops_lead', 'admin'])
    expect(screen.queryByTestId('content')).not.toBeInTheDocument()
    expect(screen.getByTestId('home')).toBeInTheDocument()
  })

  it('redirects to / while loading (no protected content flash)', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as never)
    renderGuard(['admin'])
    expect(screen.queryByTestId('content')).not.toBeInTheDocument()
    expect(screen.getByTestId('home')).toBeInTheDocument()
  })
})
