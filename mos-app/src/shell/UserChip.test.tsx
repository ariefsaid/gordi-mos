import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../auth/useAuth')
import { useAuth } from '@/auth/useAuth'

const mockUseAuth = vi.mocked(useAuth)

// We import after mock to get the mocked version
import { UserChip } from './UserChip'

const baseViewer = {
  person: {
    id: '40000000-0000-0000-0000-000000000001',
    org_id: '10000000-0000-0000-0000-000000000001',
    user_id: 'auth-user-001',
    full_name: 'Dina Pratiwi',
    email: 'dina@gordi.id',
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  isManager: false,
}

const signOut = vi.fn()

function makeRole(id: string, name: string) {
  return {
    id,
    org_id: '10000000-0000-0000-0000-000000000001',
    business_unit_id: '20000000-0000-0000-0000-000000000001',
    name,
    reports_to_role_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// AC-005: user chip + keyboard sign-out menu
describe('AC-005: UserChip and sign-out menu', () => {
  it('shows initials "DP", name "Dina Pratiwi", role "Kitchen Lead"', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: { ...baseViewer, roles: [makeRole('r1', 'Kitchen Lead')] },
      signOut,
    })
    render(<UserChip />)
    expect(screen.getByText('DP')).toBeInTheDocument()
    expect(screen.getByText('Dina Pratiwi')).toBeInTheDocument()
    expect(screen.getByText('Kitchen Lead')).toBeInTheDocument()
  })

  it('opens menu on Enter key and shows Sign out item', async () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: { ...baseViewer, roles: [makeRole('r1', 'Kitchen Lead')] },
      signOut,
    })
    const user = userEvent.setup()
    render(<UserChip />)
    const chip = screen.getByRole('button', { name: /dina pratiwi/i })
    chip.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
  })

  it('Escape closes menu and returns focus to chip', async () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: { ...baseViewer, roles: [makeRole('r1', 'Kitchen Lead')] },
      signOut,
    })
    const user = userEvent.setup()
    render(<UserChip />)
    const chip = screen.getByRole('button', { name: /dina pratiwi/i })
    chip.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(chip).toHaveFocus()
  })

  it('clicking Sign out calls signOut once', async () => {
    const mockSignOut = vi.fn().mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: { ...baseViewer, roles: [makeRole('r1', 'Kitchen Lead')] },
      signOut: mockSignOut,
    })
    const user = userEvent.setup()
    render(<UserChip />)
    const chip = screen.getByRole('button', { name: /dina pratiwi/i })
    chip.focus()
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
  })
})

// AC-006: role-title rule
describe('AC-006: Role-title rule', () => {
  it('(a) shows earliest-assigned role (roles[0]) when viewer has two roles', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        ...baseViewer,
        roles: [makeRole('r1', 'Floor Lead'), makeRole('r2', 'Kitchen Lead')],
      },
      signOut,
    })
    render(<UserChip />)
    expect(screen.getByText('Floor Lead')).toBeInTheDocument()
    expect(screen.queryByText('Kitchen Lead')).not.toBeInTheDocument()
  })

  it('(b) shows only name, no role line when viewer has zero roles', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: { ...baseViewer, roles: [] },
      signOut,
    })
    render(<UserChip />)
    expect(screen.getByText('Dina Pratiwi')).toBeInTheDocument()
    // No role text rendered at all
    expect(screen.queryByText(/Lead|Manager|Director/i)).not.toBeInTheDocument()
  })
})
