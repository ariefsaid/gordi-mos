import { useState, useId, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { AuthShell, AuthCard, Spinner } from '@/auth/auth-shell'
import { DemoLogin } from './demo-login'
import { DEMO_PASSWORD } from './demo-personas'

// Error-handling table strings (verbatim from spec)
const ERR_CREDENTIAL = 'Invalid email or password.'
const ERR_RATE_LIMIT = 'Too many attempts — try again in a minute.'
const ERR_NETWORK = "Couldn't reach the server — try again."
const ERR_EXPIRED_LINK = 'That link has expired — request a new one.'
const ERR_EMAIL_INVALID = 'Enter a valid email address.'

type Mode = 'credentials' | 'magic-confirm' | 'reset-confirm'

function mapAuthError(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status
    if (status === 429) return ERR_RATE_LIMIT
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
    return ERR_CREDENTIAL
  }
  return ERR_CREDENTIAL
}

// Simple RFC-5322-inspired email check (same pattern used by most browsers)
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function LoginPage() {
  const navigate = useNavigate()
  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()
  const emailErrorId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('credentials')
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [loading, setLoading] = useState<'sign-in' | 'magic' | 'reset' | null>(null)
  // Dev-only one-click demo sign-in: which persona email is currently in flight.
  const [demoBusy, setDemoBusy] = useState<string | null>(null)

  // Check for expired-link URL param on mount (design-plan §3 expired-link notice)
  const [expiredLink, setExpiredLink] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err === 'access_denied' || err === 'otp_expired') {
      setExpiredLink(true)
    }
  }, [])

  // Focus the error region when it appears (design-plan §5 WCAG "focus moves to error")
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus()
    }
  }, [error])

  const isDisabled = loading !== null || demoBusy !== null

  // Dev-only: one-click sign in as a seeded persona (no form interaction).
  async function handleDemoSignIn(personaEmail: string) {
    setError('')
    setEmailError('')
    setDemoBusy(personaEmail)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: personaEmail,
        password: DEMO_PASSWORD,
      })
      if (authError) {
        setError(mapAuthError(authError))
      } else {
        navigate('/', { replace: true })
      }
    } catch {
      setError(ERR_NETWORK)
    } finally {
      setDemoBusy(null)
    }
  }

  // fix-2: validate email client-side before any auth call
  function validateEmail(): boolean {
    if (!email.trim() || !isValidEmail(email)) {
      setEmailError(ERR_EMAIL_INVALID)
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
        setError(mapAuthError(authError))
      } else {
        navigate('/', { replace: true })
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
      await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      })
      // Always show neutral confirmation (no enumeration — AC-006)
      setMode('magic-confirm')
    } catch {
      setError(ERR_NETWORK)
    } finally {
      setLoading(null)
    }
  }

  async function handleForgotPassword() {
    setError('')
    if (!validateEmail()) return
    setLoading('reset')
    try {
      // redirectTo ensures the recovery link lands on /recovery so the PASSWORD_RECOVERY
      // event is handled while the router is at the correct path (audit L1 fix).
      const redirectTo = `${window.location.origin}/mos/recovery`
      await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      // Always show neutral confirmation (no enumeration — AC-006)
      setMode('reset-confirm')
    } catch {
      setError(ERR_NETWORK)
    } finally {
      setLoading(null)
    }
  }

  // ── Confirmation panel (magic-link or reset) ──────────────────────────────
  if (mode === 'magic-confirm' || mode === 'reset-confirm') {
    const isReset = mode === 'reset-confirm'
    const confirmText = isReset
      ? 'Check your email to reset your password.'
      : 'Check your email for a sign-in link.'

    return (
      <AuthShell>
        <AuthCard>
          {/* Success dot tile — success/14% tint + status-won-text */}
          <div className="flex items-start gap-3 mb-5">
            <div
              className="flex items-center justify-center rounded-full flex-shrink-0"
              style={{
                width: 28,
                height: 28,
                backgroundColor: 'color-mix(in srgb, var(--success) 14%, transparent)',
                color: 'var(--status-won-text)',
                fontSize: 14,
              }}
              aria-hidden="true"
            >
              ✓
            </div>
            <div>
              <p className="text-foreground font-semibold" style={{ fontSize: 14 }}>
                {confirmText}
              </p>
              {email && (
                <p className="text-muted-foreground mt-1" style={{ fontSize: 13 }}>
                  Sent to {email}
                </p>
              )}
            </div>
          </div>

          {/* Back to sign in — primary-text link (design-plan §3) */}
          <button
            type="button"
            className="text-primary font-medium hover:underline focus-visible:underline"
            style={{ fontSize: 14 }}
            onClick={() => {
              setMode('credentials')
              setError('')
            }}
          >
            Back to sign in
          </button>
        </AuthCard>
      </AuthShell>
    )
  }

  // ── Credentials form ──────────────────────────────────────────────────────
  return (
    <AuthShell>
      <AuthCard>
        {/* Expired-link warning notice (design-plan §3 — warning/18% tint) */}
        {expiredLink && (
          <div
            className="mb-4 rounded-md px-3 py-2 flex items-start gap-2"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--warning) 18%, transparent)',
              color: 'var(--warning-foreground)',
              fontSize: 13,
            }}
            role="alert"
          >
            <span aria-hidden="true" style={{ marginTop: 1 }}>⚠</span>
            <span>{ERR_EXPIRED_LINK}</span>
          </div>
        )}

        {/* Card title — subheading (18px/600) per design-plan §1 */}
        <h1
          className="text-foreground font-semibold"
          style={{ fontSize: 18, lineHeight: 1.3, marginBottom: 4 }}
        >
          Sign in
        </h1>
        <p
          className="text-muted-foreground mb-5"
          style={{ fontSize: 14 }}
        >
          Use your Gordi MOS account.
        </p>

        {/* Form-level error — role=alert, destructive text, tinted row */}
        {error && !expiredLink && (
          <div
            ref={errorRef}
            id={errorId}
            role="alert"
            tabIndex={-1}
            className="mb-4 rounded-md px-3 py-2"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--destructive) 8%, transparent)',
              color: 'var(--status-lost-text)',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSignIn} noValidate>
          {/* Email field */}
          <div className="mb-4">
            <label
              htmlFor={emailId}
              className="block text-foreground font-semibold mb-1"
              style={{ fontSize: 12 }}
            >
              Email
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              placeholder="you@gordi.id"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError('')
              }}
              disabled={isDisabled}
              aria-invalid={emailError ? 'true' : undefined}
              aria-describedby={emailError ? emailErrorId : (error ? errorId : undefined)}
              className="w-full bg-background text-foreground rounded-sm px-2.5 border"
              style={{
                height: 32,
                fontSize: 14,
                borderColor: emailError ? 'var(--destructive)' : 'var(--input)',
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? 'not-allowed' : undefined,
              }}
            />
            {/* fix-2: inline field error below email input */}
            {emailError && (
              <p
                id={emailErrorId}
                className="mt-1"
                style={{ fontSize: 12, color: 'var(--status-lost-text)' }}
              >
                {emailError}
              </p>
            )}
          </div>

          {/* Password field — design-plan §1 layout: label on its own row, field below */}
          {/* fix-4: "Forgot password?" moved OUT of the label row, placed AFTER the password field */}
          <div className="mb-5">
            <label
              htmlFor={passwordId}
              className="block text-foreground font-semibold mb-1"
              style={{ fontSize: 12 }}
            >
              Password
            </label>
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isDisabled}
              className="w-full bg-background text-foreground border border-input rounded-sm px-2.5"
              style={{
                height: 32,
                fontSize: 14,
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? 'not-allowed' : undefined,
              }}
              aria-describedby={error ? errorId : undefined}
            />
            {/* fix-4: Forgot password link AFTER the password field (DOM order = tab order) */}
            {/* fix-3: same min-height:44px touch-target treatment as magic-link */}
            <div className="flex justify-end mt-1">
              <button
                type="button"
                className="text-primary font-medium hover:underline focus-visible:underline"
                style={{
                  fontSize: 12,
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
                disabled={isDisabled}
                onClick={handleForgotPassword}
              >
                {loading === 'reset' ? (
                  <span className="flex items-center gap-1">
                    <Spinner />
                    Sending…
                  </span>
                ) : (
                  'Forgot password?'
                )}
              </button>
            </div>
          </div>

          {/* Primary submit — the ONE filled primary button (One Blue Rule) */}
          <button
            type="submit"
            disabled={isDisabled}
            aria-busy={loading === 'sign-in'}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-sm font-medium"
            style={{
              height: 32,
              fontSize: 14,
              boxShadow: '0 1px 2px color-mix(in srgb, var(--primary) 25%, transparent)',
              opacity: (isDisabled && loading !== 'sign-in') ? 0.5 : 1,
              cursor: isDisabled ? 'not-allowed' : undefined,
            }}
          >
            {loading === 'sign-in' ? (
              <>
                {/* role=status carries the loading announcement */}
                <span role="status" className="sr-only">Loading…</span>
                <Spinner className="text-primary-foreground" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        {/* "or" divider — single 1px border hairline (Single-Border Rule) */}
        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-border" aria-hidden="true" />
          <span className="text-muted-foreground" style={{ fontSize: 13 }}>or</span>
          <div className="flex-1 h-px bg-border" aria-hidden="true" />
        </div>

        {/* Magic-link — secondary path, primary-text link (NOT a filled button) */}
        <button
          type="button"
          disabled={isDisabled}
          className="w-full flex items-center justify-center gap-2 text-primary font-medium hover:underline focus-visible:underline"
          style={{
            fontSize: 14,
            minHeight: 44, // fix-3 / touch target ≥44px (design-plan §4)
            opacity: (isDisabled && loading !== 'magic') ? 0.5 : 1,
            cursor: isDisabled ? 'not-allowed' : undefined,
          }}
          onClick={handleMagicLink}
        >
          {loading === 'magic' ? (
            <>
              <span role="status" className="sr-only">Loading…</span>
              <Spinner className="text-primary" />
              Sending…
            </>
          ) : (
            'Email me a sign-in link instead'
          )}
        </button>

        {/* Dev-only one-click demo sign-in — NEVER rendered in a built/deployed site */}
        {import.meta.env.DEV && (
          <DemoLogin onPick={handleDemoSignIn} busyEmail={demoBusy} disabled={isDisabled} />
        )}
      </AuthCard>
    </AuthShell>
  )
}
