import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/messages'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { routeConfig } from '@/router'
import { AppShell } from './app-shell'
import { MatchedRouteContextRow } from './matched-route-context-row'

vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue({ rows: [], hasMore: false, nextCursor: null }),
}))
vi.mock('@/lib/db/signals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/signals')>()),
  getSignalPostAuthority: vi.fn().mockResolvedValue({ can_post: false, can_tag: false }),
}))

const mockUseAuth = vi.mocked(useAuth)

function setViewer(accessRoles: string[] = ['member']) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Café Member', email: null,
        archived_at: null, must_change_password: false, created_at: '', updated_at: '',
      },
      roles: [{ id: 'r1', org_id: 'o1', business_unit_id: 'bu-cafe', name: 'Barista', reports_to_role_id: null, created_at: '', updated_at: '' }],
      isManager: false,
      accessRoles,
      affiliated: ['cafe'],
    },
    signOut: vi.fn(),
  } as never)
}

/** Mount the real AppShell and its currently configured row against a selected real route branch. */
function renderMatchedRoute(path: string, locale: Locale = 'en', leafElement?: ReactNode) {
  const matches = matchRoutes(routeConfig, path)
  if (!matches) throw new Error(`${path} does not match the real route table`)

  const shellIndex = matches.findIndex(({ route }) =>
    isValidElement(route.element) && route.element.type === AppShell,
  )
  if (shellIndex < 0) throw new Error(`${path} does not match beneath AppShell`)

  let branch: RouteObject[] | undefined
  for (let index = matches.length - 1; index >= shellIndex; index--) {
    const route = matches[index].route
    const leafOverride = index === matches.length - 1 && leafElement !== undefined
      ? { element: leafElement }
      : {}
    branch = route.index
      ? [{ ...route, ...leafOverride }]
      : [{ ...route, ...leafOverride, ...(branch ? { children: branch } : {}) }]
  }

  const router = createMemoryRouter(branch!, { initialEntries: [path] })
  const rendered = render(
    <I18nProvider initialLocale={locale}>
      <RouterProvider router={router} />
    </I18nProvider>,
  )
  return { ...rendered, router, matches }
}

describe('AC-002/004/005 (#1299): matched route context in the production shell', () => {
  beforeEach(() => {
    setViewer()
  })

  afterEach(() => {
    cleanup()
  })

  it('AC-002/005: shows not-found context without a viewer scope for an unmatched Work child', async () => {
    const { router, matches } = renderMatchedRoute('/work/follow-ups')
    try {
      expect(matches.at(-1)?.route.handle).toEqual({ kind: 'infrastructure', reason: 'not-found' })

      const context = await screen.findByRole('region', { name: 'Context' })
      expect(context).toHaveTextContent('This page doesn’t exist — head back to a destination you know.')
      expect(context).not.toHaveTextContent('Café')
    } finally {
      router.dispose()
    }
  })

  it.each([
    ['en', 'Money is outside your access'],
    ['id', 'Keuangan berada di luar akses Anda'],
  ] as const)('AC-004/005: names the real %s legacy Dashboard denial and suppresses conflicting context', async (locale, expectedHeading) => {
    const { router, matches } = renderMatchedRoute('/dashboard', locale)
    try {
      expect(matches.at(-1)?.route.handle).toEqual({ kind: 'redirect', target: '/money' })
      expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(expectedHeading)
      const context = screen.getByRole('region', { name: 'Context' })
      expect(context).toBeEmptyDOMElement()
      expect(context).not.toHaveTextContent('This page doesn’t exist')
      expect(context).not.toHaveTextContent('Café')
    } finally {
      router.dispose()
    }
  })

  it.each([
    ['/unknown', 'en', 'This page doesn’t exist — head back to a destination you know.'],
    ['/work/follow-ups', 'en', 'This page doesn’t exist — head back to a destination you know.'],
    ['/work/follow-ups', 'id', 'Halaman ini tidak ada — kembali ke tujuan yang Anda kenal.'],
    ['/work/tasks/task-1/extra', 'en', 'This page doesn’t exist — head back to a destination you know.'],
    ['/inbox/unknown', 'id', 'Halaman ini tidak ada — kembali ke tujuan yang Anda kenal.'],
    ['/admin/unknown', 'en', 'This page doesn’t exist — head back to a destination you know.'],
    ['/profile/unknown', 'id', 'Halaman ini tidak ada — kembali ke tujuan yang Anda kenal.'],
  ] as const)(
    'AC-002/005: %s uses matched not-found context in %s',
    async (path, locale, expectedJob) => {
      const { router, matches } = renderMatchedRoute(path, locale)
      try {
        expect(matches.at(-1)?.route.handle).toEqual({ kind: 'infrastructure', reason: 'not-found' })
        const context = await screen.findByRole('region', { name: 'Context' })
        expect(context).toHaveTextContent(expectedJob)
        expect(context).not.toHaveTextContent('Café')
      } finally {
        router.dispose()
      }
    },
  )

  it.each([
    ['/', ['member'], { kind: 'page', family: 'workspace' }],
    ['/work/tasks', ['member'], { kind: 'page', family: 'workspace' }],
    ['/inbox', ['member'], { kind: 'page', family: 'workspace' }],
    ['/admin/people', ['admin'], { kind: 'page', family: 'management' }],
    ['/profile', ['member'], { kind: 'page', family: 'management' }],
  ] as const)(
    'AC-002/005: keeps valid sibling %s on its declared page context',
    async (path, roles, expectedHandle) => {
      setViewer([...roles])
      const { router, matches } = renderMatchedRoute(path, 'en', <div data-testid="route-page">Page</div>)
      try {
        expect(matches.at(-1)?.route.handle).toEqual(expectedHandle)
        expect(await screen.findByTestId('route-page')).toBeInTheDocument()
        expect(screen.getByRole('region', { name: 'Context' })).not.toHaveTextContent('This page doesn’t exist')
      } finally {
        router.dispose()
      }
    },
  )

  it('AC-002/005: keeps the installed AppShell and binds its real row slot to the matched adapter', () => {
    const matches = matchRoutes(routeConfig, '/work/follow-ups')
    const shellMatch = matches?.find(({ route }) => isValidElement(route.element) && route.element.type === AppShell)
    expect(shellMatch).toBeDefined()
    const shellElement = shellMatch!.route.element
    if (!isValidElement(shellElement)) throw new Error('The matched AppShell route has no React element')
    expect(shellElement.type).toBe(AppShell)
    const contextRow = (shellElement.props as { contextRow?: unknown }).contextRow
    expect(isValidElement(contextRow)).toBe(true)
    expect((contextRow as ReactElement).type).toBe(MatchedRouteContextRow)
    expect(matches?.at(-1)?.route.handle).toEqual({ kind: 'infrastructure', reason: 'not-found' })
  })
})
