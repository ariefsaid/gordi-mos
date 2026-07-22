/**
 * ProfilePage (OD-REDESIGN-70): identity read-only + language SELECTION.
 * Goal-oracle: choosing Bahasa Indonesia actually switches the app's language
 * (the rendered page re-labels), and the choice persists (ADR-0021 localStorage seam).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
      roles: [
        { id: 'r1', org_id: 'o1', business_unit_id: 'bu1', name: 'Cafe Ops Lead', reports_to_role_id: null, created_at: '', updated_at: '' },
        { id: 'r2', org_id: 'o1', business_unit_id: 'bu2', name: 'Sales Lead', reports_to_role_id: null, created_at: '', updated_at: '' },
      ],
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
  it('uses the adopted 12px card/container radius token for every profile card', () => {
    renderPage()
    const identityCard = screen.getByRole('heading', { name: 'Identity' }).closest('section')
    const languageCard = screen.getByRole('heading', { name: 'Language' }).closest('section')

    expect(identityCard).toHaveStyle({ borderRadius: 'var(--radius-lg)' })
    expect(languageCard).toHaveStyle({ borderRadius: 'var(--radius-lg)' })
  })

  it('renders read-only Identity — Person and Roles as plain text rows (not input-look), managed by Admin', () => {
    renderPage()
    // Read-only identity reads as plain labelled text, NOT an editable/input-styled field
    // (profile polish): the Person and Roles values are static terms in a definition list.
    const personTerm = screen.getByText('Person')
    expect(personTerm.tagName).toBe('DT')
    expect(screen.getByText('Cahya Cafe').tagName).toBe('DD')
    // ALL roles — the domain permits several and the real fixture is dual-hatted (audit F7).
    expect(screen.getByText('Roles').tagName).toBe('DT')
    expect(screen.getByText('Cafe Ops Lead · Sales Lead').tagName).toBe('DD')
    // No input-look: identity is never rendered as a form control.
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText(/Managed by Admin/)).toBeInTheDocument()
  })

  it('shows the Language field label exactly once (card heading only; the select label is sr-only)', () => {
    renderPage()
    // The visible "Language" is the card heading; the select keeps an accessible name via an
    // sr-only label, so getByLabelText still resolves — but there is no duplicate VISIBLE label.
    const languageTexts = screen.getAllByText('Language')
    const visible = languageTexts.filter((el) => !el.classList.contains('sr-only'))
    expect(visible).toHaveLength(1)
    expect(visible[0].tagName).toBe('H2')
    expect(screen.getByLabelText('Language').tagName).toBe('SELECT')
  })

  it('OD-70 goal (page-scope: this harness mounts ProfilePage only — the shell flip is rendered evidence in the ledger): selecting Bahasa re-renders in Indonesian and persists across remount', async () => {
    const user = userEvent.setup()
    renderPage()
    // English baseline
    expect(screen.getByRole('heading', { name: 'Personal Profile' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Language'), 'id')
    // The page itself re-renders in Indonesian — the goal, not the mechanism
    expect(await screen.findByRole('heading', { name: 'Profil Pribadi' })).toBeInTheDocument()
    expect(screen.getByLabelText('Bahasa')).toHaveValue('id')
    // Persisted (ADR-0021 seam) — and honored on a fresh mount, not just in memory.
    expect(localStorage.getItem('mos.locale')).toBe('id')
    cleanup()
    renderPage()
    expect(screen.getByRole('heading', { name: 'Profil Pribadi' })).toBeInTheDocument()
  })
})
