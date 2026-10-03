import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock supabase before imports that use it
vi.mock('../lib/supabase', () => ({
  getGoogleProviderEnabled: vi.fn(),
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
      signInWithOtp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

// Mock react-router-dom navigate + location. `location.state.from` is the route ProtectedRoute
// turned away; each test that cares sets it through `setRememberedRoute`.
const mockNavigate = vi.fn()
let mockLocation: { pathname: string; search: string; hash: string; state: unknown; key: string } = {
  pathname: '/login', search: '', hash: '', state: null, key: 'test',
}
function setRememberedRoute(from: unknown) {
  mockLocation = { ...mockLocation, state: from === undefined ? null : { from } }
}
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate, useLocation: () => mockLocation }
})

import { appUrl } from '@/config/app-build-settings'
import { I18nProvider } from '@/i18n/I18nProvider'
import { LoginPage } from './login-page'
import { getGoogleProviderEnabled, supabase } from '@/lib/supabase'

const mockGoogleProviderEnabled = vi.mocked(getGoogleProviderEnabled)
const mockSignIn = vi.mocked(supabase.auth.signInWithPassword)
const mockSignInWithOAuth = vi.mocked(supabase.auth.signInWithOAuth)
const mockSignInWithOtp = vi.mocked(supabase.auth.signInWithOtp)
const mockResetPassword = vi.mocked(supabase.auth.resetPasswordForEmail)
const mockSignOut = vi.mocked(supabase.auth.signOut)

beforeEach(() => {
  mockGoogleProviderEnabled.mockReturnValue(new Promise(() => {}))
})

// ── #1276 ── provisioned Google sign-in ────────────────────────────────────

describe('LoginPage — Google sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGoogleProviderEnabled.mockResolvedValue(true)
    setRememberedRoute(undefined)
  })

  it('hides Google while settings load, then shows it when settings enable the provider without moving the slot', async () => {
    let resolveSettings!: (enabled: boolean) => void
    mockGoogleProviderEnabled.mockReturnValue(new Promise((resolve) => { resolveSettings = resolve }))

    render(<LoginPage />)

    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
    const slot = screen.getByTestId('google-sign-in-slot')
    expect(slot).toHaveStyle({ height: '96px' })

    resolveSettings(true)
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(slot).toHaveStyle({ height: '96px' })
  })

  it('keeps Google hidden when public auth settings report it disabled', async () => {
    mockGoogleProviderEnabled.mockResolvedValue(false)

    render(<LoginPage />)

    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
    await waitFor(() => expect(mockGoogleProviderEnabled).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
  })

  it('keeps email/password sign-in available and Google hidden when settings cannot be fetched', async () => {
    mockGoogleProviderEnabled.mockRejectedValue(new Error('settings unavailable'))

    render(<LoginPage />)

    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    await waitFor(() => expect(mockGoogleProviderEnabled).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument()
  })

  it('starts Google OAuth with the login callback under the configured app base path', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: 'https://auth.example.test' },
      error: null,
    })

    const user = userEvent.setup()
    render(<LoginPage />)
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }))

    const redirectTo = new URL(appUrl('/login'), window.location.origin)
    redirectTo.searchParams.set('auth_flow', 'google')
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: redirectTo.href },
    })
  })

  it('carries the sanitized remembered route through the Google OAuth callback', async () => {
    setRememberedRoute('/money/detail?w=30d')
    mockSignInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: 'https://auth.example.test' },
      error: null,
    })

    const user = userEvent.setup()
    render(<LoginPage />)
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }))

    const redirectTo = new URL(appUrl('/login'), window.location.origin)
    redirectTo.searchParams.set('auth_flow', 'google')
    redirectTo.searchParams.set('return_to', '/money/detail?w=30d')
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: redirectTo.href },
    })
  })

  it.each([
    ['en', 'Google sign-in needs an account your admin has set up with your Google-verified email. Please contact your admin for help.'],
    ['id', 'Login dengan Google memerlukan akun yang sudah disiapkan admin dengan email Google terverifikasi. Silakan hubungi admin untuk bantuan.'],
  ] as const)('shows the provisioned-account refusal in %s', async (locale, message) => {
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '?auth_flow=google&error=server_error' },
    })
    try {
      render(
        <I18nProvider initialLocale={locale}>
          <LoginPage />
        </I18nProvider>,
      )
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    }
  })

  it.each([
    ['en', 'Google sign-in was cancelled'],
    ['id', 'Login dengan Google dibatalkan'],
  ] as const)('shows a short Google cancellation message in %s', async (locale, message) => {
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '?auth_flow=google&error=access_denied' },
    })
    try {
      render(
        <I18nProvider initialLocale={locale}>
          <LoginPage />
        </I18nProvider>,
      )
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    }
  })
})

