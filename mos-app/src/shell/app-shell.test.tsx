import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes, Link, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))

vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn().mockResolvedValue([]),
  getPeople: vi.fn().mockResolvedValue([]),
}))

// The TopBar NotificationBell fires useUnreadCount → countUnread on mount. Mock it so that async
// read resolves cleanly instead of racing the test teardown. The bell is unconditional in the v4
// chrome — it reads no feature flag at all — so this mock is needed on every run, not only when a
// flag happens to be on. (SHOW_INBOX is fully retired as of #189 — it gated the /inbox route,
// which was its last reader; nothing conditions the Inbox any more.)
vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue([]),
}))

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'

const mockUseAuth = vi.mocked(useAuth)

import { AppShell } from './app-shell'

// AC-T01/T03 (plan §4.4): the shell renders a tabbar grid row + <BottomTabBar/>
// only at narrow viewport. Real matchMedia-backed useIsNarrow is exercised by
// the wide-viewport tests below (jsdom default: matches=false → wide); the
// narrow-viewport tests override matchMedia to simulate a phone viewport.
function setNarrow(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

afterEach(() => {
  setNarrow(false)
})
function renderShell(path = '/') {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000001',
        org_id: '10000000-0000-0000-0000-000000000001',
        user_id: 'auth-user-001',
        full_name: 'Cahya Cafe',
        email: 'cahya@gordi.id',
        archived_at: null,
        must_change_password: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
      accessRoles: [],
    },
    signOut: vi.fn(),
  })

  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div role="main">page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

// RI-shell-1 / AC-S02: AppShell grid structure — topbar spans full width, rail+main are siblings
describe('RI-shell-1 (AC-S02): AppShell grid structure', () => {
  it('AC-S02: TopBar is NOT nested inside the main column — it is a direct child of the shell grid', () => {
    const { container } = renderShell()
    // The shell grid is the outermost div with display:grid
    const shellGrid = container.querySelector('[style*="display: grid"]') as HTMLElement | null
    expect(shellGrid).not.toBeNull()
    // TopBar renders a <header>; it must be a direct child of the shell grid
    const header = shellGrid!.querySelector(':scope > header')
    expect(header).not.toBeNull()
    // The <header> must NOT be nested inside another div that is a child of the shell grid
    const directDivChildren = Array.from(shellGrid!.querySelectorAll(':scope > div'))
    const headerInsideDiv = directDivChildren.some((div) => div.querySelector('header') !== null)
    expect(headerInsideDiv).toBe(false)
  })

  it('AC-S02: shell grid uses grid-template-areas placing topbar across both columns at wide width', () => {
    const { container } = renderShell()
    const shellGrid = container.querySelector('[style*="display: grid"]') as HTMLElement | null
    expect(shellGrid).not.toBeNull()
    const areas = shellGrid!.style.gridTemplateAreas
    // At wide viewport (useIsNarrow defaults to false in these tests — no mock, real hook returns false)
    // The areas string must contain "topbar topbar" (topbar spans both cols)
    expect(areas).toContain('topbar topbar')
    expect(areas).toContain('rail')
    expect(areas).toContain('main')
  })

  it('AC-S02: brand column width token matches rail width token (--rail-w, not a literal)', () => {
    const { container } = renderShell()
    // The brand column div inside TopBar must reference --rail-w, not a raw pixel literal
    // We detect this by checking the inline style uses the CSS variable reference
    const brandCol = container.querySelector('[style*="--rail-w"]') as HTMLElement | null
    expect(brandCol).not.toBeNull()
  })

  it('AC-S02: Rail and outlet-wrapper are grid-area siblings (both direct children of shell grid)', () => {
    const { container } = renderShell()
    const shellGrid = container.querySelector('[style*="display: grid"]') as HTMLElement | null
    expect(shellGrid).not.toBeNull()
    // Rail renders as <aside>; outlet wrapper is the div with grid-area: main
    const aside = shellGrid!.querySelector(':scope > aside')
    expect(aside).not.toBeNull()
    const mainWrapper = shellGrid!.querySelector(':scope > [style*="grid-area"]') as HTMLElement | null
    // The outlet wrapper div must have grid-area: main
    expect(mainWrapper).not.toBeNull()
  })
})

// AC-015: exactly one nav landmark named "Primary", one banner, one main
describe('AC-015: Shell landmarks', () => {
  it('has exactly one navigation landmark named "Primary"', () => {
    renderShell()
    const navs = screen.getAllByRole('navigation', { name: 'Primary' })
    expect(navs).toHaveLength(1)
  })

  it('has exactly one banner landmark', () => {
    renderShell()
    const banners = screen.getAllByRole('banner')
    expect(banners).toHaveLength(1)
  })

  it('has exactly one main landmark (owned by the page/outlet, not the shell)', () => {
    renderShell()
    const mains = screen.getAllByRole('main')
    expect(mains).toHaveLength(1)
  })

  it('renders outlet content', () => {
    renderShell()
    expect(screen.getByText('page')).toBeInTheDocument()
  })
})

