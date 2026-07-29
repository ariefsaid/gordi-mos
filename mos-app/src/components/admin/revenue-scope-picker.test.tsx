// RevenueScopePicker tests — TDD, FR-323, AC-323.
// Tests: lists "Whole {channel}" + per-branch options grouped by channel (never "Role"),
// toggle ON calls assignRevenueScope, toggle OFF calls removeRevenueScope, empty options
// shows the muted empty line.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/db/admin-users', () => ({
  assignRevenueScope: vi.fn(),
  removeRevenueScope: vi.fn(),
}))
import { assignRevenueScope, removeRevenueScope } from '@/lib/db/admin-users'

import { RevenueScopePicker } from './revenue-scope-picker'
import type { AdminPersonRow, RevenueScopeOption } from '@/lib/db/admin-users.types'

const mockAssignRevenueScope = vi.mocked(assignRevenueScope)
const mockRemoveRevenueScope = vi.mocked(removeRevenueScope)

const OPTIONS: RevenueScopeOption[] = [
  { channel: 'POS', branch_code: 'BGR', branch_name: 'Bungur' },
  { channel: 'B2B', branch_code: 'GRI', branch_name: 'Gordi Roastery' },
]

const PERSON_NO_SCOPE: AdminPersonRow = {
  id: 'other-person-id',
  full_name: 'Budi Santoso',
  email: 'budi@gordi.id',
  archived_at: null,
  login: 'active',
  access_roles: ['supervisor'],
  jabatan: [],
  revenue_scope: [],
}

const PERSON_WITH_SCOPE: AdminPersonRow = {
  ...PERSON_NO_SCOPE,
  revenue_scope: [{ channel: 'POS', branch_code: 'BGR' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAssignRevenueScope.mockResolvedValue(undefined)
  mockRemoveRevenueScope.mockResolvedValue(undefined)
})

function renderPicker(
  person: AdminPersonRow = PERSON_NO_SCOPE,
  options: RevenueScopeOption[] = OPTIONS,
  opts: { onDone?: () => void; onShowToast?: (message: string) => void } = {},
) {
  return render(
    <RevenueScopePicker
      person={person}
      options={options}
      onDone={opts.onDone ?? vi.fn()}
      onShowToast={opts.onShowToast}
    />,
  )
}

describe('RevenueScopePicker (AC-323 / FR-323)', () => {
  it('AC-323: lists a "Whole POS"/"Whole B2B" option per channel + each branch, never "Role"', () => {
    renderPicker()
    expect(screen.getByText('Revenue scope')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /whole pos/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /whole b2b/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /bungur/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /gordi roastery/i })).toBeInTheDocument()
    expect(screen.queryByText(/^Role$/)).not.toBeInTheDocument()
  })

  it('AC-323: checking an unassigned branch calls assignRevenueScope(id, "POS", "BGR")', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    renderPicker(PERSON_NO_SCOPE, OPTIONS, { onDone })

    await user.click(screen.getByRole('checkbox', { name: /bungur/i }))

    await waitFor(() => {
      expect(mockAssignRevenueScope).toHaveBeenCalledWith('other-person-id', 'POS', 'BGR')
    })
    expect(mockRemoveRevenueScope).not.toHaveBeenCalled()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('AC-323: checking "Whole B2B" calls assignRevenueScope(id, "B2B", null)', async () => {
    const user = userEvent.setup()
    renderPicker(PERSON_NO_SCOPE, OPTIONS)

    await user.click(screen.getByRole('checkbox', { name: /whole b2b/i }))

    await waitFor(() => {
      expect(mockAssignRevenueScope).toHaveBeenCalledWith('other-person-id', 'B2B', null)
    })
  })

  it('AC-323: unchecking an assigned branch calls removeRevenueScope(id, "POS", "BGR")', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    renderPicker(PERSON_WITH_SCOPE, OPTIONS, { onDone })

    const bgrBox = screen.getByRole('checkbox', { name: /bungur/i })
    expect(bgrBox).toHaveAttribute('aria-checked', 'true')
    await user.click(bgrBox)

    await waitFor(() => {
      expect(mockRemoveRevenueScope).toHaveBeenCalledWith('other-person-id', 'POS', 'BGR')
    })
    expect(mockAssignRevenueScope).not.toHaveBeenCalled()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('AC-323: empty options shows "No revenue branches available yet"', () => {
    renderPicker(PERSON_NO_SCOPE, [])
    expect(screen.getByText('No revenue branches available yet')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('AC-323: onShowToast is called with a message naming the person on assign', async () => {
    const user = userEvent.setup()
    const onShowToast = vi.fn()
    renderPicker(PERSON_NO_SCOPE, OPTIONS, { onShowToast })

    await user.click(screen.getByRole('checkbox', { name: /bungur/i }))

    await waitFor(() => {
      expect(onShowToast).toHaveBeenCalledWith(expect.stringContaining('Budi Santoso'))
    })
  })

  it('AC-323: an assign error surfaces inline via role="alert", does not crash', async () => {
    const user = userEvent.setup()
    mockAssignRevenueScope.mockRejectedValue(new Error('42501 permission denied'))
    renderPicker()

    await user.click(screen.getByRole('checkbox', { name: /bungur/i }))

    await screen.findByRole('alert')
    expect(screen.getByText('Revenue scope')).toBeInTheDocument()
  })
})
