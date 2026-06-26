// AdminUsersPage rework tests — items 2, 6, 7, 9.
// Covers: confirm gates (reset/disable/archive), success toasts,
//         aria-describedby on alertdialog reveal.
// These extend (not replace) admin-users-page.test.tsx.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/shell/use-is-desktop')
import { useIsDesktop } from '@/shell/use-is-desktop'

vi.mock('@/lib/db/admin-users', () => ({
  listAdminPeople: vi.fn(),
  createPerson: vi.fn(),
  createLogin: vi.fn(),
  resetPassword: vi.fn(),
  setLoginEnabled: vi.fn(),
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
  archivePerson: vi.fn(),
  restorePerson: vi.fn(),
  synthesizeEmail: vi.fn((name: string) => `${name.toLowerCase().replace(/\s+/g, '-')}@ops.gordi.local`),
}))
import {
  listAdminPeople,
  resetPassword,
  setLoginEnabled,
  archivePerson,
  restorePerson,
} from '@/lib/db/admin-users'

import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import { AdminUsersPage } from './admin-users-page'

const mockUseAuth = vi.mocked(useAuth)
const mockListAdminPeople = vi.mocked(listAdminPeople)
const mockResetPassword = vi.mocked(resetPassword)
const mockSetLoginEnabled = vi.mocked(setLoginEnabled)
const mockArchivePerson = vi.mocked(archivePerson)
const mockRestorePerson = vi.mocked(restorePerson)

const ADMIN_VIEWER: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'admin-person-id',
      org_id: 'org-1',
      user_id: 'admin-user-id',
      full_name: 'Admin Gordi',
      email: 'admin@gordi.id',
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

const TWO_PEOPLE: AdminPersonRow[] = [
  {
    id: 'admin-person-id',
    full_name: 'Admin Gordi',
    email: 'admin@gordi.id',
    archived_at: null,
    login: 'active',
    access_roles: ['admin'],
  },
  {
    id: 'p-member',
    full_name: 'Budi Santoso',
    email: 'budi@gordi.id',
    archived_at: null,
    login: 'active',
    access_roles: ['member'],
  },
]

const ARCHIVED_PERSON: AdminPersonRow = {
  id: 'p-archived',
  full_name: 'Dewi Rahayu',
  email: 'dewi@gordi.id',
  archived_at: '2026-01-01T00:00:00Z',
  login: 'disabled',
  access_roles: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(ADMIN_VIEWER)
  vi.mocked(useIsDesktop).mockReturnValue(true) // desktop view
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminUsersPage />
    </MemoryRouter>,
  )
}

// ── Confirm gates (item 2) ─────────────────────────────────────────────────────

describe('AdminUsersPage — confirm dialogs', () => {
  it('reset-password opens a confirm dialog before firing the RPC', async () => {
    const user = userEvent.setup()
    mockListAdminPeople.mockResolvedValue(TWO_PEOPLE)
    renderPage()

    await screen.findByText('Budi Santoso')

    // Open ⋯ menu for Budi
    await user.click(screen.getByRole('button', { name: /more actions for budi santoso/i }))
    await user.click(screen.getByRole('menuitem', { name: /reset password/i }))

    // Confirm dialog should appear — RPC NOT called yet
    expect(screen.getByRole('dialog', { name: /reset/i })).toBeInTheDocument()
    expect(mockResetPassword).not.toHaveBeenCalled()
  })

  it('reset-password fires RPC after confirm button is clicked', async () => {
    const user = userEvent.setup()
    mockListAdminPeople.mockResolvedValue(TWO_PEOPLE)
    mockResetPassword.mockResolvedValue('TmpPw1234')
    mockListAdminPeople.mockResolvedValueOnce(TWO_PEOPLE).mockResolvedValue(TWO_PEOPLE)
    renderPage()

    await screen.findByText('Budi Santoso')

    await user.click(screen.getByRole('button', { name: /more actions for budi santoso/i }))
    await user.click(screen.getByRole('menuitem', { name: /reset password/i }))

    // Click confirm in the dialog
    const confirmDialog = screen.getByRole('dialog', { name: /reset/i })
    const confirmBtn = within(confirmDialog).getByRole('button', { name: /reset password/i })
    await user.click(confirmBtn)

    await waitFor(() => expect(mockResetPassword).toHaveBeenCalledWith('p-member'))
  })

  it('disable-login opens a confirm dialog before firing the RPC', async () => {
    const user = userEvent.setup()
    mockListAdminPeople.mockResolvedValue(TWO_PEOPLE)
    renderPage()

    await screen.findByText('Budi Santoso')

    await user.click(screen.getByRole('button', { name: /more actions for budi santoso/i }))
    await user.click(screen.getByRole('menuitem', { name: /disable login/i }))

    expect(screen.getByRole('dialog', { name: /disable/i })).toBeInTheDocument()
    expect(mockSetLoginEnabled).not.toHaveBeenCalled()
  })

  it('archive opens a confirm dialog before firing the RPC', async () => {
    const user = userEvent.setup()
    mockListAdminPeople.mockResolvedValue(TWO_PEOPLE)
    renderPage()

    await screen.findByText('Budi Santoso')

    await user.click(screen.getByRole('button', { name: /more actions for budi santoso/i }))
    await user.click(screen.getByRole('menuitem', { name: /^archive$/i }))

    expect(screen.getByRole('dialog', { name: /archive/i })).toBeInTheDocument()
    expect(mockArchivePerson).not.toHaveBeenCalled()
  })

  it('enable-login fires directly without a confirm dialog', async () => {
    const user = userEvent.setup()
    const disabledPerson: AdminPersonRow = {
      ...TWO_PEOPLE[1],
      login: 'disabled',
    }
    mockListAdminPeople.mockResolvedValue([TWO_PEOPLE[0], disabledPerson])
    mockSetLoginEnabled.mockResolvedValue(undefined)
    renderPage()

    await screen.findByText('Budi Santoso')

    await user.click(screen.getByRole('button', { name: /more actions for budi santoso/i }))
    await user.click(screen.getByRole('menuitem', { name: /enable login/i }))

    // No confirm dialog — should fire directly
    await waitFor(() => expect(mockSetLoginEnabled).toHaveBeenCalledWith('p-member', true))
  })

  it('restore fires directly without a confirm dialog', async () => {
    const user = userEvent.setup()
    mockListAdminPeople.mockResolvedValue([TWO_PEOPLE[0], ARCHIVED_PERSON])
    mockRestorePerson.mockResolvedValue(undefined)
    renderPage()

    await screen.findByText('Dewi Rahayu')

    await user.click(screen.getByRole('button', { name: /more actions for dewi rahayu/i }))
    await user.click(screen.getByRole('menuitem', { name: /restore/i }))

    await waitFor(() => expect(mockRestorePerson).toHaveBeenCalledWith('p-archived'))
  })

  it('confirm dialog cancel does not call the RPC', async () => {
    const user = userEvent.setup()
    mockListAdminPeople.mockResolvedValue(TWO_PEOPLE)
    renderPage()

    await screen.findByText('Budi Santoso')

    await user.click(screen.getByRole('button', { name: /more actions for budi santoso/i }))
    await user.click(screen.getByRole('menuitem', { name: /^archive$/i }))

    // Cancel the confirm
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockArchivePerson).not.toHaveBeenCalled()
    // Dialog closed
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /archive/i })).not.toBeInTheDocument())
  })
})