// ── T-014 ── AC-011 + AC-005 ────────────────────────────────────────────────

describe('LoginPage — credentials form', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    setRememberedRoute(undefined)
  })

  // AC-011: inputs reachable by accessible label; error linked via aria-describedby
  it('AC-011/AC-017 pin: login inputs reachable by accessible label', () => {
    render(<LoginPage />)

    // Each input must be query-able by its label text
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  // #425: the port dropped aria-required — the sign-in fields are required and must say so
  it('login required fields carry aria-required (#425)', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-required', 'true')
  })

  it('AC-011: error linked via aria-describedby after failed submit', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400 } as unknown as import('@supabase/supabase-js').AuthError,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@example.test')
    await user.type(screen.getByLabelText('Password'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      const errorEl = screen.getByRole('alert')
      expect(errorEl).toBeInTheDocument()
    })
  })

  // AC-005: quiet credential error is byte-identical for wrong-password and unknown-email
  it('AC-005: wrong-password error shows generic message', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400 } as unknown as import('@supabase/supabase-js').AuthError,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@example.test')
    await user.type(screen.getByLabelText('Password'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.')
    })
  })

  it('AC-005: unknown-email error shows byte-identical generic message', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'user not found', status: 400 } as unknown as import('@supabase/supabase-js').AuthError,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'nobody@example.test')
    await user.type(screen.getByLabelText('Password'), 'somepass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.')
    })
  })

  it('AC-005: rate-limit (429) shows correct message', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Too many requests', status: 429 } as unknown as import('@supabase/supabase-js').AuthError,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@example.test')
    await user.type(screen.getByLabelText('Password'), 'pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts — try again in a minute.')
    })
  })

  it('AC-005: network error shows server unreachable message', async () => {
    mockSignIn.mockRejectedValue(new Error('network failure'))

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@example.test')
    await user.type(screen.getByLabelText('Password'), 'pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't reach the server — try again.")
    })
  })

  it('no sign-up affordance rendered (FR-008)', () => {
    render(<LoginPage />)
    // No "sign up", "register", "create account" text
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/register/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/create account/i)).not.toBeInTheDocument()
  })

  // ── #799 ── AC-012 / AC-013: sign-in returns to the route that was asked for ───────────────

  // Where sign-in LANDS is RedirectIfAuthed's call, asserted end to end in
  // src/auth/entry-return.test.tsx. This page never navigates on success.
  it('AC-012: this page does not decide the landing — it never navigates on success', async () => {
    setRememberedRoute('/money/detail?w=30d')
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: 'u1' } as unknown as import('@supabase/supabase-js').User,
        session: {} as unknown as import('@supabase/supabase-js').Session,
      },
      error: null,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@example.test')
    await user.type(screen.getByLabelText('Password'), 'goodpass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(mockSignIn).toHaveBeenCalled())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('AC-013: the sign-in link carries the remembered route in its redirect target', async () => {
    setRememberedRoute('/work/tasks')
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>)

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'user@example.test')
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }))

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            emailRedirectTo: new URL(appUrl('/work/tasks'), window.location.origin).href,
          }),
        }),
      )
    })
  })

  it('AC-013: an off-app remembered route never reaches the sign-in link redirect', async () => {
    setRememberedRoute('https://example.test/steal')
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>)

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'user@example.test')
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }))

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            emailRedirectTo: new URL(appUrl('/'), window.location.origin).href,
          }),
        }),
      )
    })
  })

  it('successful sign-in submits the typed credentials and reports no error (FR-002)', async () => {
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: 'u1' } as unknown as import('@supabase/supabase-js').User,
        session: {} as unknown as import('@supabase/supabase-js').Session,
      },
      error: null,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@example.test')
    await user.type(screen.getByLabelText('Password'), 'goodpass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({ email: 'test@example.test', password: 'goodpass' })
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ── T-015 ── AC-006 + AC-007 ──────────────────────────────────────────────

  // AC-007: submit disabled + loading indicator while in flight, re-enabled on settle
  it('AC-007: submit button disabled + role=status loading while in flight', async () => {
    let resolve!: (v: ReturnType<typeof supabase.auth.signInWithPassword> extends Promise<infer R> ? R : never) => void
    mockSignIn.mockReturnValue(
      new Promise<ReturnType<typeof supabase.auth.signInWithPassword> extends Promise<infer R> ? R : never>((res) => {
        resolve = res
      }) as ReturnType<typeof supabase.auth.signInWithPassword>,
    )

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@example.test')
    await user.type(screen.getByLabelText('Password'), 'pass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // While in flight: button disabled + loading indicator
    const submitBtn = screen.getByRole('button', { name: /signing in/i })
    expect(submitBtn).toBeDisabled()
    expect(screen.getByRole('status')).toBeInTheDocument()

    // Settle
    resolve!({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400 } as unknown as import('@supabase/supabase-js').AuthError,
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled()
    })
  })

  // AC-006: magic-link shows a neutral confirmation. The wording carries the neutrality —
  // it must not assert that mail was sent to THIS address (#137 security review).
  it('AC-006: magic-link confirmation shows neutral message', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>)

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'user@example.test')

    const magicLinkBtn = screen.getByRole('button', { name: /email me a sign-in link/i })
    await user.click(magicLinkBtn)

    await waitFor(() => {
      expect(
        screen.getByText('If an account exists for that address, a sign-in link is on its way.'),
      ).toBeInTheDocument()
    })
  })

  it('AC-006: magic-link called with shouldCreateUser: false (FR-003)', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>)

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'user@example.test')
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }))

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.test',
          options: expect.objectContaining({ shouldCreateUser: false }),
        }),
      )
    })
  })

  // AC-006: reset confirmation shows identical neutral message
  it('AC-006: reset password confirmation shows neutral message', async () => {
    mockResetPassword.mockResolvedValue({
      data: {},
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.resetPasswordForEmail>>)

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'user@example.test')

    const forgotBtn = screen.getByRole('button', { name: /forgot password/i })
    await user.click(forgotBtn)

    await waitFor(() => {
      expect(
        screen.getByText('If an account exists for that address, a reset link is on its way.'),
      ).toBeInTheDocument()
    })
  })

  // #137, as corrected by the PR's adversarial security review. The first attempt at this fix
  // branched the user-visible outcome on `sendError` — and that IS an account-existence oracle:
  // GoTrue answers 200 for an address it has never seen (it attempts no mail), so a send that
  // FAILS is evidence the address exists. These two tests pin the property that replaced it:
  // the outcome is identical whether the send succeeds or fails, and the copy never asserts that
  // mail went to this address. If either regresses, an attacker learns who has an account.
  it('a refused reset send is indistinguishable from a successful one (no existence oracle)', async () => {
    mockResetPassword.mockResolvedValue({
      data: {},
      error: { status: 500, message: 'Error sending recovery email' },
    } as unknown as Awaited<ReturnType<typeof supabase.auth.resetPasswordForEmail>>)

    const user = userEvent.setup()
    render(<LoginPage />)
    await user.type(screen.getByLabelText('Email'), 'user@example.test')
    await user.click(screen.getByRole('button', { name: /forgot password/i }))

    // the SAME neutral panel a successful send produces
    await waitFor(() => {
      expect(
        screen.getByText('If an account exists for that address, a reset link is on its way.'),
      ).toBeInTheDocument()
    })
    // and nothing anywhere on screen betrays the failure
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/couldn't reach|too many attempts|error sending/i)
  })

  // The strongest form of the property: not "these phrases are absent" (which a differently-worded
  // leak would slip past) but "the rendered panel is IDENTICAL". If any future change makes the
  // success and failure renders differ by a single character, this fails (#137 security re-check).
  it('the confirmation panel is byte-identical whether the send succeeded or failed', async () => {
    async function renderPanel(sendError: unknown): Promise<string> {
      mockResetPassword.mockResolvedValue({ data: {}, error: sendError } as unknown as Awaited<
        ReturnType<typeof supabase.auth.resetPasswordForEmail>
      >)
      const user = userEvent.setup()
      const view = render(<LoginPage />)
      await user.type(screen.getByLabelText('Email'), 'user@example.test')
      await user.click(screen.getByRole('button', { name: /forgot password/i }))
      await waitFor(() => {
        expect(screen.getByText(/a reset link is on its way/i)).toBeInTheDocument()
      })
      const html = view.container.innerHTML
      view.unmount()
      return html
    }

    const ok = await renderPanel(null)
    const refused = await renderPanel({ status: 500, message: 'Error sending recovery email' })
    const rateLimited = await renderPanel({ status: 429, message: 'over_email_send_rate_limit' })

    expect(refused).toBe(ok)
    expect(rateLimited).toBe(ok)
  })

  it('a rate-limited magic-link send is likewise indistinguishable, and claims no send', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: { status: 429, message: 'over_email_send_rate_limit' },
    } as unknown as Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>)

    const user = userEvent.setup()
    render(<LoginPage />)
    await user.type(screen.getByLabelText('Email'), 'user@example.test')
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }))

    await waitFor(() => {
      expect(
        screen.getByText('If an account exists for that address, a sign-in link is on its way.'),
      ).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // the copy must not assert a send happened for THIS address — that was the original lie
    expect(document.body.textContent).not.toMatch(/check your email/i)
  })

  it('AC-006/AC-017 pin: magic-link and reset confirmations both show back-to-sign-in link', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: {},
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signInWithOtp>>)

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'user@example.test')
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to sign in/i })).toBeInTheDocument()
    })
  })

  it('expired-link warning notice renders when ?error=access_denied in URL', () => {
    // Simulate expired link URL param
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?error=access_denied&error_description=expired' },
      writable: true,
      configurable: true,
    })
    render(<LoginPage />)
    expect(screen.getByText(/that link has expired/i)).toBeInTheDocument()
    // Restore
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
      configurable: true,
    })
  })
})

