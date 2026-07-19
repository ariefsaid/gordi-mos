/**
 * ProfilePage (OD-REDESIGN-70): identity read-only + language SELECTION.
 * Goal-oracle: choosing Bahasa Indonesia actually switches the app's language
 * (the rendered page re-labels), and the choice persists (ADR-0021 localStorage seam).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { ProfilePage } from './profile-page'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

function setViewer() {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Cahya Cafe',
        email: 'cahya@gordi.id', archived_at: null, created_at: '', updated_at: '',
      },
      roles: [{ id: 'r1', org_id: 'o1', business_unit_id: 'bu1', name: 'Cafe Ops Lead', reports_to_role_id: null, created_at: '', updated_at: '' }],
      isManager: true,
      accessRoles: ['ops_lead'],
    },
    signOut: vi.fn(),
  })
}

function renderPage() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={['/profile']}>
          <ProfilePage />
        </MemoryRouter>
      </I18nProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setViewer()
})

describe('ProfilePage (OD-70)', () => {
  it('renders read-only Identity — Person and Role, managed by Admin', () => {
    renderPage()
    expect(screen.getByLabelText('Person')).toHaveValue('Cahya Cafe')
    expect(screen.getByLabelText('Person')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Role')).toHaveValue('Cafe Ops Lead')
    expect(screen.getByLabelText('Role')).toHaveAttribute('readonly')
    expect(screen.getByText(/Managed by Admin/)).toBeInTheDocument()
  })

  it('OD-70 goal: selecting Bahasa Indonesia switches the app language and persists', async () => {
    const user = userEvent.setup()
    renderPage()
    // English baseline
    expect(screen.getByRole('heading', { name: 'Personal Profile' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Language'), 'id')
    // The page itself re-renders in Indonesian — the goal, not the mechanism
    expect(await screen.findByRole('heading', { name: 'Profil Pribadi' })).toBeInTheDocument()
    expect(screen.getByLabelText('Bahasa')).toHaveValue('id')
    // Persisted (ADR-0021 seam)
    expect(localStorage.getItem('mos.locale')).toBe('id')
  })
})
