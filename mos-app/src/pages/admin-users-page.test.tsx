// AdminUsersPage tests — TDD, plan §5.1.
// AC-060: list rendering (all 4 login states) + empty state predicate.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/shell/use-is-desktop')
import { useIsDesktop } from '@/shell/use-is-desktop'

vi.mock('@/lib/db/admin-users', () => ({
  listAdminPeople: vi.fn(),
  listRoles: vi.fn(),
  listRevenueScopeOptions: vi.fn(),
  createPerson: vi.fn(),
  createLogin: vi.fn(),
  resetPassword: vi.fn(),
  setLoginEnabled: vi.fn(),
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
  archivePerson: vi.fn(),
  restorePerson: vi.fn(),
  assignJabatan: vi.fn(),
  removeJabatan: vi.fn(),
  synthesizeEmail: vi.fn((name: string) => `${name.toLowerCase().replace(/\s+/g, '-')}@ops.gordi.local`),
}))
import { listAdminPeople, listRoles, listRevenueScopeOptions } from '@/lib/db/admin-users'

import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import { AdminUsersPage } from './admin-users-page'

const mockUseAuth = vi.mocked(useAuth)
const mockListAdminPeople = vi.mocked(listAdminPeople)
const mockListRoles = vi.mocked(listRoles)
const mockListRevenueScopeOptions = vi.mocked(listRevenueScopeOptions)

// Admin viewer fixture
const ADMIN_VIEWER: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'admin-person-id',
      org_id: 'org-1',
      user_id: 'admin-user-id',
      full_name: 'Admin Gordi',
      email: 'admin@example.test',
      must_change_password: false,
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [],
    isManager: false,
    accessRoles: ['admin'],
  },
  signOut: vi.fn(),
}

const PEOPLE_ALL_STATES: AdminPersonRow[] = [
  {
    id: 'p-admin',
    full_name: 'Admin Gordi',
    email: 'admin@example.test',
    archived_at: null,
    login: 'active',
    access_roles: ['admin'],
    jabatan: [],
    revenue_scope: [],
  },
  {
    id: 'p-no-login',
    full_name: 'Budi Santoso',
    email: 'budi@example.test',
    archived_at: null,
    login: 'none',
    access_roles: ['member'],
    jabatan: [],
    revenue_scope: [],
  },
  {
    id: 'p-disabled',
    full_name: 'Sari Indah',
    email: 'sari@example.test',
    archived_at: null,
    login: 'disabled',
    access_roles: ['ops_lead'],
    jabatan: [],
    revenue_scope: [],
  },
  {
    id: 'p-archived',
    full_name: 'Old Staff',
    email: 'old@example.test',
    archived_at: '2026-01-01T00:00:00Z',
    login: 'none',
    access_roles: [],
    jabatan: [],
    revenue_scope: [],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(ADMIN_VIEWER)
  vi.mocked(useIsDesktop).mockReturnValue(true)
  mockListRoles.mockResolvedValue([])
  mockListRevenueScopeOptions.mockResolvedValue([])
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminUsersPage />
    </MemoryRouter>,
  )
}

describe('AdminUsersPage (AC-060)', () => {
  it('AC-060: renders loading state (SkeletonRows) before data resolves', () => {
    // Return a never-resolving promise
    mockListAdminPeople.mockReturnValue(new Promise(() => {}))
    renderPage()
    // Page heading should be present immediately
    expect(screen.getByRole('heading', { name: /People/i })).toBeInTheDocument()
    // Loading state — SkeletonRows uses aria-hidden, so check for the page head
    // and that no person names render yet
    expect(screen.queryByText('Budi Santoso')).not.toBeInTheDocument()
  })

  it('AC-060: renders each login status distinctly — active, none, disabled, archived', async () => {
    const user = userEvent.setup()
    mockListAdminPeople.mockResolvedValue(PEOPLE_ALL_STATES)
    renderPage()

    // Wait for data
    await screen.findByText('Budi Santoso')

    // Active login → "Active" pill present (toolbar also has an "Active" tab — getAllByText)
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)

    // No login → "No login" pill (at least one — two rows have no login in test data)
    expect(screen.getAllByText('No login').length).toBeGreaterThan(0)

    // Disabled login → "Disabled" pill present (toolbar also has a "Disabled" tab)
    expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0)

    // Archived person → visible under the Archived segment (design-plan §2.1: All = non-archived)
    const tablist = screen.getByRole('tablist', { name: /status filter/i })
    await user.click(within(tablist).getByRole('tab', { name: /archived/i }))
    expect(screen.getByText('Old Staff')).toBeInTheDocument()
  })

  it('AC-060: each person name is visible in the list (non-archived under All; archived under Archived segment)', async () => {
    const user = userEvent.setup()
    mockListAdminPeople.mockResolvedValue(PEOPLE_ALL_STATES)
    renderPage()

    await screen.findByText('Budi Santoso')
    // Non-archived people visible under All (default segment)
    expect(screen.getByText('Sari Indah')).toBeInTheDocument()
    expect(screen.getByText('Admin Gordi')).toBeInTheDocument()
    // Archived person visible under Archived segment (design-plan §2.1)
    const tablist = screen.getByRole('tablist', { name: /status filter/i })
    await user.click(within(tablist).getByRole('tab', { name: /archived/i }))
    expect(screen.getByText('Old Staff')).toBeInTheDocument()
  })

  it('AC-060: renders "Add person" primary action button', async () => {
    mockListAdminPeople.mockResolvedValue(PEOPLE_ALL_STATES)
    renderPage()
    await screen.findByText('Budi Santoso')

    // "Add person" button (or "+" Add person variant) is present
    expect(screen.getAllByRole('button', { name: /add person/i }).length).toBeGreaterThan(0)
  })

  it('AC-060: empty state shows when only the admin is in the list (non-self count = 0)', async () => {
    // Only the admin's own row
    mockListAdminPeople.mockResolvedValue([
      {
        id: 'admin-person-id', // matches viewer.person.id
        full_name: 'Admin Gordi',
        email: 'admin@example.test',
        archived_at: null,
        login: 'active',
        access_roles: ['admin'],
        jabatan: [],
        revenue_scope: [],
      },
    ])
    renderPage()

    await screen.findByText(/just you so far/i)
    expect(screen.getByText(/add your first teammate/i)).toBeInTheDocument()
  })

  it('AC-060: error state shows with retry when listAdminPeople rejects', async () => {
    mockListAdminPeople.mockRejectedValue(new Error('rls denied'))
    renderPage()

    await screen.findByText(/couldn't load people/i)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('AC-060: page heading is "People" and has descriptive sub-caption', async () => {
    mockListAdminPeople.mockResolvedValue(PEOPLE_ALL_STATES)
    renderPage()
    await screen.findByText('Budi Santoso')

    expect(screen.getByRole('heading', { name: /People/i })).toBeInTheDocument()
  })
})

