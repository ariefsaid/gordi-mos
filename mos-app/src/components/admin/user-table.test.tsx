// UserTable behavior tests — TDD.
// Covers: item 1 (mobile action path), 3 (last-admin guard), 8 (⋯ menu keyboard),
//         10 (action-layer coverage), 12 (PersonAction type).
// Design-plan §4.6, FR-041, AC-040.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import { UserTable } from './user-table'
import type { PersonAction } from './user-table'

// Mock useIsDesktop so tests can control desktop/mobile rendering
vi.mock('@/shell/use-is-desktop')
import { useIsDesktop } from '@/shell/use-is-desktop'
const mockUseIsDesktop = vi.mocked(useIsDesktop)

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ACTIVE_ADMIN: AdminPersonRow = {
  id: 'p-admin',
  full_name: 'Admin Gordi',
  email: 'admin@gordi.id',
  archived_at: null,
  login: 'active',
  access_roles: ['admin'],
}

const ACTIVE_MEMBER: AdminPersonRow = {
  id: 'p-member',
  full_name: 'Budi Santoso',
  email: 'budi@gordi.id',
  archived_at: null,
  login: 'active',
  access_roles: ['member'],
}

const NO_LOGIN_PERSON: AdminPersonRow = {
  id: 'p-no-login',
  full_name: 'Citra Wulandari',
  email: 'citra@gordi.id',
  archived_at: null,
  login: 'none',
  access_roles: ['member'],
}

const ARCHIVED_PERSON: AdminPersonRow = {
  id: 'p-archived',
  full_name: 'Dewi Rahayu',
  email: 'dewi@gordi.id',
  archived_at: '2026-01-01T00:00:00Z',
  login: 'disabled',
  access_roles: [],
}

const DISABLED_LOGIN_PERSON: AdminPersonRow = {
  id: 'p-disabled',
  full_name: 'Eko Prasetyo',
  email: 'eko@gordi.id',
  archived_at: null,
  login: 'disabled',
  access_roles: ['member'],
}

// Two admins (so last-admin guard does NOT apply)
const TWO_ADMINS = [ACTIVE_ADMIN, { ...ACTIVE_MEMBER, id: 'p-admin-2', access_roles: ['admin'] }]

beforeEach(() => {
  vi.clearAllMocks()
  // Default to desktop
  mockUseIsDesktop.mockReturnValue(true)
})

function renderTable(
  people: AdminPersonRow[],
  opts: {
    viewerPersonId?: string
    onAction?: (action: PersonAction, person: AdminPersonRow) => void
    onAddPerson?: () => void
    isDesktop?: boolean
  } = {},
) {
  // Control desktop/mobile via the mocked useIsDesktop hook
  mockUseIsDesktop.mockReturnValue(opts.isDesktop !== false)

  return render(
    <UserTable
      people={people}
      viewerPersonId={opts.viewerPersonId ?? 'viewer-id'}
      onAction={opts.onAction ?? vi.fn()}
      onAddPerson={opts.onAddPerson ?? vi.fn()}
    />,
  )
}

// ── Desktop ⋯ menu tests ──────────────────────────────────────────────────────

describe('UserTable — desktop ⋯ menu', () => {
  it('opens on click and shows correct actions for active-login person', async () => {
    const user = userEvent.setup()
    const people = [ACTIVE_ADMIN, ACTIVE_MEMBER]
    renderTable(people)

    // Open Budi's menu
    const menuBtn = screen.getByRole('button', { name: /more actions for budi santoso/i })
    await user.click(menuBtn)

    // Menu should be open
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /manage roles/i })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /reset password/i })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /disable login/i })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /enable login/i })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /create login/i })).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /archive/i })).toBeInTheDocument()
  })

  it('shows "Create login" and no reset/disable for no-login person', async () => {
    const user = userEvent.setup()
    renderTable([ACTIVE_ADMIN, NO_LOGIN_PERSON])

    const menuBtn = screen.getByRole('button', { name: /more actions for citra wulandari/i })
    await user.click(menuBtn)

    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /create login/i })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /reset password/i })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /disable login/i })).not.toBeInTheDocument()
  })

  it('shows "Enable login" for disabled-login person', async () => {
    const user = userEvent.setup()
    renderTable([ACTIVE_ADMIN, DISABLED_LOGIN_PERSON])

    const menuBtn = screen.getByRole('button', { name: /more actions for eko prasetyo/i })
    await user.click(menuBtn)

    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /enable login/i })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /disable login/i })).not.toBeInTheDocument()
  })

  it('shows "Restore" for archived person', async () => {
    const user = userEvent.setup()
    renderTable([ACTIVE_ADMIN, ARCHIVED_PERSON])

    const menuBtn = screen.getByRole('button', { name: /more actions for dewi rahayu/i })
    await user.click(menuBtn)

    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /restore/i })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /archive/i })).not.toBeInTheDocument()
  })

  it('closes on Esc key', async () => {
    const user = userEvent.setup()
    renderTable([ACTIVE_ADMIN, ACTIVE_MEMBER])

    const menuBtn = screen.getByRole('button', { name: /more actions for budi santoso/i })
    await user.click(menuBtn)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('dispatches manage-roles action when "Manage roles" clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderTable([ACTIVE_ADMIN, ACTIVE_MEMBER], { onAction })

    await user.click(screen.getByRole('button', { name: /more actions for budi santoso/i }))
    await user.click(screen.getByRole('menuitem', { name: /manage roles/i }))

    expect(onAction).toHaveBeenCalledWith('manage-roles', ACTIVE_MEMBER)
  })

  it('dispatches reset-password action when "Reset password" clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderTable([ACTIVE_ADMIN, ACTIVE_MEMBER], { onAction })

    await user.click(screen.getByRole('button', { name: /more actions for budi santoso/i }))
    await user.click(screen.getByRole('menuitem', { name: /reset password/i }))

    expect(onAction).toHaveBeenCalledWith('reset-password', ACTIVE_MEMBER)
  })

  it('dispatches archive action when "Archive" clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderTable([ACTIVE_ADMIN, ACTIVE_MEMBER], { onAction })

    await user.click(screen.getByRole('button', { name: /more actions for budi santoso/i }))
    await user.click(screen.getByRole('menuitem', { name: /archive/i }))

    expect(onAction).toHaveBeenCalledWith('archive', ACTIVE_MEMBER)
  })
})

