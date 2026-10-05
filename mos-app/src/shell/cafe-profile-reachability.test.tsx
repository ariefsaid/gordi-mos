import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { RailNav } from './rail-nav'
import { MobileDrawer } from './mobile-drawer'
import { BottomTabBar } from './bottom-tab-bar'
import { APP_RELEASE_PROFILE } from '@/config/app-build-settings'
import { SHOW_ASSISTANT, SHOW_WORK_COLLECTIONS } from '@/config/features'
import { isProfilePathAvailable } from '@/config/build-settings'
import { isShipGatedInProfile } from '@/lib/ship-gate'
import { useAuth } from '@/auth/use-auth'
import { CafeOccurrenceTaskRoute, CafeProfileFallbackRoute } from './cafe-profile-route-guards'
import { DESTINATIONS, MODULES, UTILITY, goToDestinations } from './destinations'
import { flattenRoutes, isRedirect, redirectProps, leafInThisTable } from '@/test/route-table'
import { messages } from '@/i18n/messages'

vi.mock('@/auth/use-auth')
vi.mock('@/components/catalog/use-work-write-authority', () => ({
  canCreateForScope: () => false,
  useWorkWriteAuthority: () => ({
    scopes: { workline_org: false, workline_bu_ids: [], objective_org: false, objective_bu_ids: [] },
    loading: false,
    error: false,
    retry: vi.fn(),
  }),
}))
vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/signals', () => ({ searchSignalsByBody: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/follow-ups', () => ({ searchFollowUpsByCounterparty: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/directory', () => ({ searchPeopleByName: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/objectives', () => ({ searchObjectivesByName: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/work-lines', () => ({ searchWorkLinesByName: vi.fn().mockResolvedValue([]) }))

import { searchTasksByTitle } from '@/lib/db/tasks'
import { searchSignalsByBody } from '@/lib/db/signals'
import { searchPeopleByName } from '@/lib/db/directory'
import { searchObjectivesByName } from '@/lib/db/objectives'
import { searchWorkLinesByName } from '@/lib/db/work-lines'
import { CommandMenu } from '@/components/command/command-menu'

const mockUseAuth = vi.mocked(useAuth)

function setOmniscientViewer() {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Profile Test',
        email: 'profile@example.test', archived_at: null, must_change_password: false,
        created_at: '', updated_at: '',
      },
      roles: [],
      isManager: true,
      accessRoles: ['admin', 'finance', 'manager', 'supervisor', 'ops_lead', 'member'],
      affiliated: ['cafe'],
    },
    signOut: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
}

function declaredNavigationPaths(): string[] {
  return [...DESTINATIONS, ...MODULES.flatMap((group) => group.items), ...UTILITY]
    .flatMap((destination) => [
      ...(destination.primaryPath ? [destination.primaryPath] : []),
      ...destination.links.map((link) => link.path),
      ...(destination.children ?? []).map((link) => link.path),
    ])
}

function hrefsIn(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).map((link) => link.getAttribute('href')!)
}

function wrapNavigation(node: React.ReactNode) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/cafe']}>{node}</MemoryRouter>
      </I18nProvider>
    </ThemeProvider>
  )
}

function atPhoneWidth<T>(fn: () => T): T {
  const real = window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: /max-width/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  try {
    return fn()
  } finally {
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: real })
  }
}

