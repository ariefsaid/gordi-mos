/**
 * ProfilePage — Personal Profile (#807, part of #738).
 *
 * The page says WHAT the person is (Identity: Person · Team · Position · Access, read-only) and
 * lets them own their password (Change password → inline SetPasswordForm) when they have a real
 * email. A sign-in-name account sees the ask-your-admin line instead. Language and the Home
 * layout picker stay as built; existing regression pins (Language card, radius, measures) still
 * hold. Both locales for every new string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { ProfilePage } from './profile-page'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('@/lib/db/viewer-teams')
import { listViewerTeams } from '@/lib/db/viewer-teams'
const mockListViewerTeams = vi.mocked(listViewerTeams)

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

interface FixtureOpts {
  fullName?: string
  email?: string | null
  positions?: { id: string; name: string }[]
  accessRoles?: string[]
  hasEmail?: boolean
}

function setViewer(opts: FixtureOpts = {}) {
  const positions = opts.positions ?? [{ id: 'r1', name: 'Finance Lead' }]
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-fitri', org_id: 'o1', user_id: 'u1',
        full_name: opts.fullName ?? 'Fitri Finance',
        email: opts.email === undefined ? 'fitri.dev@example.test' : opts.email,
        must_change_password: false, archived_at: null, created_at: '', updated_at: '',
      },
      roles: positions.map((p) => ({
        id: p.id, org_id: 'o1', business_unit_id: 'bu1', name: p.name,
        reports_to_role_id: null, created_at: '', updated_at: '',
      })),
      isManager: false,
      accessRoles: opts.accessRoles ?? ['finance'],
      affiliated: [],
      hasEmail: opts.hasEmail === undefined ? true : opts.hasEmail,
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
  mockListViewerTeams.mockResolvedValue([
    { team_id: 'fin', name: 'Finance Team', is_primary: true },
  ])
})

describe('Profile identity + password (ticket 807)', () => {
  it('AC-030: Finance viewer sees the head sentence, and Identity rows Person · Team · Position · Access — read-only', async () => {
    renderPage()

    // Head sentence (from job.profile) — the SAME string in both locales' shape (EN here).
    expect(await screen.findByText('Your account, language and Home layout.')).toBeInTheDocument()

    // Identity card rows — all four terms are DTs whose values are DDs (plain text, no inputs).
    expect(await screen.findByText('Person')).toBeInTheDocument()
    expect(screen.getByText('Person').tagName).toBe('DT')
    expect(screen.getByText('Fitri Finance').tagName).toBe('DD')

    expect(await screen.findByText('Team')).toBeInTheDocument()
    expect(screen.getByText('Team').tagName).toBe('DT')
    expect(screen.getByText('Finance Team').tagName).toBe('DD')

    expect(screen.getByText('Position').tagName).toBe('DT')
    expect(screen.getByText('Finance Lead').tagName).toBe('DD')

    expect(screen.getByText('Access').tagName).toBe('DT')
    expect(screen.getByText('Finance').tagName).toBe('DD')

    // Managed-by-Admin line
    expect(screen.getByText(/Managed by Admin — ask an admin to correct these/)).toBeInTheDocument()

    // Read-only: the Identity card has no input
    const identityCard = screen.getByRole('heading', { name: 'Identity' }).closest('section')
    expect(identityCard!.querySelectorAll('input, textarea, select')).toHaveLength(0)
  })

  it("AC-031: two live Teams → the primary is first, and the other lives after it (in the same 'Teams' row)", async () => {
    mockListViewerTeams.mockResolvedValueOnce([
      { team_id: 'fin', name: 'Finance Team', is_primary: true },
      { team_id: 'swp', name: 'SWP Finance', is_primary: false },
    ])
    renderPage()

    // Plural term because there is more than one — "Teams", not "Team".
    expect(await screen.findByText('Teams')).toBeInTheDocument()
    // The value is BOTH teams as one label, primary first.
    const value = await screen.findByText(/Finance Team\s*·\s*SWP Finance/)
    expect(value.tagName).toBe('DD')
  })

  it('AC-032: with a real email → the Password card offers Change password, opens the inline SetPasswordForm, and closes it on success', async () => {
    setViewer({ hasEmail: true })
    const user = userEvent.setup()
    renderPage()

    // Card + button visible
    expect(await screen.findByRole('heading', { name: 'Password' })).toBeInTheDocument()
    const change = screen.getByRole('button', { name: 'Change password' })
    expect(change).toBeInTheDocument()
    // The sign-in-name ask-your-admin line is NOT present for an email account.
    expect(screen.queryByText(/Ask your admin to reset your password/)).toBeNull()
    // The inline form is NOT mounted yet.
    expect(screen.queryByLabelText(/new password/i)).toBeNull()

    // Opening the form mounts the fields; the Change button retires (no duplicate control).
    await user.click(change)
    expect(await screen.findByLabelText(/new password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull()

    // Saving closes the form and returns to the button.
    await user.type(screen.getByLabelText(/new password/i), 'correct horse battery')
    await user.type(screen.getByLabelText(/confirm password/i), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    await waitFor(() => {
      expect(screen.queryByLabelText(/new password/i)).toBeNull()
    })
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument()
  })

  it('AC-032: sign-in-name account (no email) → ask-your-admin line, no Change-password button', async () => {
    setViewer({ hasEmail: false, email: 'wulan-warung@ops.gordi.local' })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Password' })).toBeInTheDocument()
    expect(screen.getByText('Ask your admin to reset your password.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull()
    // The inline form must not be reachable at all.
    expect(screen.queryByLabelText(/new password/i)).toBeNull()
  })

  it('AC-033: the Home-layout card gets the picker measure, and the phone rule stacks its cards (one per row)', async () => {
    renderPage()
    // Picker measure at desktop
    const layoutCard = (await screen.findByRole('heading', { name: 'Home layout' })).closest('section')
    expect(layoutCard).toHaveStyle({ maxWidth: '754px' })

    // Phone stacking: the picker's own CSS collapses to one column at ≤767px. jsdom doesn't parse
    // Vite-injected CSS the way the browser does, so pin the design invariant against the source
    // file itself — a removal (or a widened breakpoint) fails the test.
    const css = readFileSync(resolvePath(__dirname, '../components/home/home-layout-picker.css'), 'utf-8')
    expect(css).toMatch(/@media\s*\(\s*max-width:\s*767px\s*\)/)
    expect(css).toMatch(/\.hlp-opts\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*[;}]/)
  })

  it('AC-034 regression: the Language card is present and its select still switches locale', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Language' })).toBeInTheDocument()
    expect(screen.getByLabelText('Language').tagName).toBe('SELECT')
    await user.selectOptions(screen.getByLabelText('Language'), 'id')
    expect(await screen.findByRole('heading', { name: 'Bahasa' })).toBeInTheDocument()
  })

  it('AC-034 regression: the card border-radius token still resolves to --radius-lg for every card', async () => {
    renderPage()
    const identity = (await screen.findByRole('heading', { name: 'Identity' })).closest('section')
    const language = screen.getByRole('heading', { name: 'Language' }).closest('section')
    const password = screen.getByRole('heading', { name: 'Password' }).closest('section')
    const layout = screen.getByRole('heading', { name: 'Home layout' }).closest('section')
    for (const el of [identity, language, password, layout]) {
      expect(el).toHaveStyle({ borderRadius: 'var(--radius-lg)' })
    }
  })

  it('AC-034 both-locales: every new head/card string exists in the Indonesian catalog too', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.selectOptions(await screen.findByLabelText('Language'), 'id')

    // Head sentence
    expect(await screen.findByText('Akun, bahasa dan tata letak Beranda Anda.')).toBeInTheDocument()
    // Identity rows in ID
    expect(await screen.findByText('Orang')).toBeInTheDocument()
    expect(screen.getByText('Tim')).toBeInTheDocument()
    expect(screen.getByText('Jabatan')).toBeInTheDocument()
    expect(screen.getByText('Tingkat akses')).toBeInTheDocument()
    // Managed-by line, ID phrasing
    expect(screen.getByText(/Dikelola Admin — hubungi admin untuk memperbaikinya\./)).toBeInTheDocument()
    // Password card, ID
    expect(screen.getByRole('heading', { name: 'Kata sandi' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ubah kata sandi' })).toBeInTheDocument()
  })

  it('AC-034 both-locales: sign-in-name account renders the ask-your-admin line in Indonesian', async () => {
    setViewer({ hasEmail: false })
    const user = userEvent.setup()
    renderPage()
    await user.selectOptions(await screen.findByLabelText('Language'), 'id')
    expect(await screen.findByText('Minta admin Anda untuk mengatur ulang kata sandi Anda.')).toBeInTheDocument()
  })

  // Regression: language SELECTION still works, Home layout still persists (retained from #199).
  it('regression: selecting Bahasa persists across a remount', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.selectOptions(await screen.findByLabelText('Language'), 'id')
    expect(localStorage.getItem('mos.locale')).toBe('id')
    cleanup()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Profil Pribadi' })).toBeInTheDocument()
  })

  it('regression: the Home layout choice persists against the viewer', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('radio', { name: /overview/i }))
    expect(localStorage.getItem('gordi.home.layout.p-fitri')).toBe('overview')
    cleanup()
    renderPage()
    expect(await screen.findByRole('radio', { name: /overview/i })).toBeChecked()
  })
})
