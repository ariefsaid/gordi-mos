/**
 * Money's sub-nav (#1464): Branches for every Money tier, Pending bills for Finance only — the same
 * answer on the desktop rail and the phone drawer, and the same `anyOf` the route gate carries.
 * Money remains available only to its revenue-view roles; tests exercise the real access-role predicate.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'

vi.mock('@/lib/db/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/notifications')>()),
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue({ rows: [], hasMore: false, nextCursor: null }),
}))

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { RailNav } from './rail-nav'
import { MobileDrawer } from './mobile-drawer'
import { linkTitleKeyForPath, viewerAdmittedToRoute } from './destinations'

const mockUseAuth = vi.mocked(useAuth)

function viewer(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Test Person', email: 't@example.test',
        archived_at: null, must_change_password: false, created_at: '', updated_at: '',
      },
      roles: [],
      isManager: false,
      accessRoles,
      affiliated: [],
    },
    signOut: vi.fn(),
  }
}

function moneyChildren(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('a.rail-item--child[href^="/money"]'))
    .map((a) => `${a.getAttribute('href')}=${a.textContent?.trim() ?? a.getAttribute('aria-label')}`)
}

function surfaces(accessRoles: string[], path = '/money/pending-bills') {
  mockUseAuth.mockReturnValue(viewer(accessRoles))
  const wrap = (ui: React.ReactNode) => render(
    <ThemeProvider><I18nProvider initialLocale="en"><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></I18nProvider></ThemeProvider>,
  )
  const rail = wrap(<RailNav />)
  const railChildren = moneyChildren(rail.container)
  const railCurrent = within(rail.container).queryByRole('link', { current: 'page' })?.getAttribute('href') ?? null
  rail.unmount()
  const drawer = wrap(<MobileDrawer open onClose={() => {}} />)
  const drawerChildren = moneyChildren(drawer.baseElement)
  drawer.unmount()
  return { railChildren, railCurrent, drawerChildren }
}

describe('Money sub-nav', () => {
  it('Finance sees Branches and Pending bills on both surfaces, and only the open one is the page', () => {
    const { railChildren, railCurrent, drawerChildren } = surfaces(['finance'])
    expect(railChildren).toEqual(['/money=Branches', '/money/pending-bills=Pending bills'])
    expect(drawerChildren).toEqual(railChildren)
    expect(railCurrent).toBe('/money/pending-bills')
  })

  it.each([['manager'], ['supervisor']])('a %s sees Branches only, on both surfaces', (role) => {
    const { railChildren, drawerChildren } = surfaces([role], '/money')
    expect(railChildren).toEqual(['/money=Branches'])
    expect(drawerChildren).toEqual(railChildren)
  })

  it('names the denied link for the outside-access panel and admits Finance only', () => {
    expect(linkTitleKeyForPath('/money/pending-bills')).toBe('nav.money.pendingBills')
    expect(viewerAdmittedToRoute('/money/pending-bills', ['finance'])).toBe(true)
    expect(viewerAdmittedToRoute('/money/pending-bills', ['manager'])).toBe(false)
    expect(viewerAdmittedToRoute('/money/pending-bills', ['admin'])).toBe(false)
  })
})
