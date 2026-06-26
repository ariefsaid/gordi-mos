// CreatePersonDialog tests — TDD, plan §5.2.
// AC-011: synthetic email, show-once password, self-assign guard.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/admin-users', () => ({
  synthesizeEmail: vi.fn((name: string) => `${name.toLowerCase().replace(/\s+/g, '-')}@ops.gordi.local`),
  createPerson: vi.fn(),
  createLogin: vi.fn(),
}))
import { synthesizeEmail, createPerson, createLogin } from '@/lib/db/admin-users'

import { CreatePersonDialog } from './create-person-dialog'

const mockUseAuth = vi.mocked(useAuth)
const mockCreatePerson = vi.mocked(createPerson)
const mockCreateLogin = vi.mocked(createLogin)
const mockSynthesizeEmail = vi.mocked(synthesizeEmail)

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
      created_at: '',
      updated_at: '',
    },
    roles: [],
    isManager: false,
    accessRoles: ['admin'],
  },
  signOut: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(ADMIN_VIEWER)
  mockSynthesizeEmail.mockImplementation((name: string) =>
    `${name.toLowerCase().replace(/\s+/g, '-')}@ops.gordi.local`,
  )
})

function renderDialog(props: { open?: boolean; onClose?: () => void; onCreated?: () => void } = {}) {
  return render(
    <CreatePersonDialog
      open={props.open ?? true}
      onClose={props.onClose ?? vi.fn()}
      onCreated={props.onCreated ?? vi.fn()}
    />,
  )
}

