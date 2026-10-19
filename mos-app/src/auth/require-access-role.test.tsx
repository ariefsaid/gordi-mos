// RequireAccessRole guard tests (OD-C-2). Generic anyOf gate nested under ProtectedRoute: a
// session holding ANY listed role sees the outlet; an authenticated session that holds none meets
// the access boundary in place (#800); a session that is not authenticated yet still redirects.

import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { resetModuleAvailability } from '@/lib/module-availability'
import { ModuleBoundary } from '@/shell/module-boundary'

const dataLayer = vi.hoisted(() => ({ getViewerModuleAvailability: vi.fn() }))
vi.mock('@/lib/db/module-settings', () => dataLayer)
vi.mock('./use-auth')
import { useAuth } from './use-auth'
import { RequireAccessRole } from './require-access-role'

const mockUseAuth = vi.mocked(useAuth)

const availabilityRows = (moneyEnabled = true, moneyOverride = 'inherit') =>
  (['work', 'money', 'cafe', 'roastery', 'ecommerce', 'assistant'] as const).map((module_id) => ({
    module_id,
    enabled: module_id === 'money' ? moneyEnabled : module_id !== 'assistant',
    person_override: module_id === 'money' ? moneyOverride : 'inherit',
    revision: 'identity-revision',
  }))

function authed(accessRoles: string[]) {
  return {
    status: 'authenticated' as const,
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'U', email: null,
        must_change_password: false,
        archived_at: null, created_at: '', updated_at: '',
      },
      roles: [],
      isManager: false,
      accessRoles,
      affiliated: [],
    },
    signOut: vi.fn(),
  }
}

function renderMoneyRoute() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/money']}>
        <Routes>
          <Route element={<ModuleBoundary moduleId="money"><RequireAccessRole anyOf={['finance']} moduleId="money" /></ModuleBoundary>}>
            <Route path="/money" element={<div data-testid="money-page">Money page</div>} />
          </Route>
          <Route path="/" element={<div data-testid="home">Home</div>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

function renderGuard(anyOf: string[]) {
  return render(
    <MemoryRouter initialEntries={['/catalog']}>
      <Routes>
        <Route element={<RequireAccessRole anyOf={anyOf} />}>
          <Route path="/catalog" element={<div data-testid="content">Catalog</div>} />
        </Route>
        <Route path="/" element={<div data-testid="home">Home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAccessRole', () => {
  beforeEach(() => {
    resetModuleAvailability()
    dataLayer.getViewerModuleAvailability.mockResolvedValue(availabilityRows())
  })
  it('shows the outlet when the viewer holds the single required role', () => {
    mockUseAuth.mockReturnValue(authed(['admin']))
    renderGuard(['admin'])
    expect(screen.getByTestId('content')).toBeInTheDocument()
  })

  it('shows the outlet when the viewer holds ANY of the allowed roles', () => {
    mockUseAuth.mockReturnValue(authed(['ops_lead']))
    renderGuard(['ops_lead', 'admin'])
    expect(screen.getByTestId('content')).toBeInTheDocument()
  })

  it('shows the access boundary in place, not a bounce home, when the viewer holds none of the allowed roles', () => {
    mockUseAuth.mockReturnValue(authed(['member']))
    renderGuard(['ops_lead', 'admin'])
    expect(screen.queryByTestId('content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home')).not.toBeInTheDocument()
    // `/catalog` belongs to no destination — the boundary still names an area rather than
    // rendering a sentence with a hole in it.
    expect(screen.getByText('This area is outside your access')).toBeInTheDocument()
  })

  it('Money Allow admits a member through the real role guard without changing their roles', async () => {
    mockUseAuth.mockReturnValue(authed(['member']))
    dataLayer.getViewerModuleAvailability.mockResolvedValue(availabilityRows(true, 'allow'))

    renderMoneyRoute()
    expect(await screen.findByTestId('money-page')).toHaveTextContent('Money page')
  })

  it('Org Off plus personal Allow still meets the module-off boundary', async () => {
    mockUseAuth.mockReturnValue(authed(['member']))
    dataLayer.getViewerModuleAvailability.mockResolvedValue(availabilityRows(false, 'allow'))

    renderMoneyRoute()
    expect(await screen.findByRole('heading', { name: 'This module is switched off' })).toBeInTheDocument()
    expect(screen.queryByTestId('money-page')).not.toBeInTheDocument()
  })

  it('Inherit without a qualifying role retains the access boundary', async () => {
    mockUseAuth.mockReturnValue(authed(['member']))
    dataLayer.getViewerModuleAvailability.mockResolvedValue(availabilityRows(true, 'inherit'))

    renderMoneyRoute()
    expect(await screen.findByRole('heading', { name: 'Money is outside your access' })).toBeInTheDocument()
    expect(screen.queryByTestId('money-page')).not.toBeInTheDocument()
  })

  it('redirects to / while loading (no protected content flash)', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as never)
    renderGuard(['admin'])
    expect(screen.queryByTestId('content')).not.toBeInTheDocument()
    expect(screen.getByTestId('home')).toBeInTheDocument()
  })
})
