// PeopleToolbar — TDD tests (RED first).
// Design-plan §2.1 (toolbar), §4.1 (filter-no-match state).
// Segments: All · Active · No login · Disabled · Archived.
// Search: case-insensitive substring match on full_name OR email.
// AC: each segment, search by name, search by email, combined, no-match empty state.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import { UserTable } from './user-table'
import type { PersonAction } from './user-table'

// Mock useIsDesktop — default to desktop for toolbar tests
vi.mock('@/shell/use-is-desktop')
import { useIsDesktop } from '@/shell/use-is-desktop'
const mockUseIsDesktop = vi.mocked(useIsDesktop)

// The list presents as cards on a coarse pointer regardless of width; these toolbar tests
// assert the desktop table presentation, so the pointer stays fine.
vi.mock('@/shell/use-is-coarse-pointer')
import { useIsCoarsePointer } from '@/shell/use-is-coarse-pointer'

beforeEach(() => {
  vi.mocked(useIsCoarsePointer).mockReturnValue(false)
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADMIN: AdminPersonRow = {
  id: 'p-admin',
  full_name: 'Admin Gordi',
  email: 'admin@example.test',
  archived_at: null,
  login: 'active',
  access_roles: ['admin'],
  jabatan: [],
  revenue_scope: [],
  teams: [],
}

const ACTIVE_MEMBER: AdminPersonRow = {
  id: 'p-member',
  full_name: 'Budi Santoso',
  email: 'budi@example.test',
  archived_at: null,
  login: 'active',
  access_roles: ['member'],
  jabatan: [],
  revenue_scope: [],
  teams: [],
}

const NO_LOGIN_PERSON: AdminPersonRow = {
  id: 'p-no-login',
  full_name: 'Citra Wulandari',
  email: 'citra@example.test',
  archived_at: null,
  login: 'none',
  access_roles: ['member'],
  jabatan: [],
  revenue_scope: [],
  teams: [],
}

const DISABLED_LOGIN_PERSON: AdminPersonRow = {
  id: 'p-disabled',
  full_name: 'Dewi Rahayu',
  email: 'dewi@example.test',
  archived_at: null,
  login: 'disabled',
  access_roles: ['member'],
  jabatan: [],
  revenue_scope: [],
  teams: [],
}

const ARCHIVED_PERSON: AdminPersonRow = {
  id: 'p-archived',
  full_name: 'Eko Prasetyo',
  email: 'eko@example.test',
  archived_at: '2026-01-01T00:00:00Z',
  login: 'disabled',
  access_roles: [],
  jabatan: [],
  revenue_scope: [],
  teams: [],
}

// Full roster: admin + active + no-login + disabled + archived
const ALL_PEOPLE = [ADMIN, ACTIVE_MEMBER, NO_LOGIN_PERSON, DISABLED_LOGIN_PERSON, ARCHIVED_PERSON]

function renderTable(
  people: AdminPersonRow[],
  opts: {
    viewerPersonId?: string
    onAction?: (action: PersonAction, person: AdminPersonRow) => void
    onAddPerson?: () => void
    isDesktop?: boolean
  } = {},
) {
  mockUseIsDesktop.mockReturnValue(opts.isDesktop !== false)
  // URL-synced filter state (I7 / interaction item 7) — the toolbar reads useSearchParams now,
  // so the harness provides a Router (deliberate infra change; assertions untouched).
  return render(
    <MemoryRouter>
      <UserTable
        people={people}
        viewerPersonId={opts.viewerPersonId ?? 'viewer-id'}
        onAction={opts.onAction ?? vi.fn()}
        onAddPerson={opts.onAddPerson ?? vi.fn()}
      />
    </MemoryRouter>,
  )
}

// ── Segment filter tests ──────────────────────────────────────────────────────

describe('PeopleToolbar — segment filters', () => {
  it('renders all five segment buttons', () => {
    renderTable(ALL_PEOPLE)

    const tablist = screen.getByRole('tablist', { name: /status filter/i })
    expect(within(tablist).getByRole('tab', { name: /^all$/i })).toBeInTheDocument()
    expect(within(tablist).getByRole('tab', { name: /active/i })).toBeInTheDocument()
    expect(within(tablist).getByRole('tab', { name: /no login/i })).toBeInTheDocument()
    expect(within(tablist).getByRole('tab', { name: /disabled/i })).toBeInTheDocument()
    expect(within(tablist).getByRole('tab', { name: /archived/i })).toBeInTheDocument()
  })

  it('All segment (default) shows non-archived people only', () => {
    renderTable(ALL_PEOPLE)

    // Non-archived people visible
    expect(screen.getByText('Admin Gordi')).toBeInTheDocument()
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
    expect(screen.getByText('Citra Wulandari')).toBeInTheDocument()
    expect(screen.getByText('Dewi Rahayu')).toBeInTheDocument()
    // Archived person NOT visible under All
    expect(screen.queryByText('Eko Prasetyo')).not.toBeInTheDocument()
  })

  it('Active segment shows only active-login, non-archived people', async () => {
    const user = userEvent.setup()
    renderTable(ALL_PEOPLE)

    const tablist = screen.getByRole('tablist', { name: /status filter/i })
    await user.click(within(tablist).getByRole('tab', { name: /active/i }))

    expect(screen.getByText('Admin Gordi')).toBeInTheDocument()
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
    expect(screen.queryByText('Citra Wulandari')).not.toBeInTheDocument()
    expect(screen.queryByText('Dewi Rahayu')).not.toBeInTheDocument()
    expect(screen.queryByText('Eko Prasetyo')).not.toBeInTheDocument()
  })

  it('No login segment shows only login=none, non-archived people', async () => {
    const user = userEvent.setup()
    renderTable(ALL_PEOPLE)

    const tablist = screen.getByRole('tablist', { name: /status filter/i })
    await user.click(within(tablist).getByRole('tab', { name: /no login/i }))

    expect(screen.queryByText('Admin Gordi')).not.toBeInTheDocument()
    expect(screen.queryByText('Budi Santoso')).not.toBeInTheDocument()
    expect(screen.getByText('Citra Wulandari')).toBeInTheDocument()
    expect(screen.queryByText('Dewi Rahayu')).not.toBeInTheDocument()
    expect(screen.queryByText('Eko Prasetyo')).not.toBeInTheDocument()
  })

  it('Disabled segment shows only disabled-login, non-archived people', async () => {
    const user = userEvent.setup()
    renderTable(ALL_PEOPLE)

    const tablist = screen.getByRole('tablist', { name: /status filter/i })
    await user.click(within(tablist).getByRole('tab', { name: /disabled/i }))

    expect(screen.queryByText('Admin Gordi')).not.toBeInTheDocument()
    expect(screen.queryByText('Budi Santoso')).not.toBeInTheDocument()
    expect(screen.queryByText('Citra Wulandari')).not.toBeInTheDocument()
    expect(screen.getByText('Dewi Rahayu')).toBeInTheDocument()
    expect(screen.queryByText('Eko Prasetyo')).not.toBeInTheDocument()
  })

  it('Archived segment shows only archived people', async () => {
    const user = userEvent.setup()
    renderTable(ALL_PEOPLE)

    const tablist = screen.getByRole('tablist', { name: /status filter/i })
    await user.click(within(tablist).getByRole('tab', { name: /archived/i }))

    expect(screen.queryByText('Admin Gordi')).not.toBeInTheDocument()
    expect(screen.queryByText('Budi Santoso')).not.toBeInTheDocument()
    expect(screen.queryByText('Citra Wulandari')).not.toBeInTheDocument()
    expect(screen.queryByText('Dewi Rahayu')).not.toBeInTheDocument()
    expect(screen.getByText('Eko Prasetyo')).toBeInTheDocument()
  })

  it('active segment tab is marked aria-selected="true"', async () => {
    const user = userEvent.setup()
    renderTable(ALL_PEOPLE)

    const tablist = screen.getByRole('tablist', { name: /status filter/i })
    const activeTab = within(tablist).getByRole('tab', { name: /active/i })
    await user.click(activeTab)

    expect(activeTab).toHaveAttribute('aria-selected', 'true')
  })

  // Interaction-contract I7 / the shared ViewTabs keyboard grammar (view-tabs.tsx):
  // roving tabindex (only the active tab is tabindex=0, every other tab is -1) plus
  // Arrow/Home/End cycling. Previously the status filter was raw tablist buttons with
  // no keyboard contract at all.
  describe('roving tabindex + Arrow/Home/End (shared ViewTabs contract)', () => {
    it('only the active tab is tabindex=0; every other tab is -1', () => {
      renderTable(ALL_PEOPLE)
      const tablist = screen.getByRole('tablist', { name: /status filter/i })
      const tabs = within(tablist).getAllByRole('tab')
      const allTab = within(tablist).getByRole('tab', { name: /^all$/i })

      expect(allTab).toHaveAttribute('tabindex', '0')
      for (const tab of tabs) {
        if (tab !== allTab) expect(tab).toHaveAttribute('tabindex', '-1')
      }
    })

    it('ArrowRight moves selection + DOM focus to the next tab (wrapping)', async () => {
      const user = userEvent.setup()
      renderTable(ALL_PEOPLE)
      const tablist = screen.getByRole('tablist', { name: /status filter/i })
      const allTab = within(tablist).getByRole('tab', { name: /^all$/i })
      const activeTab = within(tablist).getByRole('tab', { name: /^active$/i })

      allTab.focus()
      await user.keyboard('{ArrowRight}')

      expect(activeTab).toHaveFocus()
      expect(activeTab).toHaveAttribute('aria-selected', 'true')
      expect(allTab).toHaveAttribute('aria-selected', 'false')
    })

    it('End jumps to the last tab (Archived) and selects it', async () => {
      const user = userEvent.setup()
      renderTable(ALL_PEOPLE)
      const tablist = screen.getByRole('tablist', { name: /status filter/i })
      const allTab = within(tablist).getByRole('tab', { name: /^all$/i })
      const archivedTab = within(tablist).getByRole('tab', { name: /archived/i })

      allTab.focus()
      await user.keyboard('{End}')

      expect(archivedTab).toHaveFocus()
      expect(archivedTab).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText('Eko Prasetyo')).toBeInTheDocument()
    })

    it('Home jumps back to the first tab (All) from anywhere', async () => {
      const user = userEvent.setup()
      renderTable(ALL_PEOPLE)
      const tablist = screen.getByRole('tablist', { name: /status filter/i })
      const archivedTab = within(tablist).getByRole('tab', { name: /archived/i })
      const allTab = within(tablist).getByRole('tab', { name: /^all$/i })

      archivedTab.focus()
      await user.keyboard('{End}{Home}')

      expect(allTab).toHaveFocus()
      expect(allTab).toHaveAttribute('aria-selected', 'true')
    })
  })
})

// ── Search filter tests ────────────────────────────────────────────────────────

describe('PeopleToolbar — search filter', () => {
  it('renders a search input', () => {
    renderTable(ALL_PEOPLE)
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('filters by name (case-insensitive substring)', async () => {
    const user = userEvent.setup()
    renderTable(ALL_PEOPLE)

    await user.type(screen.getByRole('searchbox'), 'budi')

    expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
    expect(screen.queryByText('Admin Gordi')).not.toBeInTheDocument()
    expect(screen.queryByText('Citra Wulandari')).not.toBeInTheDocument()
  })

  it('filters by email (case-insensitive substring)', async () => {
    const user = userEvent.setup()
    renderTable(ALL_PEOPLE)

    await user.type(screen.getByRole('searchbox'), 'citra@example')

    expect(screen.getByText('Citra Wulandari')).toBeInTheDocument()
    expect(screen.queryByText('Budi Santoso')).not.toBeInTheDocument()
    expect(screen.queryByText('Admin Gordi')).not.toBeInTheDocument()
  })

  it('clears filter when search input is emptied', async () => {
    const user = userEvent.setup()
    renderTable(ALL_PEOPLE)

    const searchbox = screen.getByRole('searchbox')
    await user.type(searchbox, 'budi')
    expect(screen.queryByText('Admin Gordi')).not.toBeInTheDocument()

    await user.clear(searchbox)
    expect(screen.getByText('Admin Gordi')).toBeInTheDocument()
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
  })
})

// ── Combined search + segment tests ───────────────────────────────────────────

describe('PeopleToolbar — combined search + segment', () => {
  it('combines Active segment + search to narrow results further', async () => {
    const user = userEvent.setup()
    // Two active people: Admin Gordi + Budi Santoso
    renderTable(ALL_PEOPLE)

    // Switch to Active
    const tablist = screen.getByRole('tablist', { name: /status filter/i })
    await user.click(within(tablist).getByRole('tab', { name: /active/i }))

    // Now search for "budi" — should show only Budi
    await user.type(screen.getByRole('searchbox'), 'budi')

    expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
    expect(screen.queryByText('Admin Gordi')).not.toBeInTheDocument()
  })
})

// ── No-match empty state ───────────────────────────────────────────────────────

describe('PeopleToolbar — no-match empty state', () => {
  it('shows no-match empty state when search yields zero results', async () => {
    const user = userEvent.setup()
    renderTable(ALL_PEOPLE, { viewerPersonId: 'viewer-id' })

    await user.type(screen.getByRole('searchbox'), 'zzz-no-match')

    expect(screen.getByText(/no people match/i)).toBeInTheDocument()
    // Must not show the org-empty "Just you so far" copy
    expect(screen.queryByText(/just you so far/i)).not.toBeInTheDocument()
  })

  it('shows no-match empty state when segment yields zero results', async () => {
    const user = userEvent.setup()
    // People with only active + no-login; no disabled person
    renderTable([ADMIN, ACTIVE_MEMBER, NO_LOGIN_PERSON], { viewerPersonId: 'viewer-id' })

    const tablist = screen.getByRole('tablist', { name: /status filter/i })
    await user.click(within(tablist).getByRole('tab', { name: /disabled/i }))

    expect(screen.getByText(/no people match/i)).toBeInTheDocument()
    expect(screen.queryByText(/just you so far/i)).not.toBeInTheDocument()
  })

  it('no-match empty state has a "Clear filter" button that resets search', async () => {
    const user = userEvent.setup()
    renderTable(ALL_PEOPLE, { viewerPersonId: 'viewer-id' })

    await user.type(screen.getByRole('searchbox'), 'zzz-no-match')
    expect(screen.getByText(/no people match/i)).toBeInTheDocument()

    const clearBtn = screen.getByRole('button', { name: /clear filter/i })
    await user.click(clearBtn)

    await waitFor(() => expect(screen.queryByText(/no people match/i)).not.toBeInTheDocument())
    expect(screen.getByText('Admin Gordi')).toBeInTheDocument()
  })

  it('no-match empty state has a "Clear filter" button that resets segment', async () => {
    const user = userEvent.setup()
    renderTable([ADMIN, ACTIVE_MEMBER, NO_LOGIN_PERSON], { viewerPersonId: 'viewer-id' })

    const tablist = screen.getByRole('tablist', { name: /status filter/i })
    await user.click(within(tablist).getByRole('tab', { name: /disabled/i }))
    expect(screen.getByText(/no people match/i)).toBeInTheDocument()

    const clearBtn = screen.getByRole('button', { name: /clear filter/i })
    await user.click(clearBtn)

    await waitFor(() => expect(screen.queryByText(/no people match/i)).not.toBeInTheDocument())
    expect(screen.getByText('Admin Gordi')).toBeInTheDocument()
  })
})

// ── Org-empty ("Just you so far") still works ─────────────────────────────────

describe('PeopleToolbar — does not interfere with org-empty state', () => {
  it('shows "Just you so far" when the org has only the admin (non-self count = 0)', () => {
    // Only the admin themselves; no filter active
    renderTable([ADMIN], { viewerPersonId: 'p-admin' })

    expect(screen.getByText(/just you so far/i)).toBeInTheDocument()
    // The toolbar must still render above the empty state
    expect(screen.getByRole('tablist', { name: /status filter/i })).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })
})
