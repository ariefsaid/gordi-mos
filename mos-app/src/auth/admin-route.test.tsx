// AdminRoute guard tests — TDD, plan §4.1.
// AC-070 (route arm): admin sees outlet; non-admin redirected to /.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('./use-auth')
import { useAuth } from './use-auth'

import { AdminRoute } from './admin-route'

const mockUseAuth = vi.mocked(useAuth)

function AdminContent() {
  return <div data-testid="admin-content">Admin area</div>
}

function HomePage() {
  return <div data-testid="home-page">Home</div>
}

function renderAdminRoute() {
  return render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <Routes>
        <Route element={<AdminRoute />}>
          <Route path="/admin/users" element={<AdminContent />} />
        </Route>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminRoute (AC-070 route arm)', () => {
  it('AC-070: admin viewer sees the protected content', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p1',
          org_id: 'o1',
          user_id: 'u1',
          full_name: 'Admin User',
          email: 'admin@gordi.id',
          archived_at: null,
          created_at: '',
          updated_at: '',
        },
        roles: [],
        isManager: false,
        accessRoles: ['admin'],
      },
      signOut: vi.fn(),
    })

    renderAdminRoute()
    expect(screen.getByTestId('admin-content')).toBeInTheDocument()
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument()
  })

  it('AC-070: admin with multiple roles (including admin) sees protected content', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p1',
          org_id: 'o1',
          user_id: 'u1',
          full_name: 'Admin User',
          email: null,
          archived_at: null,
          created_at: '',
          updated_at: '',
        },
        roles: [],
        isManager: false,
        accessRoles: ['member', 'admin', 'ops_lead'],
      },
      signOut: vi.fn(),
    })

    renderAdminRoute()
    expect(screen.getByTestId('admin-content')).toBeInTheDocument()
  })

  it('AC-070: member (no admin role) is redirected to /', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p2',
          org_id: 'o1',
          user_id: 'u2',
          full_name: 'Member User',
          email: null,
          archived_at: null,
          created_at: '',
          updated_at: '',
        },
        roles: [],
        isManager: false,
        accessRoles: ['member'],
      },
      signOut: vi.fn(),
    })

    renderAdminRoute()
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('home-page')).toBeInTheDocument()
  })

  it('AC-070: ops_lead without admin role is redirected to /', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p3',
          org_id: 'o1',
          user_id: 'u3',
          full_name: 'Ops Lead',
          email: null,
          archived_at: null,
          created_at: '',
          updated_at: '',
        },
        roles: [],
        isManager: false,
        accessRoles: ['ops_lead'],
      },
      signOut: vi.fn(),
    })

    renderAdminRoute()
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('home-page')).toBeInTheDocument()
  })

  it('AC-070: loading state redirects to / (no admin content shown)', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' })

    renderAdminRoute()
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('home-page')).toBeInTheDocument()
  })

  it('AC-070: unauthenticated state redirects to /', () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })

    renderAdminRoute()
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('home-page')).toBeInTheDocument()
  })
})
