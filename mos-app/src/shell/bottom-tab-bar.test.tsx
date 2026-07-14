/**
 * BottomTabBar tests — Redesign Step 2 (T15). Phone bottom-nav = Home · Work ·
 * Café · Inbox · More (5). More opens the More menu; More carries aria-current=
 * page when a non-primary destination is active (AC-021/022 unit arm).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
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
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Test User',
        email: 't@gordi.id', archived_at: null, created_at: '', updated_at: '',
      },
      roles: [], isManager: false, accessRoles,
    },
    signOut: vi.fn(),
  })
}

function renderTabBar(initialPath = '/', { narrow = true, onOpenMore = vi.fn() }: { narrow?: boolean; onOpenMore?: () => void } = {}) {
  mockUseIsNarrow.mockReturnValue(narrow)
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="*" element={<BottomTabBar onOpenMore={onOpenMore} />} />
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

describe('AC-021: phone bottom-nav = Home · Work · Café · Inbox · More', () => {
  it('renders exactly 4 primary links + a More button, in order', () => {
    renderTabBar('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'Work', 'Café', 'Inbox'])
    expect(within(nav).getByRole('button', { name: /More/i })).toBeInTheDocument()
  })

  it('primary tabs link to /, /work/tasks, /cafe, /inbox', () => {
    renderTabBar('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: /Home/ })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: /Work/ })).toHaveAttribute('href', '/work/tasks')
    expect(within(nav).getByRole('link', { name: /Café/ })).toHaveAttribute('href', '/cafe')
    expect(within(nav).getByRole('link', { name: /Inbox/ })).toHaveAttribute('href', '/inbox')
  })

  it('More button calls onOpenMore', () => {
    const onOpenMore = vi.fn()
    renderTabBar('/', { onOpenMore })
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: /More/i }))
    expect(onOpenMore).toHaveBeenCalledOnce()
  })
})

describe('AC-021/008: aria-current — primary tab page on its route; More page on non-primary', () => {
  it('Home tab page at /', () => {
    renderTabBar('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const page = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(page).toHaveLength(1)
    expect(page[0]).toHaveAccessibleName(/Home/)
  })

  it('Work tab page at /work/tasks', () => {
    renderTabBar('/work/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const page = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(page).toHaveLength(1)
    expect(page[0]).toHaveAccessibleName(/Work/)
  })

  it('Café tab page at /cafe/log', () => {
    renderTabBar('/cafe/log')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const page = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(page).toHaveLength(1)
    expect(page[0]).toHaveAccessibleName(/Café/)
  })

  it('More button carries aria-current=page at /events (non-primary)', () => {
    renderTabBar('/events')
    const more = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: /More/i })
    expect(more).toHaveAttribute('aria-current', 'page')
    // and no primary tab is page
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(0)
  })

  it('More button carries aria-current=page at /profile', () => {
    renderTabBar('/profile')
    const more = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: /More/i })
    expect(more).toHaveAttribute('aria-current', 'page')
  })

  it('More button carries aria-current=page at /money (finance viewer)', () => {
    setAuthAs(['finance'])
    renderTabBar('/money')
    const more = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: /More/i })
    expect(more).toHaveAttribute('aria-current', 'page')
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
