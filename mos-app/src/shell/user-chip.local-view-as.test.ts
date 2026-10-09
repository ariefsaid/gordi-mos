import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/auth/use-auth')
vi.mock('@/theme/theme-provider')
vi.mock('@/lib/db/admin-users', () => ({ listAdminPeople: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithPassword: vi.fn() } } }))
import { useAuth } from '@/auth/use-auth'
import { useThemeContext } from '@/theme/theme-provider'
import { listAdminPeople } from '@/lib/db/admin-users'
import { supabase } from '@/lib/supabase'
import { UserChip } from './user-chip'

const mockUseAuth = vi.mocked(useAuth)
const mockUseThemeContext = vi.mocked(useThemeContext)
const mockListAdminPeople = vi.mocked(listAdminPeople)
const mockSignIn = vi.mocked(supabase.auth.signInWithPassword)
const originalId = 'person-dina'
const people = [
  { id: originalId, full_name: 'Dina Pratiwi', email: 'dina@example.test', archived_at: null, login: 'active', access_roles: ['admin'], jabatan: [{ role_id: 'r1', role_name: 'Kitchen Lead' }], revenue_scope: [], teams: [] },
  { id: 'person-andi', full_name: 'Andi Saputra', email: 'andi@example.test', archived_at: null, login: 'active', access_roles: ['member'], jabatan: [{ role_id: 'r2', role_name: 'Barista' }], revenue_scope: [], teams: [] },
  { id: 'person-budi', full_name: 'Budi Santoso', email: 'budi@example.test', archived_at: null, login: 'active', access_roles: ['member'], jabatan: [{ role_id: 'r3', role_name: 'Barista' }], revenue_scope: [], teams: [] },
  { id: 'person-riri', full_name: 'Riri', email: 'riri@example.test', archived_at: null, login: 'active', access_roles: ['member'], jabatan: [{ role_id: 'r4', role_name: 'Kitchen Lead' }], revenue_scope: [], teams: [] },
  { id: 'person-sari', full_name: 'Sari Indah', email: 'sari@example.test', archived_at: null, login: 'none', access_roles: ['member'], jabatan: [], revenue_scope: [], teams: [] },
]
const role = (name: string) => ({ id: 'r1', org_id: 'org-1', business_unit_id: 'bu-1', name, reports_to_role_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' })
const authState = (id = originalId, name = 'Dina Pratiwi') => ({
  status: 'authenticated' as const,
  viewer: { person: { id, org_id: 'org-1', user_id: `auth-${id}`, full_name: name }, roles: id === originalId ? [role('Kitchen Lead')] : [], isManager: false, accessRoles: [], affiliated: [] },
  signOut: vi.fn(),
})
const renderChip = () => render(createElement(MemoryRouter, null, createElement(UserChip)))

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  vi.stubEnv('VITE_LOCAL_VIEW_AS_PASSWORD', 'local-test-password')
  mockUseAuth.mockReturnValue(authState() as never)
  mockUseThemeContext.mockReturnValue({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() })
  mockListAdminPeople.mockResolvedValue(people as never)
  mockSignIn.mockResolvedValue({ data: { user: null, session: null }, error: null } as never)
})
afterEach(() => vi.unstubAllEnvs())

describe('local development view-as menu', () => {
  it('lists logged-in coworkers in role/name order and signs in with the chosen email', async () => {
    const user = userEvent.setup()
    renderChip()
    await user.click(screen.getByRole('button', { name: 'Dina Pratiwi' }))

    const andi = await screen.findByRole('menuitem', { name: 'Andi Saputra — Barista' })
    const budi = screen.getByRole('menuitem', { name: 'Budi Santoso — Barista' })
    const riri = screen.getByRole('menuitem', { name: 'Riri — Kitchen Lead' })
    expect(andi.compareDocumentPosition(budi) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(budi.compareDocumentPosition(riri) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /sari indah/i })).not.toBeInTheDocument()
    await user.click(budi)

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith({ email: 'budi@example.test', password: 'local-test-password' }))
  })

  it('clears the cached return account when signing out', async () => {
    const mockSignOut = vi.fn()
    mockUseAuth.mockReturnValue({ ...authState(), signOut: mockSignOut } as never)
    const user = userEvent.setup()
    renderChip()
    await user.click(screen.getByRole('button', { name: 'Dina Pratiwi' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Budi Santoso — Barista' }))
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledOnce())
    expect(sessionStorage.length).toBe(2)

    await user.click(screen.getByRole('button', { name: 'Dina Pratiwi' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))

    expect(sessionStorage.length).toBe(0)
    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('returns to the original account from the cached list', async () => {
    const user = userEvent.setup()
    const { unmount } = renderChip()
    await user.click(screen.getByRole('button', { name: 'Dina Pratiwi' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Budi Santoso — Barista' }))
    await waitFor(() => expect(mockSignIn).toHaveBeenNthCalledWith(1, { email: 'budi@example.test', password: 'local-test-password' }))

    unmount()
    mockUseAuth.mockReturnValue(authState('person-budi', 'Budi Santoso') as never)
    renderChip()
    await user.click(screen.getByRole('button', { name: 'Budi Santoso' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Back to Dina Pratiwi' }))

    await waitFor(() => expect(mockSignIn).toHaveBeenNthCalledWith(2, { email: 'dina@example.test', password: 'local-test-password' }))
    expect(mockListAdminPeople).toHaveBeenCalledOnce()
    expect(sessionStorage.length).toBe(0)
  })
})
