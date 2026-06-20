import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('./use-is-narrow')
import { useIsNarrow } from './use-is-narrow'

const mockUseAuth = vi.mocked(useAuth)
const mockUseIsNarrow = vi.mocked(useIsNarrow)

import { TopBar } from './top-bar'

const viewer = {
  person: {
    id: '40000000-0000-0000-0000-000000000001',
    org_id: '10000000-0000-0000-0000-000000000001',
    user_id: 'auth-user-001',
    full_name: 'Cahya Cafe',
    email: 'cahya@gordi.id',
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  roles: [],
  isManager: false,
  accessRoles: [],
}

function renderTopBar(path = '/tasks', onOpenDrawer = vi.fn(), onOpenSearch = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<TopBar onOpenDrawer={onOpenDrawer} onOpenSearch={onOpenSearch} />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ status: 'authenticated', viewer, signOut: vi.fn() })
  mockUseIsNarrow.mockReturnValue(false)
})

// AC-S01: top bar shows elements in the correct order
describe('AC-S01: TopBar order — brand · breadcrumb · search · bell · user', () => {
  it('AC-S01: top bar shows brand wordmark, breadcrumb nav, search trigger, bell, and user chip', () => {
    renderTopBar()
    // Brand wordmark
    expect(screen.getByText('Gordi MOS')).toBeInTheDocument()
    // Breadcrumb navigation landmark
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    // ⌘K search trigger
    expect(screen.getByRole('button', { name: /Search/i })).toBeInTheDocument()
    // Notification bell
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    // User chip (the viewer's name as the accessible name)
    expect(screen.getByRole('button', { name: viewer.person.full_name })).toBeInTheDocument()
  })

  it('AC-S01: elements appear in DOM order brand → breadcrumb → search → bell → user', () => {
    renderTopBar()
    // DOCUMENT_POSITION_FOLLOWING (4) means the arg comes AFTER the node — assert each precedes the next.
    const brand = screen.getByText('Gordi MOS')
    const crumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    const search = screen.getByRole('button', { name: /Search/i })
    const bell = screen.getByRole('button', { name: 'Notifications' })
    const user = screen.getByRole('button', { name: viewer.person.full_name })
    const precedes = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(precedes(brand, crumb)).toBe(true)
    expect(precedes(crumb, search)).toBe(true)
    expect(precedes(search, bell)).toBe(true)
    expect(precedes(bell, user)).toBe(true)
  })
})

// AC-K02: the ⌘K search trigger opens the command menu
describe('AC-K02: Search trigger opens the command menu', () => {
  it('AC-K02: clicking the Search trigger calls onOpenSearch', () => {
    const onOpenSearch = vi.fn()
    renderTopBar('/tasks', vi.fn(), onOpenSearch)
    fireEvent.click(screen.getByRole('button', { name: /Search/i }))
    expect(onOpenSearch).toHaveBeenCalledOnce()
  })
})

// AC-S07: notification bell is a disabled stub
describe('AC-S07: Notification bell is a non-functional stub', () => {
  it('AC-S07: notification bell is a disabled stub with accessible name', () => {
    renderTopBar()
    const bell = screen.getByRole('button', { name: 'Notifications' })
    // Disabled — either disabled attribute or aria-disabled
    const isDisabled = bell.hasAttribute('disabled') || bell.getAttribute('aria-disabled') === 'true'
    expect(isDisabled).toBe(true)
  })
})

// AC-S08: top bar is a <header> banner landmark; exactly one banner
describe('AC-S08: TopBar is a banner landmark', () => {
  it('AC-S08: top bar renders as a <header> banner landmark', () => {
    renderTopBar()
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('AC-S08: user chip name ellipsizes — name element has truncate class', () => {
    renderTopBar()
    // The user name text node should exist and its container should have truncate
    const nameEl = screen.getByText(viewer.person.full_name)
    // The element itself or a parent carries truncate (checked via className)
    const hasTruncate =
      nameEl.classList.contains('truncate') ||
      nameEl.closest('[class*="truncate"]') !== null
    expect(hasTruncate).toBe(true)
  })
})

// AC-S02/S03: brand column is fixed 236px with right divider; breadcrumb track is min-w-0
describe('AC-S02/S03: Brand column is fixed and breadcrumb track is min-w-0', () => {
  it('AC-S02: brand column has border-r class and width references --rail-w token (not a literal px)', () => {
    const { container } = renderTopBar()
    // Brand column must use the --rail-w CSS variable so it stays aligned with the rail
    const brandCol = container.querySelector('[style*="--rail-w"]') as HTMLElement | null
    expect(brandCol).not.toBeNull()
    expect(brandCol!.className).toMatch(/border-r/)
  })

  it('AC-S03: breadcrumb track has min-w-0 class (long crumb cannot shove brand)', () => {
    const { container } = renderTopBar()
    // The breadcrumb wrapper div carries min-w-0
    const crumbTrack = container.querySelector('.min-w-0')
    expect(crumbTrack).not.toBeNull()
  })

  it('AC-S03: current breadcrumb crumb ellipsizes — truncate + title attribute', () => {
    renderTopBar('/tasks')
    // The current crumb ("Tasks") must truncate and expose its full text via title.
    const crumb = screen.getByText('Tasks')
    const truncating = crumb.classList.contains('truncate') || crumb.closest('[class*="truncate"]') !== null
    expect(truncating).toBe(true)
    const titled = crumb.getAttribute('title') === 'Tasks' || crumb.closest('[title="Tasks"]') !== null
    expect(titled).toBe(true)
  })
})

// AC-S06: hamburger at <920px
describe('AC-S06: Hamburger button at narrow viewports', () => {
  it('AC-S06: hamburger appears at <920px and opens the drawer', () => {
    const onOpenDrawer = vi.fn()
    mockUseIsNarrow.mockReturnValue(true)
    renderTopBar('/tasks', onOpenDrawer)
    const hamburger = screen.getByRole('button', { name: 'Open navigation' })
    expect(hamburger).toBeInTheDocument()
    fireEvent.click(hamburger)
    expect(onOpenDrawer).toHaveBeenCalledOnce()
  })

  it('AC-S06: hamburger is absent at ≥920px', () => {
    mockUseIsNarrow.mockReturnValue(false)
    renderTopBar()
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull()
  })

  it('AC-S06 a11y: hamburger has aria-expanded reflecting drawer state', () => {
    mockUseIsNarrow.mockReturnValue(true)
    // drawerOpen defaults to false in the helper render (TopBarProps.drawerOpen not passed)
    renderTopBar()
    const hamburger = screen.getByRole('button', { name: 'Open navigation' })
    expect(hamburger).toHaveAttribute('aria-expanded', 'false')
  })
})

// A11y: notification bell title attribute communicates intent when disabled
describe('A11y: Notification bell title', () => {
  it('notification bell disabled stub has a title communicating coming-soon intent', () => {
    renderTopBar()
    const bell = screen.getByRole('button', { name: 'Notifications' })
    expect(bell).toHaveAttribute('title', 'Notifications — coming soon')
  })
})
