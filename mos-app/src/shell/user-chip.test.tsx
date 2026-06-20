import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../auth/use-auth')
vi.mock('../theme/theme-provider')
import { useAuth } from '@/auth/use-auth'
import { useThemeContext } from '@/theme/theme-provider'

const mockUseAuth = vi.mocked(useAuth)
const mockUseThemeContext = vi.mocked(useThemeContext)

// We import after mock to get the mocked version
import { UserChip } from './user-chip'

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
  accessRoles: [],
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
  // Provide a default theme context so AppearanceControl renders without throwing
  mockUseThemeContext.mockReturnValue({
    theme: 'light',
    resolvedTheme: 'light',
    setTheme: vi.fn(),
  })
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

  // AC-D03 (RI-3, ADR-0013 D2): the identity-bearing user name is a single-line string —
  // it must ellipsize (truncate) AND carry a `title` so the full name is recoverable on hover
  // when clipped (no-bleed regression).
  it('AC-D03: user name truncates and carries a title attribute', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: { ...baseViewer, roles: [makeRole('r1', 'Kitchen Lead')] },
      signOut,
    })
    render(<UserChip />)
    const name = screen.getByText('Dina Pratiwi')
    expect(name.className).toMatch(/truncate/)
    expect(name.getAttribute('title')).toBe('Dina Pratiwi')
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

// AC-138 integration: appearance control in the account menu
describe('AC-138: Appearance control is in the account menu above Sign out', () => {
  it('menu shows Light / Dark / System radios when opened', async () => {
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
    expect(screen.getByRole('menuitemradio', { name: /light/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /dark/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /system/i })).toBeInTheDocument()
  })

  it('clicking a theme option keeps menu open', async () => {
    const setThemeMock = vi.fn()
    mockUseThemeContext.mockReturnValue({
      theme: 'light',
      resolvedTheme: 'light',
      setTheme: setThemeMock,
    })
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: { ...baseViewer, roles: [makeRole('r1', 'Kitchen Lead')] },
      signOut,
    })
    const user = userEvent.setup()
    render(<UserChip />)
    await user.click(screen.getByRole('button', { name: /dina pratiwi/i }))
    await user.click(screen.getByRole('menuitemradio', { name: /dark/i }))
    // Menu stays open after selecting a theme option
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(setThemeMock).toHaveBeenCalledWith('dark')
  })

  it('Sign out appears below the appearance options (separator present)', async () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: { ...baseViewer, roles: [makeRole('r1', 'Kitchen Lead')] },
      signOut,
    })
    const user = userEvent.setup()
    render(<UserChip />)
    await user.click(screen.getByRole('button', { name: /dina pratiwi/i }))
    // Both appearance and sign out are in the menu
    expect(screen.getByRole('menuitemradio', { name: /light/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
    // Separator present (aria-hidden so not in the accessible tree; verify via DOM)
    const menu = screen.getByRole('menu')
    expect(menu.querySelector('[role="separator"]')).toBeInTheDocument()
  })
})
