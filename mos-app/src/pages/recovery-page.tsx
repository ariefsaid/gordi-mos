import { useId, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { AuthShell, AuthCard, Spinner } from '@/auth/auth-shell'
import { SetPasswordForm } from '@/auth/set-password-form'
import { useAuth } from '@/auth/use-auth'

const ERR_EXPIRED = 'That link has expired — request a new one.'

/**
 * The dead end of a recovery link, and the way out of it.
 *
 * A person here has already proved they can read the mailbox — only the token expired. Sending
 * them back to sign in to hunt for "Forgot password?" again is a lap of the same loop, so the new
 * link is requested from this card. The address has to be asked for: an expired link carries no
 * session, so nothing on this screen knows who they are.
 */
function ExpiredCard() {
  const emailId = useId()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function requestNewLink() {
    setSending(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/mos/recovery`,
      })
      // The outcome must not vary with `error` — GoTrue answers 200 for an address it has never
      // seen, so a send that FAILS is evidence the address EXISTS. Console only, never the UI.
      if (error) console.warn('[auth] recovery re-send did not go through', error)
    } catch (err) {
      console.warn('[auth] recovery re-send did not go through', err)
    } finally {
      setSending(false)
      setSent(true)
    }
  }

  // Result state — replaces the card body, never stacks under the form.
  if (sent) {
    return (
      <AuthShell>
        <AuthCard>
          <div className="flex items-start gap-3 mb-5">
            <div
              className="flex items-center justify-center rounded-full flex-shrink-0"
              style={{
                width: 28,
                height: 28,
                backgroundColor: 'color-mix(in srgb, var(--success) 14%, transparent)',
                color: 'var(--status-won-text)',
                fontSize: 16,
              }}
              aria-hidden="true"
            >
              ✓
            </div>
            <p className="text-foreground font-semibold" style={{ fontSize: 16 }}>
              If an account exists for that address, a reset link is on its way.
            </p>
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
        {/* Warning notice — warning/18% tint + warning-foreground */}
        <div
          className="mb-4 rounded-md px-3 py-2 flex items-start gap-2"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--warning) 18%, transparent)',
            color: 'var(--warning-foreground)',
            fontSize: 'var(--font-size-body-lg)',
          }}
          role="alert"
        >
          <span aria-hidden="true" style={{ marginTop: 1 }}>⚠</span>
          <span>{ERR_EXPIRED}</span>
        </div>

        <label
          htmlFor={emailId}
          className="block text-foreground font-semibold mb-1"
          style={{ fontSize: 'var(--font-size-label)' }}
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
          disabled={sending}
          aria-required="true"
          className="w-full bg-background text-foreground border border-input rounded-sm px-2.5 mb-4"
          style={{
            height: 32,
            fontSize: 'var(--font-size-touch-input)',
            opacity: sending ? 0.5 : 1,
          }}
        />

        {/* The ONE filled primary on this card */}
        <button
          type="button"
          disabled={sending || !email.trim()}
          aria-busy={sending}
          onClick={requestNewLink}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-sm font-medium"
          style={{
            height: 32,
            fontSize: 16,
            opacity: sending || !email.trim() ? 0.5 : 1,
            cursor: sending || !email.trim() ? 'not-allowed' : undefined,
          }}
        >
          {sending ? (
            <>
              <span role="status" className="sr-only">Loading…</span>
              <Spinner className="text-primary-foreground" />
              Sending…
            </>
          ) : (
            'Request a new link'
          )}
        </button>

        {/* The other way out stays where it was. */}
        <div className="mt-4">
          <a
            href="/mos/login"
            className="text-primary font-medium hover:underline"
            style={{ fontSize: 16 }}
          >
            Back to sign in
          </a>
        </div>
      </AuthCard>
    </AuthShell>
  )
}

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
    // must_change_password gate too. Nothing to do here — the auth.users trigger lowered the flag
    // as part of the updateUser above, so they are not re-gated on arrival.

    // Clear the recovering flag so AuthProvider can resolve the viewer (audit L1 fix).
    await auth.clearRecovering()
    navigate('/', { replace: true })
    return null
  }

  // Expired link fallback
  if (expired) {
    return <ExpiredCard />
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
    return <ExpiredCard />
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
