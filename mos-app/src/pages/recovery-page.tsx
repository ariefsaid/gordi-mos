import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { AuthShell, AuthCard, Spinner } from '@/auth/auth-shell'
import { SetPasswordForm } from '@/auth/set-password-form'
import { clearMustChangePassword } from '@/lib/db/account'
import { useAuth } from '@/auth/use-auth'

const ERR_EXPIRED = 'That link has expired — request a new one.'

export function RecoveryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()

  const [expired, setExpired] = useState(false)

  const hasRecoveryParams =
    /\b(code|token_hash|access_token|refresh_token)=/.test(location.search)
    || /\b(access_token|refresh_token|type=recovery)=/.test(location.hash)
  const waitingForRecoverySession =
    auth.status === 'loading' || (auth.status === 'unauthenticated' && hasRecoveryParams)
  const isRecoveryReady = auth.status === 'recovering'

  async function handleSubmit(newPassword: string): Promise<string | null> {
    setExpired(false)

    if (!isRecoveryReady) {
      setExpired(true)
      return null
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      if (error.code === 'weak_password') return error.message
      // Link/session errors from updateUser on a recovery link = expired/invalid link.
      setExpired(true)
      return null
    }

    // #131: a recovery-link reset is the holder choosing their own password, so it satisfies the
    // must_change_password gate too. Without this they land on / and are immediately re-gated,
    // asked to set a password they just set. Swallowed on failure: the flag simply stays up and
    // the gate re-prompts, which is the same fail-safe the gate itself relies on.
    try {
      await clearMustChangePassword()
    } catch {
      // no-op — see above
    }

    // Clear the recovering flag so AuthProvider can resolve the viewer (audit L1 fix).
    await auth.clearRecovering()
    navigate('/', { replace: true })
    return null
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

  // isRecoveryReady is guaranteed true past the guard above; handleSubmit re-checks it because the
  // auth status can still change while the form is being filled in.
  return (
    <AuthShell>
      <AuthCard>
        <SetPasswordForm
          title="Set a new password"
          subtitle="Choose a strong password for your account."
          onSubmit={handleSubmit}
        />
      </AuthCard>
    </AuthShell>
  )
}
