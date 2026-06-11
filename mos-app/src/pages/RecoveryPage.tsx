import { useState, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const ERR_MISMATCH = "Passwords don't match."
const ERR_EXPIRED = 'That link has expired — request a new one.'

// Inline spinner — aria-hidden; button label carries meaning
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

// Shared auth shell — centered viewport + brand block
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-4">
      {/* Brand block */}
      <div className="w-full max-w-[360px] mb-6 flex items-center gap-2">
        <div
          className="flex items-center justify-center bg-primary text-primary-foreground rounded-sm font-bold select-none"
          style={{ width: 28, height: 28, fontSize: 14, letterSpacing: '-0.01em' }}
          aria-hidden="true"
        >
          G
        </div>
        <div className="flex flex-col leading-none">
          <span
            className="text-foreground font-bold"
            style={{ fontSize: 14, letterSpacing: '-0.01em' }}
          >
            Gordi MOS
          </span>
          <span
            className="text-muted-foreground font-semibold uppercase tracking-[0.06em]"
            style={{ fontSize: 11 }}
          >
            Management OS
          </span>
        </div>
      </div>

      {children}

      <p className="mt-6 text-muted-foreground text-center" style={{ fontSize: 13 }}>
        Trouble signing in? Contact Arief.
      </p>
    </div>
  )
}

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

export default function RecoveryPage() {
  const navigate = useNavigate()
  const newPasswordId = useId()
  const confirmPasswordId = useId()
  const mismatchErrorId = useId()
  const serverErrorId = useId()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mismatchError, setMismatchError] = useState('')
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [expired, setExpired] = useState(false)

  const isDisabled = loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMismatchError('')
    setServerError('')
    setExpired(false)

    if (newPassword !== confirmPassword) {
      setMismatchError(ERR_MISMATCH)
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        // Any error from updateUser on a recovery link = expired/invalid link
        setExpired(true)
      } else {
        navigate('/', { replace: true })
      }
    } catch {
      setServerError("Couldn't reach the server — try again.")
    } finally {
      setLoading(false)
    }
  }

  // Expired link fallback
  if (expired) {
    return (
      <AuthShell>
        <AuthCard>
          {/* Warning notice — warning/18% tint + warning-foreground */}
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
            <span>{ERR_EXPIRED}</span>
          </div>
          <a
            href="/mos/login"
            className="text-primary font-medium hover:underline"
            style={{ fontSize: 14 }}
          >
            Back to sign in
          </a>
        </AuthCard>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <AuthCard>
        {/* Card title */}
        <h1
          className="text-foreground font-semibold"
          style={{ fontSize: 18, lineHeight: 1.3, marginBottom: 4 }}
        >
          Set a new password
        </h1>
        <p className="text-muted-foreground mb-5" style={{ fontSize: 14 }}>
          Choose a strong password for your account.
        </p>

        {serverError && (
          <div
            id={serverErrorId}
            role="alert"
            className="mb-4 rounded-md px-3 py-2"
            style={{
              backgroundColor: 'hsl(var(--destructive) / 0.08)',
              color: 'hsl(var(--destructive))',
              fontSize: 13,
            }}
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* New password */}
          <div className="mb-4">
            <label
              htmlFor={newPasswordId}
              className="block text-foreground font-semibold mb-1"
              style={{ fontSize: 12 }}
            >
              New password
            </label>
            <input
              id={newPasswordId}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isDisabled}
              className="w-full bg-background text-foreground border border-input rounded-md px-2.5"
              style={{
                height: 32,
                fontSize: 14,
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? 'not-allowed' : undefined,
              }}
            />
          </div>

          {/* Confirm password */}
          <div className="mb-5">
            <label
              htmlFor={confirmPasswordId}
              className="block text-foreground font-semibold mb-1"
              style={{ fontSize: 12 }}
            >
              Confirm password
            </label>
            <input
              id={confirmPasswordId}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isDisabled}
              aria-invalid={mismatchError ? 'true' : undefined}
              aria-describedby={mismatchError ? mismatchErrorId : undefined}
              className="w-full bg-background text-foreground border rounded-md px-2.5"
              style={{
                height: 32,
                fontSize: 14,
                borderColor: mismatchError ? 'hsl(var(--destructive))' : 'hsl(var(--input))',
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? 'not-allowed' : undefined,
              }}
            />
            {mismatchError && (
              <p
                id={mismatchErrorId}
                className="mt-1"
                style={{ fontSize: 12, color: 'hsl(var(--destructive))' }}
              >
                {mismatchError}
              </p>
            )}
          </div>

          {/* Primary submit */}
          <button
            type="submit"
            disabled={isDisabled}
            aria-busy={loading}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md font-medium"
            style={{
              height: 32,
              fontSize: 14,
              opacity: isDisabled ? 0.5 : 1,
              cursor: isDisabled ? 'not-allowed' : undefined,
            }}
          >
            {loading ? (
              <>
                <span role="status" className="sr-only">Loading…</span>
                <Spinner className="text-primary-foreground" />
                Saving…
              </>
            ) : (
              'Save password'
            )}
          </button>
        </form>
      </AuthCard>
    </AuthShell>
  )
}