describe.runIf(APP_RELEASE_PROFILE === 'cafe')('Cafe profile reachability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setOmniscientViewer()
  })

  it('is the selected build profile with Work collections and Deputy switched off', () => {
    expect(APP_RELEASE_PROFILE).toBe('cafe')
    expect(SHOW_WORK_COLLECTIONS).toBe(false)
    expect(SHOW_ASSISTANT).toBe(false)
  })

  it('redirects every general Work route and alias straight to Cafe', () => {
    const routes = flattenRoutes()
    const rootLayouts = routes.filter(({ path, route }) => path === '/' && route.path === undefined && !route.index)
    expect(rootLayouts.length, 'auth and shell layouts at / must stay mounted around the Café route').toBeGreaterThan(0)
    expect(rootLayouts.filter(({ route }) => isRedirect(route.element))).toEqual([])
    const deputyRoutes = routes.filter(({ path }) => /(^|\/)(deputy|assistant)(\/|$)/i.test(path))
    expect(deputyRoutes, 'Deputy routes must not be declared in the Cafe profile').toEqual([])

    const contextualTasks = routes.filter(
      ({ route }) => isValidElement(route.element) && route.element.type === CafeOccurrenceTaskRoute,
    )
    expect(contextualTasks.map(({ path }) => path)).toEqual(['/work/tasks', '/work/tasks/:taskId'])
    const fallback = routes.find(({ route }) => route.path === '*')
    expect(isValidElement(fallback?.route.element) && fallback?.route.element.type === CafeProfileFallbackRoute).toBe(true)

    const unavailable = routes.filter(
      ({ path, route }) => route.path !== undefined &&
        !isProfilePathAvailable(path, 'cafe') &&
        !contextualTasks.some((contextual) => contextual.route === route),
    )
    expect(unavailable.length, 'the route sweep must include the blocked Work collections and record routes').toBeGreaterThan(10)

    const home = flattenRoutes().find(({ route }) => route.index)
    expect(home, 'the bare address must remain declared').toBeDefined()
    expect(isRedirect(home?.route.element), 'the bare address must no longer mount Home').toBe(true)
    expect(redirectProps(home?.route.element).to).toBe('/cafe')

    for (const { path, route } of unavailable) {
      expect(isRedirect(route.element), `${path} still renders a Work surface`).toBe(true)
      expect(redirectProps(route.element).to).toBe('/cafe')
    }

    const blockedRedirects = flattenRoutes()
      .filter(({ route }) => isRedirect(route.element))
      .map(({ path, route }) => [path, redirectProps(route.element).to] as const)
      .filter(([, target]) => !isProfilePathAvailable(target, 'cafe'))
    expect(blockedRedirects, 'a redirect still points to Work or the unavailable Home root').toEqual([])
  })

  it('preserves only the Café occurrence-scoped Task/Process context, not an unscoped collection', async () => {
    const renderAt = (path: string) => render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/cafe" element={<p>Café landing</p>} />
          <Route
            path="/work/tasks/*"
            element={<CafeOccurrenceTaskRoute><p>Occurrence task capability</p></CafeOccurrenceTaskRoute>}
          />
        </Routes>
      </MemoryRouter>,
    )

    const scoped = renderAt('/work/tasks?occurrence=run-1')
    expect(screen.getByText('Occurrence task capability')).toBeInTheDocument()
    scoped.unmount()

    const record = renderAt('/work/tasks/task-1?occurrence=run-1')
    expect(screen.getByText('Occurrence task capability')).toBeInTheDocument()
    record.unmount()

    const unscoped = renderAt('/work/tasks')
    expect(await screen.findByText('Café landing')).toBeInTheDocument()
    unscoped.unmount()

    renderAt('/work/tasks?occurrence=run-1&create=1')
    expect(await screen.findByText('Café landing')).toBeInTheDocument()
  })

  it('sends unknown Work URLs to Café instead of the shell 404', async () => {
    render(
      <MemoryRouter initialEntries={['/work/not-a-collection']}>
        <Routes>
          <Route path="/cafe" element={<p>Café landing</p>} />
          <Route path="*" element={<CafeProfileFallbackRoute><p>Shell not found</p></CafeProfileFallbackRoute>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Café landing')).toBeInTheDocument()
    expect(screen.queryByText('Shell not found')).toBeNull()
  })

  it('keeps Cafe, Inbox, account, and Admin routes reachable', () => {
    for (const path of ['/cafe', '/cafe/plan', '/cafe/production', '/cafe/transfer', '/cafe/waste', '/cafe/count', '/inbox', '/profile', '/admin/people', '/admin/teams', '/admin/access']) {
      const leaf = leafInThisTable(path)
      expect(leaf, `${path} is missing from the production route table`).toBeDefined()
      expect(isRedirect(leaf?.route.element), `${path} is redirected by the Cafe profile`).toBe(false)
      expect(isShipGatedInProfile(path, 'cafe')).toBe(false)
    }
  })

  it('enumerates declared navigation but exposes no Work or Home entry to any role', () => {
    const declared = declaredNavigationPaths()
    expect(declared.some((path) => !isProfilePathAvailable(path, 'cafe'))).toBe(true)

    const visible = goToDestinations(['admin', 'finance', 'manager', 'supervisor', 'ops_lead', 'member'])
      .flatMap(({ path, children }) => [path, ...children.map((child) => child.path)])
    expect(visible.length).toBeGreaterThan(5)
    expect(visible.filter((path) => !isProfilePathAvailable(path, 'cafe'))).toEqual([])
    expect(visible).toContain('/cafe')
    expect(visible).toContain('/inbox')
    expect(visible).toContain('/admin/people')
    expect(visible).not.toContain('/')
    expect(visible.some((path) => path === '/work' || path.startsWith('/work/'))).toBe(false)
  })

  it('renders no Work/Home door on desktop or phone navigation', () => {
    const desktop = render(wrapNavigation(<RailNav compact={false} />))
    const desktopLinks = hrefsIn(screen.getByRole('navigation', { name: 'Primary' }))
    expect(desktopLinks.length).toBeGreaterThan(5)
    expect(desktopLinks.filter((path) => !isProfilePathAvailable(path, 'cafe'))).toEqual([])
    expect(desktopLinks).toContain('/cafe')
    expect(desktopLinks).toContain('/inbox')
    expect(desktopLinks).toContain('/admin/people')
    desktop.unmount()

    const phone = atPhoneWidth(() => render(wrapNavigation(
      <>
        <BottomTabBar />
        <MobileDrawer open onClose={() => {}} />
      </>,
    )))
    expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument()
    const phoneLinks = hrefsIn(document.body)
    expect(phoneLinks.length).toBeGreaterThan(5)
    expect(phoneLinks.filter((path) => !isProfilePathAvailable(path, 'cafe'))).toEqual([])
    expect(phoneLinks).toContain('/cafe')
    expect(phoneLinks).toContain('/inbox')
    expect(phoneLinks).toContain('/admin/people')
    expect(phoneLinks).not.toContain('/')
    phone.unmount()
  })

  it('removes Work and Deputy from the command menu and does not search Work records', async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <CommandMenu open onClose={() => {}} onShareSignal={() => {}} />
        </MemoryRouter>
      </I18nProvider>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).not.toContain(messages.en['commandMenu.action.askDeputy'])
    const targets = Array.from(dialog.querySelectorAll<HTMLElement>('[data-to]'))
      .map((item) => item.getAttribute('data-to'))
      .filter((path): path is string => !!path)
    expect(targets.filter((path) => !isProfilePathAvailable(path, 'cafe'))).toEqual([])

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'coffee' } })
    await waitFor(() => expect(searchPeopleByName).toHaveBeenCalledWith('coffee'))
    expect(searchTasksByTitle).not.toHaveBeenCalled()
    expect(searchSignalsByBody).not.toHaveBeenCalled()
    expect(searchObjectivesByName).not.toHaveBeenCalled()
    expect(searchWorkLinesByName).not.toHaveBeenCalled()
  })
})
