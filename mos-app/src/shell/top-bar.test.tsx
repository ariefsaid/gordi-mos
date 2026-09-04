import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('./use-is-narrow')
import { useIsNarrow } from './use-is-narrow'

// OD-REDESIGN-84.2 (P1-1): TopBar reads the rail's generic wide-width regime (the brand
// column's width must track Rail's own compact boundary). Mocked + defaulted to wide below so
// every pre-existing test keeps rendering the full-width brand unless it opts into compact.
vi.mock('./use-is-wide-overlay-width')
import { useIsWideOverlayWidth } from './use-is-wide-overlay-width'

vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue([]),
}))

vi.mock('../config/features', () => ({
  SHOW_USER_VIEWS: true,
  SHOW_ASSISTANT: true,
  SHOW_FOLLOWUPS: false,
  SHOW_PLAN_BUDGET: false,
}))

const mockUseAuth = vi.mocked(useAuth)
const mockUseIsNarrow = vi.mocked(useIsNarrow)
const mockUseIsWideOverlayWidth = vi.mocked(useIsWideOverlayWidth)

import { TopBar } from './top-bar'

const topBarCss = readFileSync(resolve(process.cwd(), 'src/shell/top-bar.css'), 'utf8')

const viewer = {
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
  roles: [],
  isManager: false,
  accessRoles: [],
}

function renderTopBar(path = '/work/tasks', onOpenDrawer = vi.fn(), onOpenSearch = vi.fn()) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<TopBar onOpenDrawer={onOpenDrawer} onOpenSearch={onOpenSearch} />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

// Same render, plus a probe that reports the router's current pathname, so a test can assert the
// bell actually moved the viewer rather than merely that it was clickable.
function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="loc">{loc.pathname}</span>
}

function renderTopBarWithLocation(path = '/work/tasks') {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <TopBar onOpenSearch={vi.fn()} />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockUseAuth.mockReturnValue({ status: 'authenticated', viewer, signOut: vi.fn() })
  mockUseIsNarrow.mockReturnValue(false)
  mockUseIsWideOverlayWidth.mockReturnValue(true)
})

