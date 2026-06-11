import { useState, useId, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Error-handling table strings (verbatim from spec)
const ERR_CREDENTIAL = 'Invalid email or password.'
const ERR_RATE_LIMIT = 'Too many attempts — try again in a minute.'
const ERR_NETWORK = "Couldn't reach the server — try again."
const ERR_EXPIRED_LINK = 'That link has expired — request a new one.'

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

// Inline spinner — aria-hidden; label on button carries the meaning (design-plan §5)
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={['animate-spin', className].filter(Boolean).join(' ')}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 16 16"
      width="14"
      height="14"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.25"
      />
      <path
        d="M14 8a6 6 0 0 1-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

// AuthShell — centered viewport + brand block + foot line
// Used by all auth views per design-plan §2
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-4">
      {/* Brand block — mirrors IA-8 rail brand */}
      <div className="w-full max-w-[360px] mb-6 flex items-center gap-2">
        {/* Logo square: 28px, primary bg, primary-foreground glyph, rounded-sm */}
        <div
          className="flex items-center justify-center bg-primary text-primary-foreground rounded-sm font-bold select-none"
          style={{ width: 28, height: 28, fontSize: 14, letterSpacing: '-0.01em' }}
          aria-hidden="true"
        >
          G
        </div>
        <div className="flex flex-col leading-none">
          {/* Brand name: 14px/700, ls -0.01em (heading weight, not page-title) */}
          <span
            className="text-foreground font-bold"
            style={{ fontSize: 14, letterSpacing: '-0.01em' }}
          >
            Gordi MOS
          </span>
          {/* Overline: 11px/600, ls 0.06em, uppercase, muted-foreground */}
          <span
            className="text-muted-foreground font-semibold uppercase tracking-[0.06em]"
            style={{ fontSize: 11 }}
          >
            Management OS
          </span>
        </div>
      </div>

      {children}

      {/* Foot line: body 13px, muted-foreground */}
      <p
        className="mt-6 text-muted-foreground text-center"
        style={{ fontSize: 13 }}
      >
        Trouble signing in?{' '}
        <span className="text-muted-foreground">Contact Arief.</span>
      </p>
    </div>
  )
}

// Card container — border-only, rounded-md, padding spacing.6 (24px), flat-by-default
function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full max-w-[360px] bg-card border border-border rounded-md"
      style={{ padding: 24 }}
    >
      {children}
    </div>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('credentials')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState<'sign-in' | 'magic' | 'reset' | null>(null)

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

  const isDisabled = loading !== null

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
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
    setLoading('reset')
    try {
      await supabase.auth.resetPasswordForEmail(email)
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
                backgroundColor: 'hsl(var(--success) / 0.14)',
                color: 'hsl(var(--status-won-text))',
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
              backgroundColor: 'hsl(var(--warning) / 0.18)',
              color: 'hsl(var(--warning-foreground))',
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
              backgroundColor: 'hsl(var(--destructive) / 0.08)',
              color: 'hsl(var(--destructive))',
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
              onChange={(e) => setEmail(e.target.value)}
              disabled={isDisabled}
              className="w-full bg-background text-foreground border border-input rounded-md px-2.5"
              style={{
                height: 32,
                fontSize: 14,
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? 'not-allowed' : undefined,
              }}
              aria-describedby={error ? errorId : undefined}
            />
          </div>

          {/* Password field with "Forgot password?" */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor={passwordId}
                className="text-foreground font-semibold"
                style={{ fontSize: 12 }}
              >
                Password
              </label>
              {/* Forgot password — primary-text link, quiet tertiary affordance */}
              <button
                type="button"
                className="text-primary font-medium hover:underline focus-visible:underline"
                style={{ fontSize: 12 }}
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
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isDisabled}
              className="w-full bg-background text-foreground border border-input rounded-md px-2.5"
              style={{
                height: 32,
                fontSize: 14,
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? 'not-allowed' : undefined,
              }}
              aria-describedby={error ? errorId : undefined}
            />
          </div>

          {/* Primary submit — the ONE filled primary button (One Blue Rule) */}
          <button
            type="submit"
            disabled={isDisabled}
            aria-busy={loading === 'sign-in'}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md font-medium"
            style={{
              height: 32,
              fontSize: 14,
              boxShadow: 'box-shadow: 0 1px 2px hsl(var(--primary) / 0.25)',
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
            minHeight: 44, // touch target ≥44px (design-plan §4)
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
      </AuthCard>
    </AuthShell>
  )
}
