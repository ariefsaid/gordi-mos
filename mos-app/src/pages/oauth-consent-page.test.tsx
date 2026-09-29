import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'

const h = vi.hoisted(() => ({
  getDetails: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      oauth: {
        getAuthorizationDetails: h.getDetails,
        approveAuthorization: h.approve,
        denyAuthorization: h.deny,
      },
    },
    schema: () => ({
      rpc: h.rpc,
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }) }) }),
    }),
  },
}))

vi.mock('@/lib/agent-redirect', async (orig) => ({
  ...(await orig<typeof import('@/lib/agent-redirect')>()),
  redirectToAgent: h.redirect,
}))

import { OAuthConsentPage } from './oauth-consent-page'

const AUTH_ID = 'auth-req-1'
const DETAILS = {
  authorization_id: AUTH_ID,
  redirect_uri: 'https://agent.example.test/callback',
  client: { id: 'client-1', name: 'Registered Name', uri: '', logo_uri: '' },
  user: { id: 'user-1', email: 'viewer@example.test' },
  scope: '',
}
const AGENT_URL = 'https://agent.example.test/callback?code=abc&state=xyz'

const AUTHED: AuthState = {
  status: 'authenticated',
  signOut: async () => {},
  viewer: {
    person: { id: 'p1', org_id: 'o1', user_id: 'user-1', full_name: 'Viola Viewer', email: 'viewer@example.test' } as never,
    roles: [],
    isManager: false,
    accessRoles: ['admin'],
    affiliated: [],
  },
}