// ── Demo login (dev-only one-click sign-in) ─────────────────────────────────

describe('LoginPage — demo login (dev-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    setRememberedRoute(undefined)
  })

  it('renders the demo-login panel in dev (import.meta.env.DEV)', () => {
    render(<LoginPage />)
    expect(screen.getByText(/demo login/i)).toBeInTheDocument()
  })

  it('one-click persona signs in with the persona email + shared dev password', async () => {
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: 'u1' } as unknown as import('@supabase/supabase-js').User,
        session: {} as unknown as import('@supabase/supabase-js').Session,
      },
      error: null,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.click(screen.getByRole('button', { name: /director/i }))

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'dewi.dev@example.test',
        password: 'Passw0rd!dev',
      })
    })
  })

  it('does NOT render the demo panel when not in dev (prod-safety gate)', () => {
    // Pin the security contract: the plaintext password + all-roles buttons
    // must never render in a built/deployed site (import.meta.env.DEV === false).
    vi.stubEnv('DEV', false)
    try {
      render(<LoginPage />)
      expect(screen.queryByText(/demo login/i)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /director/i })).not.toBeInTheDocument()
      expect(screen.queryByText(/Passw0rd!dev/)).not.toBeInTheDocument()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('failed demo sign-in surfaces the generic credential error', async () => {
    mockSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400 } as unknown as import('@supabase/supabase-js').AuthError,
    })

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.click(screen.getByRole('button', { name: /finance/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.')
    })
  })
})

