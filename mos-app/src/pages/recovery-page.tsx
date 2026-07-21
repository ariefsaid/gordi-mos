import { useState, useId } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { AuthShell, AuthCard, Spinner } from '@/auth/auth-shell'
import { useAuth } from '@/auth/use-auth'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'

const ERR_MISMATCH = "Passwords don't match."
const ERR_EXPIRED = 'That link has expired — request a new one.'

export function RecoveryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()
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

  const hasRecoveryParams =
    /\b(code|token_hash|access_token|refresh_token)=/.test(location.search)
    || /\b(access_token|refresh_token|type=recovery)=/.test(location.hash)
  const waitingForRecoverySession =
    auth.status === 'loading' || (auth.status === 'unauthenticated' && hasRecoveryParams)
  const isRecoveryReady = auth.status === 'recovering'
  const isDisabled = loading || !isRecoveryReady

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMismatchError('')
    setServerError('')
    setExpired(false)

    if (newPassword !== confirmPassword) {
      setMismatchError(ERR_MISMATCH)
      return
    }

    if (!isRecoveryReady) {
      setExpired(true)
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        if (error.code === 'weak_password') {
          setServerError(error.message)
        } else {
          // Link/session errors from updateUser on a recovery link = expired/invalid link.
          setExpired(true)
        }
      } else {
        // Clear the recovering flag so AuthProvider can resolve the viewer (audit L1 fix).
        await auth.clearRecovering()
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
              backgroundColor: 'color-mix(in srgb, var(--warning) 18%, transparent)',
              color: 'var(--warning-foreground)',
              fontSize: 15,
            }}
            role="alert"
          >
            <span aria-hidden="true" style={{ marginTop: 1 }}>⚠</span>
            <span>{ERR_EXPIRED}</span>
          </div>
          <a
            href="/mos/login"
            className="text-primary font-medium hover:underline"
            style={{ fontSize: 16 }}
          >
            Back to sign in
          </a>
        </AuthCard>
      </AuthShell>
    )
  }

  if (waitingForRecoverySession) {
    return (
      <AuthShell>
        <AuthCard>
          <div role="status" aria-label="Verifying recovery link" className="flex items-center gap-2">
            <Spinner />
            <span>Verifying recovery link…</span>
          </div>
        </AuthCard>
      </AuthShell>
    )
  }

  if (!isRecoveryReady) {
    return (
      <AuthShell>
        <AuthCard>
          <div
            className="mb-4 rounded-md px-3 py-2 flex items-start gap-2"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--warning) 18%, transparent)',
              color: 'var(--warning-foreground)',
              fontSize: 15,
            }}
            role="alert"
          >
            <span aria-hidden="true" style={{ marginTop: 1 }}>⚠</span>
            <span>{ERR_EXPIRED}</span>
          </div>
          <a
            href="/mos/login"
            className="text-primary font-medium hover:underline"
            style={{ fontSize: 16 }}
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
          style={{ fontSize: 20, lineHeight: 1.3, marginBottom: 4 }}
        >
          Set a new password
        </h1>
        <p className="text-muted-foreground mb-5" style={{ fontSize: 16 }}>
          Choose a strong password for your account.
        </p>

        {serverError && (
          <div
            id={serverErrorId}
            role="alert"
            className="mb-4 rounded-md px-3 py-2"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--destructive) 8%, transparent)',
              color: 'var(--destructive)',
              fontSize: 15,
            }}
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* New password */}
          <div className="mb-4">
            <TextInput
              id={newPasswordId}
              label="New password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isDisabled}
              fullWidth
              aria-required="true"
            />
          </div>

          {/* Confirm password */}
          <div className="mb-5">
            <TextInput
              id={confirmPasswordId}
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isDisabled}
              error={Boolean(mismatchError)}
              fullWidth
              aria-required="true"
              aria-describedby={mismatchError ? mismatchErrorId : undefined}
            />
            {mismatchError && (
              <p
                id={mismatchErrorId}
                className="mt-1"
                style={{ fontSize: 12, color: 'var(--destructive)' }}
              >
                {mismatchError}
              </p>
            )}
          </div>

          {/* Primary submit */}
          <Button
            type="submit"
            disabled={isDisabled}
            aria-busy={loading}
            className="w-full btn-touch"
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
          </Button>
        </form>
      </AuthCard>
    </AuthShell>
  )
}
