// Hidden-state contract for My Week when Weekly Updates + Daily Log are flag-hidden
// (config/features.ts, owner-directed 2026-06-17). Locks the hide so a future change can't
// silently un-hide: the weekly-update strip, ops strip, and manager team module must NOT
// render, the subtitle must not promise them, and the "My tasks" card must remain.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Force both sections OFF regardless of the live default.
vi.mock('../config/features', () => ({ SHOW_WEEKLY_UPDATES: false, SHOW_DAILY_LOG: false }))

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

// Data layers the effects still call (rendering is gated, fetches aren't) — keep them quiet.
vi.mock('../lib/db/weekly-updates', () => ({
  getMyUpdate: vi.fn(() => Promise.resolve(null)),
  listTeamUpdates: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../lib/db/team', () => ({ getTeamForManager: vi.fn(() => Promise.resolve([])) }))
vi.mock('../lib/db/ops-log', () => ({ getTodayOpsSummary: vi.fn(() => Promise.resolve({ count: 0, needsAttention: false })) }))

import { MyWeek } from './my-week'

beforeEach(() => {
  vi.clearAllMocks()
  // A MANAGER viewer — proves the team module is hidden by the FLAG, not by role.
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'org', user_id: 'u1', full_name: 'Test Manager',
        email: null, archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: true,
      accessRoles: [],
    },
    signOut: vi.fn(),
  })
})

function renderMyWeek() {
  return render(<MemoryRouter><MyWeek /></MemoryRouter>)
}

describe('My Week — Weekly Updates + Daily Log hidden (config/features.ts)', () => {
  it('still renders the "My tasks" card', async () => {
    renderMyWeek()
    expect(await screen.findByRole('heading', { name: 'My tasks' })).toBeInTheDocument()
  })

  it('does NOT render the weekly-update strip', () => {
    renderMyWeek()
    expect(screen.queryByText(/write update/i)).toBeNull()
    expect(screen.queryByText(/no weekly update for this week/i)).toBeNull()
  })

  it('does NOT render the ops / daily-log strip', () => {
    renderMyWeek()
    expect(screen.queryByText(/open the daily log/i)).toBeNull()
    expect(screen.queryByText(/log entr/i)).toBeNull()
  })

  it('does NOT render the manager team module (even for a manager)', async () => {
    renderMyWeek()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'My tasks' })).toBeInTheDocument())
    expect(screen.queryByText(/^Your team —/)).toBeNull()
  })

  it('subtitle promises only tasks — no "your update" / "on the floor"', async () => {
    renderMyWeek()
    await screen.findByRole('heading', { name: 'My tasks' })
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/what needs you/)
    expect(body).not.toMatch(/your update/)
    expect(body).not.toMatch(/on the floor/)
  })
})
