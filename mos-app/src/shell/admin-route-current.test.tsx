import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
import { AppShell } from './app-shell'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))
vi.mock('@/lib/db/open-task-count', () => ({ getMyOpenTaskCount: vi.fn().mockResolvedValue(0) }))
vi.mock('@/lib/db/signals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/signals')>()),
  getSignalPostAuthority: vi.fn().mockResolvedValue({ can_post: false, can_tag: false }),
}))
vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn().mockResolvedValue([]),
  getPeople: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue({ rows: [], hasMore: false, nextCursor: null }),
}))
vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

const TAB_FOR: Record<string, string> = {
  '/admin/people': 'People',
  '/admin/teams': 'Teams',
  '/admin/access': 'Roles & permissions',
  '/admin/agents': 'Connected agents',
}

function renderAdminRoute(path: string) {
  vi.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000001',
        org_id: '10000000-0000-0000-0000-000000000001',
        user_id: 'auth-user-001',
        full_name: 'Ada Admin',
        email: 'ada@example.test',
        archived_at: null,
        must_change_password: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
      accessRoles: ['admin'],
      affiliated: [],
    },
    signOut: vi.fn(),
  })
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="admin/*" element={<div role="main"><AdminSettingsNav /></div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

// One current-page marker per route: the active Admin tab. The rail's Admin link is the section
// the tab lives in, so it says `location`, never a second "page" (breadcrumb.tsx, Rule 5).
describe('Admin routes carry exactly one aria-current="page"', () => {
  it.each(Object.entries(TAB_FOR))('at %s the active tab is the only page marker and the rail Admin link is "location"', (path, tab) => {
    const { container } = renderAdminRoute(path)
    const pages = container.querySelectorAll('[aria-current="page"]')
    expect(pages).toHaveLength(1)
    expect(pages[0]).toBe(within(screen.getByRole('navigation', { name: 'Admin settings sections' })).getByRole('link', { name: tab }))
    const railAdmin = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: /Admin Settings/ })
    expect(railAdmin).toHaveAttribute('aria-current', 'location')
    expect(railAdmin).toHaveClass('rail-item--active')
  })
})
