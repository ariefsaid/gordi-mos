import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { SideNav } from './side-nav'
import { MobileDrawer } from './mobile-drawer'
import { BottomTabBar } from './bottom-tab-bar'
import { APP_RELEASE_PROFILE } from '@/config/app-build-settings'
import { SHOW_ASSISTANT, SHOW_WORK_COLLECTIONS } from '@/config/features'
import { isProfilePathAvailable } from '@/config/build-settings'
import { isShipGatedInProfile } from '@/lib/ship-gate'
import { useAuth } from '@/auth/use-auth'
import { CafeOccurrenceTaskRoute, CafeProfileFallbackRoute } from './cafe-profile-route-guards'
import { goToEntries } from './module-registry'
import { flattenRoutes, isRedirect, redirectProps, leafInThisTable } from '@/test/route-table'
import { messages } from '@/i18n/messages'

vi.mock('@/auth/use-auth')
vi.mock('./use-is-narrow')
vi.mock('./use-nav', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./use-nav')>()),
  useNavBadges: () => ({ forPath: () => undefined, forDestination: () => undefined }),
}))
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
vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue({ rows: [], hasMore: false, nextCursor: null }),
}))

import { useIsNarrow } from './use-is-narrow'
import { searchTasksByTitle } from '@/lib/db/tasks'
import { searchSignalsByBody } from '@/lib/db/signals'
import { searchPeopleByName } from '@/lib/db/directory'
import { searchObjectivesByName } from '@/lib/db/objectives'
import { searchWorkLinesByName } from '@/lib/db/work-lines'
import { CommandMenu } from '@/components/command/command-menu'

const mockUseAuth = vi.mocked(useAuth)
const mockUseIsNarrow = vi.mocked(useIsNarrow)

// The viewer variants the Café release serves, each with the roles route admission reads.
const ALL_ROLES = ['admin', 'finance', 'manager', 'supervisor', 'ops_lead', 'member']
const VIEWERS = {
  member: ['member'],
  supervisor: ['supervisor', 'member'],
  director: ALL_ROLES,
} as const

function setViewer(accessRoles: readonly string[]) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Profile Test',
        email: 'profile@example.test', archived_at: null, must_change_password: false,
        created_at: '', updated_at: '',
      },
      roles: [],
      isManager: accessRoles.includes('manager'),
      accessRoles: [...accessRoles],
      affiliated: ['cafe'],
    },
    signOut: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
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

const outsideProfile = (paths: string[]) => paths.filter((path) => !isProfilePathAvailable(path, 'cafe'))

