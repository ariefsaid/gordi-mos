import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { Rail } from './rail'
import { __resetRailCollapsePrefForTests } from './use-rail-collapse-pref'
import { useRailCompact } from './use-rail-compact'

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

function renderRail(props: { compact?: boolean; collapsible?: boolean } = {}) {
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
  // The collapse preference is a module-level store (useSyncExternalStore); clearing storage
  // alone would leave the previous case's snapshot in memory.
  __resetRailCollapsePrefForTests()
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

// ── #442 — the user-controlled collapse ─────────────────────────────────────────────────────
//
// These mount the rail WIRED THE WAY THE SHELL WIRES IT (`useRailCompact` → `compact` +
// `collapsible`), because the journey under test is "I press the control and the rail collapses",
// and a Rail holding a hard-coded `compact` prop could never show that.

function stubWidth(px: number) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('919.98') ? px <= 919.98 : query.includes('1100') ? px >= 1100 : false,
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

function ShellWiredRail() {
  const { compact, collapsible } = useRailCompact()
  return <Rail compact={compact} collapsible={collapsible} />
}

function renderShellWiredRail() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/tasks']}>
          <ShellWiredRail />
        </MemoryRouter>
      </I18nProvider>
    </ThemeProvider>,
  )
}

describe('Rail — user-controlled collapse (#442)', () => {
  it('offers a labelled collapse control at 1280px, expanded, describing the nav it controls', () => {
    stubWidth(1280)
    renderShellWiredRail()
    const toggle = screen.getByRole('button', { name: 'Collapse navigation' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle.getAttribute('aria-controls')).toBe('rail-primary-nav')
    expect(document.getElementById('rail-primary-nav')).toBe(screen.getByRole('navigation', { name: 'Primary' }))
  })

  it('pressing it collapses the rail to the SAME compact rendering the width regime uses', async () => {
    stubWidth(1280)
    const { container } = renderShellWiredRail()
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.style.width).toBe('var(--rail-w)')

    await userEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))

    expect(aside.style.width).toBe('var(--rail-w-compact)')
    expect(aside.getAttribute('data-rail-compact')).toBe('true')
    // The compact regime's own markers, unchanged — proof this is the existing path, not a
    // second collapsed style: group overline gone, every destination still reachable by name.
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).queryByText('Destinations')).toBeNull()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tasks' })).toBeInTheDocument()
  })

  it('flips its own label and aria-expanded once collapsed, so it can be pressed back', async () => {
    stubWidth(1280)
    renderShellWiredRail()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    const toggle = screen.getByRole('button', { name: 'Expand navigation' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('is keyboard-operable — reachable by Tab and fired by Enter and by Space', async () => {
    stubWidth(1280)
    const { container } = renderShellWiredRail()
    const aside = container.querySelector('aside') as HTMLElement

    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(aside.style.width).toBe('var(--rail-w-compact)')

    await userEvent.keyboard(' ')
    expect(aside.style.width).toBe('var(--rail-w)')
  })

  it('remembers the collapse across a full remount', async () => {
    stubWidth(1280)
    const first = renderShellWiredRail()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    first.unmount()

    // Reset the in-memory snapshot the way a page reload would; storage is the only carrier left.
    __resetRailCollapsePrefForTests()
    const second = renderShellWiredRail()
    const aside = second.container.querySelector('aside') as HTMLElement
    expect(aside.style.width).toBe('var(--rail-w-compact)')
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument()
  })

  it('offers no control in the 920–1099.98px band, where width decides and a press could not', () => {
    stubWidth(1000)
    const { container } = renderShellWiredRail()
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.style.width).toBe('var(--rail-w-compact)')
    expect(screen.queryByRole('button', { name: 'Collapse navigation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Expand navigation' })).toBeNull()
  })

  it('a stored collapse does not survive into that band as anything the user can undo', () => {
    stubWidth(1000)
    localStorage.setItem('mos.rail.collapsed', 'true')
    __resetRailCollapsePrefForTests()
    const { container } = renderShellWiredRail()
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.style.width).toBe('var(--rail-w-compact)')
    expect(screen.queryByRole('button', { name: 'Expand navigation' })).toBeNull()
  })

  it('honours a stored collapse on first paint at 1280px — no expanded flash to correct', () => {
    stubWidth(1280)
    localStorage.setItem('mos.rail.collapsed', 'true')
    __resetRailCollapsePrefForTests()
    const { container } = renderShellWiredRail()
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.style.width).toBe('var(--rail-w-compact)')
  })
})
