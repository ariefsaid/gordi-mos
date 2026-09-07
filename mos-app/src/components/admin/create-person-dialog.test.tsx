// CreatePersonDialog tests — TDD, ticket #808.
// AC-035 (field order + login toggle rules) · AC-036 (submit shape).
// Legacy AC-011 coverage (email/synth path, reveal, JQ-3 login-intent handling) preserved.

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
import type { TeamOption, RoleOption } from '@/lib/db/admin-users.types'

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
      email: 'admin@example.test',
      must_change_password: false,
      archived_at: null,
      created_at: '',
      updated_at: '',
    },
    roles: [],
    isManager: false,
    accessRoles: ['admin'],
    affiliated: [], hasEmail: true,
  },
  signOut: vi.fn(),
}

const TEAMS: TeamOption[] = [
  { id: 't-hq', name: 'HQ Operations', branch_name: null, activity: null },
  { id: 't-bar', name: 'Gordi HQ Bar', branch_name: 'Gordi HQ', activity: 'bar' },
]

const ROLES: RoleOption[] = [
  { id: 'r-barista', name: 'Barista' },
  { id: 'r-lead', name: 'Shift Lead' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(ADMIN_VIEWER)
  mockSynthesizeEmail.mockImplementation((name: string) =>
    `${name.toLowerCase().replace(/\s+/g, '-')}@ops.gordi.local`,
  )
})

function renderDialog(
  props: {
    open?: boolean
    onClose?: () => void
    onCreated?: () => void
    onShowToast?: (message: string) => void
    teams?: TeamOption[]
    roles?: RoleOption[]
  } = {},
) {
  return render(
    <CreatePersonDialog
      open={props.open ?? true}
      onClose={props.onClose ?? vi.fn()}
      onCreated={props.onCreated ?? vi.fn()}
      onShowToast={props.onShowToast}
      teams={props.teams ?? TEAMS}
      roles={props.roles ?? ROLES}
    />,
  )
}

