import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { isProfilePathAvailable } from '@/config/build-settings'
import { useAuth } from '@/auth/use-auth'
import { SideNav } from './side-nav'
import { BottomTabBar } from './bottom-tab-bar'
import { MobileDrawer } from './mobile-drawer'
import { goToEntries, rememberModule } from './module-registry'
import { resetModuleAvailability, useModuleAvailability } from '@/lib/module-availability'
import type { ModuleId, ViewerModuleAvailability } from '@/lib/db/module-settings'

const dataLayer = vi.hoisted(() => ({ getViewerModuleAvailability: vi.fn(), narrow: false }))
const moduleIds: ModuleId[] = ['work', 'money', 'cafe', 'staff', 'assistant', 'roastery', 'ecommerce']
const rows = (blocked: ModuleId[] = []): ViewerModuleAvailability[] => moduleIds.map((module_id) => ({
  module_id, enabled: module_id !== 'money' && module_id !== 'assistant',
  person_override: blocked.includes(module_id) ? 'block' : 'inherit', revision: 'r1',
}))

vi.mock('@/auth/use-auth')
vi.mock('./use-is-narrow', () => ({ useIsNarrow: () => dataLayer.narrow }))
vi.mock('@/lib/db/module-settings', () => ({ getViewerModuleAvailability: dataLayer.getViewerModuleAvailability }))
vi.mock('./use-nav', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./use-nav')>()),
  useNavBadges: () => ({ forPath: () => undefined, forDestination: () => undefined }),
}))

const mockUseAuth = vi.mocked(useAuth)

function setViewer(accessRoles: string[], personId = 'p1') {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: personId, org_id: 'o1', user_id: 'u1', full_name: 'Navigation Test',
        email: 'navigation@example.test', archived_at: null, must_change_password: false,
        created_at: '', updated_at: '',
      },
      roles: [],
      isManager: false,
      accessRoles,
      affiliated: ['cafe'],
    },
    signOut: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
}

function CurrentRoute() {
  const { pathname } = useLocation()
  return <output aria-label="Current route">{pathname}</output>
}

function GoToProbe() {
  const { isOn } = useModuleAvailability()
  return <nav aria-label="Go to">{goToEntries(['member'], isOn).map((entry) => <a key={entry.id} href={entry.path}>{entry.path}</a>)}</nav>
}

function navigation(path = '/') {
  return (
    <ThemeProvider><I18nProvider><MemoryRouter initialEntries={[path]}>
      <SideNav /><BottomTabBar /><MobileDrawer open={dataLayer.narrow} onClose={() => {}} /><GoToProbe />
    </MemoryRouter></I18nProvider></ThemeProvider>
  )
}

function renderNavigation(path = '/') {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <SideNav />
          <Routes><Route path="*" element={<CurrentRoute />} /></Routes>
        </MemoryRouter>
      </I18nProvider>
    </ThemeProvider>,
  )
}

function setFullDesktopWidth() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === '(min-width: 1280px)',
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetModuleAvailability()
  dataLayer.narrow = false
  dataLayer.getViewerModuleAvailability.mockResolvedValue(rows())
  setFullDesktopWidth()
})

describe('Work and Café navigation', () => {
  it.each([false, true])('isolates a personal Café Block across same-org sessions (phone=%s)', async (phone) => {
    dataLayer.narrow = phone
    dataLayer.getViewerModuleAvailability.mockResolvedValueOnce(rows(['cafe'])).mockResolvedValueOnce(rows())
    rememberModule('cafe')
    setViewer(['member'], 'blocked-person')
    const view = render(navigation())
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Work' }).length).toBeGreaterThan(0))
    expect(screen.queryByRole('link', { name: 'Café' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Go to' })).queryByRole('link', { name: '/cafe' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Go to' })).queryByRole('link', { name: '/cafe/records' })).not.toBeInTheDocument()
    setViewer(['member'], 'other-person')
    view.rerender(navigation())
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Café' }).length).toBeGreaterThan(0))
    expect(within(screen.getByRole('navigation', { name: 'Go to' })).getByRole('link', { name: '/cafe/records' })).toBeInTheDocument()
  })

  it.each(['admin', 'member'])('%s without Money can reach Work Tasks and Café pages', async (role) => {
    setViewer([role])
    renderNavigation()
    await screen.findByRole('link', { name: 'Work' })

    const primary = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(primary).queryByRole('link', { name: 'Money' })).not.toBeInTheDocument()
    fireEvent.click(await within(primary).findByRole('link', { name: 'Work' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/work')

    const workPages = await screen.findByRole('navigation', { name: 'Work pages' })
    fireEvent.click(within(workPages).getByRole('link', { name: 'Tasks' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/work/tasks')

    fireEvent.click(within(primary).getByRole('link', { name: 'Café' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/cafe')

    const cafePages = await screen.findByRole('navigation', { name: 'Café pages' })
    fireEvent.click(within(cafePages).getByRole('link', { name: 'Records' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/cafe/records')
  })

  it('opens Admin pages through its utility menu; Profile is not a sidebar row', async () => {
    setViewer(['admin'])
    renderNavigation('/cafe/records')
    await screen.findByRole('button', { name: 'Admin settings' })

    const primary = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(primary).getByRole('button', { name: 'Admin settings' })).toBeInTheDocument()
    expect(within(primary).queryByRole('link', { name: 'Personal profile' })).toBeNull()

    fireEvent.click(within(primary).getByRole('button', { name: 'Admin settings' }))
    fireEvent.click(await screen.findByRole('link', { name: 'People' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin/people')
    const adminPages = await screen.findByRole('navigation', { name: 'Admin settings pages' })
    fireEvent.click(within(adminPages).getByRole('link', { name: 'People' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin/people')
  })

  it('keeps Café pages reachable when Work is disabled or unavailable in the Café profile', async () => {
    expect(isProfilePathAvailable('/work/tasks', 'full')).toBe(true)
    expect(isProfilePathAvailable('/work/tasks', 'cafe')).toBe(false)
    expect(isProfilePathAvailable('/cafe/records', 'cafe')).toBe(true)

    dataLayer.getViewerModuleAvailability.mockResolvedValue(rows(['work']))
    setViewer(['admin'])
    renderNavigation('/cafe')

    // Staff is its own switch: with Work off, Café and Staff are the two areas, and both stay reachable.
    const primary = () => within(screen.getByRole('navigation', { name: 'Primary' }))
    await waitFor(() => expect(primary().getByRole('link', { name: 'Staff' })).toHaveAttribute('href', '/staff/shifts'))
    expect(primary().queryByRole('link', { name: 'Work' })).not.toBeInTheDocument()
    expect(primary().queryByRole('link', { name: 'Money' })).not.toBeInTheDocument()
    const cafePages = await screen.findByRole('navigation', { name: 'Café pages' })
    fireEvent.click(within(cafePages).getByRole('link', { name: 'Records' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/cafe/records')
  })
})
