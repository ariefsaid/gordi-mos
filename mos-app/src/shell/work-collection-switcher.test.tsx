import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { useAuth } from '@/auth/use-auth'
import { WorkCollectionSwitcher } from './work-collection-switcher'
import { useIsNarrow } from './use-is-narrow'

vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('./use-is-narrow', () => ({ useIsNarrow: vi.fn() }))

const COLLECTIONS = [
  { path: '/work/signals', label: 'Signals' },
  { path: '/work/tasks', label: 'Tasks' },
  { path: '/work/projects', label: 'Projects & Processes' },
  { path: '/work/objectives', label: 'Objectives' },
] as const

const mockUseAuth = vi.mocked(useAuth)
const mockUseIsNarrow = vi.mocked(useIsNarrow)

function authenticatedViewer(accessRoles: string[]) {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'person-1', org_id: 'org-1', user_id: 'user-1', full_name: 'Test Member',
        email: 'member@example.test', archived_at: null, must_change_password: false,
        created_at: '', updated_at: '',
      },
      roles: [],
      isManager: false,
      accessRoles,
      affiliated: [],
    },
    signOut: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>
}

function renderAt(pathname: string, accessRoles: string[] = ['member'], isNarrow = true) {
  mockUseAuth.mockReturnValue(authenticatedViewer(accessRoles))
  mockUseIsNarrow.mockReturnValue(isNarrow)
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[pathname]}>
        <WorkCollectionSwitcher />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('WorkCollectionSwitcher', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(COLLECTIONS)('shows every Work collection on $label and marks the current one', ({ path, label }) => {
    renderAt(path)

    const nav = screen.getByRole('navigation', { name: 'Work' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(COLLECTIONS.map((item) => item.path))
    expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
  })

  it('does not add collection navigation to a canonical record page', () => {
    renderAt('/work/signals/signal-1')

    expect(screen.queryByRole('navigation', { name: 'Work' })).not.toBeInTheDocument()
  })

  it('does not add collection navigation outside the Work collection lists', () => {
    renderAt('/')

    expect(screen.queryByRole('navigation', { name: 'Work' })).not.toBeInTheDocument()
  })

  it('does not render the switcher or its current-page link outside the narrow layout', () => {
    renderAt('/work/signals', ['member'], false)

    expect(screen.queryByRole('navigation', { name: 'Work' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Signals' })).not.toBeInTheDocument()
  })
})
