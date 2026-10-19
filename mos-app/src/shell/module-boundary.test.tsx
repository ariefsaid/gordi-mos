import { act, render, screen, waitFor } from '@testing-library/react'
import { isValidElement } from 'react'
import { createMemoryRouter, matchRoutes, MemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom'
import { routeConfig } from '@/router'
import { globalNavigationDestinations } from '@/shell/module-registry'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { ModuleId, ViewerModuleAvailability } from '@/lib/db/module-settings'
import { resetModuleAvailability } from '@/lib/module-availability'
import { ModuleBoundary } from './module-boundary'

const dataLayer = vi.hoisted(() => ({ getViewerModuleAvailability: vi.fn() }))
vi.mock('@/lib/db/module-settings', () => dataLayer)

const MODULE_IDS: ModuleId[] = ['work', 'money', 'cafe', 'roastery', 'ecommerce', 'assistant']
const availabilityRows = (moneyEnabled = true): ViewerModuleAvailability[] => MODULE_IDS.map((module_id) => ({
  module_id,
  enabled: module_id === 'money' ? moneyEnabled : module_id !== 'assistant',
  person_override: 'inherit',
  revision: 'r1',
}))

const auth: AuthState = {
  status: 'authenticated',
  viewer: {
    person: { id: 'person-1', org_id: 'org-1', user_id: 'user-1', full_name: 'Viewer', must_change_password: false },
    roles: [], isManager: false, accessRoles: [], affiliated: [],
  },
  signOut: vi.fn(),
}

function renderBoundary() {
  return render(
    <AuthContext.Provider value={auth}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/money']}>
          <ModuleBoundary moduleId="money"><p>Money page</p></ModuleBoundary>
        </MemoryRouter>
      </I18nProvider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  resetModuleAvailability()
  vi.clearAllMocks()
})

function renderRealModuleRoute(path: string) {
  const matches = matchRoutes(routeConfig, path)!
  const boundaryIndex = matches.findIndex(({ route }) => isValidElement(route.element) && route.element.type === ModuleBoundary)
  if (boundaryIndex < 0) throw new Error(`No module boundary for ${path}`)
  const mountPage = vi.fn(() => <p>Module page mounted</p>)
  let branch: RouteObject[] | undefined
  for (let index = matches.length - 1; index >= boundaryIndex; index--) {
    const route = matches[index].route
    const element = index === matches.length - 1 ? <PageProbe /> : route.element
    branch = route.index ? [{ ...route, element }] : [{ ...route, element, children: branch }]
  }
  function PageProbe() { return mountPage() }
  const router = createMemoryRouter(branch!, { initialEntries: [path] })
  render(<AuthContext.Provider value={auth}><I18nProvider><RouterProvider router={router} /></I18nProvider></AuthContext.Provider>)
  return mountPage
}

describe('real module routes and navigation agree', () => {
  it.each(['/cafe', '/cafe/records', '/kitchen/log', '/kitchen/review', '/projects-processes'])('keeps blocked %s behind the module boundary without mounting the child', async (path) => {
    dataLayer.getViewerModuleAvailability.mockResolvedValue(availabilityRows().map((row) => ({
      ...row, person_override: row.module_id === 'cafe' || row.module_id === 'work' ? 'block' : 'inherit',
    })))
    const mountPage = renderRealModuleRoute(path)
    expect(await screen.findByRole('heading', { name: 'This module is switched off' })).toBeInTheDocument()
    expect(mountPage).not.toHaveBeenCalled()
  })

  it.each([
    { enabled: true, override: 'allow', admitted: true },
    { enabled: true, override: 'inherit', admitted: false },
    { enabled: false, override: 'allow', admitted: false },
  ] as const)('Money member: org=$enabled, override=$override agrees with the actual role guard', async ({ enabled, override, admitted }) => {
    const rows = availabilityRows(enabled).map((row) => ({ ...row, person_override: row.module_id === 'money' ? override : 'inherit' as const }))
    dataLayer.getViewerModuleAvailability.mockResolvedValue(rows)
    const mountPage = renderRealModuleRoute('/money')
    if (admitted) expect(await screen.findByText('Module page mounted')).toBeInTheDocument()
    else {
      expect(await screen.findByRole('heading', { name: enabled ? 'Money is outside your access' : 'This module is switched off' })).toBeInTheDocument()
      expect(mountPage).not.toHaveBeenCalled()
    }
    // Navigation reads the same fetched facts; no synthetic roles are introduced.
    const { effectiveModuleAccess } = await import('@/lib/module-access')
    const destinations = globalNavigationDestinations([], (moduleId, roleAdmitted = true) => {
      const row = rows.find((fact) => fact.module_id === moduleId)!
      return effectiveModuleAccess({ released: true, orgEnabled: row.enabled, override: row.person_override, roleAdmitted }).available
    })
    expect(destinations.some((destination) => destination.id === 'money')).toBe(admitted)
  })
})

describe('ModuleBoundary', () => {
  it('renders the module when its setting is on', async () => {
    dataLayer.getViewerModuleAvailability.mockResolvedValue(availabilityRows())
    renderBoundary()
    expect(await screen.findByText('Money page')).toBeInTheDocument()
  })

  it('shows loading and keeps the module content unmounted while availability is loading', async () => {
    let finish: ((rows: ViewerModuleAvailability[]) => void) | undefined
    dataLayer.getViewerModuleAvailability.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    renderBoundary()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Money page')).not.toBeInTheDocument()
    await act(async () => finish?.(availabilityRows()))
    expect(await screen.findByText('Money page')).toBeInTheDocument()
  })

  it('offers Retry after an availability error without a known setting', async () => {
    dataLayer.getViewerModuleAvailability
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(availabilityRows())
    renderBoundary()
    expect(await screen.findByText("Couldn't load module availability. Try again.")).toBeInTheDocument()
    await act(async () => { screen.getByRole('button', { name: 'Try again' }).click() })
    await waitFor(() => expect(screen.getByText('Money page')).toBeInTheDocument())
  })

  it('shows the switched-off message and a Home link when the setting is off', async () => {
    dataLayer.getViewerModuleAvailability.mockResolvedValue(availabilityRows(false))
    renderBoundary()
    expect(await screen.findByRole('heading', { name: 'This module is switched off' })).toBeInTheDocument()
    expect(screen.getByText('An admin can turn it on under Admin settings › Modules.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.queryByText('Money page')).not.toBeInTheDocument()
  })
})