// AC-014: top bar layout — brand · breadcrumb · spacer · Search⌘K · Inbox · Deputy;
// no universal-action buttons (Ask Deputy / Share Signal / Create Task) in the top bar.
describe('AC-014: TopBar layout (OD-57)', () => {
  it('AC-014: renders brand, breadcrumb, search trigger, inbox bell, and deputy launcher', () => {
    renderTopBar()
    expect(screen.getByText('Gordi MOS')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Search/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open deputy/i })).toBeInTheDocument()
    expect(screen.queryByText('Cahya Cafe')).toBeNull()
    expect(screen.queryByText('Barista')).toBeNull()
  })

  it('AC-014: order left→right is brand → breadcrumb → search → inbox → deputy', () => {
    renderTopBar()
    const brand = screen.getByText('Gordi MOS')
    const crumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    const search = screen.getByRole('button', { name: /Search/i })
    const inbox = screen.getByRole('button', { name: 'Inbox' })
    const deputy = screen.getByRole('button', { name: /Open deputy/i })
    const precedes = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(precedes(brand, crumb)).toBe(true)
    expect(precedes(crumb, search)).toBe(true)
    expect(precedes(search, inbox)).toBe(true)
    expect(precedes(inbox, deputy)).toBe(true)
  })

  it('AC-014: contains NO button labelled Ask Deputy / Share Signal / Create Task (those live in ⌘K)', () => {
    renderTopBar()
    expect(screen.queryByRole('button', { name: 'Ask Deputy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Share Signal' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create Task' })).toBeNull()
  })

  // The bell reads NO feature flag in the v4 chrome — Inbox is unconditionally live. SHOW_INBOX
  // still exists on this branch and still gates the /inbox ROUTE; what changed is that the header
  // control no longer consults it. This case would fail the moment a gate came back.
  it('AC-014/FR-007: the NotificationBell always renders — never a disabled stub', () => {
    renderTopBar()
    const bell = screen.getByRole('button', { name: 'Inbox' })
    expect(bell.hasAttribute('disabled')).toBe(false)
    expect(bell.getAttribute('aria-disabled')).not.toBe('true')
  })

  // The bell has two doors (#195): desktop quick-triage in the shared overlay host, phone (or no
  // host mounted) the full `/inbox` route — see top-bar-inbox-bell.test.tsx for the desktop door
  // and the record-open/focus-return cases, isolated there so their mocks don't perturb this
  // file's broader layout suite. This render has no `OverlayHostProvider`, so `host` is null and
  // the bell takes the same no-host fallback path a phone viewer gets — the case still worth
  // covering here since it is this file's own render shape, not duplicated from the other file.
  it('the Inbox bell navigates to the /inbox route (the door that is live without the overlay host)', () => {
    renderTopBarWithLocation()
    expect(screen.getByTestId('loc')).toHaveTextContent('/work/tasks')
    fireEvent.click(screen.getByRole('button', { name: 'Inbox' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('/inbox')
  })

  it('renders localized top-bar chrome for Indonesian', () => {
    localStorage.setItem('mos.locale', 'id')
    renderTopBar()
    expect(screen.getByRole('button', { name: /Cari/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kotak Masuk' })).toBeInTheDocument()
  })
})

// OD-REDESIGN-91 #16 (F1) — the top-bar Create button is REMOVED app-wide (enforces
// experience-contract Rule 7: creation lives in the ⌘K palette, not as a header button).
// Desktop creation = ⌘K + page CTAs; the phone keeps its bottom-tab + launcher. This is a
// deliberate UX change: the journey (no header Create control) changed, and the goal — one
// solid primary per screen, creation via the palette — is asserted below.
describe('OD-REDESIGN-91 #16: no top-bar Create button', () => {
  it('renders NO Create button on desktop', () => {
    renderTopBar()
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull()
  })

  it('renders NO Create button at <920px either (the bottom-tab plus is the phone launcher)', () => {
    mockUseIsNarrow.mockReturnValue(true)
    renderTopBar()
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull()
  })
})

// AC-K02: the ⌘K search trigger opens the command menu
describe('AC-K02: Search trigger opens the command menu', () => {
  it('AC-K02: clicking the Search trigger calls onOpenSearch', () => {
    const onOpenSearch = vi.fn()
    renderTopBar('/work/tasks', vi.fn(), onOpenSearch)
    fireEvent.click(screen.getByRole('button', { name: /Search/i }))
    expect(onOpenSearch).toHaveBeenCalledOnce()
  })
})

// AC-S08: top bar is a <header> banner landmark
describe('AC-S08: TopBar is a banner landmark', () => {
  it('AC-S08: top bar renders as a <header> banner landmark', () => {
    renderTopBar()
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })
})

// AC-S02/S03: brand column token + breadcrumb min-w-0
describe('AC-S02/S03: Brand column token + breadcrumb min-w-0', () => {
  it('phone breadcrumb keeps the leaf inline and constrained beside the control cluster', () => {
    mockUseIsNarrow.mockReturnValue(true)
    const { container } = renderTopBar('/work/tasks')
    const header = container.querySelector('[data-anatomy="header"]')!
    const breadcrumbTrack = container.querySelector('.top-bar__breadcrumb-track')!
    const leaf = container.querySelector('.top-bar__breadcrumb-leaf')!
    expect(header).toHaveClass('top-bar')
    expect(breadcrumbTrack).toHaveClass('top-bar__breadcrumb-track')
    expect(leaf).toHaveClass('top-bar__breadcrumb-leaf')
    expect(topBarCss).toMatch(/\.top-bar__breadcrumb-track\s*\{[^}]*min-width:\s*0/)
    expect(topBarCss).toMatch(/@media \(max-width: 767\.98px\)[\s\S]*\.top-bar__breadcrumb\s*\{[^}]*white-space:\s*nowrap[^}]*min-width:\s*0[^}]*overflow:\s*hidden/)
    expect(topBarCss).toMatch(/@media \(max-width: 767\.98px\)[\s\S]*\.top-bar__breadcrumb-leaf\s*\{[^}]*display:\s*inline-block[^}]*max-width:\s*100%[^}]*vertical-align:\s*bottom[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/)
  })

  it('AC-S02: brand column references --rail-w token and has border-r', () => {
    const { container } = renderTopBar()
    const brandCol = container.querySelector('[style*="--rail-w"]') as HTMLElement | null
    expect(brandCol).not.toBeNull()
    expect(brandCol!.className).toMatch(/border-r/)
  })

  it('AC-S03: breadcrumb track has min-w-0 class', () => {
    const { container } = renderTopBar()
    expect(container.querySelector('.min-w-0')).not.toBeNull()
  })

  // OD-REDESIGN-84.2 (P1-1): the 920–1099.98px icon rail — the brand column narrows to
  // --rail-w-compact and drops the "Gordi MOS" wordmark (72px only fits the mark), keeping
  // the divider aligned with the rail's own compact boundary.
  it('P1-1: at the compact rail regime, the brand column narrows to --rail-w-compact and drops the wordmark', () => {
    mockUseIsWideOverlayWidth.mockReturnValue(false)
    const { container } = renderTopBar()
    const brandCol = container.querySelector('[style*="--rail-w-compact"]') as HTMLElement | null
    expect(brandCol).not.toBeNull()
    expect(screen.queryByText('Gordi MOS')).toBeNull()
  })
})

// AC-S06 REPLACED, not relaxed. The header hamburger is GONE in the v4 shell (its Task 1: the
// bottom-tab More button is the drawer's sole opener, so there is only ever one opener to track
// focus-return for — top-bar.tsx and app-shell.tsx both state it). The old pair of cases asserted
// the opener existed on phone and not on desktop; the replacement asserts the actual contract, on
// both viewports, and would fail the moment a header hamburger came back.
describe('v4 shell Task 1: no header hamburger — the bottom-tab More button is the drawer opener', () => {
  it('the header carries no navigation opener at <920px (the bottom tab bar owns it)', () => {
    mockUseIsNarrow.mockReturnValue(true)
    renderTopBar('/work/tasks')
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull()
    // The phone header carries its real controls alongside the bottom-tab Inbox entry.
    expect(screen.getByRole('button', { name: /Search/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open deputy/i })).toBeInTheDocument()
  })

  it('the header carries no navigation opener at ≥920px either (the rail is the nav)', () => {
    mockUseIsNarrow.mockReturnValue(false)
    renderTopBar()
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull()
  })
})

// AC-002 (#545, FR-002): the top-bar bell is an Inbox door at every viewport. The bottom-tab
// Inbox entry with its unread badge remains available on phones. One test, both arms.
describe('AC-002: the Inbox bell renders at every viewport (#545)', () => {
  it('narrow and desktop viewports: bell present', () => {
    mockUseIsNarrow.mockReturnValue(true)
    const phone = renderTopBar()
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument()
    phone.unmount()

    mockUseIsNarrow.mockReturnValue(false)
    renderTopBar()
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument()
  })
})
