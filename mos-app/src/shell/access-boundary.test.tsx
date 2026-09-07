/**
 * The access boundary (#800, OD-WAY-98 (8)) — what a denied deep link meets.
 *
 * The three route guards are rendered here rather than the component alone: "the guards render
 * the ONE boundary" is the claim, and a test that only mounts `<AccessBoundary />` would stay
 * green through a guard that quietly went back to `<Navigate to="/">`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { RequireAccessRole } from '@/auth/require-access-role'
import { AdminRoute } from '@/auth/admin-route'
import { RequireCapability } from '@/auth/require-capability'
import { REVENUE_VIEW_ROLES } from '@/lib/capabilities'
import { DESTINATIONS, UTILITY, isLive, navUtility, viewerAdmittedToRoute } from './destinations'
import { leafInThisTable, isRedirect, redirectProps } from '@/test/route-table'

const mockUseAuth = vi.mocked(useAuth)

function setViewer(accessRoles: string[]) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'U', email: null,
        must_change_password: false, archived_at: null, created_at: '', updated_at: '',
      },
      roles: [],
      isManager: false,
      accessRoles,
      affiliated: [],
    },
    signOut: vi.fn(),
  } as never)
}

/** Reports where a navigation landed — mounted so a redirect cannot pass as a rendered boundary. */
function Landing() {
  return <div data-testid="landing">{useLocation().pathname}</div>
}

/** Renders `guard` over `path`, with a live surface behind it and a catch-all in front of it. */
function renderAt(path: string, guard: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={guard}>
          <Route path={path} element={<div data-testid="surface">surface</div>} />
        </Route>
        <Route path="*" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  )
}

function panel(): HTMLElement {
  return screen.getByTestId('empty-state')
}