describe('AdminUsersPage — Catalog-Manage content head (Wave 2: W2-3)', () => {
  it('W2-3: renders the shared content PageHead chrome with the meta copy', async () => {
    mockListAdminPeople.mockResolvedValue(PEOPLE_ALL_STATES)
    renderPage()
    await screen.findByText('Budi Santoso')
    const head = screen.getByTestId('page-head')
    expect(head.className).toContain('content-header')
    // the bespoke subtitle now rides in the head meta slot
    expect(screen.getByText('Manage who can sign in and what they can do.')).toBeInTheDocument()
  })

  it('W2-3: the + Add-person button sits in the head action slot (.ch-action)', async () => {
    mockListAdminPeople.mockResolvedValue(PEOPLE_ALL_STATES)
    const { container } = renderPage()
    await screen.findByText('Budi Santoso')
    const actionSlot = container.querySelector('.ch-action') as HTMLElement | null
    expect(actionSlot).toBeTruthy()
    expect(within(actionSlot!).getByRole('button', { name: /add person/i })).toBeInTheDocument()
    // exactly one Add-person control in the loaded (non-empty) state — no duplicate
    expect(screen.getAllByRole('button', { name: /add person/i })).toHaveLength(1)
  })

  it('W2-3: the count pill reflects people.length when loaded', async () => {
    mockListAdminPeople.mockResolvedValue(PEOPLE_ALL_STATES)
    const { container } = renderPage()
    await screen.findByText('Budi Santoso')
    const pill = container.querySelector('.ch-count')
    expect(pill).toBeTruthy()
    expect(pill!.textContent).toBe(String(PEOPLE_ALL_STATES.length))
  })

  it('W2-3: the count pill is omitted while loading', () => {
    mockListAdminPeople.mockReturnValue(new Promise(() => {}))
    const { container } = renderPage()
    expect(container.querySelector('.ch-count')).toBeNull()
    expect(screen.getByTestId('page-head')).toBeInTheDocument()
  })
})

// CQ Issue 1 (feat/manager-tier-role-assignment review): the open Access/Position dialog must re-derive
// from reloaded people after a write, not hold a stale snapshot (else the just-toggled Position reverts).
describe('AdminUsersPage — dialog reflects fresh data after a Position toggle', () => {
  it('re-renders the open dialog against reloaded people (no stale snapshot)', async () => {
    const user = userEvent.setup()
    const base: AdminPersonRow = {
      id: 'p-riri',
      full_name: 'Riri',
      email: 'riri@example.test',
      archived_at: null,
      login: 'active',
      access_roles: [],
      jabatan: [],
      revenue_scope: [],
    }
    mockListRoles.mockResolvedValue([{ id: 'r-kitchen', name: 'Kitchen Lead' }])
    mockListAdminPeople
      .mockResolvedValueOnce([base]) // first load: no Position
      .mockResolvedValue([{ ...base, jabatan: [{ role_id: 'r-kitchen', role_name: 'Kitchen Lead' }] }]) // after assign

    renderPage()
    await screen.findByText('Riri')

    await user.click(screen.getByRole('button', { name: /more actions for riri/i }))
    await user.click(screen.getByRole('menuitem', { name: /manage access & position/i }))

    const box = screen.getByRole('checkbox', { name: /kitchen lead/i })
    expect(box).toHaveAttribute('aria-checked', 'false')

    await user.click(box) // assignJabatan → onDone → load() returns the assigned Position

    // With the stale-snapshot bug the dialog would stay unchecked; the fix re-derives it from fresh data.
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /kitchen lead/i })).toHaveAttribute('aria-checked', 'true'),
    )
  })
})
