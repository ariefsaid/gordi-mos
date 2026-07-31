/**
 * BottomTabBar tests (plan §4.3, AC-T01/T02/T03).
 * Phone-first primary nav: one tab per LIVE destination (DESTINATIONS model).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('./use-is-narrow')
import { useIsNarrow } from './use-is-narrow'
const mockUseIsNarrow = vi.mocked(useIsNarrow)

import { BottomTabBar } from './bottom-tab-bar'

function setAuthAs(accessRoles: string[] = []) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000001',
        org_id: '10000000-0000-0000-0000-000000000001',
        user_id: 'auth-user-001',
        full_name: 'Test User',
        email: 'test@example.test',
        archived_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  })
}

function renderTabBar(initialPath = '/', { narrow = true }: { narrow?: boolean } = {}) {
  mockUseIsNarrow.mockReturnValue(narrow)
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="*" element={<BottomTabBar />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setAuthAs([])
})

describe('AC-T01 / AC-410: phone viewport — one tab per live destination', () => {
  it('AC-410: a member sees exactly Home, Work, Operate, Inbox tabs (Plan gated off)', () => {
    renderTabBar('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'Work', 'Operate', 'Inbox'])
  })

  it('AC-410: finance sees all five tabs including Plan; Plan links to /dashboard', () => {
    setAuthAs(['finance'])
    renderTabBar('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'Work', 'Operate', 'Plan', 'Inbox'])
    expect(within(nav).getByRole('link', { name: /Plan/ })).toHaveAttribute('href', '/dashboard')
  })

  it('every tab has an accessible name via aria-label (t(labelKey))', () => {
    renderTabBar('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: /Home/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Work/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Operate/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Inbox/ })).toBeInTheDocument()
  })

  it('Home links to /, Work to /tasks, Operate to Daily Log (/ops, first Operate link), Inbox to /inbox', () => {
    renderTabBar('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: /Home/ })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: /Work/ })).toHaveAttribute('href', '/tasks')
    expect(within(nav).getByRole('link', { name: /Operate/ })).toHaveAttribute('href', '/ops')
    expect(within(nav).getByRole('link', { name: /Inbox/ })).toHaveAttribute('href', '/inbox')
  })

  it('AC-408: Work tab stays active on a capability-gated manage route (/work/objectives)', () => {
    renderTabBar('/work/objectives')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const active = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAccessibleName(/Work/)
  })
})

describe('AC-T02: active tab per route', () => {
  it('Work tab has aria-current=page when on /tasks', () => {
    renderTabBar('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const active = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAccessibleName(/Work/)
  })

  it('Home tab has aria-current=page when on / (end match, not a prefix match)', () => {
    renderTabBar('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const active = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAccessibleName(/Home/)
  })

  it('Operate tab has aria-current=page when on /kitchen/plan (a non-primary kitchen route)', () => {
    renderTabBar('/kitchen/plan')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const active = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAccessibleName(/Operate/)
  })
})

describe('AC-T03: desktop viewport — no bottom tab bar', () => {
  it('renders nothing when useIsNarrow is false', () => {
    renderTabBar('/', { narrow: false })
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
  })
})

describe('a11y: every tab icon is aria-hidden', () => {
  it('all SVGs inside the tab bar are aria-hidden=true', () => {
    const { container } = renderTabBar('/')
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
    svgs.forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'))
  })
})
