/**
 * MobileDrawer tests — Redesign Step 2 (T15). The drawer is now the "More" menu:
 * every authorized non-primary destination (Events, Money, Ecommerce, Roastery,
 * Admin, Profile) as plain links (no aria-current — the bottom-nav owns that).
 * AC-021/022 unit arm.
 */
import { useRef, useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'

const moduleSwitches = vi.hoisted(() => ({ isOn: vi.fn((_moduleId: string, roleAdmitted = true) => roleAdmitted) }))
vi.mock('@/lib/module-availability', () => ({ useModuleAvailability: () => ({ status: 'ready', isOn: moduleSwitches.isOn, retry: vi.fn() }) }))
vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('./use-nav', () => ({
  useNavBadges: () => ({ forPath: () => undefined, forDestination: () => undefined }),
}))
vi.mock('@/lib/db/deployment-stamp', () => ({ readDeploymentStamp: vi.fn().mockResolvedValue(null) }))

import { MobileDrawer } from './mobile-drawer'

function setAuthAs(accessRoles: string[] = [], affiliated: string[] = []) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Cahya Cafe',
        email: 'c@example.test', archived_at: null, must_change_password: false, created_at: '', updated_at: '',
      },
      roles: [], isManager: false, accessRoles, affiliated,
    },
    signOut: vi.fn(),
  })
}

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderDrawer({ open = true, onClose = vi.fn(), accessRoles = ['admin'], locale, affiliated = [], path = '/' }: { open?: boolean; onClose?: () => void; accessRoles?: string[]; locale?: 'id'; affiliated?: string[]; path?: string } = {}) {
  setAuthAs(accessRoles, affiliated)
  return render(
    <ThemeProvider>
      <I18nProvider initialLocale={locale}>
        <MemoryRouter initialEntries={[path]}>
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
  moduleSwitches.isOn.mockImplementation((_moduleId, roleAdmitted = true) => roleAdmitted)
  localStorage.clear()
})

describe('AC-021: More menu lists every authorized non-primary destination (admin)', () => {
  // Was "…and NO module links (OD-REDESIGN-68: More is not the org chart)". OD-WAY-51 (owner
  // ruling) replaces that model: navigation mirrors what the ROUTE admits, and the module routes
  // are ungated. The drawer is the phone's only route to a module's screens, so hiding them here
  // is precisely what left kitchen staff with no phone nav (#242).
  it('an org-wide admin sees Work, Admin settings, Personal profile — and the module links their routes admit', () => {
    renderDrawer({ accessRoles: ['admin'] })
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText(/^v0\.11\.0 · web/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Work$/ })).toHaveAttribute('href', '/work')
    expect(screen.getByRole('link', { name: /Admin settings/i })).toHaveAttribute('href', '/admin/people')
    expect(screen.getByRole('link', { name: /Personal profile/i })).toHaveAttribute('href', '/profile')
    // At the collapsed root, Café is one route entry with a chevron; children appear when active or affiliated (home-shell.md §1.1).
    expect(screen.getByRole('link', { name: /^Café$/ })).toHaveAttribute('href', '/cafe')
    expect(screen.queryByRole('link', { name: /^Log$/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Review$/ })).toBeNull()
    // #444: Events, Ecommerce and Roastery were each asserted PRESENT here. All three are
    // ship-gated (outside the MVP payload), and the gate is above roles — so the viewer holding
    // every role there is gets no link to any of them, on the one nav surface a phone has.
    for (const name of [/^Events$/, /^Ecommerce$/, /^Roastery$/]) {
      expect(screen.queryByRole('link', { name }), `${name} is ship-gated`).toBeNull()
    }
  })

  it('Issue 1673: the Café module being used keeps its parent row and lists the distinct child routes', () => {
    renderDrawer({ accessRoles: ['member'], affiliated: ['cafe'], path: '/cafe' })
    const cafe = screen.getByRole('link', { name: /^Café$/ })
    expect(cafe).toHaveAttribute('href', '/cafe')
    for (const path of ['/cafe/count', '/cafe/receive']) {
      expect(document.querySelector(`a[href="${path}"]`), `${path} listed under Café`).toBeInTheDocument()
    }
  })

  it('a plain member sees Café\'s ungated screens but not Review or Pushes', () => {
    // The gate that should still exist, on the surface where it is easiest to lose.
    renderDrawer({ accessRoles: ['member'] })
    expect(screen.getByRole('link', { name: /^Café$/ })).toHaveAttribute('href', '/cafe')
    expect(screen.queryByRole('link', { name: /^Log$/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Review$/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Pushes$/ })).toBeNull()
  })

  it('hides Work and Money when their org switches are off', () => {
    moduleSwitches.isOn.mockImplementation((moduleId, roleAdmitted = true) =>
      roleAdmitted && moduleId !== 'work' && moduleId !== 'money',
    )
    renderDrawer({ accessRoles: ['finance'] })
    expect(screen.queryByRole('link', { name: /^Work$/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /^Money$/ })).toBeNull()
  })

  it('admin sees the Inbox root but not Money without a revenue-view role', () => {
    renderDrawer({ accessRoles: ['admin'] })
    expect(screen.getByRole('link', { name: /Inbox/ })).toHaveAttribute('href', '/inbox')
    expect(screen.queryByRole('link', { name: /^Money$/ })).toBeNull()
  })
})