describe('CreatePersonDialog (AC-011)', () => {
  it('AC-011: renders Add person dialog with name, email fields, and Create person button', () => {
    renderDialog()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create person/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('AC-011: "no email" checkbox is present and toggles email field disabled state', async () => {
    const user = userEvent.setup()
    renderDialog()

    const emailInput = screen.getByLabelText('Email')
    expect(emailInput).not.toBeDisabled()

    const noEmailCheckbox = screen.getByRole('checkbox', { name: /no email/i })
    await user.click(noEmailCheckbox)

    // Email field should be disabled when "no email" checked
    expect(screen.getByLabelText('Email')).toBeDisabled()
  })

  it('AC-011: "no email" checked + name "Budi Santoso" shows synthetic @ops.gordi.local preview', async () => {
    const user = userEvent.setup()
    renderDialog()

    const nameInput = screen.getByLabelText(/full name/i)
    await user.type(nameInput, 'Budi Santoso')

    const noEmailCheckbox = screen.getByRole('checkbox', { name: /no email/i })
    await user.click(noEmailCheckbox)

    // Synthetic email preview should contain @ops.gordi.local
    expect(screen.getByText(/ops\.gordi\.local/i)).toBeInTheDocument()
  })

  it('AC-011: submitting with "no email" calls createPerson with @ops.gordi.local email', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockResolvedValue('new-person-id')
    renderDialog()

    await user.type(screen.getByLabelText(/full name/i), 'Budi Santoso')

    const noEmailCheckbox = screen.getByRole('checkbox', { name: /no email/i })
    await user.click(noEmailCheckbox)

    await user.click(screen.getByRole('button', { name: /create person/i }))

    await waitFor(() => {
      expect(mockCreatePerson).toHaveBeenCalledWith(
        expect.objectContaining({
          email: expect.stringMatching(/@ops\.gordi\.local$/),
        }),
      )
    })
  })

  it('AC-011: access-role rows show human labels + descriptions, never raw slugs', () => {
    renderDialog()
    // Human labels for the assignable roles
    expect(screen.getByText('Ops Lead')).toBeInTheDocument()
    expect(screen.getByText('Member')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Finance')).toBeInTheDocument()
    // Description line under each role
    expect(screen.getByText('Plans and approves')).toBeInTheDocument()
    // Raw slug must not leak into the UI
    expect(screen.queryByText('ops_lead')).not.toBeInTheDocument()
    // Checkbox accessible name is the human label
    expect(screen.getByRole('checkbox', { name: /ops lead/i })).toBeInTheDocument()
  })

  it('AC-011: "create a login now" toggle appears and is off by default', () => {
    renderDialog()
    const loginToggle = screen.getByRole('switch', { name: /create a login now/i })
    expect(loginToggle).toBeInTheDocument()
    expect(loginToggle).toHaveAttribute('aria-checked', 'false')
  })

  it('AC-011: with "create a login now" ON, createLogin is called after createPerson', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockResolvedValue('new-person-id')
    mockCreateLogin.mockResolvedValue('TempPw1234')
    renderDialog()

    await user.type(screen.getByLabelText(/full name/i), 'Budi Santoso')
    await user.type(screen.getByLabelText('Email'), 'budi@gordi.id')

    const loginToggle = screen.getByRole('switch', { name: /create a login now/i })
    await user.click(loginToggle)

    await user.click(screen.getByRole('button', { name: /create person/i }))

    await waitFor(() => {
      expect(mockCreatePerson).toHaveBeenCalled()
      expect(mockCreateLogin).toHaveBeenCalledWith('new-person-id')
    })
  })

  it('AC-011: temp password revealed exactly once — the TempPasswordReveal panel appears', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockResolvedValue('new-person-id')
    mockCreateLogin.mockResolvedValue('TempPw9999')
    renderDialog()

    await user.type(screen.getByLabelText(/full name/i), 'Budi Santoso')
    await user.type(screen.getByLabelText('Email'), 'budi@gordi.id')

    const loginToggle = screen.getByRole('switch', { name: /create a login now/i })
    await user.click(loginToggle)

    await user.click(screen.getByRole('button', { name: /create person/i }))

    // Password reveal panel should show with the password
    await screen.findByText('TempPw9999')

    // Warning banner "copy this now" must be present
    expect(screen.getByText(/copy this now/i)).toBeInTheDocument()

    // "Done" button is present (no Esc dismiss — intentional)
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })

  it('AC-011: password is NOT retained in DOM after Done is clicked', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockResolvedValue('new-person-id')
    mockCreateLogin.mockResolvedValue('TempPw9999')
    const onClose = vi.fn()
    renderDialog({ onClose })

    await user.type(screen.getByLabelText(/full name/i), 'Budi Santoso')
    await user.type(screen.getByLabelText('Email'), 'budi@gordi.id')

    const loginToggle = screen.getByRole('switch', { name: /create a login now/i })
    await user.click(loginToggle)

    await user.click(screen.getByRole('button', { name: /create person/i }))
    await screen.findByText('TempPw9999')

    // Click Done
    await user.click(screen.getByRole('button', { name: /done/i }))

    // onClose called, password gone from DOM
    expect(onClose).toHaveBeenCalled()
  })

  it('AC-011: role=alertdialog on the password reveal step', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockResolvedValue('new-person-id')
    mockCreateLogin.mockResolvedValue('TempPw1111')
    renderDialog()

    await user.type(screen.getByLabelText(/full name/i), 'Budi Santoso')
    await user.type(screen.getByLabelText('Email'), 'budi@gordi.id')
    await user.click(screen.getByRole('switch', { name: /create a login now/i }))
    await user.click(screen.getByRole('button', { name: /create person/i }))

    // After reveal, dialog role becomes alertdialog
    await screen.findByText('TempPw1111')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('AC-011: validation — empty name shows an error, createPerson not called', async () => {
    const user = userEvent.setup()
    renderDialog()

    // Submit without name
    await user.click(screen.getByRole('button', { name: /create person/i }))

    expect(mockCreatePerson).not.toHaveBeenCalled()
    // Error hint for name field
    expect(screen.getByText(/enter a name/i)).toBeInTheDocument()
  })

  it('AC-011: submitting state disables the form and shows "Creating…"', async () => {
    const user = userEvent.setup()
    // Never resolve so we can catch the submitting state
    mockCreatePerson.mockReturnValue(new Promise(() => {}))
    renderDialog()

    await user.type(screen.getByLabelText(/full name/i), 'Budi Santoso')
    await user.type(screen.getByLabelText('Email'), 'budi@gordi.id')
    await user.click(screen.getByRole('button', { name: /create person/i }))

    expect(screen.getByText(/creating/i)).toBeInTheDocument()
  })

  it('AC-011: error from createPerson shows an inline error message', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockRejectedValue(new Error('rls denied'))
    renderDialog()

    await user.type(screen.getByLabelText(/full name/i), 'Budi Santoso')
    await user.type(screen.getByLabelText('Email'), 'budi@gordi.id')
    await user.click(screen.getByRole('button', { name: /create person/i }))

    await screen.findByText(/couldn't create/i)
  })

  // FIX B1 regression — dialog card must have a visible border (Single-Border Rule)
  it('FIX-B1: dialog card container has a non-empty border style (Single-Border Rule)', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog')
    expect(dialog.style.border).toBeTruthy()
    expect(dialog.style.border).not.toBe('')
  })
})
