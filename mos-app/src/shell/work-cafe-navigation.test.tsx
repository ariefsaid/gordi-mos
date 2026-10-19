import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { isProfilePathAvailable } from '@/config/build-settings'
import { useAuth } from '@/auth/use-auth'
import { SideNav } from './side-nav'

const moduleAvailability = vi.hoisted(() => ({ isOn: (moduleId: string) => moduleId !== 'money' }))

vi.mock('@/auth/use-auth')
vi.mock('./use-is-narrow', () => ({ useIsNarrow: () => false }))
vi.mock('@/lib/module-availability', () => ({
  useModuleAvailability: () => ({ status: 'ready', isOn: (moduleId: string) => moduleAvailability.isOn(moduleId), retry: vi.fn() }),
}))
vi.mock('./use-nav', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./use-nav')>()),
  useNavBadges: () => ({ forPath: () => undefined, forDestination: () => undefined }),
}))

const mockUseAuth = vi.mocked(useAuth)

function setViewer(accessRoles: string[]) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Navigation Test',
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
  moduleAvailability.isOn = (moduleId) => moduleId !== 'money'
  setFullDesktopWidth()
})

describe('Work and Café navigation', () => {
  it.each(['admin', 'member'])('%s without Money can reach Work Tasks and Café pages', async (role) => {
    setViewer([role])
    renderNavigation()

    const primary = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(primary).queryByRole('link', { name: 'Money' })).not.toBeInTheDocument()
    fireEvent.click(within(primary).getByRole('link', { name: 'Work' }))
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

  it('opens Admin pages through its utility menu and keeps Profile reachable', async () => {
    setViewer(['admin'])
    renderNavigation('/cafe/records')

    const primary = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(primary).getByRole('button', { name: 'Admin settings' })).toBeInTheDocument()
    expect(within(primary).getByRole('link', { name: 'Personal profile' })).toBeInTheDocument()

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

    moduleAvailability.isOn = (moduleId) => moduleId === 'cafe'
    setViewer(['admin'])
    renderNavigation('/cafe')

    const primary = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(primary).queryByRole('link', { name: 'Work' })).not.toBeInTheDocument()
    expect(within(primary).queryByRole('link', { name: 'Money' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Café pages' })).not.toBeInTheDocument()
    fireEvent.click(within(primary).getByRole('link', { name: 'Records' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/cafe/records')
  })
})