// AC-020: one page anatomy — header · context-row · content; no fifth region / second drawer host.
describe('AC-020: AppShell anatomy — four regions, no fifth region / second drawer', () => {
  it('AC-020: shell owns exactly three data-anatomy regions — header, context-row, content', () => {
    const { container } = renderShell()
    const regions = container.querySelectorAll('[data-anatomy]')
    const ids = Array.from(regions).map((r) => r.getAttribute('data-anatomy'))
    expect(ids.sort()).toEqual(['content', 'context-row', 'header'])
  })

  it('AC-020: ContextRow is mounted above the content Outlet (region 2 before region 3)', () => {
    const { container } = renderShell()
    const ctx = container.querySelector('[data-anatomy="context-row"]')
    const content = container.querySelector('[data-anatomy="content"]')
    expect(ctx).not.toBeNull()
    expect(content).not.toBeNull()
    // context-row precedes content in DOM order
    expect(
      Boolean(ctx!.compareDocumentPosition(content!) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true)
  })

  it('AC-020: no second drawer host / extra role=region added by the shell (only the context-row region)', () => {
    const { container } = renderShell()
    // The shell's only role=region is the context row (region 2). No competing drawer host.
    const regions = container.querySelectorAll('[role="region"]')
    expect(regions).toHaveLength(1)
    expect(regions[0]).toHaveAttribute('data-anatomy', 'context-row')
  })
})

// AC-K02: the command menu mounts at the shell level and opens via the trigger + ⌘K hotkey
describe('AC-K02: AppShell mounts the command menu', () => {
  it('AC-K02: the menu is closed by default (no dialog named "Command menu")', () => {
    renderShell()
    expect(screen.queryByRole('dialog', { name: 'Command menu' })).toBeNull()
  })

  it('AC-K02: clicking the Search trigger opens the command menu', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Search/i }))
    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeInTheDocument()
  })

  it('AC-K02: ⌘K opens the command menu globally', () => {
    renderShell()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeInTheDocument()
  })

  // STILL DEFERRED after #190 — now waiting on the SIGNALS SURFACE. v4's `AC-428` case here proves
  // the palette's Share Signal action opens the shell-mounted SignalComposerHost. That host mounts
  // `SignalComposer` and reads the Signals mention rosters from the database, neither of which is on
  // this branch, and the palette has no Share-Signal action to fire either. The case travels with
  // that surface rather than being weakened to fit this branch.
})

// Plan §4.4 (AC-T01/T03): phone chrome gains a tabbar grid row + BottomTabBar.
describe('AC-T01/AC-T03: AppShell tabbar row (narrow viewport)', () => {
  it('AC-T03: at wide viewport, the shell grid has no tabbar row and BottomTabBar does not render', () => {
    setNarrow(false)
    const { container } = renderShell()
    const shellGrid = container.querySelector('[style*="display: grid"]') as HTMLElement | null
    expect(shellGrid).not.toBeNull()
    expect(shellGrid!.style.gridTemplateAreas).not.toContain('tabbar')
    // Two "Primary" navs would exist if BottomTabBar rendered alongside the rail's nav.
    expect(screen.getAllByRole('navigation', { name: 'Primary' })).toHaveLength(1)
  })

  it('AC-T01: at narrow viewport, the shell grid gains a tabbar row and BottomTabBar renders', () => {
    setNarrow(true)
    const { container } = renderShell()
    const shellGrid = container.querySelector('[style*="display: grid"]') as HTMLElement | null
    expect(shellGrid).not.toBeNull()
    expect(shellGrid!.style.gridTemplateAreas).toContain('tabbar')
    expect(shellGrid!.style.gridTemplateRows).toContain('var(--tabbar-h)')
    // BottomTabBar's "Primary" nav is present alongside the rail being hidden.
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(nav).toBeInTheDocument()
    expect(container.querySelector(':scope > aside')).toBeNull()
  })
})