describe.runIf(APP_RELEASE_PROFILE === 'cafe')('Cafe profile reachability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockUseIsNarrow.mockReturnValue(false)
    // Desktop at full navigation width: the sidebar renders its rows as links. (The collapsed rail renders
    // buttons that open flyouts; jsdom's default matchMedia says every query is false, which would pick the rail.)
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, writable: true,
      value: (query: string) => ({ matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }),
    })
    setViewer(VIEWERS.director)
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

    const home = routes.find(({ route }) => route.index)
    expect(home, 'the bare address must remain declared').toBeDefined()
    expect(isRedirect(home?.route.element), 'the bare address must no longer mount Home').toBe(true)
    expect(redirectProps(home?.route.element).to).toBe('/cafe')

    for (const { path, route } of unavailable) {
      expect(isRedirect(route.element), `${path} still renders a Work surface`).toBe(true)
      expect(redirectProps(route.element).to).toBe('/cafe')
    }

    const blockedRedirects = routes
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
    for (const path of ['/cafe', '/cafe/plan', '/cafe/production', '/cafe/transfer', '/cafe/waste', '/cafe/count', '/cafe/receive', '/cafe/receive/review', '/cafe/receive/issues', '/cafe/request', '/cafe/request/review', '/inbox', '/profile', '/admin/people', '/admin/teams', '/admin/access']) {
      const leaf = leafInThisTable(path)
      expect(leaf, `${path} is missing from the production route table`).toBeDefined()
      // A redirect is fine only when it lands on another Café-available path (the Review queues).
      if (isRedirect(leaf?.route.element)) expect(isProfilePathAvailable(redirectProps(leaf?.route.element).to, 'cafe'), `${path} is redirected out of the Cafe profile`).toBe(true)
      expect(isShipGatedInProfile(path, 'cafe')).toBe(false)
    }
  })

  it('offers no Work or Home entry to any role, and every offered path resolves in the route table', () => {
    for (const [name, roles] of Object.entries(VIEWERS)) {
      const visible = goToEntries([...roles]).map((entry) => entry.path)
      expect(visible.length, name).toBeGreaterThan(1)
      expect(outsideProfile(visible), `${name} is offered a path outside the profile`).toEqual([])
      expect(visible, name).not.toContain('/')
      expect(visible.some((path) => path === '/work' || path.startsWith('/work/')), name).toBe(false)
      for (const path of visible) {
        const leaf = leafInThisTable(path.split('?')[0])
        expect(leaf, `${name}: ${path} has no route`).toBeDefined()
        if (isRedirect(leaf?.route.element)) expect(isProfilePathAvailable(redirectProps(leaf?.route.element).to, 'cafe'), `${name}: ${path} is redirected out of the profile`).toBe(true)
      }
    }
    const director = goToEntries([...VIEWERS.director]).map((entry) => entry.path)
    expect(director).toEqual(expect.arrayContaining(['/cafe', '/inbox', '/admin/people']))
  })

  it('shows each viewer only the destinations their roles are admitted to', () => {
    const paths = (roles: readonly string[]) => goToEntries([...roles]).map((entry) => entry.path)
    expect(paths(VIEWERS.member)).not.toContain('/admin/people')
    expect(paths(VIEWERS.supervisor)).not.toContain('/admin/people')
    expect(paths(VIEWERS.director)).toContain('/admin/people')
    // The wider the roles, the wider the offer: no narrower viewer sees a path the director does not.
    const wide = new Set(paths(VIEWERS.director))
    expect(paths(VIEWERS.member).filter((path) => !wide.has(path))).toEqual([])
    expect(paths(VIEWERS.supervisor).filter((path) => !wide.has(path))).toEqual([])
  })

  it('renders no Work/Home door on the desktop navigation for any role', () => {
    mockUseIsNarrow.mockReturnValue(false)
    for (const [name, roles] of Object.entries(VIEWERS)) {
      setViewer(roles)
      const desktop = render(wrapNavigation(<SideNav />))
      const desktopLinks = hrefsIn(desktop.container)
      expect(desktopLinks.length, `${name} desktop nav`).toBeGreaterThan(0) // a Café member sees Café alone: Inbox is the bell, Admin is not theirs
      expect(outsideProfile(desktopLinks), `${name} desktop nav`).toEqual([])
      expect(desktopLinks, name).toContain('/cafe')
      // Inbox has no sidebar row in the redesign: it is the top-bar bell (and a drawer row on the phone).
      desktop.unmount()
    }
  })

  it('renders no Work/Home door on the phone tab bar or More drawer for any role', () => {
    mockUseIsNarrow.mockReturnValue(true)
    for (const [name, roles] of Object.entries(VIEWERS)) {
      setViewer(roles)
      const phone = render(wrapNavigation(
        <>
          <BottomTabBar onOpenMore={() => {}} onOpenActionLauncher={() => {}} />
          <MobileDrawer open onClose={() => {}} />
        </>,
      ))
      expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument()
      const tabs = within(screen.getByRole('navigation', { name: 'Primary' })).getAllByRole('link')
      expect(outsideProfile(tabs.map((link) => link.getAttribute('href')!)), `${name} tab bar`).toEqual([])
      const phoneLinks = hrefsIn(document.body)
      expect(phoneLinks.length, `${name} phone nav`).toBeGreaterThan(2)
      expect(outsideProfile(phoneLinks), `${name} phone nav`).toEqual([])
      expect(phoneLinks, name).toContain('/cafe')
      expect(phoneLinks, name).not.toContain('/')
      phone.unmount()
    }
    setViewer(VIEWERS.director)
    const admin = render(wrapNavigation(<MobileDrawer open onClose={() => {}} />))
    expect(hrefsIn(document.body)).toContain('/admin/people')
    admin.unmount()
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
    expect(targets.length).toBeGreaterThan(2)
    expect(outsideProfile(targets)).toEqual([])

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'coffee' } })
    await waitFor(() => expect(searchPeopleByName).toHaveBeenCalledWith('coffee'))
    expect(searchTasksByTitle).not.toHaveBeenCalled()
    expect(searchSignalsByBody).not.toHaveBeenCalled()
    expect(searchObjectivesByName).not.toHaveBeenCalled()
    expect(searchWorkLinesByName).not.toHaveBeenCalled()
  })
})
