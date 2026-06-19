import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../auth/useAuth')
import { useAuth } from '@/auth/useAuth'

const mockUseAuth = vi.mocked(useAuth)

import AppShell from './AppShell'

function renderShell(path = '/') {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
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
  })

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div role="main">page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

// AC-015: exactly one nav landmark named "Primary", one banner, one main
describe('AC-015: Shell landmarks', () => {
  it('has exactly one navigation landmark named "Primary"', () => {
    renderShell()
    const navs = screen.getAllByRole('navigation', { name: 'Primary' })
    expect(navs).toHaveLength(1)
  })

  it('has exactly one banner landmark', () => {
    renderShell()
    const banners = screen.getAllByRole('banner')
    expect(banners).toHaveLength(1)
  })

  it('has exactly one main landmark (owned by the page/outlet, not the shell)', () => {
    renderShell()
    const mains = screen.getAllByRole('main')
    expect(mains).toHaveLength(1)
  })

  it('renders outlet content', () => {
    renderShell()
    expect(screen.getByText('page')).toBeInTheDocument()
  })
})
