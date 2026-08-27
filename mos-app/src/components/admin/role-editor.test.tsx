// RoleEditor tests — TDD, FR-050, AC-050.
// Tests: toggle ON calls grantRole, toggle OFF calls revokeRole, self-row disables admin/finance,
// other rows leave them enabled, 'manager' is never rendered.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/admin-users', () => ({
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
}))
import { grantRole, revokeRole } from '@/lib/db/admin-users'

import { RoleEditor } from './role-editor'
import type { AdminPersonRow, RevenueScopeOption } from '@/lib/db/admin-users.types'

const mockUseAuth = vi.mocked(useAuth)
const mockGrantRole = vi.mocked(grantRole)
const mockRevokeRole = vi.mocked(revokeRole)

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
  },
  signOut: vi.fn(),
}

const OTHER_PERSON: AdminPersonRow = {
  id: 'other-person-id',
  full_name: 'Budi Santoso',
  email: 'budi@example.test',
  archived_at: null,
  login: 'active',
  access_roles: ['member'],
  jabatan: [],
  revenue_scope: [],
  teams: [],
}

const SELF_PERSON: AdminPersonRow = {
  id: 'admin-person-id', // matches viewer person id
  full_name: 'Admin Gordi',
  email: 'admin@example.test',
  archived_at: null,
  login: 'active',
  access_roles: ['admin', 'member'],
  jabatan: [],
  revenue_scope: [],
  teams: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(ADMIN_VIEWER)
  mockGrantRole.mockResolvedValue(undefined)
  mockRevokeRole.mockResolvedValue(undefined)
})

function renderEditor(
  person: AdminPersonRow = OTHER_PERSON,
  opts: {
    onClose?: () => void
    onDone?: () => void
    onShowToast?: (message: string) => void
    people?: AdminPersonRow[]
  } = {},
) {
  return render(
    <RoleEditor
      person={person}
      people={opts.people}
      open
      onClose={opts.onClose ?? vi.fn()}
      onDone={opts.onDone ?? vi.fn()}
      onShowToast={opts.onShowToast}
    />,
  )
}

