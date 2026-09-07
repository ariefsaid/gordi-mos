// AC-028 (#802) — /nope, mounted in the real shell, carries ONE title and no role chip.
//
// The 404 used to say the same thing twice: "Page not found" in the page head and "That page isn't
// here" in the state block under it. And the context row's scope crumb, with no scope to resolve on
// a path that does not exist, fell through to the viewer's ROLE name — labelling the reader
// ("Finance Lead") beside a message about a broken link. One title; the sentence stands alone.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn().mockResolvedValue([]),
  getPeople: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue([]),
}))
vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'

import { AppShell } from '@/shell/app-shell'
import { NotFoundPage } from './not-found-page'

const FINANCE_ROLE = 'Finance Lead'

function renderNotFoundInShell() {
  vi.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000009',
        org_id: '10000000-0000-0000-0000-000000000001',
        user_id: 'auth-user-009',
        full_name: 'Finance Viewer',
        email: 'finance@example.test',
        archived_at: null,
        must_change_password: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      // No module affiliation — exactly the viewer whose scope crumb fell through to a role name.
      roles: [{ id: 'r-fin', name: FINANCE_ROLE }],
      isManager: false,
      accessRoles: [],
      affiliated: [],
    },
    signOut: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)

  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/nope']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('AC-028 — the not-found surface in the shell', () => {
  it('carries exactly one title, and it is the message', () => {
    renderNotFoundInShell()
    const headings = screen.getAllByRole('heading')
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('That page isn’t here')
    // The short label survives only as the browser-tab title, never as a second on-page heading.
    expect(screen.queryByText('Page not found')).toBeNull()
  })

  it('the context row carries the sentence and no role chip', () => {
    const { container } = renderNotFoundInShell()
    const ctxRow = container.querySelector('[data-anatomy="context-row"]')
    expect(ctxRow).not.toBeNull()
    expect(ctxRow).toHaveTextContent('This page doesn’t exist — head back to a destination you know.')
    expect(ctxRow!.querySelector('.ctx-scope')).toBeNull()
    expect(container.textContent).not.toContain(FINANCE_ROLE)
  })
})
