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
import { ThemeProvider } from '@/theme/theme-provider'

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
        email: 'c@example.test', archived_at: null, must_change_password: false, created_at: '', updated_at: '',
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
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="*" element={<><MobileDrawer open={open} onClose={onClose} /><LocationDisplay /></>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('AC-021: More menu lists every authorized non-primary destination (admin)', () => {
  // Was "…and NO module links (OD-REDESIGN-68: More is not the org chart)". OD-WAY-51 (owner
  // ruling) replaces that model: navigation mirrors what the ROUTE admits, and the module routes
  // are ungated. The drawer is the phone's only route to a module's screens, so hiding them here
  // is precisely what left kitchen staff with no phone nav (#242).
  it('an org-wide admin sees Signals, Admin Settings, Profile — and the module links their routes admit', () => {
    renderDrawer({ accessRoles: ['admin'] })
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('link', { name: /Signals/ })).toHaveAttribute('href', '/work/signals')
    expect(screen.getByRole('link', { name: /Admin Settings/ })).toHaveAttribute('href', '/admin/people')
    expect(screen.getByRole('link', { name: /Personal Profile/ })).toHaveAttribute('href', '/profile')
    // Café's screens, which are the reason the drawer matters on a phone.
    expect(screen.getByRole('link', { name: /^Log$/ })).toHaveAttribute('href', '/cafe/log')
    expect(screen.getByRole('link', { name: /^Review$/ })).toHaveAttribute('href', '/cafe/review')
    // #444: Events, Ecommerce and Roastery were each asserted PRESENT here. All three are
    // ship-gated (outside the MVP payload), and the gate is above roles — so the viewer holding
    // every role there is gets no link to any of them, on the one nav surface a phone has.
    for (const name of [/^Events$/, /^Ecommerce$/, /^Roastery$/]) {
      expect(screen.queryByRole('link', { name }), `${name} is ship-gated`).toBeNull()
    }
  })

  it('a plain member sees Café\'s ungated screens but not Review or Pushes', () => {
    // The gate that should still exist, on the surface where it is easiest to lose.
    renderDrawer({ accessRoles: ['member'] })
    expect(screen.getByRole('link', { name: /^Log$/ })).toHaveAttribute('href', '/cafe/log')
    expect(screen.queryByRole('link', { name: /^Review$/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Pushes$/ })).toBeNull()
  })

  // Was "admin also sees Money (finance/admin)". #444 ship-gates Money, so no viewer does — see
  // the AC-022 block below, which now carries that claim for every role including admin.
  it('admin sees the Inbox root, which is the workspace destination that still ships', () => {
    renderDrawer({ accessRoles: ['admin'] })
    expect(screen.getByRole('link', { name: /Inbox/ })).toHaveAttribute('href', '/inbox')
    expect(screen.queryByRole('link', { name: /^Money$/ })).toBeNull()
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

  // #444 widened this from "non-finance/admin" to EVERYONE: the ship gate sits above the role
  // gate, so a finance or admin viewer sees exactly what a plain member sees here. The role
  // policy itself stays asserted on the registry in destinations.test.ts, and comes back the
  // moment /money leaves SHIP_GATED_PATHS.
  it.each([['finance', ['finance']], ['admin', ['admin']], ['manager', ['manager']]])(
    '%s sees no Money link either — the ship gate is above the role gate',
    (_who, accessRoles) => {
      renderDrawer({ accessRoles })
      expect(screen.queryByRole('link', { name: /^Money$/ })).toBeNull()
      // …and the drawer rendered, so this is not passing on nothing.
      expect(screen.getByRole('link', { name: /Inbox/ })).toBeInTheDocument()
    },
  )
})

// Security audit HIGH-1 (2026-07-17): the phone drawer is the only nav surface at <920px, so the
// sign-out affordance must be mounted here too, not just on the desktop rail.
describe('AC-005/HIGH-1: sign-out affordance is mounted in the phone drawer and invokable', () => {
  it('shows the viewer\'s name and a working Sign out item', async () => {
    const user = userEvent.setup()
    const signOut = vi.fn()
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Cahya Cafe',
          email: 'c@example.test', archived_at: null, must_change_password: false, created_at: '', updated_at: '',
        },
        roles: [], isManager: false, accessRoles: ['admin'],
      },
      signOut,
    })
    render(
      <ThemeProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="*" element={<MobileDrawer open onClose={vi.fn()} />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Cahya Cafe' }))
    const menuItem = screen.getByRole('menuitem', { name: /sign out/i })
    expect(menuItem).toBeInTheDocument()
    await user.click(menuItem)
    expect(signOut).toHaveBeenCalledOnce()
  })
})

describe('More menu navigation + a11y', () => {
  it('clicking a destination link navigates and closes the drawer', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderDrawer({ onClose, accessRoles: ['admin'] })
    // Was the Events link — ship-gated by #444, so it no longer renders. Signals is the Work
    // child that ships, and it exercises the identical close-and-navigate path.
    await user.click(screen.getByRole('link', { name: /Signals/ }))
    expect(screen.getByTestId('location').textContent).toBe('/work/signals')
    expect(onClose).toHaveBeenCalled()
  })

  // Interaction-contract I2: Close/Back must return focus to the opener — the SAME
  // route-safe focus-return path Escape/backdrop/X already use. Previously the
  // destination-link onClick called raw `onClose`, so focus could land on a link
  // that's about to unmount instead of returning to the launcher.
  it('clicking a destination link ALSO returns focus to the opener (I2 — same path as Escape/backdrop/X)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const focusOpener = vi.fn()
    setAuthAs(['admin'])
    render(
      <ThemeProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route
                path="*"
                element={<><MobileDrawer open onClose={onClose} focusOpener={focusOpener} /><LocationDisplay /></>}
              />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </ThemeProvider>,
    )
    // Was the Events link — ship-gated by #444, so it no longer renders. Signals is the Work
    // child that ships, and it exercises the identical close-and-navigate path.
    await user.click(screen.getByRole('link', { name: /Signals/ }))
    expect(screen.getByTestId('location').textContent).toBe('/work/signals')
    expect(onClose).toHaveBeenCalled()
    expect(focusOpener).toHaveBeenCalled()
  })

  it('Escape closes the drawer and returns focus to the opener', async () => {
    const user = userEvent.setup()
    const focusOpener = vi.fn()
    setAuthAs(['admin'])
    render(
      <ThemeProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="*" element={<MobileDrawer open onClose={vi.fn()} focusOpener={focusOpener} />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </ThemeProvider>,
    )
    await user.keyboard('{Escape}')
    expect(focusOpener).toHaveBeenCalled()
  })

  it('does not render when open=false', () => {
    renderDrawer({ open: false, accessRoles: ['admin'] })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // OD-REDESIGN-91 #37: the drawer opens from the LEFT (matches the ☰ position + rail side) —
  // the prior right-slide was judged "not natural / intuitive". Deliberate UX change.
  it('#37: the panel is anchored to the LEFT edge (not the right)', () => {
    renderDrawer({ accessRoles: ['admin'] })
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toMatch(/\bleft-0\b/)
    expect(dialog.className).not.toMatch(/\bright-0\b/)
    expect(dialog.className).toMatch(/\bmobile-drawer-panel\b/)
  })
})