// ── Last-admin guard (FR-041) ─────────────────────────────────────────────────

describe('UserTable — last-admin guard (FR-041)', () => {
  it('disables "Disable login" for the sole active admin', async () => {
    const user = userEvent.setup()
    // Only one admin and they are active
    renderTable([ACTIVE_ADMIN, ACTIVE_MEMBER], { viewerPersonId: 'viewer-id' })

    const menuBtn = screen.getByRole('button', { name: /more actions for admin gordi/i })
    await user.click(menuBtn)

    const menu = screen.getByRole('menu')
    const disableBtn = within(menu).getByRole('menuitem', { name: /disable login/i })
    expect(disableBtn).toHaveAttribute('aria-disabled', 'true')
  })

  it('does NOT disable "Disable login" when there are multiple active admins', async () => {
    const user = userEvent.setup()
    renderTable(TWO_ADMINS)

    // Find first admin's menu
    const menuBtn = screen.getByRole('button', { name: /more actions for admin gordi/i })
    await user.click(menuBtn)

    const menu = screen.getByRole('menu')
    const disableBtn = within(menu).getByRole('menuitem', { name: /disable login/i })
    expect(disableBtn).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('disables "Archive" for the sole active admin', async () => {
    const user = userEvent.setup()
    renderTable([ACTIVE_ADMIN, ACTIVE_MEMBER])

    const menuBtn = screen.getByRole('button', { name: /more actions for admin gordi/i })
    await user.click(menuBtn)

    const menu = screen.getByRole('menu')
    const archiveBtn = within(menu).getByRole('menuitem', { name: /archive/i })
    expect(archiveBtn).toHaveAttribute('aria-disabled', 'true')
  })
})

// ── Mobile action sheet (item 1) ──────────────────────────────────────────────

describe('UserTable — mobile action sheet', () => {
  it('mobile "Manage" button opens an action sheet with all applicable actions', async () => {
    const user = userEvent.setup()
    renderTable([ACTIVE_ADMIN, ACTIVE_MEMBER], { isDesktop: false })

    // On mobile, each card has a "Manage" button
    // Use aria-label "Manage Budi Santoso" to target specific card
    const manageBtns = screen.getAllByRole('button', { name: /manage/i })
    // Both admin and member have Manage buttons; click Budi's (2nd)
    await user.click(manageBtns[1])

    // Action sheet should be open with actions
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /manage roles/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /reset password/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /disable login/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /archive/i })).toBeInTheDocument()
  })

  it('mobile action sheet dispatches the correct action when item is clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderTable([ACTIVE_ADMIN, ACTIVE_MEMBER], { onAction, isDesktop: false })

    const manageBtns = screen.getAllByRole('button', { name: /manage/i })
    await user.click(manageBtns[1])

    await user.click(screen.getByRole('menuitem', { name: /manage roles/i }))

    expect(onAction).toHaveBeenCalledWith('manage-roles', ACTIVE_MEMBER)
  })

  it('mobile action sheet closes after action', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderTable([ACTIVE_ADMIN, ACTIVE_MEMBER], { onAction, isDesktop: false })

    const manageBtns = screen.getAllByRole('button', { name: /manage/i })
    await user.click(manageBtns[1])

    await user.click(screen.getByRole('menuitem', { name: /manage roles/i }))

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})
