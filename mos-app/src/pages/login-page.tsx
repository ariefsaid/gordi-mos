import { useState, useId, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getGoogleProviderEnabled, supabase } from '@/lib/supabase'
import { AuthShell, AuthCard, AuthBackLink, PasswordToggle, Spinner } from '@/auth/auth-shell'
import { safeReturnTarget } from '@/auth/return-target'
import { appUrl } from '@/config/app-build-settings'
import { isValidEmail } from '@/auth/is-valid-email'
import { useT } from '@/i18n/use-t'
import { DemoLogin } from './demo-login'
import { demoLoginMode, isSampleSession } from './demo-personas'
import { Notice } from '@/components/ui/notice'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'
import './login-page.css'


type Mode = 'credentials' | 'magic-confirm' | 'reset-confirm'

function mapAuthError(error: unknown, t: ReturnType<typeof useT>): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status
    if (status === 429) return t('auth.login.rateError')
  }
  // Treat all credential failures as identical (AC-005 quiet error)
  const msg = error && typeof error === 'object' && 'message' in error
    ? String((error as { message: string }).message).toLowerCase()
    : ''
  if (
    msg.includes('invalid login credentials') ||
    msg.includes('user not found') ||
    msg.includes('invalid credentials') ||
    msg.includes('email not confirmed') ||
    msg.includes('invalid email or password')
  ) {
    return t('auth.login.credentialError')
  }
  return t('auth.login.credentialError')
}

// The server refuses (403) a sample account outside Gordi Sample before any session exists.
const NOT_IN_SAMPLE_ORG = 'auth.login.sampleError'

