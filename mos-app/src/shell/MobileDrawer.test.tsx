import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

vi.mock('../auth/useAuth')
import { useAuth } from '../auth/useAuth'

const mockUseAuth = vi.mocked(useAuth)

import MobileDrawer from './MobileDrawer'
import Header from './Header'

// R2: Helper to force narrow viewport (matches:true for useIsNarrow)
function setNarrowViewport(narrow: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: narrow,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

import { useState, useRef } from 'react'

function TestHarness() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const focusHamburgerRef = useRef<(() => void) | undefined>(undefined)
  return (
    <>
      <Header
        onOpenDrawer={() => setDrawerOpen(true)}
        onRegisterHamburgerFocus={(fn) => { focusHamburgerRef.current = fn }}
      />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        focusOpener={() => focusHamburgerRef.current?.()}
      />
      <LocationDisplay />
    </>
  )
}

function renderNarrow() {
  setNarrowViewport(true)
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
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
    },
    signOut: vi.fn(),
  })
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="*"
          element={<TestHarness />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  // Restore default matchMedia stub (matches:false)
  setNarrowViewport(false)
})

// AC-014: Mobile drawer behavior
describe('AC-014: Mobile drawer', () => {
  it('rail is hidden and hamburger is visible at narrow viewport', () => {
    renderNarrow()
    const hamburger = screen.getByRole('button', { name: /open navigation/i })
    expect(hamburger).toBeInTheDocument()
    // No persistent rail aside at narrow
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('activating hamburger opens a dialog with aria-modal and Primary navigation name', async () => {
    const user = userEvent.setup()
    renderNarrow()
    const hamburger = screen.getByRole('button', { name: /open navigation/i })
    await user.click(hamburger)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Primary navigation')
  })

  it('dialog contains the four nav items', async () => {
    const user = userEvent.setup()
    renderNarrow()
    await user.click(screen.getByRole('button', { name: /open navigation/i }))
    const dialog = screen.getByRole('dialog')
    // nav items are links within the dialog
    expect(dialog.querySelector('[href="/"]')).toBeTruthy()
    expect(dialog.querySelector('[href="/tasks"]')).toBeTruthy()
    expect(dialog.querySelector('[href="/updates"]')).toBeTruthy()
    expect(dialog.querySelector('[href="/ops"]')).toBeTruthy()
  })

  it('Escape closes drawer and returns focus to hamburger', async () => {
    const user = userEvent.setup()
    renderNarrow()
    const hamburger = screen.getByRole('button', { name: /open navigation/i })
    await user.click(hamburger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(hamburger).toHaveFocus()
  })

  it('Tab cycles focus within the dialog (focus stays inside)', async () => {
    const user = userEvent.setup()
    renderNarrow()
    await user.click(screen.getByRole('button', { name: /open navigation/i }))
    const dialog = screen.getByRole('dialog')

    // Get all focusables in the dialog
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    )
    expect(focusables.length).toBeGreaterThan(0)

    // Tab through all focusables — should wrap back inside
    for (let i = 0; i < focusables.length; i++) {
      await user.tab()
    }
    // After tabbing past the last item, focus wraps to first inside the dialog
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('clicking a nav item (Tasks) navigates to /tasks and closes the dialog', async () => {
    const user = userEvent.setup()
    renderNarrow()
    await user.click(screen.getByRole('button', { name: /open navigation/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Click Tasks link in the dialog
    const tasksLink = screen.getByRole('dialog').querySelector('[href="/tasks"]') as HTMLElement
    expect(tasksLink).toBeTruthy()
    await user.click(tasksLink)

    // Dialog closes
    expect(screen.queryByRole('dialog')).toBeNull()
    // Location updated
    expect(screen.getByTestId('location').textContent).toBe('/tasks')
  })
})