// ── Success toasts (item 6) ────────────────────────────────────────────────────

describe('AdminUsersPage — success toasts', () => {
  it('shows a success toast after enable-login succeeds', async () => {
    const user = userEvent.setup()
    const disabledPerson: AdminPersonRow = { ...TWO_PEOPLE[1], login: 'disabled' }
    mockListAdminPeople.mockResolvedValue([TWO_PEOPLE[0], disabledPerson])
    mockSetLoginEnabled.mockResolvedValue(undefined)
    renderPage()

    await screen.findByText('Budi Santoso')

    await user.click(screen.getByRole('button', { name: /more actions for budi santoso/i }))
    await user.click(screen.getByRole('menuitem', { name: /enable login/i }))

    // Toast should appear
    await screen.findByRole('status')
    const toast = screen.getByRole('status')
    expect(toast.textContent).toMatch(/budi santoso|login enabled/i)
  })

  it('shows a success toast after restore succeeds', async () => {
    const user = userEvent.setup()
    mockListAdminPeople.mockResolvedValue([TWO_PEOPLE[0], ARCHIVED_PERSON])
    mockRestorePerson.mockResolvedValue(undefined)
    renderPage()

    await screen.findByText('Dewi Rahayu')

    await user.click(screen.getByRole('button', { name: /more actions for dewi rahayu/i }))
    await user.click(screen.getByRole('menuitem', { name: /restore/i }))

    await screen.findByRole('status')
    const toast = screen.getByRole('status')
    expect(toast.textContent).toMatch(/dewi rahayu|restored/i)
  })

  it('shows a success toast after archive is confirmed and succeeds', async () => {
    const user = userEvent.setup()
    mockListAdminPeople.mockResolvedValue(TWO_PEOPLE)
    mockArchivePerson.mockResolvedValue(undefined)
    renderPage()

    await screen.findByText('Budi Santoso')

    await user.click(screen.getByRole('button', { name: /more actions for budi santoso/i }))
    await user.click(screen.getByRole('menuitem', { name: /^archive$/i }))
    await user.click(screen.getByRole('button', { name: /archive/i }))

    await screen.findByRole('status')
    const toast = screen.getByRole('status')
    expect(toast.textContent).toMatch(/budi santoso|archived/i)
  })
})

// ── aria-describedby on alertdialog reveal (item 7) ──────────────────────────

describe('AdminUsersPage — password reveal a11y', () => {
  it('the alertdialog element has aria-describedby pointing at the warning', async () => {
    const user = userEvent.setup()
    const disabledPerson: AdminPersonRow = { ...TWO_PEOPLE[1], login: 'none' }
    mockListAdminPeople.mockResolvedValue([TWO_PEOPLE[0], disabledPerson])

    const { createLogin } = await import('@/lib/db/admin-users')
    vi.mocked(createLogin).mockResolvedValue('TmpPw9999')
    renderPage()

    await screen.findByText('Budi Santoso')

    await user.click(screen.getByRole('button', { name: /more actions for budi santoso/i }))
    await user.click(screen.getByRole('menuitem', { name: /create login/i }))

    await screen.findByText('TmpPw9999')

    const alertdialog = screen.getByRole('alertdialog')
    const describedById = alertdialog.getAttribute('aria-describedby')
    expect(describedById).toBeTruthy()
    const describedByEl = document.getElementById(describedById!)
    expect(describedByEl).not.toBeNull()
    expect(describedByEl!.textContent).toMatch(/copy this now/i)
  })
})

// helper — need within
import { within } from '@testing-library/react'