describe('AC-022: Money in More follows its revenue-view role gate', () => {
  it('a plain member does NOT see Money in the More menu', () => {
    renderDrawer({ accessRoles: ['member'] })
    expect(screen.queryByRole('link', { name: /^Money$/ })).toBeNull()
  })

  it('a plain member does NOT see Admin Settings in the More menu', () => {
    renderDrawer({ accessRoles: [] })
    expect(screen.queryByRole('link', { name: /Admin settings/i })).toBeNull()
  })

  it.each([['finance', ['finance']], ['manager', ['manager']]])(
    '%s sees Money in the More menu',
    (_who, accessRoles) => {
      renderDrawer({ accessRoles })
      expect(screen.getByRole('link', { name: /^Money$/ })).toHaveAttribute('href', '/money')
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
        roles: [], isManager: false, accessRoles: ['admin'], affiliated: [],
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
    await user.click(screen.getByRole('link', { name: /^Work$/ }))
    expect(screen.getByTestId('location').textContent).toBe('/work')
    expect(onClose).toHaveBeenCalled()
  })

  // The drawer covers the whole phone screen, so a link inside it that navigates without closing
  // leaves the viewer staring at the drawer on top of the page they asked for. That is exactly how
  // Personal Profile behaved the first time it was rendered into the chip menu: the menu closed,
  // the drawer did not. Every other drawer link routes through `closeAndReturn` (DrawerRow's
  // `onNavigate`); the chip now takes the same handler.
  it('tapping Personal profile navigates AND closes the drawer', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderDrawer({ onClose, accessRoles: ['admin'] })
    await user.click(screen.getByRole('link', { name: /Personal profile/i }))
    expect(screen.getByTestId('location').textContent).toBe('/profile')
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
    function DrawerHarness() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <MobileDrawer open={open} onClose={() => { onClose(); setOpen(false) }} focusOpener={focusOpener} />
          <LocationDisplay />
        </>
      )
    }

    render(
      <ThemeProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="*" element={<DrawerHarness />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </ThemeProvider>,
    )
    await user.click(screen.getByRole('link', { name: /^Work$/ }))
    expect(screen.getByTestId('location').textContent).toBe('/work')
    expect(onClose).toHaveBeenCalled()
    expect(focusOpener).toHaveBeenCalled()
  })

  it('Escape closes the drawer and returns focus to the opener', async () => {
    const user = userEvent.setup()
    const focusOpener = vi.fn()
    setAuthAs(['admin'])
    function DrawerHarness() {
      const [open, setOpen] = useState(true)
      return <MobileDrawer open={open} onClose={() => setOpen(false)} focusOpener={focusOpener} />
    }

    render(
      <ThemeProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="*" element={<DrawerHarness />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </ThemeProvider>,
    )
    await user.keyboard('{Escape}')
    expect(focusOpener).toHaveBeenCalledTimes(1)
  })

  it('inerts the app while open and restores focus after the drawer closes', async () => {
    const user = userEvent.setup()
    const appRoot = document.createElement('div')
    appRoot.id = 'root'
    const overlayRoot = document.createElement('div')
    overlayRoot.id = 'overlay-root'
    document.body.append(appRoot, overlayRoot)
    setAuthAs(['admin'])

    function Fixture() {
      const [open, setOpen] = useState(false)
      const openerRef = useRef<HTMLButtonElement>(null)
      return (
        <>
          <button ref={openerRef} type="button" onClick={() => setOpen(true)}>Open More</button>
          <MobileDrawer
            open={open}
            onClose={() => setOpen(false)}
            focusOpener={() => openerRef.current?.focus()}
          />
        </>
      )
    }

    const view = render(
      <ThemeProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={['/']}><Fixture /></MemoryRouter>
        </I18nProvider>
      </ThemeProvider>,
      { container: appRoot },
    )
    try {
      const opener = screen.getByRole('button', { name: 'Open More' })
      await user.click(opener)
      const dialog = screen.getByRole('dialog')
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ))
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      expect(first).toHaveFocus()
      expect(appRoot).toHaveAttribute('inert')

      last.focus()
      await user.tab()
      expect(first).toHaveFocus()
      first.focus()
      await user.keyboard('{Shift>}{Tab}{/Shift}')
      expect(last).toHaveFocus()

      await user.keyboard('{Escape}')
      expect(appRoot).not.toHaveAttribute('inert')
      expect(opener).toHaveFocus()
    } finally {
      view.unmount()
      appRoot.remove()
      overlayRoot.remove()
    }
  })

  it('does not render when open=false', () => {
    renderDrawer({ open: false, accessRoles: ['admin'] })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Issue 1109: drawer accessible names are translated', () => {
  it('in Indonesian the panel and close button use the translated names', () => {
    renderDrawer({ locale: 'id' })
    expect(screen.getByRole('dialog', { name: 'Lainnya' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tutup' })).toBeInTheDocument()
  })
})
