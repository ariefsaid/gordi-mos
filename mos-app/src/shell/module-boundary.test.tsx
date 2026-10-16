import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import { resetModuleAvailability } from '@/lib/module-availability'
import { ModuleBoundary } from './module-boundary'

const dataLayer = vi.hoisted(() => ({ getViewerModuleAvailability: vi.fn() }))
vi.mock('@/lib/db/module-settings', () => dataLayer)

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

describe('ModuleBoundary', () => {
  it('renders the module when its setting is on', async () => {
    dataLayer.getViewerModuleAvailability.mockResolvedValue([{ module_id: 'money', enabled: true, revision: 'r1' }])
    renderBoundary()
    expect(await screen.findByText('Money page')).toBeInTheDocument()
  })

  it('shows loading and keeps the module content unmounted while availability is loading', async () => {
    let finish: ((rows: { module_id: 'money'; enabled: boolean; revision: string }[]) => void) | undefined
    dataLayer.getViewerModuleAvailability.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    renderBoundary()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Money page')).not.toBeInTheDocument()
    await act(async () => finish?.([{ module_id: 'money', enabled: true, revision: 'r1' }]))
    expect(await screen.findByText('Money page')).toBeInTheDocument()
  })

  it('offers Retry after an availability error without a known setting', async () => {
    dataLayer.getViewerModuleAvailability
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([{ module_id: 'money', enabled: true, revision: 'r2' }])
    renderBoundary()
    expect(await screen.findByText("Couldn't load module availability. Try again.")).toBeInTheDocument()
    await act(async () => { screen.getByRole('button', { name: 'Try again' }).click() })
    await waitFor(() => expect(screen.getByText('Money page')).toBeInTheDocument())
  })

  it('shows the switched-off message and a Home link when the setting is off', async () => {
    dataLayer.getViewerModuleAvailability.mockResolvedValue([{ module_id: 'money', enabled: false, revision: 'r1' }])
    renderBoundary()
    expect(await screen.findByRole('heading', { name: 'This module is switched off' })).toBeInTheDocument()
    expect(screen.getByText('An admin can turn it on under Admin settings › Modules.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.queryByText('Money page')).not.toBeInTheDocument()
  })
})
