// PositionPicker tests — TDD, FR-201/202/206, AC-125.
// Tests: lists roles under "Position" (never "Role"), toggle ON calls assignJabatan,
// toggle OFF calls removeJabatan, empty roles shows the muted empty line, RPC error surfaces inline.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/db/admin-users', () => ({
  assignJabatan: vi.fn(),
  removeJabatan: vi.fn(),
}))
import { assignJabatan, removeJabatan } from '@/lib/db/admin-users'

import { PositionPicker } from './position-picker'
import type { AdminPersonRow, RoleOption } from '@/lib/db/admin-users.types'

const mockAssignJabatan = vi.mocked(assignJabatan)
const mockRemoveJabatan = vi.mocked(removeJabatan)

const ROLES: RoleOption[] = [
  { id: 'r-barista', name: 'Barista' },
  { id: 'r-lead', name: 'Shift Lead' },
]

const PERSON_NO_POSITION: AdminPersonRow = {
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

const PERSON_WITH_POSITION: AdminPersonRow = {
  ...PERSON_NO_POSITION,
  jabatan: [{ role_id: 'r-barista', role_name: 'Barista' }],
  revenue_scope: [],
  teams: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAssignJabatan.mockResolvedValue(undefined)
  mockRemoveJabatan.mockResolvedValue(undefined)
})

function renderPicker(
  person: AdminPersonRow = PERSON_NO_POSITION,
  roles: RoleOption[] = ROLES,
  opts: { onDone?: () => void; onShowToast?: (message: string) => void } = {},
) {
  return render(
    <PositionPicker
      person={person}
      roles={roles}
      onDone={opts.onDone ?? vi.fn()}
      onShowToast={opts.onShowToast}
    />,
  )
}

describe('PositionPicker (AC-125 / FR-201/202/206)', () => {
  it('AC-125: lists roles under a "Position" label, never "Role"', () => {
    renderPicker()
    expect(screen.getByText('Position')).toBeInTheDocument()
    expect(screen.getByText('Barista')).toBeInTheDocument()
    expect(screen.getByText('Shift Lead')).toBeInTheDocument()
    expect(screen.queryByText(/^Role$/)).not.toBeInTheDocument()
  })

  it('AC-125: checking an unassigned role calls assignJabatan(id, roleId)', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    renderPicker(PERSON_NO_POSITION, ROLES, { onDone })

    await user.click(screen.getByRole('checkbox', { name: /barista/i }))

    await waitFor(() => {
      expect(mockAssignJabatan).toHaveBeenCalledWith('other-person-id', 'r-barista')
    })
    expect(mockRemoveJabatan).not.toHaveBeenCalled()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('AC-125: unchecking an assigned role calls removeJabatan(id, roleId)', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    renderPicker(PERSON_WITH_POSITION, ROLES, { onDone })

    const baristaBox = screen.getByRole('checkbox', { name: /barista/i })
    expect(baristaBox).toHaveAttribute('aria-checked', 'true')
    await user.click(baristaBox)

    await waitFor(() => {
      expect(mockRemoveJabatan).toHaveBeenCalledWith('other-person-id', 'r-barista')
    })
    expect(mockAssignJabatan).not.toHaveBeenCalled()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('AC-125: empty roles shows "No positions defined yet"', () => {
    renderPicker(PERSON_NO_POSITION, [])
    expect(screen.getByText('No positions defined yet')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('AC-125: onShowToast is called with a message naming the role and person on assign', async () => {
    const user = userEvent.setup()
    const onShowToast = vi.fn()
    renderPicker(PERSON_NO_POSITION, ROLES, { onShowToast })

    await user.click(screen.getByRole('checkbox', { name: /barista/i }))

    await waitFor(() => {
      expect(onShowToast).toHaveBeenCalledWith(expect.stringContaining('Barista'))
    })
    expect(onShowToast).toHaveBeenCalledWith(expect.stringContaining('Budi Santoso'))
  })

  it('AC-125: an RPC error surfaces inline via role="alert", does not crash', async () => {
    const user = userEvent.setup()
    mockAssignJabatan.mockRejectedValue(new Error('42501 permission denied'))
    renderPicker()

    await user.click(screen.getByRole('checkbox', { name: /barista/i }))

    await screen.findByRole('alert')
    expect(screen.getByText('Position')).toBeInTheDocument()
  })

  // Defect 3 (design review, Important, a11y) — the whole row must be clickable, single-fire
  it('DEFECT-3: clicking the row text (not the checkbox glyph) toggles exactly once', async () => {
    const user = userEvent.setup()
    renderPicker(PERSON_NO_POSITION, ROLES)

    await user.click(screen.getByText('Barista'))

    await waitFor(() => {
      expect(mockAssignJabatan).toHaveBeenCalledTimes(1)
    })
    expect(mockAssignJabatan).toHaveBeenCalledWith('other-person-id', 'r-barista')
    expect(mockRemoveJabatan).not.toHaveBeenCalled()
  })

  it('DEFECT-3: clicking the text of a disabled (busy) row does not toggle again', async () => {
    const user = userEvent.setup()
    // Never resolves — keeps the fieldset in the busy/disabled state after the first click
    mockAssignJabatan.mockReturnValue(new Promise(() => {}))
    renderPicker(PERSON_NO_POSITION, ROLES)

    await user.click(screen.getByText('Barista'))
    await waitFor(() => expect(mockAssignJabatan).toHaveBeenCalledTimes(1))

    // Row is now disabled (busy) — clicking its text again must not fire a second toggle
    await user.click(screen.getByText('Barista'))
    expect(mockAssignJabatan).toHaveBeenCalledTimes(1)
  })
})