function renderPage(url = `/oauth/consent?authorization_id=${AUTH_ID}`, locale: 'en' | 'id' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <AuthContext.Provider value={AUTHED}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/oauth/consent" element={<OAuthConsentPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

function readyToConsent() {
  h.getDetails.mockResolvedValue({ data: DETAILS, error: null })
  h.rpc.mockResolvedValue({ data: true, error: null })
  h.maybeSingle.mockResolvedValue({ data: { display_name: 'Claude Desktop' }, error: null })
  h.approve.mockResolvedValue({ data: { redirect_url: AGENT_URL }, error: null })
  h.deny.mockResolvedValue({ data: { redirect_url: 'https://agent.example.test/callback?error=access_denied' }, error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  readyToConsent()
})

describe('OAuthConsentPage', () => {
  it('shows a loading state while the request resolves', () => {
    h.getDetails.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeInTheDocument()
  })

  it('names the trusted agent app from the allow-list, who it acts as, where it returns, and what it may do', async () => {
    renderPage()
    const heading = await screen.findByRole('heading', { name: /Claude Desktop/ })
    expect(screen.queryByText('Registered Name')).not.toBeInTheDocument()
    expect(screen.getByText(/Viola Viewer/)).toBeInTheDocument()
    expect(screen.getByText(/viewer@example\.test/)).toBeInTheDocument()
    expect(screen.getByText('agent.example.test')).toBeInTheDocument()
    expect(screen.getByText(/Read your Work records and the directory/)).toBeInTheDocument()
    expect(screen.getByText(/Create and edit Tasks, Signals, Projects & Processes/)).toBeInTheDocument()
    expect(screen.getByText(/Update Objective write-ups and progress/)).toBeInTheDocument()
    expect(screen.getByText(/Archive or delete anything, change targets or permissions, or touch money/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Allow' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled()
    // No code or token ever reaches the page.
    expect(document.body.textContent).not.toContain('code=')
    expect(heading).toBeInTheDocument()
  })

  it('puts focus on the heading, then Tab goes Allow then Deny', async () => {
    const user = userEvent.setup()
    renderPage()
    const heading = await screen.findByRole('heading', { name: /Claude Desktop/ })
    await waitFor(() => expect(heading).toHaveFocus())
    await user.tab()
    expect(screen.getByRole('button', { name: 'Allow' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Deny' })).toHaveFocus()
  })

  it('Allow approves through the auth API without its own redirect, then returns to the agent', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(h.redirect).toHaveBeenCalledWith(AGENT_URL))
    expect(h.approve).toHaveBeenCalledWith(AUTH_ID, { skipBrowserRedirect: true })
    expect(h.deny).not.toHaveBeenCalled()
  })

  it('Enter on the focused Allow approves', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: 'Allow' })
    await user.tab()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(h.approve).toHaveBeenCalledTimes(1))
  })

  it('Deny denies and returns to the agent', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Deny' }))
    await waitFor(() =>
      expect(h.redirect).toHaveBeenCalledWith('https://agent.example.test/callback?error=access_denied'),
    )
    expect(h.deny).toHaveBeenCalledWith(AUTH_ID, { skipBrowserRedirect: true })
    expect(h.approve).not.toHaveBeenCalled()
  })

  it('Escape does nothing', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: 'Allow' })
    await user.keyboard('{Escape}')
    expect(h.approve).not.toHaveBeenCalled()
    expect(h.deny).not.toHaveBeenCalled()
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('disables both buttons while a decision is in flight and cannot double-submit', async () => {
    const user = userEvent.setup()
    h.approve.mockReturnValue(new Promise(() => {}))
    renderPage()
    const allow = await screen.findByRole('button', { name: 'Allow' })
    await user.click(allow)
    await user.click(allow)
    expect(h.approve).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled()
  })

  it('an already-approved request goes straight back to the agent with no buttons', async () => {
    h.getDetails.mockResolvedValue({ data: { redirect_url: AGENT_URL }, error: null })
    renderPage()
    await waitFor(() => expect(h.redirect).toHaveBeenCalledWith(AGENT_URL))
    expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeInTheDocument()
    expect(h.approve).not.toHaveBeenCalled()
  })

  it('an expired or unknown request says so, with no Allow', async () => {
    h.getDetails.mockResolvedValue({ data: null, error: { name: 'AuthApiError', status: 404, message: 'not found' } })
    renderPage()
    expect(await screen.findByRole('heading', { name: /expired or isn.t valid/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deny' })).not.toBeInTheDocument()
  })

  it('a link with no authorization id is unknown without calling the auth API', async () => {
    renderPage('/oauth/consent')
    expect(await screen.findByRole('heading', { name: /expired or isn.t valid/i })).toBeInTheDocument()
    expect(h.getDetails).not.toHaveBeenCalled()
  })

  it('a viewer without agent.connect sees the reason and a disabled Allow', async () => {
    h.rpc.mockResolvedValue({ data: false, error: null })
    renderPage()
    expect(await screen.findByText('Ask an admin to let you connect agents.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled()
  })

  it('asks the authority function for agent.connect', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'Allow' })
    expect(h.rpc).toHaveBeenCalledWith('role_authority_allows', { p_action: 'agent.connect' })
  })

  it('an agent app not on the allow-list shows its registered name as not yet trusted, Allow disabled', async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null })
    renderPage()
    const heading = await screen.findByRole('heading', { name: /Registered Name/ })
    expect(heading).toBeInTheDocument()
    expect(screen.getByText(/not yet trusted/i)).toBeInTheDocument()
    expect(screen.getByText(/An admin has to trust this agent app before it can connect/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled()
  })

  it('a load error shows an alert with Retry that reloads', async () => {
    const user = userEvent.setup()
    h.getDetails.mockResolvedValueOnce({ data: null, error: { name: 'AuthRetryableFetchError', status: 0, message: 'net' } })
    renderPage()
    const alert = await screen.findByRole('alert')
    await user.click(within(alert).getByRole('button', { name: /retry|try again/i }))
    expect(await screen.findByRole('button', { name: 'Allow' })).toBeEnabled()
    expect(h.getDetails).toHaveBeenCalledTimes(2)
  })

  it('a failed decision stays on the request with an alert and lets the viewer try again', async () => {
    const user = userEvent.setup()
    h.approve.mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', status: 500, message: 'boom' } })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Allow' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(h.redirect).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Allow' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(h.redirect).toHaveBeenCalledWith(AGENT_URL))
  })

  it('refuses to follow a redirect that is not a normal web or app address', async () => {
    const user = userEvent.setup()
    h.approve.mockResolvedValue({ data: { redirect_url: 'javascript:alert(1)' }, error: null })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Allow' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('renders Indonesian copy', async () => {
    renderPage(`/oauth/consent?authorization_id=${AUTH_ID}`, 'id')
    expect(await screen.findByRole('button', { name: 'Izinkan' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Tolak' })).toBeEnabled()
    expect(screen.getByText(/Memperbarui uraian dan progres Sasaran/)).toBeInTheDocument()
  })
})