// WCAG 2.1 AA, 4.1.2 Name, Role, Value + 2.1.1 Keyboard: every interactive control the chrome
// renders is reachable by keyboard AND announces something. An icon-only control with no
// accessible name is announced as a bare "button" — the failure mode this chrome is most exposed
// to, because the compact rail, the top-bar cluster and the phone tab bar are all icon-first.
//
// Enumerated from the rendered DOM rather than from a list of controls, so a control added later
// is covered the moment it appears. Both viewports are walked: the desktop chrome (rail + top bar)
// and the phone chrome (bottom tab bar + launcher) render disjoint sets of controls.
describe('WCAG 2.1 AA: every interactive control in the chrome is named and keyboard-reachable', () => {
  const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]'

  // Scoped to the chrome the shell OWNS — the skip link, the header, the rail, the phone tab bar
  // and its launcher. Page content (inside #main-content) and the Deputy panel are other tickets'
  // surfaces and are not judged here.
  const CHROME_REGIONS = ['header', 'aside', 'nav[aria-label="Primary"]', '.mobile-action-launcher']

  function chromeControls(container: HTMLElement): HTMLElement[] {
    const found = new Set<HTMLElement>()
    const skip = container.querySelector<HTMLElement>('a[href="#main-content"]')
    if (skip) found.add(skip)
    for (const selector of CHROME_REGIONS) {
      for (const region of container.querySelectorAll<HTMLElement>(selector)) {
        if (region.matches(FOCUSABLE)) found.add(region)
        for (const el of region.querySelectorAll<HTMLElement>(FOCUSABLE)) found.add(el)
      }
    }
    // tabindex="-1" is programmatic-focus-only by design (the skip link's #main-content target),
    // not a control, and is deliberately out of the Tab order.
    return [...found].filter((el) => el.getAttribute('tabindex') !== '-1')
  }

  it.each([
    ['desktop (rail + top bar)', false],
    ['phone (bottom tab bar + launcher)', true],
  ])('%s: no chrome control is unnamed or removed from the Tab order', (_label, narrow) => {
    setNarrow(narrow)
    const { container } = renderShell()
    const controls = chromeControls(container)

    // Guards the enumeration: an empty or near-empty list would make the loop pass vacuously.
    // The phone chrome renders fewer controls than the desktop one, hence the modest floor.
    expect(controls.length).toBeGreaterThanOrEqual(5)

    for (const el of controls) {
      expect(el, `${el.tagName}.${el.className} has no accessible name`).toHaveAccessibleName()
      expect(el.getAttribute('tabindex'), `${el.tagName} is removed from the Tab order`).not.toBe('-1')
    }
  })

  it('the skip link is the first focusable element, so the chrome can be bypassed', () => {
    setNarrow(false)
    const { container } = renderShell()
    const first = container.querySelector<HTMLElement>(FOCUSABLE)
    expect(first).toHaveAccessibleName('Skip to main content')
    expect(first).toHaveAttribute('href', '#main-content')
    // And its target exists, or the bypass goes nowhere.
    expect(container.querySelector('#main-content')).not.toBeNull()
  })
})

// AC-016 (FR-014, User Story 6): the shell survives navigation. Moving between destinations must
// keep the SAME rail and header instances mounted — changing destination is not supposed to feel
// like reloading a different app.
//
// The instrument is DOM NODE IDENTITY, deliberately. React re-uses a component's host nodes only
// while that component stays mounted; a remount discards them and builds new ones. So holding the
// `<aside>` and `<header>` element objects across a navigation and comparing by reference detects
// exactly the failure this AC names — a route-level re-parent of AppShell, or a key on the rail
// that changes with the route — and little else. Asserting "the rail is still in the document"
// would NOT detect it: a freshly remounted rail is also in the document.
//
// The navigation is asserted first, so the identity check cannot pass vacuously by never moving.
describe('AC-016: the shell is not remounted when the viewer changes destination', () => {
  function LocationProbe({ label }: { label: string }) {
    const { pathname } = useLocation()
    return <div role="main">{label} at {pathname}</div>
  }

  function renderShellForNavigation() {
    setNarrow(false)
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: '40000000-0000-0000-0000-000000000001',
          org_id: '10000000-0000-0000-0000-000000000001',
          user_id: 'auth-user-001',
          full_name: 'Cahya Cafe',
          email: 'cahya@gordi.id',
          archived_at: null,
          must_change_password: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        roles: [],
        isManager: false,
        accessRoles: [],
      },
      signOut: vi.fn(),
    })
    return render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route
                index
                element={
                  <>
                    <LocationProbe label="home page" />
                    <Link to="/inbox">go to inbox</Link>
                  </>
                }
              />
              <Route path="inbox" element={<LocationProbe label="inbox page" />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
  }

  it('AC-016: the rail and header element instances survive a destination change', async () => {
    const { container } = renderShellForNavigation()

    const railBefore = container.querySelector('aside')
    const headerBefore = container.querySelector('header')
    expect(railBefore).not.toBeNull()
    expect(headerBefore).not.toBeNull()
    expect(screen.getByText(/home page at \//)).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'go to inbox' }))
    })

    // The navigation really happened — without this the identity check below is vacuous.
    expect(screen.getByText(/inbox page at \/inbox/)).toBeInTheDocument()

    // The SAME nodes, not merely nodes that still exist: a remount would have replaced them.
    expect(container.querySelector('aside')).toBe(railBefore)
    expect(container.querySelector('header')).toBe(headerBefore)
  })
})