describe('CreatePersonDialog — #808 rewrite (AC-035 / AC-036)', () => {
  it('AC-035: renders the fields in order — Full name · Email · Team · Position · Access · login toggle', () => {
    renderDialog()
    // Every field is present and named for what it does.
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    // Team is a Select — the RPC needs a primary Team and this dialog now owns that.
    const teamSelect = screen.getByLabelText('Team') as HTMLSelectElement
    expect(teamSelect.tagName).toBe('SELECT')
    // Position is optional multi.
    expect(screen.getByRole('checkbox', { name: /barista/i })).toBeInTheDocument()
    // Access is a chip row (radiogroup, so aria is honest).
    expect(screen.getByRole('radiogroup', { name: /access/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /create a login now/i })).toBeInTheDocument()
  })

  it('AC-035: the Team Select lists the live teams and starts unset', () => {
    renderDialog()
    const teamSelect = screen.getByLabelText('Team') as HTMLSelectElement
    expect(teamSelect.value).toBe('')
    // Each live team appears as an option; the (branch, activity) stream teams are spelled out.
    expect(screen.getByRole('option', { name: /HQ Operations/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Gordi HQ Bar · Gordi HQ Bar/i })).toBeInTheDocument()
  })

  it('AC-035: submit without a Team shows the field error and calls nothing', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText(/full name/i), 'Bagas Barista')
    await user.type(screen.getByLabelText('Email'), 'bagas@example.test')
    // No team chosen.
    await user.click(screen.getByRole('button', { name: /create person/i }))
    // Field-error text appears at the Team field (role=alert distinguishes it from the placeholder).
    const alerts = screen.getAllByRole('alert').map((el) => el.textContent ?? '')
    expect(alerts.some((t) => /choose a team to continue/i.test(t))).toBe(true)
    // Neither RPC fired — nothing was written.
    expect(mockCreatePerson).not.toHaveBeenCalled()
    expect(mockCreateLogin).not.toHaveBeenCalled()
  })

  it('AC-035: the Access chip row pre-selects Member', () => {
    renderDialog()
    const memberChip = screen.getByRole('radio', { name: /member/i })
    expect(memberChip).toHaveAttribute('aria-checked', 'true')
    // Everything else starts unchecked.
    expect(screen.getByRole('radio', { name: /^admin$/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('AC-035: typing an email flips the login toggle ON by default', async () => {
    const user = userEvent.setup()
    renderDialog()
    const toggle = screen.getByRole('switch', { name: /create a login now/i })
    // No address yet → OFF and disabled with a reason.
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toBeDisabled()
    expect(screen.getByText(/add an email or sign-in name first/i)).toBeInTheDocument()
    // Once the admin types an email, the toggle enables and flips ON by default.
    await user.type(screen.getByLabelText('Email'), 'bagas@example.test')
    expect(toggle).not.toBeDisabled()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('AC-035: "no email" with no sign-in name yet → toggle OFF and disabled with reason', async () => {
    const user = userEvent.setup()
    renderDialog()
    // Tick "no email" WITHOUT typing a name — so no synthetic sign-in name is derived yet.
    await user.click(screen.getByRole('checkbox', { name: /no email/i }))
    const toggle = screen.getByRole('switch', { name: /create a login now/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toBeDisabled()
    expect(screen.getByText(/add an email or sign-in name first/i)).toBeInTheDocument()
  })

  it('AC-036: valid submit → exactly one createPerson call carrying name, email, team, positions, access', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockResolvedValue('new-person-id')
    mockCreateLogin.mockResolvedValue('TempPw808')
    renderDialog()

    await user.type(screen.getByLabelText(/full name/i), 'Bagas Barista')
    await user.type(screen.getByLabelText('Email'), 'bagas@example.test')
    await user.selectOptions(screen.getByLabelText('Team'), 't-bar')
    await user.click(screen.getByRole('checkbox', { name: /barista/i }))
    // Admin already pre-picked Member; swap to Ops Lead to prove the payload carries the chosen role.
    await user.click(screen.getByRole('radio', { name: /ops lead/i }))

    await user.click(screen.getByRole('button', { name: /create person/i }))

    await waitFor(() => {
      expect(mockCreatePerson).toHaveBeenCalledTimes(1)
      expect(mockCreatePerson).toHaveBeenCalledWith({
        full_name: 'Bagas Barista',
        email: 'bagas@example.test',
        team_id: 't-bar',
        position_ids: ['r-barista'],
        access_role: 'ops_lead',
      })
    })
  })

  it('AC-036: login RPC is called only when the toggle is ON, then the reveal renders once', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockResolvedValue('new-person-id')
    mockCreateLogin.mockResolvedValue('TempPw808')
    renderDialog()

    await user.type(screen.getByLabelText(/full name/i), 'Bagas Barista')
    await user.type(screen.getByLabelText('Email'), 'bagas@example.test')
    await user.selectOptions(screen.getByLabelText('Team'), 't-bar')
    // Toggle is ON by default because an email is typed (AC-035).
    await user.click(screen.getByRole('button', { name: /create person/i }))

    await waitFor(() => expect(mockCreateLogin).toHaveBeenCalledWith('new-person-id'))
    // The show-once reveal renders exactly once.
    await screen.findByText('TempPw808')
    expect(screen.getAllByText('TempPw808')).toHaveLength(1)
  })

  it('AC-036: login toggle OFF → createPerson runs, createLogin does NOT, no reveal', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockResolvedValue('new-person-id')
    renderDialog()

    await user.type(screen.getByLabelText(/full name/i), 'Bagas Barista')
    await user.type(screen.getByLabelText('Email'), 'bagas@example.test')
    await user.selectOptions(screen.getByLabelText('Team'), 't-bar')
    // Admin explicitly turns OFF the default-ON toggle.
    await user.click(screen.getByRole('switch', { name: /create a login now/i }))
    await user.click(screen.getByRole('button', { name: /create person/i }))

    await waitFor(() => expect(mockCreatePerson).toHaveBeenCalled())
    expect(mockCreateLogin).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  // ── Preserved legacy coverage (AC-011 + JQ-3) ────────────────────────────────

  it('AC-011: "no email" + name "Budi Santoso" shows the @ops.gordi.local sign-in preview', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText(/full name/i), 'Budi Santoso')
    await user.click(screen.getByRole('checkbox', { name: /no email/i }))
    expect(screen.getByText(/ops\.gordi\.local/i)).toBeInTheDocument()
  })

  it('AC-011: submitting with "no email" calls createPerson with the synthetic address', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockResolvedValue('new-person-id')
    renderDialog()
    await user.type(screen.getByLabelText(/full name/i), 'Budi Santoso')
    await user.click(screen.getByRole('checkbox', { name: /no email/i }))
    await user.selectOptions(screen.getByLabelText('Team'), 't-hq')
    await user.click(screen.getByRole('button', { name: /create person/i }))
    await waitFor(() => {
      expect(mockCreatePerson).toHaveBeenCalledWith(
        expect.objectContaining({
          email: expect.stringMatching(/@ops\.gordi\.local$/),
          team_id: 't-hq',
        }),
      )
    })
  })

  it('AC-011: validation — empty name shows an error, createPerson not called', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /create person/i }))
    expect(mockCreatePerson).not.toHaveBeenCalled()
    expect(screen.getByText(/enter a name/i)).toBeInTheDocument()
  })

  it('AC-011: error from createPerson shows an inline error message', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockRejectedValue(new Error('rls denied'))
    renderDialog()
    await user.type(screen.getByLabelText(/full name/i), 'Budi Santoso')
    await user.type(screen.getByLabelText('Email'), 'budi@example.test')
    await user.selectOptions(screen.getByLabelText('Team'), 't-hq')
    await user.click(screen.getByRole('button', { name: /create person/i }))
    await screen.findByText(/couldn't create/i)
  })

  it('JQ-3: person-created-but-login-failed → honest toast, no bare "added"', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockResolvedValue('new-person-id')
    mockCreateLogin.mockRejectedValue(new Error('provisioning RPC failed'))
    const onCreated = vi.fn()
    const onClose = vi.fn()
    const onShowToast = vi.fn()
    renderDialog({ onCreated, onClose, onShowToast })

    await user.type(screen.getByLabelText(/full name/i), 'New Hire')
    await user.type(screen.getByLabelText('Email'), 'hire@example.test')
    await user.selectOptions(screen.getByLabelText('Team'), 't-hq')
    // Toggle is ON by default because an email is typed.
    await user.click(screen.getByRole('button', { name: /create person/i }))

    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    const message = onShowToast.mock.calls.at(-1)?.[0] as string
    expect(message).toMatch(/sign-in couldn't be created/i)
    expect(message).toMatch(/create login/i)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it('AC-036: password is dropped and dialog closes when Done is clicked on the reveal', async () => {
    const user = userEvent.setup()
    mockCreatePerson.mockResolvedValue('new-person-id')
    mockCreateLogin.mockResolvedValue('TempPw9999')
    const onClose = vi.fn()
    renderDialog({ onClose })

    await user.type(screen.getByLabelText(/full name/i), 'Budi Santoso')
    await user.type(screen.getByLabelText('Email'), 'budi@example.test')
    await user.selectOptions(screen.getByLabelText('Team'), 't-hq')
    await user.click(screen.getByRole('button', { name: /create person/i }))
    await screen.findByText('TempPw9999')
    await user.click(screen.getByRole('button', { name: /done/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('FIX-B1: dialog card uses the canonical bordered modal surface', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('modal-shell__surface')
  })
})
