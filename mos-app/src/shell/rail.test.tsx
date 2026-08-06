import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { Rail } from './rail'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('./use-rail-counts', () => ({ useRailCounts: () => null }))

function setAuthAs(roleNames: string[] = ['Managing Director']) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000001',
        org_id: '10000000-0000-0000-0000-000000000001',
        user_id: 'auth-user-001',
        full_name: 'Cahya Cafe',
        email: 'cahya@example.test',
        archived_at: null,
        must_change_password: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: roleNames.map((n, i) => ({ id: `r${i}`, org_id: 'o1', business_unit_id: 'bu-cafe', name: n, reports_to_role_id: null, created_at: '', updated_at: '' })),
      isManager: false,
      accessRoles: ['admin'],
    },
    signOut: vi.fn(),
  })
}

function renderRail(props: { compact?: boolean } = {}) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/tasks']}>
          <Rail {...props} />
        </MemoryRouter>
      </I18nProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setAuthAs()
})

// OD-REDESIGN-84.2 (P1-1): Rail is the desktop wrapper — this suite covers its own width-var
// threading + compact-prop plumbing; RailNav's own compact-regime content assertions (labels
// sr-only, overlines absent, badges present) live in rail-nav.test.tsx.
describe('Rail — width regime (OD-REDESIGN-84.2 / P1-1)', () => {
  it('defaults to the full 232px rail width', () => {
    const { container } = renderRail()
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.style.width).toBe('var(--rail-w)')
    expect(aside.getAttribute('data-rail-compact')).toBeNull()
  })

  it('compact=true renders the 72px icon-only rail width and tags data-rail-compact', () => {
    const { container } = renderRail({ compact: true })
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.style.width).toBe('var(--rail-w-compact)')
    expect(aside.getAttribute('data-rail-compact')).toBe('true')
  })

  it('compact=true still renders every destination link, reachable by its accessible name', () => {
    renderRail({ compact: true })
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Work' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tasks' })).toBeInTheDocument()
  })

  it('compact=true hides the "Destinations" group overline while keeping the links reachable', () => {
    renderRail({ compact: true })
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).queryByText('Destinations')).toBeNull()
  })

  it('compact=false (default) shows the "Destinations" group overline', () => {
    renderRail()
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByText('Destinations')).toBeInTheDocument()
  })

  // NAV-2: the compact rail must NOT be a scroll container, or `overflow-x` computes to `auto`
  // and clips the label tooltip that escapes the 72px aside to the right. Full rail keeps scroll.
  it('compact=true makes the aside overflow visible so the label tooltip can disclose', () => {
    const { container } = renderRail({ compact: true })
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.style.overflow).toBe('visible')
    expect(aside.style.overflowY).toBe('')
  })

  it('compact=false keeps the aside vertically scrollable (no tooltip to clip)', () => {
    const { container } = renderRail()
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.style.overflowY).toBe('auto')
    expect(aside.style.overflow).toBe('')
  })
})