export function LoginPage() {
  const location = useLocation()
  const t = useT()
  const networkError = t('auth.login.networkError')
  const ERR_NETWORK = networkError
  // ProtectedRoute parks the requested page in router state (see safeReturnTarget). Password and
  // magic-link sign-in keep that state in place; Google carries the same safe target through its
  // full-page OAuth round trip for RedirectIfAuthed to restore after sign-in.
  const returnTarget = safeReturnTarget((location.state as { from?: unknown } | null)?.from)
  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()
  const emailErrorId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<Mode>('credentials')
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [loading, setLoading] = useState<'sign-in' | 'magic' | 'reset' | 'google' | null>(null)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  // Which one-click persona is currently signing in.
  const [demoBusy, setDemoBusy] = useState<string | null>(null)
  const demoMode = demoLoginMode(import.meta.env, window.location.hostname)

  useEffect(() => {
    let active = true
    getGoogleProviderEnabled()
      .then((enabled) => {
        if (active) setGoogleEnabled(enabled)
      })
      .catch(() => {
        if (active) setGoogleEnabled(false)
      })
    return () => { active = false }
  }, [])

  // Check for expired-link URL param on mount (design-plan §3 expired-link notice)
  const [expiredLink, setExpiredLink] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    const googleError = params.get('error') || params.get('error_code')
    if (
      params.get('auth_flow') === 'google' &&
      (params.has('error') || params.has('error_code') || params.has('error_description'))
    ) {
      setError(googleError === 'access_denied' ? t('auth.google.cancelled') : t('auth.google.refused'))
      return
    }
    if (err === 'access_denied' || err === 'otp_expired') {
      setExpiredLink(true)
    }
  }, [t])

  // Focus the error region when it appears (design-plan §5 WCAG "focus moves to error")
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus()
    }
  }, [error])

  const isDisabled = loading !== null || demoBusy !== null

  // One-click sign-in for a seeded local or staging sample persona.
  async function handleDemoSignIn(personaEmail: string) {
    if (!demoMode || !demoMode.personas.some((persona) => persona.email === personaEmail)) return
    setError('')
    setEmailError('')
    setDemoBusy(personaEmail)
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: personaEmail,
        password: demoMode.password,
      })
      if (authError) {
        setError(demoMode.kind === 'sample' && authError.status === 403 ? t(NOT_IN_SAMPLE_ORG) : mapAuthError(authError, t))
      } else if (demoMode.kind === 'sample' && (
        data.user?.email !== personaEmail ||
        !isSampleSession(data.session?.access_token)
      )) {
        await supabase.auth.signOut()
        setError(t(NOT_IN_SAMPLE_ORG))
      }
    } catch {
      setError(ERR_NETWORK)
    } finally {
      setDemoBusy(null)
    }
  }

  async function handleGoogleSignIn() {
    setError('')
    setEmailError('')
    setLoading('google')
    try {
      const redirectTo = new URL(appUrl('/login'), window.location.origin)
      redirectTo.searchParams.set('auth_flow', 'google')
      if (returnTarget !== '/') redirectTo.searchParams.set('return_to', returnTarget)
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo.href },
      })
      if (authError) setError(t('auth.google.refused'))
    } catch {
      setError(t('auth.google.refused'))
    } finally {
      setLoading(null)
    }
  }

  // fix-2: validate email client-side before any auth call
  function validateEmail(message = t('auth.login.emailInvalid')): boolean {
    if (!email.trim() || !isValidEmail(email)) {
      setEmailError(message)
      return false
    }
    setEmailError('')
    return true
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!validateEmail()) return
    setLoading('sign-in')
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        setError(mapAuthError(authError, t))
      }
    } catch {
      setError(ERR_NETWORK)
    } finally {
      setLoading(null)
    }
  }

  async function handleMagicLink() {
    setError('')
    if (!validateEmail()) return
    setLoading('magic')
    try {
      const { error: sendError } = await supabase.auth.signInWithOtp({
        email,
        // The link lands on the route they asked for, so a person who followed a deep link into
        // MOS from their mail finishes where they started rather than on Home.
        options: { shouldCreateUser: false, emailRedirectTo: new URL(appUrl(returnTarget), window.location.origin).href },
      })
      // ⚠ DO NOT branch the user-visible outcome on `sendError` (AC-006, and a review of #137
      // caught exactly that). GoTrue answers 200 for an address it has never seen — it attempts
      // no mail — so a send that FAILS is evidence the address EXISTS. Rendering a different
      // message on failure therefore turns this form into an account-existence oracle for anyone
      // who can read the screen. The outcome here is identical in all four cases (address known
      // or not x mail sent or not); the confirmation copy is worded so it never asserts that mail
      // was sent to THIS address, which is what made the old always-"check your inbox" a lie.
      // The failure is still surfaced — to the console, where the network tab already shows it —
      // never to the UI.
      if (sendError) console.warn('[auth] magic-link send did not go through', sendError)
      setMode('magic-confirm')
    } catch {
      setError(ERR_NETWORK)
    } finally {
      setLoading(null)
    }
  }

  async function handleForgotPassword() {
    setError('')
    if (!validateEmail(t('auth.recovery.emailInvalid'))) return
    setLoading('reset')
    try {
      // redirectTo ensures the recovery link lands on /recovery so the PASSWORD_RECOVERY
      // event is handled while the router is at the correct path (audit L1 fix).
      const redirectTo = new URL(appUrl('/recovery'), window.location.origin).href
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      // Same reasoning as the magic-link path above: the outcome must not vary with `sendError`,
      // because a failed send implies the address exists. Console only, never the UI.
      if (sendError) console.warn('[auth] password-reset send did not go through', sendError)
      setMode('reset-confirm')
    } catch {
      setMode('reset-confirm')
    } finally {
      setLoading(null)
    }
  }

  // ── Confirmation panel (magic-link or reset) ──────────────────────────────
  if (mode === 'magic-confirm' || mode === 'reset-confirm') {
    const isReset = mode === 'reset-confirm'
    const confirmText = isReset
      // Worded to be true in every case, which is what makes the neutral outcome honest rather
      // than a lie: it never asserts that mail was sent to THIS address (#137 review).
      ? t('auth.login.resetSent')
      : t('auth.login.magicSent')

    return (
      <AuthShell>
        <AuthCard>
          <AuthBackLink
            onClick={() => {
              setMode('credentials')
              setError('')
            }}
            label={t('auth.login.confirmBack')}
          />
          <h1 className="page-title">{isReset ? t('auth.recovery.title') : t('auth.login.title')}</h1>
          <Notice tone="success" role="status" aria-live="polite">
            <p><strong>{confirmText}</strong></p>
            {email && (
              /* Echoes the address the person typed so they can spot a typo — it must NOT say
                 "Sent to", which asserts a delivery that may not have happened and would put
                 the same lie one line below the hedged headline (#137 security re-check). */
              <p>{t('auth.login.forAddress', { email })}</p>
            )}
          </Notice>
        </AuthCard>
      </AuthShell>
    )
  }

  // ── Credentials form ──────────────────────────────────────────────────────
  return (
    <AuthShell>
      <AuthCard>
        <div className="login-workbench">
          <header className="login-heading">
            <h1 className="page-title">{t('auth.login.title')}</h1>
            <p className="auth-lede">{t('auth.login.subtitle')}</p>
            {expiredLink && <Notice tone="attention" role="alert">{t('auth.login.expired')}</Notice>}
          </header>
          <div className="login-capture">
            <form className="auth-form" onSubmit={handleSignIn} noValidate>
              <div className="auth-field">
                <TextInput
                  id={emailId}
                  label={t('auth.login.email')}
                  type="email"
                  autoComplete="email"
                  placeholder="you@gordi.id"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError('')
                  }}
                  disabled={isDisabled}
                  aria-required="true"
                  error={Boolean(emailError)}
                  aria-describedby={emailError ? emailErrorId : (error ? errorId : undefined)}
                  fullWidth
                />
                {emailError && <p id={emailErrorId} className="auth-field-error">{emailError}</p>}
              </div>

              <div className="auth-field">
                <TextInput
                  id={passwordId}
                  label={t('auth.login.password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isDisabled}
                  aria-required="true"
                  aria-describedby={error ? errorId : undefined}
                  fullWidth
                  trailing={(
                    <PasswordToggle
                      shown={showPassword}
                      onToggle={() => setShowPassword((value) => !value)}
                      showLabel={t('auth.password.showNew')}
                      hideLabel={t('auth.password.hideNew')}
                      controls={passwordId}
                      disabled={isDisabled}
                    />
                  )}
                />
                {/* DOM order = tab order: the recovery link follows the field it belongs to. */}
                <div className="auth-field-aside">
                  <button type="button" className="auth-link" disabled={isDisabled} onClick={handleForgotPassword}>
                    {loading === 'reset' ? (
                      <span className="iconrow iconrow--center">
                        <Spinner />
                        {t('auth.login.sending')}
                      </span>
                    ) : (
                      t('auth.login.forgot')
                    )}
                  </button>
                </div>
              </div>

              {/* Form-level error — sits between the fields and the submit it belongs to */}
              {error && !expiredLink && (
                <Notice tone="urgent" ref={errorRef} id={errorId} tabIndex={-1}>{error}</Notice>
              )}

              {/* The ONE filled primary button */}
              <Button type="submit" variant="primary" className="btn-touch" disabled={isDisabled} aria-busy={loading === 'sign-in'}>
                {loading === 'sign-in' ? (
                  <>
                    {/* role=status carries the loading announcement */}
                    <span role="status" className="sr-only">{t('auth.login.signingIn')}</span>
                    <Spinner />
                    {t('auth.login.signingIn')}
                  </>
                ) : (
                  t('auth.login.signIn')
                )}
              </Button>
            </form>

            <div className="login-alternatives">
              {/* Google OAuth uses the database-provisioned account; auth-layer guards validate the match. */}
              <div data-testid="google-sign-in-slot" aria-hidden={!googleEnabled} hidden={!googleEnabled}>
                <div className="login-or" aria-hidden="true">
                  <span>{t('auth.login.or')}</span>
                </div>
                <Button
                  variant="outline"
                  className="btn-touch"
                  disabled={!googleEnabled || isDisabled}
                  aria-busy={loading === 'google'}
                  onClick={handleGoogleSignIn}
                >
                  {loading === 'google' ? (
                    <>
                      <span role="status" className="sr-only">{t('auth.google.loading')}</span>
                      <Spinner />
                      {t('auth.google.loading')}
                    </>
                  ) : (
                    <>
                      <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48" width="16" height="16">
                        <path fill="currentColor" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z" />
                        <path fill="currentColor" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44Z" />
                        <path fill="currentColor" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.2H5.8a20 20 0 0 0 0 17.6l6.8-5.2Z" />
                        <path fill="currentColor" d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 6.1 29.5 4 24 4A20 20 0 0 0 5.8 15.2l6.8 5.2C14.2 15.6 18.7 12 24 12Z" />
                      </svg>
                      {t('auth.google.button')}
                    </>
                  )}
                </Button>
              </div>

              {/* Magic link — secondary path, outline (not a second filled button) */}
              <Button variant="outline" className="btn-touch" disabled={isDisabled} onClick={handleMagicLink}>
                {loading === 'magic' ? (
                  <>
                    <span role="status" className="sr-only">{t('auth.login.sending')}</span>
                    <Spinner />
                    {t('auth.login.sending')}
                  </>
                ) : (
                  t('auth.login.magic')
                )}
              </Button>
            </div>
          </div>

          {/* Local dev personas, or the separate staging sample org when its build flag is enabled. */}
          {demoMode && (
            <DemoLogin
              onPick={handleDemoSignIn}
              busyEmail={demoBusy}
              disabled={isDisabled}
              personas={demoMode.personas}
              showPassword={demoMode.kind === 'dev'}
              title={demoMode.kind === 'sample' ? t('auth.login.sampleDisclosure') : t('auth.login.demoDisclosure')}
              hideTitle={demoMode.kind === 'sample' ? t('auth.login.sampleHide') : t('auth.login.demoHide')}
            />
          )}
        </div>
      </AuthCard>
    </AuthShell>
  )
}
