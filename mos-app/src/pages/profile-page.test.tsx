/**
 * ProfilePage: identity read-only + language SELECTION.
 * Goal-oracle: choosing Bahasa Indonesia actually switches the app's language (the rendered page
 * re-labels), and the choice persists (the ADR-0021 localStorage seam).
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
        email: 'cahya@example.test', must_change_password: false, archived_at: null,
        created_at: '', updated_at: '',
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

describe('PORT-024: ProfilePage', () => {
  it('uses the adopted 12px card/container radius token for every profile card', () => {
    renderPage()
    const identityCard = screen.getByRole('heading', { name: 'Identity' }).closest('section')
    const languageCard = screen.getByRole('heading', { name: 'Language' }).closest('section')

    expect(identityCard).toHaveStyle({ borderRadius: 'var(--radius-lg)' })
    expect(languageCard).toHaveStyle({ borderRadius: 'var(--radius-lg)' })
  })

  it('FR-920: the Home layout setting gets the picker measure, and the form cards keep the form measure', () => {
    renderPage()
    // The picker is a THREE-UP DIAGRAM, not a form field: at the 560px form measure its cards
    // measured 167px and the wireframes stopped being readable, which is the whole point of a
    // diagram-based chooser. It gets the 720px setting measure (+ this card's own 16px padding
    // and 1px border on each side, which the bare content box does not carry).
    const layoutCard = screen.getByRole('heading', { name: 'Home layout' }).closest('section')
    expect(layoutCard).toHaveStyle({ maxWidth: '754px' })
    // …and widening it must not drag the short-form cards out with it.
    for (const title of ['Identity', 'Language']) {
      expect(screen.getByRole('heading', { name: title }).closest('section')).toHaveStyle({
        maxWidth: '560px',
      })
    }
  })

  it('renders read-only Identity — Person and Roles as plain text rows (not input-look), managed by Admin', () => {
    renderPage()
    // Read-only identity reads as plain labelled text, NOT an editable/input-styled field: the
    // Person and Roles values are static terms in a definition list.
    const personTerm = screen.getByText('Person')
    expect(personTerm.tagName).toBe('DT')
    expect(screen.getByText('Cahya Cafe').tagName).toBe('DD')
    // ALL roles — the domain permits several and the fixture is dual-hatted.
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

  it('goal (page-scope: this harness mounts ProfilePage only): selecting Bahasa re-renders in Indonesian and persists across remount', async () => {
    const user = userEvent.setup()
    renderPage()
    // English baseline
    expect(screen.getByRole('heading', { name: 'Personal Profile' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Language'), 'id')
    // The page itself re-renders in Indonesian — the goal, not the mechanism
    expect(await screen.findByRole('heading', { name: 'Profil Pribadi' })).toBeInTheDocument()
    expect(screen.getByLabelText('Bahasa')).toHaveValue('id')
    // …and its BODY re-renders too, not just the title. `useT` falls back to `en` silently when a
    // key is missing from the `id` catalog, so a page that switches its heading and keeps English
    // cards passes every title-only assertion. Found by mutation: replacing an `id` card string
    // with its `en` twin left the rest of this file green. Every card heading is checked.
    for (const heading of ['Identitas', 'Bahasa', 'Tata letak Beranda']) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument()
    }
    for (const english of ['Identity', 'Home layout']) {
      expect(screen.queryByRole('heading', { name: english })).toBeNull()
    }
    expect(screen.getByText('Orang').tagName).toBe('DT')
    // Persisted (ADR-0021 seam) — and honored on a fresh mount, not just in memory.
    expect(localStorage.getItem('mos.locale')).toBe('id')
    cleanup()
    renderPage()
    expect(screen.getByRole('heading', { name: 'Profil Pribadi' })).toBeInTheDocument()
  })

  it('sets the document title through the catalog, so an Indonesian session gets an Indonesian tab', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(document.title).toBe('Personal Profile — Gordi MOS')
    await user.selectOptions(screen.getByLabelText('Language'), 'id')
    expect(document.title).toBe('Profil Pribadi — Gordi MOS')
  })

  it('persists the Home layout choice against the viewer, and reads it back on remount', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('radio', { name: /overview/i }))
    expect(localStorage.getItem('gordi.home.layout.p1')).toBe('overview')
    cleanup()
    renderPage()
    expect(screen.getByRole('radio', { name: /overview/i })).toBeChecked()
  })
})
