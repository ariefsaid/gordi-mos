/**
 * ProfilePage: identity read-only + language SELECTION.
 * Goal-oracle: choosing Bahasa Indonesia actually switches the app's language (the rendered page
 * re-labels), and the choice is saved to the signed-in account (#927), never to the browser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AccountLocaleProvider } from '@/i18n/account-locale'
import type { Locale } from '@/i18n/messages'
import { ThemeProvider } from '@/theme/theme-provider'
import { ProfilePage } from './profile-page'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

// The account's stored language, standing in for shared.person_preferences.
const accountStore = new Map<string, Locale>()
vi.mock('@/lib/db/account-locale', () => ({
  readAccountLocale: vi.fn(async (personId: string) => accountStore.get(personId) ?? null),
  saveAccountLocale: vi.fn(async (personId: string, locale: Locale) => { accountStore.set(personId, locale) }),
}))
import { readAccountLocale, saveAccountLocale } from '@/lib/db/account-locale'
const mockRead = vi.mocked(readAccountLocale)
const mockSave = vi.mocked(saveAccountLocale)

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
      affiliated: [],
    },
    signOut: vi.fn(),
  })
}

// Settles on the account's saved language: until it loads, the control is disabled.
async function renderPage() {
  renderLoading()
  await waitFor(() => expect(screen.getByRole('combobox', { name: /^(Language|Bahasa)$/ })).toBeEnabled())
}

function renderLoading() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <AccountLocaleProvider>
          <MemoryRouter initialEntries={['/profile']}>
            <ProfilePage />
          </MemoryRouter>
        </AccountLocaleProvider>
      </I18nProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  accountStore.clear()
  setViewer()
})

async function chooseLanguage(user: ReturnType<typeof userEvent.setup>, from: string, option: string) {
  await user.click(screen.getByRole('combobox', { name: from }))
  await user.click(screen.getByRole('option', { name: option }))
}

describe('PORT-024: ProfilePage', () => {
  it('uses the adopted 12px card/container radius token for every profile card', async () => {
    await renderPage()
    const identityCard = screen.getByRole('heading', { name: 'Identity' }).closest('section')
    const languageCard = screen.getByRole('heading', { name: 'Language' }).closest('section')
    const layoutCard = screen.getByRole('heading', { name: 'Home layout' }).closest('section')

    expect(identityCard).toHaveStyle({ borderRadius: 'var(--radius-lg)' })
    expect(languageCard).toHaveStyle({ borderRadius: 'var(--radius-lg)' })
    expect(layoutCard).toHaveStyle({ borderRadius: 'var(--radius-lg)' })
  })

  it('keeps the remaining profile form cards at the narrow form measure', async () => {
    await renderPage()
    for (const title of ['Identity', 'Language']) {
      expect(screen.getByRole('heading', { name: title }).closest('section')).toHaveStyle({
        maxWidth: '560px',
      })
    }
    expect(screen.getByRole('heading', { name: 'Home layout' }).closest('section')).toHaveStyle({
      maxWidth: '754px',
    })
  })

  it('exposes the personal Home layout picker with Focused as the default', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Home layout' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /focused/i })).toBeChecked()
  })

  it('FR-921: selecting Overview persists the choice and applies it on a fresh Profile mount', async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole('radio', { name: /overview/i }))
    expect(screen.getByRole('radio', { name: /overview/i })).toBeChecked()
    expect(localStorage.getItem('gordi.home.layout.p1')).toBe('overview')

    cleanup()
    await renderPage()
    expect(screen.getByRole('radio', { name: /overview/i })).toBeChecked()
  })

  it('FR-921: a storage write failure does not block the session choice', async () => {
    const user = userEvent.setup()
    const originalSetItem = localStorage.setItem
    try {
      localStorage.setItem = () => { throw new Error('quota') }
      await renderPage()
      await user.click(screen.getByRole('radio', { name: /list/i }))
      expect(screen.getByRole('radio', { name: /list/i })).toBeChecked()
    } finally {
      localStorage.setItem = originalSetItem
    }
  })

  it('renders read-only Identity — Person and Roles as plain text rows (not input-look), managed by Admin', async () => {
    await renderPage()
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

  it('shows the Language field label exactly once (card heading only; the select label is sr-only)', async () => {
    await renderPage()
    // The visible "Language" is the card heading; the select keeps an accessible name via an
    // sr-only label, so getByLabelText still resolves — but there is no duplicate VISIBLE label.
    const languageTexts = screen.getAllByText('Language')
    const visible = languageTexts.filter((el) => !el.classList.contains('sr-only'))
    expect(visible).toHaveLength(1)
    expect(visible[0].tagName).toBe('H2')
    expect(screen.getByLabelText('Language').tagName).toBe('BUTTON')
  })

  it('goal (page-scope: this harness mounts ProfilePage only): selecting Bahasa re-renders in Indonesian and is saved to the account', async () => {
    const user = userEvent.setup()
    await renderPage()
    // English baseline
    expect(screen.getByRole('heading', { name: 'Personal Profile' })).toBeInTheDocument()
    await chooseLanguage(user, 'Language', 'Bahasa Indonesia')
    // The page itself re-renders in Indonesian — the goal, not the mechanism
    expect(await screen.findByRole('heading', { name: 'Profil Pribadi' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Bahasa' })).toHaveTextContent('Bahasa Indonesia')
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
    // Saved to the signed-in account (#927) — and honored on a fresh mount, not just in memory.
    expect(mockSave).toHaveBeenCalledWith('p1', 'id')
    expect(localStorage.getItem('mos.locale')).toBeNull()
    cleanup()
    await renderPage()
    expect(await screen.findByRole('heading', { name: 'Profil Pribadi' })).toBeInTheDocument()
  })

  it('a failed save says so and keeps the language actually in use', async () => {
    mockSave.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    await renderPage()
    await chooseLanguage(user, 'Language', 'Bahasa Indonesia')
    expect(await screen.findByRole('alert')).toHaveTextContent('Your language was not saved. The previous choice is still in use.')
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveTextContent('English')
    expect(screen.getByRole('heading', { name: 'Personal Profile' })).toBeInTheDocument()
    expect(accountStore.size).toBe(0)
  })

  it('when the saved language cannot be read, it says English is standing in', async () => {
    mockRead.mockRejectedValueOnce(new Error('offline'))
    await renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Your saved language could not be loaded, so English is shown for now.')
  })

  it('the language control stays disabled while the account’s saved value loads', async () => {
    renderLoading()
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Language' })).toBeEnabled())
  })

  it('sets the document title through the catalog, so an Indonesian session gets an Indonesian tab', async () => {
    const user = userEvent.setup()
    await renderPage()
    expect(document.title).toBe('Personal Profile — Gordi MOS')
    await chooseLanguage(user, 'Language', 'Bahasa Indonesia')
    await waitFor(() => expect(document.title).toBe('Profil Pribadi — Gordi MOS'))
  })

})