describe('RoleEditor (AC-050 / FR-050)', () => {
  it('AC-050: renders a dialog with role checkboxes for all ASSIGNABLE_ROLES', () => {
    renderEditor()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // All four assignable roles must appear
    expect(screen.getByRole('checkbox', { name: /member/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /ops lead/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /admin/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /finance/i })).toBeInTheDocument()
  })

  it('AC-050: renders human role labels + descriptions, never raw slugs', () => {
    renderEditor()
    // Human labels visible
    expect(screen.getByText('Ops Lead')).toBeInTheDocument()
    expect(screen.getByText('Member')).toBeInTheDocument()
    // Descriptions visible
    expect(screen.getByText('Plans and approves')).toBeInTheDocument()
    expect(screen.getByText('Submits logs and updates')).toBeInTheDocument()
    // Raw slug must not leak
    expect(screen.queryByText('ops_lead')).not.toBeInTheDocument()
  })

  it('AC-121: renders a Manager checkbox (manager is now assignable)', () => {
    renderEditor()
    expect(screen.getByRole('checkbox', { name: /manager/i })).toBeInTheDocument()
  })

  it('AC-122: on the self row, the manager checkbox is disabled (self-guard)', () => {
    renderEditor({ ...SELF_PERSON, access_roles: ['admin', 'member'] })
    expect(screen.getByRole('checkbox', { name: /manager/i })).toHaveAttribute('aria-disabled', 'true')
  })

  it('AC-123: toggling Manager on calls grantRole(id, "manager")', async () => {
    const user = userEvent.setup()
    renderEditor(OTHER_PERSON)
    await user.click(screen.getByRole('checkbox', { name: /manager/i }))
    await waitFor(() => expect(mockGrantRole).toHaveBeenCalledWith('other-person-id', 'manager'))
  })

  it('AC-322: renders a Supervisor checkbox', () => {
    renderEditor()
    expect(screen.getByRole('checkbox', { name: /supervisor/i })).toBeInTheDocument()
  })

  it('AC-322: on the self row, the supervisor checkbox is disabled (self-guard)', () => {
    renderEditor({ ...SELF_PERSON, access_roles: ['admin'] })
    expect(screen.getByRole('checkbox', { name: /supervisor/i })).toHaveAttribute('aria-disabled', 'true')
  })

  it('AC-324: the Revenue scope picker renders only when the person holds supervisor', () => {
    const baseProps = {
      people: undefined,
      roles: undefined,
      open: true,
      onClose: vi.fn(),
      onDone: vi.fn(),
    }
    const { rerender } = render(
      <RoleEditor {...baseProps} person={{ ...OTHER_PERSON, access_roles: ['member'] }} scopeOptions={[]} />,
    )
    expect(screen.queryByText('Revenue scope')).not.toBeInTheDocument()

    const options: RevenueScopeOption[] = []
    rerender(
      <RoleEditor
        {...baseProps}
        person={{ ...OTHER_PERSON, access_roles: ['supervisor'] }}
        scopeOptions={options}
      />,
    )
    expect(screen.getByText('Revenue scope')).toBeInTheDocument()
  })

  it('AC-050: currently granted roles appear checked', () => {
    // OTHER_PERSON has ['member'] — member should be checked, others unchecked
    renderEditor()
    const memberBox = screen.getByRole('checkbox', { name: /member/i })
    const adminBox = screen.getByRole('checkbox', { name: /admin/i })
    expect(memberBox).toHaveAttribute('aria-checked', 'true')
    expect(adminBox).toHaveAttribute('aria-checked', 'false')
  })

  it('AC-050: toggling an unchecked role ON calls grantRole(personId, role)', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    renderEditor(OTHER_PERSON, { onDone })

    // ops_lead is unchecked — click it
    const opsLeadBox = screen.getByRole('checkbox', { name: /ops lead/i })
    await user.click(opsLeadBox)

    await waitFor(() => {
      expect(mockGrantRole).toHaveBeenCalledWith('other-person-id', 'ops_lead')
    })
    expect(mockRevokeRole).not.toHaveBeenCalled()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('AC-050: toggling a checked role OFF calls revokeRole(personId, role)', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    renderEditor(OTHER_PERSON, { onDone })

    // member is checked — click it to revoke
    const memberBox = screen.getByRole('checkbox', { name: /member/i })
    await user.click(memberBox)

    await waitFor(() => {
      expect(mockRevokeRole).toHaveBeenCalledWith('other-person-id', 'member')
    })
    expect(mockGrantRole).not.toHaveBeenCalled()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('AC-050: on the self row, admin and finance checkboxes are disabled', () => {
    renderEditor(SELF_PERSON)
    const adminBox = screen.getByRole('checkbox', { name: /admin/i })
    const financeBox = screen.getByRole('checkbox', { name: /finance/i })
    expect(adminBox).toHaveAttribute('aria-disabled', 'true')
    expect(financeBox).toHaveAttribute('aria-disabled', 'true')
  })

  it('AC-050: on the self row, member and ops_lead are NOT disabled', () => {
    renderEditor(SELF_PERSON)
    const memberBox = screen.getByRole('checkbox', { name: /member/i })
    const opsLeadBox = screen.getByRole('checkbox', { name: /ops lead/i })
    expect(memberBox).not.toHaveAttribute('aria-disabled', 'true')
    expect(opsLeadBox).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('AC-050: on a different person row, admin and finance are NOT disabled', () => {
    renderEditor(OTHER_PERSON)
    const adminBox = screen.getByRole('checkbox', { name: /admin/i })
    const financeBox = screen.getByRole('checkbox', { name: /finance/i })
    expect(adminBox).not.toHaveAttribute('aria-disabled', 'true')
    expect(financeBox).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('AC-050: RPC error surfaces as an inline error message, does not crash', async () => {
    const user = userEvent.setup()
    mockGrantRole.mockRejectedValue(new Error('42501 permission denied'))
    renderEditor(OTHER_PERSON)

    const opsLeadBox = screen.getByRole('checkbox', { name: /ops lead/i })
    await user.click(opsLeadBox)

    await screen.findByRole('alert')
    expect(screen.getByRole('dialog')).toBeInTheDocument() // still open
  })

  it('AC-050: Esc key closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderEditor(OTHER_PERSON, { onClose })

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })

  it('AC-050: Close button dismisses the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderEditor(OTHER_PERSON, { onClose })

    await user.click(screen.getByRole('button', { name: /close/i }))

    expect(onClose).toHaveBeenCalled()
  })

  // The dialog must not dismiss out from under an in-flight write — a strayed Escape used to
  // close it while a grant/revoke was still pending, leaving the viewer with no confirmation
  // and no error if it failed.
  it('does not dismiss while a role mutation is pending', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mockGrantRole.mockReturnValue(new Promise(() => {}))
    renderEditor(OTHER_PERSON, { onClose })

    await user.click(screen.getByRole('checkbox', { name: /ops lead/i }))
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // FIX B1 regression, re-homed (#201): the Single-Border Rule still binds, but the border is
  // now ModalShell's — an inline `style.border` assertion would fail on correct code, so it
  // asserts the canonical bordered surface instead of re-implementing the check.
  it('FIX-B1: dialog card uses the canonical bordered modal surface (Single-Border Rule)', () => {
    renderEditor()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('modal-shell__surface')
    expect(screen.getAllByTestId('modal-shell-scrim')).toHaveLength(1)
  })

  // Defect 1 (design review, Important) — toast must never leak the raw role SLUG
  it('DEFECT-1: granting ops_lead fires a toast with the human label, not the raw slug', async () => {
    const user = userEvent.setup()
    const onShowToast = vi.fn()
    renderEditor(OTHER_PERSON, { onShowToast })

    await user.click(screen.getByRole('checkbox', { name: /ops lead/i }))

    await waitFor(() => {
      expect(onShowToast).toHaveBeenCalledWith(expect.stringContaining('Ops Lead granted'))
    })
    const [message] = onShowToast.mock.calls[0] as [string]
    expect(message).not.toContain('ops_lead')
  })

  it('DEFECT-1: granting manager fires a toast with the human label, not the raw slug', async () => {
    const user = userEvent.setup()
    const onShowToast = vi.fn()
    renderEditor(OTHER_PERSON, { onShowToast })

    await user.click(screen.getByRole('checkbox', { name: /manager/i }))

    await waitFor(() => {
      expect(onShowToast).toHaveBeenCalledWith(expect.stringContaining('Manager granted'))
    })
    // The raw slug "manager" must not leak in lowercase form anywhere in the message
    const [message] = onShowToast.mock.calls[0] as [string]
    expect(message).not.toMatch(/\bmanager\b/) // only the capitalized "Manager" label is allowed
  })

  // Defect 2 (design review, Important, WCAG 1.4.10) — dialog must not clip on short viewports.
  // The height bound moved from an inline `max-h-[90vh]` to ModalShell's own surface rule, so
  // the assertion follows it: the panel is the ModalShell surface's only child (which is what
  // the `:has(> .role-editor-panel)` rule keys off — see modal-shell.css), and the middle
  // region is still the one that scrolls, leaving the ✕ and Close outside it.
  it('DEFECT-2: only the middle region scrolls, so the header ✕ and footer Close stay reachable', () => {
    // jsdom has no real layout engine, so this is a structural guard: it asserts the
    // scroll-container classes are present on the correct element, not actual clipping/scroll
    // behavior (which would need a real browser + viewport to observe).
    renderEditor()
    const body = screen.getByTestId('role-editor-scroll-body')
    expect(body.className).toContain('overflow-y-auto')
    expect(body.className).toContain('flex-1')

    const dialog = screen.getByRole('dialog')
    const panel = dialog.firstElementChild as HTMLElement
    expect(panel).toHaveClass('role-editor-panel')
    // The header ✕ and the footer Close both live OUTSIDE the scrolling region.
    expect(body.contains(screen.getByRole('button', { name: /dismiss dialog/i }))).toBe(false)
    expect(body.contains(screen.getByRole('button', { name: /^close$/i }))).toBe(false)
  })

  // Defect 3 (design review, Important, a11y) — the whole row must be clickable, single-fire
  it('DEFECT-3: clicking the row text (not the checkbox glyph) toggles exactly once', async () => {
    const user = userEvent.setup()
    renderEditor(OTHER_PERSON)

    // ops_lead is unchecked — click its text label, not the checkbox itself
    await user.click(screen.getByText('Ops Lead'))

    await waitFor(() => {
      expect(mockGrantRole).toHaveBeenCalledTimes(1)
    })
    expect(mockGrantRole).toHaveBeenCalledWith('other-person-id', 'ops_lead')
    expect(mockRevokeRole).not.toHaveBeenCalled()
  })

  it('DEFECT-3: clicking the text of a self-guarded (disabled) row does not toggle', async () => {
    const user = userEvent.setup()
    renderEditor(SELF_PERSON)

    // admin is self-guarded/disabled for SELF_PERSON — click its text label
    await user.click(screen.getByText('Admin'))

    expect(mockGrantRole).not.toHaveBeenCalled()
    expect(mockRevokeRole).not.toHaveBeenCalled()
  })
})