describe('access boundary', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // ── AC-019 ────────────────────────────────────────────────────────────────────────────────
  // Desktop is the default render: jsdom computes no layout, so "at 1440" is the un-narrowed
  // case, and the phone difference is a CSS contract (AC-021 below).
  describe('AC-019: a Sales member deep-links to /money', () => {
    beforeEach(() => {
      setViewer(['member'])
      renderAt('/money', <RequireAccessRole anyOf={REVENUE_VIEW_ROLES} />)
    })

    it('stays on the route — no surface, and nothing navigated', () => {
      expect(screen.queryByTestId('surface')).not.toBeInTheDocument()
      expect(screen.queryByTestId('landing')).not.toBeInTheDocument()
    })

    it('renders the page head titled for the area, with the Access required sentence', () => {
      const head = screen.getByTestId('page-head')
      expect(within(head).getByRole('heading', { level: 1 })).toHaveTextContent('Money')
      expect(within(head).getByText('Access required')).toBeInTheDocument()
    })

    it('renders one quiet dashed panel: the area sentence, the admin sentence, one outline Back', () => {
      expect(within(panel()).getByRole('heading', { level: 2 }))
        .toHaveTextContent('Money is outside your access')
      expect(within(panel()).getByText('An admin changes access in Admin Settings.'))
        .toBeInTheDocument()
      const back = within(panel()).getByRole('link', { name: 'Back to Home' })
      expect(back).toHaveClass('btn', 'btn-outline')
    })

    it('offers exactly one control in the panel — a wall is not a menu', () => {
      const controls = [
        ...within(panel()).queryAllByRole('link'),
        ...within(panel()).queryAllByRole('button'),
      ]
      expect(controls).toHaveLength(1)
    })

    it('names the area and nothing inside it — the boundary exposes no data', () => {
      // The whole rendered text is the area label plus the two fixed sentences. Any figure,
      // record title or count leaking through the guard would show up as an extra digit here.
      expect(panel().textContent).toBe(
        '—Money is outside your accessAn admin changes access in Admin Settings.Back to Home',
      )
    })
  })

  // ── AC-020 ────────────────────────────────────────────────────────────────────────────────
  it('AC-020: Finance at /admin/people is told the AREA, not the screen', () => {
    setViewer(['finance'])
    renderAt('/admin/people', <AdminRoute />)
    // `Admin Settings`, the thing an admin would grant — not `People`, a screen this viewer has
    // never been shown the name of.
    expect(screen.getByRole('heading', { level: 2 }))
      .toHaveTextContent('Admin Settings is outside your access')
    expect(screen.queryByTestId('landing')).not.toBeInTheDocument()
  })

  it('AC-020: Cafe Ops at /money/detail meets the Money panel — a child names its area', () => {
    setViewer(['ops_lead'])
    renderAt('/money/detail', <RequireAccessRole anyOf={REVENUE_VIEW_ROLES} />)
    expect(screen.getByRole('heading', { level: 2 }))
      .toHaveTextContent('Money is outside your access')
  })

  // ── AC-021 ────────────────────────────────────────────────────────────────────────────────
  describe('AC-021: phone (≤390)', () => {
    const css = readFileSync(resolve(__dirname, 'access-boundary.css'), 'utf8')
    const phoneBlock = css.slice(css.indexOf('@media'))

    it('the phone block runs the panel and its button to the full column', () => {
      expect(phoneBlock).toContain('@media (max-width: 767.98px)')
      expect(phoneBlock).toMatch(/\.access-boundary \.empty-state-frame \{[^}]*width: 100%/)
      expect(phoneBlock).toMatch(/\.access-boundary \.empty-state-frame \{[^}]*max-width: 100%/)
      expect(phoneBlock).toMatch(/\.access-boundary \.empty-actions \.btn \{[^}]*width: 100%/)
    })

    it('nothing in the file can push the column wider than the viewport', () => {
      // Full width plus padding overflows unless the border box owns the padding; and a fixed px
      // width would overflow a 390px column outright. Both are the horizontal-overflow defect.
      expect(css).toMatch(/\.access-boundary \.empty-state-frame \{[^}]*box-sizing: border-box/)
      expect(css).not.toMatch(/width:\s*\d+px/)
      expect(css).not.toMatch(/min-width:/)
    })

    it('the panel carries the class those rules target — a rule with no element is no rule', () => {
      setViewer(['member'])
      renderAt('/money', <RequireAccessRole anyOf={REVENUE_VIEW_ROLES} />)
      expect(panel()).toHaveClass('access-boundary')
      expect(within(panel()).getByRole('link', { name: 'Back to Home' }).parentElement)
        .toHaveClass('empty-actions')
    })

    it('Back lands on /', async () => {
      setViewer(['member'])
      renderAt('/money', <RequireAccessRole anyOf={REVENUE_VIEW_ROLES} />)
      await userEvent.click(screen.getByRole('link', { name: 'Back to Home' }))
      expect(screen.getByTestId('landing')).toHaveTextContent('/')
    })
  })

  // ── AC-022 ────────────────────────────────────────────────────────────────────────────────
  describe('AC-022: navigation is unchanged', () => {
    // The RENDERED sweep — every persona, every nav surface, both viewports — is owned by
    // `nav-reachability.test.tsx` and `ship-gate.test.tsx`. What is asserted here is the seam
    // those sweeps read, so this file fails if the boundary is ever mistaken for a reason to
    // widen a nav surface.
    it('a Sales member is offered no Money and no Admin door', () => {
      const money = DESTINATIONS.find((d) => d.id === 'money')!
      expect(isLive(money, ['member'])).toBe(false) // rail group, tab bar, More drawer
      expect(navUtility(['member']).map((u) => u.id)).not.toContain('admin')
      expect(viewerAdmittedToRoute('/money', ['member'])).toBe(false) // ⌘K
      expect(viewerAdmittedToRoute('/admin/people', ['member'])).toBe(false)
      // Not vacuous: the same authorities DO open the Admin door for an admin.
      expect(navUtility(['admin']).map((u) => u.id)).toContain('admin')
      expect(UTILITY.map((u) => u.id)).toContain('admin')
    })

    it('the ship gate stays a forward — a gated area never reaches a guard to be told about', () => {
      const leaf = leafInThisTable('/money')
      expect(leaf).toBeDefined()
      expect(isRedirect(leaf!.route.element)).toBe(true)
      expect(redirectProps(leaf!.route.element).to).toBe('/')
    })
  })

  // ── AC-023 ────────────────────────────────────────────────────────────────────────────────
  describe('AC-023: all three guards render the ONE boundary', () => {
    const CASES = [
      ['RequireAccessRole', '/money', <RequireAccessRole anyOf={REVENUE_VIEW_ROLES} />, 'Money'],
      ['AdminRoute', '/admin/people', <AdminRoute />, 'Admin Settings'],
      ['RequireCapability', '/work/projects', <RequireCapability capability="workline.manage" />, 'Work'],
    ] as const

    it.each(CASES)('%s renders the boundary in place for an authenticated viewer', (_n, path, guard, area) => {
      setViewer(['member'])
      renderAt(path, guard)
      expect(screen.queryByTestId('landing'), 'a guard navigated away').not.toBeInTheDocument()
      expect(screen.getByTestId('empty-state')).toHaveClass('access-boundary')
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(`${area} is outside your access`)
    })

    it.each(CASES)('%s still redirects before the session is authenticated — no boundary flash', (_n, path, guard) => {
      mockUseAuth.mockReturnValue({ status: 'loading' } as never)
      renderAt(path, guard)
      expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
      expect(screen.getByTestId('landing')).toHaveTextContent('/')
    })
  })
})
