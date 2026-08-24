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

// OD-REDESIGN-68: the module bottom-tab is role-scoped to the viewer's job role, so a viewer
// needs a matching job-role NAME (not just an access role) to see e.g. the Café slot.
function setAuthAs(accessRoles: string[] = [], roleNames: string[] = []) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Test User',
        email: 't@example.test', archived_at: null, must_change_password: false, created_at: '', updated_at: '',
      },
      roles: roleNames.map((name, i) => ({
        id: `r${i}`, org_id: 'o1', business_unit_id: `bu${i}`, name,
        reports_to_role_id: null, created_at: '', updated_at: '',
      })),
      isManager: false, accessRoles,
    },
    signOut: vi.fn(),
  })
}

// A café-affiliated viewer (job role name matches the Café module's workMatch) — the
// persona that OD-68 promotes the Café slot for.
function setCafeViewer() {
  setAuthAs([], ['Café Ops Lead'])
}

function renderTabBar(initialPath = '/', {
  narrow = true,
  onOpenMore = vi.fn(),
  onOpenActionLauncher = vi.fn(),
  onRegisterMoreFocus,
}: { narrow?: boolean; onOpenMore?: () => void; onOpenActionLauncher?: () => void; onRegisterMoreFocus?: (focus: () => void) => void } = {}) {
  mockUseIsNarrow.mockReturnValue(narrow)
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="*" element={<BottomTabBar onOpenMore={onOpenMore} onOpenActionLauncher={onOpenActionLauncher} onRegisterMoreFocus={onRegisterMoreFocus} />} />
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

describe('AC-021 / OD-REDESIGN-68: phone bottom-nav is Home · Work · <role module> · Inbox · More', () => {
  it('a café-affiliated viewer sees Home · Work · Café · Inbox + More, in order', () => {
    setCafeViewer()
    renderTabBar('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'Work', 'Café', 'Inbox'])
    expect(within(nav).getByRole('button', { name: /More/i })).toBeInTheDocument()
  })

  it('an org-wide viewer with no module role omits the module slot (Home · Work · Inbox + More)', () => {
    setAuthAs(['admin']) // org-wide role, no café/roastery job role → no module tab (OD-68)
    renderTabBar('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'Work', 'Inbox'])
    expect(within(nav).queryByRole('link', { name: /Café/ })).toBeNull()
    expect(within(nav).getByRole('button', { name: /More/i })).toBeInTheDocument()
  })

  // #444: this asserted that a roastery viewer's third slot is Roastery. Roastery is ship-gated
  // (post-MVP), so it is not a module anyone can be promoted INTO — the slot is empty and the bar
  // falls back to its three fixed tabs, which is the same "no matching module" path an org-wide
  // role already takes. The promotion mechanism itself is still proven by the café case below,
  // where the module does ship.
  it('a roastery viewer gets no promoted module slot while Roastery is ship-gated', () => {
    setAuthAs([], ['Roastery Lead'])
    renderTabBar('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'Work', 'Inbox'])
    expect(within(nav).queryByRole('link', { name: /Roastery/ })).toBeNull()
  })

  it('primary tabs link to /, /work/tasks, /cafe, /inbox (café viewer)', () => {
    setCafeViewer()
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

  it('registers the More button as the drawer focus-return target', () => {
    let returnFocus: (() => void) | undefined
    renderTabBar('/', { onRegisterMoreFocus: (focus) => { returnFocus = focus } })
    const more = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: /More/i })
    expect(returnFocus).toBeDefined()
    returnFocus?.()
    expect(more).toHaveFocus()
  })

  it('the persistent phone plus launcher opens the approved action launcher', () => {
    const onOpenActionLauncher = vi.fn()
    renderTabBar('/', { onOpenActionLauncher })
    const launcher = screen.getByRole('button', { name: /open actions/i })
    expect(launcher).toHaveClass('mobile-action-launcher')
    expect(launcher).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(launcher)
    expect(onOpenActionLauncher).toHaveBeenCalledOnce()
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

  it('Café tab page at /cafe/log (café viewer)', () => {
    setCafeViewer()
    renderTabBar('/cafe/log')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const page = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(page).toHaveLength(1)
    expect(page[0]).toHaveAccessibleName(/Café/)
  })

  // UPDATED, not relaxed — and it is the SAME Rule-5 contract, read the other way round. These
  // three cases used to require the More button to carry aria-current="page" whenever a
  // non-primary destination was active. The v4 shell rebuild (Task 3/5, stated in
  // bottom-tab-bar.tsx) rules that More is a DOOR, not a location: it carries dialog-disclosure
  // semantics (aria-haspopup/aria-expanded) and never aria-current. The current-location marker
  // for a destination with no bottom tab moves to the BREADCRUMB LEAF instead — I7, "rail owns
  // it; breadcrumb leaf when the viewer has no rail entry", implemented in breadcrumb.tsx and
  // asserted there. Exactly-one-marker is therefore still the contract; what changed is which
  // element carries it. Asserting the absence alone would be weaker than the original, so each
  // case also asserts the disclosure semantics that replaced it.
  it('More is a disclosure, not a location, at /events (non-primary)', () => {
    renderTabBar('/events')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const more = within(nav).getByRole('button', { name: /More/i })
    expect(more).not.toHaveAttribute('aria-current')
    expect(more).toHaveAttribute('aria-haspopup', 'dialog')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    // No primary tab claims the page either — the breadcrumb leaf carries it on this route.
    expect(within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(0)
  })

  it('More is a disclosure, not a location, at /profile', () => {
    renderTabBar('/profile')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const more = within(nav).getByRole('button', { name: /More/i })
    expect(more).not.toHaveAttribute('aria-current')
    expect(more).toHaveAttribute('aria-haspopup', 'dialog')
    expect(within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(0)
  })

  it('More is a disclosure, not a location, at /money (finance viewer)', () => {
    setAuthAs(['finance'])
    renderTabBar('/money')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const more = within(nav).getByRole('button', { name: /More/i })
    expect(more).not.toHaveAttribute('aria-current')
    expect(more).toHaveAttribute('aria-haspopup', 'dialog')
    expect(within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(0)
  })
})

// OD-REDESIGN-64/F-B + Experience Contract Rule 5/9: the Work bottom-nav tab points
// at /work/tasks but must carry aria-current="page" for EVERY /work/* child
// (signals, projects, objectives) so exactly one current-location marker exists on
// every phone route. Mirrors the desktop rail's `to="/work"` NavLink semantics.
describe('F-B / Rule 5/9: Work tab is aria-current=page for every /work/* child on phone', () => {
  const WORK_CHILDREN = ['work/signals', 'work/projects', 'work/objectives']

  it.each(WORK_CHILDREN)('marks the Work tab page (and exactly one marker) at /%s', (path) => {
    renderTabBar(`/${path}`)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pageLinks = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(pageLinks).toHaveLength(1)
    expect(pageLinks[0]).toHaveAccessibleName(/Work/)
    // More must NOT also be page on a /work/* route (no co-activation)
    const more = within(nav).getByRole('button', { name: /More/i })
    expect(more).not.toHaveAttribute('aria-current', 'page')
  })

  it('does NOT mark Work active on an unrelated route (/inbox)', () => {
    renderTabBar('/inbox')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const workLink = within(nav).getByRole('link', { name: /Work/ })
    expect(workLink).not.toHaveAttribute('aria-current', 'page')
    const inboxLink = within(nav).getByRole('link', { name: /Inbox/ })
    expect(inboxLink).toHaveAttribute('aria-current', 'page')
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
