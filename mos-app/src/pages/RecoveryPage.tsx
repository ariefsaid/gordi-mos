import { useState, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthShell, AuthCard, Spinner } from '../auth/AuthShell'

const ERR_MISMATCH = "Passwords don't match."
const ERR_EXPIRED = 'That link has expired — request a new one.'

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
