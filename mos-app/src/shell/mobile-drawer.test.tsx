/**
 * MobileDrawer tests — Redesign Step 2 (T15). The drawer is now the "More" menu:
 * every authorized non-primary destination (Events, Money, Ecommerce, Roastery,
 * Admin, Profile) as plain links (no aria-current — the bottom-nav owns that).
 * AC-021/022 unit arm.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

import { MobileDrawer } from './mobile-drawer'

function setAuthAs(accessRoles: string[] = []) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Cahya Cafe',
        email: 'c@gordi.id', archived_at: null, created_at: '', updated_at: '',
      },
      roles: [], isManager: false, accessRoles,
    },
    signOut: vi.fn(),
  })
}

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderDrawer({ open = true, onClose = vi.fn(), accessRoles = ['admin'] }: { open?: boolean; onClose?: () => void; accessRoles?: string[] } = {}) {
  setAuthAs(accessRoles)
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<><MobileDrawer open={open} onClose={onClose} /><LocationDisplay /></>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('AC-021: More menu lists every authorized non-primary destination (admin)', () => {
  it('admin sees Events, Ecommerce, Roastery, Admin Settings, Profile', () => {
    renderDrawer({ accessRoles: ['admin'] })
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('link', { name: /Events/ })).toHaveAttribute('href', '/events')
    expect(screen.getByRole('link', { name: /Ecommerce/ })).toHaveAttribute('href', '/ecommerce')
    expect(screen.getByRole('link', { name: /Roastery/ })).toHaveAttribute('href', '/roastery')
    expect(screen.getByRole('link', { name: /Admin Settings/ })).toHaveAttribute('href', '/admin/people')
    expect(screen.getByRole('link', { name: /Personal Profile/ })).toHaveAttribute('href', '/profile')
  })

  it('admin also sees Money (finance/admin)', () => {
    renderDrawer({ accessRoles: ['admin'] })
    expect(screen.getByRole('link', { name: /Money/ })).toHaveAttribute('href', '/money')
  })
})

describe('AC-022: Money absent for non-finance/admin (from More)', () => {
  it('a plain member does NOT see Money in the More menu', () => {
    renderDrawer({ accessRoles: [] })
    expect(screen.queryByRole('link', { name: /^Money$/ })).toBeNull()
  })

  it('a plain member does NOT see Admin Settings in the More menu', () => {
    renderDrawer({ accessRoles: [] })
    expect(screen.queryByRole('link', { name: /Admin Settings/ })).toBeNull()
  })

  it('finance sees Money but not Admin Settings', () => {
    renderDrawer({ accessRoles: ['finance'] })
    expect(screen.getByRole('link', { name: /Money/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Admin Settings/ })).toBeNull()
  })
})

describe('More menu navigation + a11y', () => {
  it('clicking a destination link navigates and closes the drawer', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderDrawer({ onClose, accessRoles: ['admin'] })
    await user.click(screen.getByRole('link', { name: /Events/ }))
    expect(screen.getByTestId('location').textContent).toBe('/events')
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape closes the drawer and returns focus to the opener', async () => {
    const user = userEvent.setup()
    const focusOpener = vi.fn()
    setAuthAs(['admin'])
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="*" element={<MobileDrawer open onClose={vi.fn()} focusOpener={focusOpener} />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
    await user.keyboard('{Escape}')
    expect(focusOpener).toHaveBeenCalled()
  })

  it('does not render when open=false', () => {
    renderDrawer({ open: false, accessRoles: ['admin'] })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
