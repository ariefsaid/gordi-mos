/**
 * AC-120 (RI-5): Tasks nav item is role-stable after the navy active-indicator token swap.
 * The visual color change (primary/10 → brand-navy/6) is token-only; this test guards
 * that the semantic role + aria-current are preserved through the refactor.
 *
 * AC-120 also covers: breadcrumb/landmark survive the change (verified by AppShell.test.tsx
 * AC-015 which must stay green; this file focuses on the Tasks-specific aria-current guard).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../auth/useAuth')
import { useAuth } from '@/auth/useAuth'
const mockUseAuth = vi.mocked(useAuth)

import { RailNav } from './RailNav'

function renderRailAtPath(path: string) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000001',
        org_id: '10000000-0000-0000-0000-000000000001',
        user_id: 'auth-user-001',
        full_name: 'Arief Said',
        email: 'arief@gordi.id',
        archived_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
    },
    signOut: vi.fn(),
  })

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<RailNav />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('shell brand touches (AC-120)', () => {
  it('AC-120: the Tasks nav item is present + role-stable (aria-current=page) after the navy active-indicator swap', () => {
    renderRailAtPath('/tasks')
    const tasksLink = screen.getByRole('link', { name: /tasks/i })
    expect(tasksLink).toBeInTheDocument()
    expect(tasksLink).toHaveAttribute('aria-current', 'page')
  })

  it('AC-120: only the Tasks link has aria-current=page at /tasks (no other link is marked active)', () => {
    renderRailAtPath('/tasks')
    const activeLinks = screen.getAllByRole('link').filter(
      (l) => l.getAttribute('aria-current') === 'page',
    )
    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0]).toHaveAccessibleName(/tasks/i)
  })

  it('AC-120: the Primary navigation landmark is present (landmark role-stable)', () => {
    renderRailAtPath('/tasks')
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })
})