describe('LoginPage — staging sample one-click login', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('DEV', false)
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SAMPLE_ONE_CLICK_LOGIN', 'true')
    vi.stubEnv('VITE_SAMPLE_LOGIN_PASSWORD', 'SamplePassword123')
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'gordi-mos.pages.dev', search: '' },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('signs in with a sample email and verifies the minted sample-org claim', async () => {
    const payload = Buffer.from(JSON.stringify({ org_id: '5a000000-0000-0000-0000-000000000001' })).toString('base64url')
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: 'sample-user', email: 'dewi@sample.gordi.test' } as import('@supabase/supabase-js').User,
        session: { access_token: `header.${payload}.sig` } as import('@supabase/supabase-js').Session,
      },
      error: null,
    })
    render(<LoginPage />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Director' }))
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith({
      email: 'dewi@sample.gordi.test', password: 'SamplePassword123',
    }))
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(screen.queryByText(/SamplePassword123/)).not.toBeInTheDocument()
  })

  it('signs out if the account resolves to a different organisation', async () => {
    const payload = Buffer.from(JSON.stringify({ org_id: '10000000-0000-0000-0000-000000000001' })).toString('base64url')
    mockSignIn.mockResolvedValue({
      data: {
        user: { id: 'wrong-user', email: 'dewi@sample.gordi.test' } as import('@supabase/supabase-js').User,
        session: { access_token: `header.${payload}.sig` } as import('@supabase/supabase-js').Session,
      },
      error: null,
    })
    render(<LoginPage />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Director' }))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledOnce())
    expect(screen.getByRole('alert')).toHaveTextContent(/not in Gordi Sample/i)
  })
})

