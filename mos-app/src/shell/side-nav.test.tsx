import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import { footerAreas } from './module-registry'

const runtime = vi.hoisted(() => ({
  isOn: vi.fn((moduleId: string) => moduleId.length > 0),
  mode: 'panel' as 'sidebar' | 'panel',
  compact: false,
  panelArea: null as object | null,
  area: null as object | null,
}))
vi.mock('./use-nav', () => ({
  useNavLayout: () => ({
    isNarrow: false, roles: ['admin', 'finance'], mode: runtime.mode, compact: runtime.compact, collapsible: false,
    panelArea: runtime.panelArea, area: runtime.area, columnWidth: 'var(--mos-context-width)', brandWide: false, isOn: runtime.isOn,
  }),
  useNavBadges: () => ({ forPath: () => undefined, forDestination: () => undefined }),
}))
vi.mock('./use-rail-collapse-pref', () => ({ useRailCollapsePref: () => ({ toggle: vi.fn() }) }))
vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { SideNav } from './side-nav'

const auth: AuthState = {
  status: 'authenticated',
  viewer: {
    person: { id: 'person-1', org_id: 'org-1', user_id: 'user-1', full_name: 'Viewer', must_change_password: false },
    roles: [], accessRoles: ['admin', 'finance'], affiliated: [], isManager: false,
  },
  signOut: vi.fn(),
}

function renderNav(path = '/') {
  vi.mocked(useAuth).mockReturnValue(auth)
  return render(<I18nProvider><MemoryRouter initialEntries={[path]}><SideNav /></MemoryRouter></I18nProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  runtime.isOn.mockImplementation(() => true)
  runtime.mode = 'panel'
  runtime.compact = false
  runtime.panelArea = null
  runtime.area = null
})

describe('desktop navigation follows org module settings', () => {
  it('shows Work, Inbox and admitted modules on the labelled global rail', () => {
    renderNav()
    expect(screen.getByRole('link', { name: 'Work' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Money' })).toBeInTheDocument()
  })

  it('hides Work and Money when their switches are off', () => {
    runtime.isOn.mockImplementation((moduleId) => moduleId !== 'work' && moduleId !== 'money')
    renderNav()
    expect(screen.queryByRole('link', { name: 'Work' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Money' })).not.toBeInTheDocument()
  })

  it('shows the selected Admin page in the contextual panel', () => {
    const admin = footerAreas(['admin']).find((destination) => destination.id === 'admin')!
    runtime.panelArea = admin
    renderNav('/admin/access')

    const panel = screen.getByRole('navigation', { name: 'Admin settings pages' })
    expect(within(panel).getByRole('link', { name: 'Access levels' })).toHaveAttribute('aria-current', 'page')
    expect(within(panel).getByRole('link', { name: 'People' })).toBeInTheDocument()
  })

  it('keeps the Admin flyout keyboard reachable and Escape restores focus to its trigger', async () => {
    renderNav('/admin/access')
    const trigger = screen.getByRole('button', { name: 'Admin settings' })
    fireEvent.click(trigger)

    const flyout = await screen.findByRole('group', { name: 'Admin settings' })
    const activePage = within(flyout).getByRole('link', { name: 'Access levels' })
    await waitFor(() => expect(activePage).toHaveFocus())
    fireEvent.keyDown(activePage, { key: 'Escape' })

    expect(screen.queryByRole('group', { name: 'Admin settings' })).toBeNull()
    expect(trigger).toHaveFocus()
  })
})
