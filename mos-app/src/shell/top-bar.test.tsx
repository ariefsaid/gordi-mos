import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('./use-is-narrow')
import { useIsNarrow } from './use-is-narrow'

vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue([]),
}))

vi.mock('../config/features', () => ({
  SHOW_WEEKLY_UPDATES: true,
  SHOW_DAILY_LOG: true,
  SHOW_USER_VIEWS: true,
  SHOW_ASSISTANT: true,
  SHOW_HOME_STACKED: false,
  SHOW_FOLLOWUPS: false,
  SHOW_PLAN_BUDGET: false,
}))

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

function renderTopBar(path = '/work/tasks', onOpenDrawer = vi.fn(), onOpenSearch = vi.fn(), onOpenCreate = vi.fn()) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<TopBar onOpenDrawer={onOpenDrawer} onOpenSearch={onOpenSearch} onOpenCreate={onOpenCreate} />} />
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

  it('AC-014/FR-007: the NotificationBell always renders (SHOW_INBOX retired — never a disabled stub)', () => {
    renderTopBar()
    const bell = screen.getByRole('button', { name: 'Inbox' })
    expect(bell.hasAttribute('disabled')).toBe(false)
    expect(bell.getAttribute('aria-disabled')).not.toBe('true')
  })

  it('renders localized top-bar chrome for Indonesian', () => {
    localStorage.setItem('mos.locale', 'id')
    renderTopBar()
    expect(screen.getByRole('button', { name: /Cari/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kotak Masuk' })).toBeInTheDocument()
  })
})

// E7 topbar parity — the Create button (Action Launcher trigger). Desktop-only; opens the
// shared command registry (the same command menu the mobile plus opens). Its accessible name
// is "Open actions" (actionLauncher.open), NOT "Create Task", so AC-014's no-universal-action
// assertion above still holds.
describe('E7 parity: Create button (Action Launcher)', () => {
  it('renders the Create button after the deputy launcher on desktop', () => {
    renderTopBar()
    const create = screen.getByRole('button', { name: 'Open actions' })
    expect(create).toBeInTheDocument()
    expect(create).toHaveTextContent('Create')
    const deputy = screen.getByRole('button', { name: /Open deputy/i })
    const precedes = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(precedes(deputy, create)).toBe(true)
  })

  it('clicking Create calls onOpenCreate', () => {
    const onOpenCreate = vi.fn()
    renderTopBar('/work/tasks', vi.fn(), vi.fn(), onOpenCreate)
    fireEvent.click(screen.getByRole('button', { name: 'Open actions' }))
    expect(onOpenCreate).toHaveBeenCalledOnce()
  })

  it('is desktop-only — absent at <920px (the bottom-tab plus is the phone launcher)', () => {
    mockUseIsNarrow.mockReturnValue(true)
    renderTopBar()
    expect(screen.queryByRole('button', { name: 'Open actions' })).toBeNull()
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
})

// AC-S06: hamburger at <920px opens the drawer (More menu on phone)
describe('AC-S06: Hamburger button at narrow viewports', () => {
  it('AC-S06: hamburger appears at <920px and opens the drawer', () => {
    const onOpenDrawer = vi.fn()
    mockUseIsNarrow.mockReturnValue(true)
    renderTopBar('/work/tasks', onOpenDrawer)
    const hamburger = screen.getByRole('button', { name: 'Open navigation' })
    fireEvent.click(hamburger)
    expect(onOpenDrawer).toHaveBeenCalledOnce()
  })

  it('AC-S06: hamburger is absent at ≥920px', () => {
    mockUseIsNarrow.mockReturnValue(false)
    renderTopBar()
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull()
  })
})
