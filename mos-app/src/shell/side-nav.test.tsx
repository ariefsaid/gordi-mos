import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'

const runtime = vi.hoisted(() => ({ isOn: vi.fn((moduleId: string) => moduleId.length > 0), mode: 'sidebar' }))
vi.mock('./use-nav', () => ({
  useNavLayout: () => ({
    isNarrow: false, roles: ['admin', 'finance'], mode: runtime.mode, compact: false, collapsible: false,
    panelArea: null, area: null, columnWidth: 'var(--mos-rail-width)', brandWide: true, isOn: runtime.isOn,
  }),
  useNavBadges: () => ({ forPath: () => undefined, forDestination: () => undefined }),
}))
vi.mock('./use-rail-collapse-pref', () => ({ useRailCollapsePref: () => ({ toggle: vi.fn() }) }))
vi.mock('@/lib/db/deployment-stamp', () => ({ readDeploymentStamp: vi.fn().mockResolvedValue(null) }))
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

function renderNav() {
  vi.mocked(useAuth).mockReturnValue(auth)
  return render(<I18nProvider><MemoryRouter><SideNav /></MemoryRouter></I18nProvider>)
}

beforeEach(() => { vi.clearAllMocks(); runtime.isOn.mockImplementation(() => true); runtime.mode = 'sidebar' })

describe('desktop navigation follows org module settings', () => {
  it('shows Work and Money while their switches are on', () => {
    renderNav()
    expect(screen.getByRole('link', { name: 'Work' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Money' })).toBeInTheDocument()
    expect(screen.getByText(/^v0\.11\.0 · web/)).toBeInTheDocument()
  })

  it('shows the release stamp in the rail footer', () => {
    runtime.mode = 'rail'
    renderNav()
    expect(screen.getByText(/^v0\.11\.0 · web/)).toBeInTheDocument()
  })

  it('hides Work and Money when their switches are off', () => {
    runtime.isOn.mockImplementation((moduleId) => moduleId !== 'work' && moduleId !== 'money')
    renderNav()
    expect(screen.queryByRole('link', { name: 'Work' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Money' })).not.toBeInTheDocument()
  })
})