// ── fix-2 ── Email client-validation (design-plan §3 + §5) ──────────────────

describe('LoginPage — email client-validation (fix-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('empty email on sign-in shows inline field error + no auth call', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    // Leave email blank, type password, click Sign in
    await user.type(screen.getByLabelText('Password'), 'pass')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    })
    expect(vi.mocked((await import('@/lib/supabase')).supabase.auth.signInWithPassword)).not.toHaveBeenCalled()
  })

  it('invalid email on sign-in shows destructive border (aria-invalid)', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'notanemail')
    await user.type(screen.getByLabelText('Password'), 'pass')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      const emailInput = screen.getByLabelText('Email')
      expect(emailInput).toHaveAttribute('aria-invalid', 'true')
    })
  })

  it('invalid email on magic-link shows field error + no auth call', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    // Leave email blank
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }))

    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    })
    expect(vi.mocked((await import('@/lib/supabase')).supabase.auth.signInWithOtp)).not.toHaveBeenCalled()
  })

  it('invalid email on forgot-password shows field error + no auth call', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    // Leave email blank
    await user.click(screen.getByRole('button', { name: /forgot password/i }))

    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    })
    expect(vi.mocked((await import('@/lib/supabase')).supabase.auth.resetPasswordForEmail)).not.toHaveBeenCalled()
  })

  it('invalid email field has aria-describedby pointing to the error message', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      const emailInput = screen.getByLabelText('Email')
      const describedBy = emailInput.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      const errorEl = document.getElementById(describedBy!)
      expect(errorEl).not.toBeNull()
      expect(errorEl!.textContent).toMatch(/enter a valid email address/i)
    })
  })
})

// ── #403 (supersedes fix-3) ── the phone tap contract on this card ──────────
//
// fix-3's test asserted the MECHANISM — an inline `minHeight: 44` on each link — and so it could
// only ever pass while the floor was re-authored per control. #403 moved the floor to the shared
// auth.css seam, and DESIGN.md scopes it to phone; an unconditional inline 44 also inflated these
// links on DESKTOP, where the density is 32px. The GOAL that replaced it is owned at two levels:
//   • the floor itself      → src/components/ui/tap-targets.css.test.ts (CSS source, BOTH axes,
//                             in `verify` — the only lane that gates a PR→dev merge)
//   • the rendered box+gap  → GUARD-TAP in e2e/guards.geometry.spec.ts (real pixels at 390px)
// What is left for THIS level is the drift this PR's review actually caught: the floor being
// stated twice, and the separation half being a Tailwind class jsdom can see.
describe('LoginPage — phone tap contract lives at the shared seam (#403)', () => {
  it('neither auth link re-authors the 44px floor inline — auth.css owns it', () => {
    render(<LoginPage />)
    const forgotBtn = screen.getByRole('button', { name: /forgot password/i })
    const magicBtn = screen.getByRole('button', { name: /email me a sign-in link/i })

    expect(forgotBtn.style.minHeight).toBe('')
    expect(magicBtn.style.minHeight).toBe('')
  })

  it('the "Forgot password?" row keeps 8px (mt-2) off the password field it sits under', () => {
    // DESIGN.md pairs the 44px floor with "8px between adjacent targets". At mt-1 the two 44px
    // boxes sat 4.0px apart and a mistap cost the person their typed password. Structural twin of
    // the measured gap assertion in GUARD-TAP.
    render(<LoginPage />)
    const forgotBtn = screen.getByRole('button', { name: /forgot password/i })
    expect(forgotBtn.parentElement?.className).toContain('mt-2')
  })
})

// ── fix-4 ── Tab order: Email → Password → Forgot → Sign in → Magic-link ────

describe('LoginPage — tab order (fix-4)', () => {
  it('DOM order follows design-plan §5: Email → Password → Forgot → Sign in → magic-link', () => {
    render(<LoginPage />)

    const email = screen.getByLabelText('Email')
    const password = screen.getByLabelText('Password')
    const forgot = screen.getByRole('button', { name: /forgot password/i })
    const signIn = screen.getByRole('button', { name: /^sign in$/i })
    const magicLink = screen.getByRole('button', { name: /email me a sign-in link/i })

    // Use DOM position (compareDocumentPosition) to verify order
    expect(email.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(password.compareDocumentPosition(forgot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(forgot.compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(signIn.compareDocumentPosition(magicLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
