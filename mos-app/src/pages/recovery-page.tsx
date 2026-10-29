import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { AuthShell, AuthCard, AuthBackLink, Spinner } from '@/auth/auth-shell'
import { SetPasswordForm } from '@/auth/set-password-form'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { passwordRefusal } from '@/auth/password-error'
import { isValidEmail } from '@/auth/is-valid-email'
import { appUrl } from '@/config/app-build-settings'
import { Notice } from '@/components/ui/notice'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'
import './recovery-page.css'

/**
 * The dead end of a recovery link, and the way out of it.
 *
 * A person here has already proved they can read the mailbox — only the token expired. Sending
 * them back to sign in to hunt for "Forgot password?" again is a lap of the same loop, so the new
 * link is requested from this card. The address has to be asked for: an expired link carries no
 * session, so nothing on this screen knows who they are.
 */
function ExpiredCard() {
  const t = useT()
  const emailId = useId()
  const emailErrorId = useId()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const sendingRef = useRef(false)

  async function requestNewLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValidEmail(email)) {
      setEmailError(t('auth.recovery.emailInvalid'))
      return
    }
    if (sendingRef.current) return

    sendingRef.current = true
    setSending(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: new URL(appUrl('/recovery'), window.location.origin).href,
      })
      // The outcome must not vary with `error` — GoTrue answers 200 for an address it has never
      // seen, so a send that FAILS is evidence the address EXISTS. Console only, never the UI.
      if (error) console.warn('[auth] recovery re-send did not go through', error)
    } catch (err) {
      console.warn('[auth] recovery re-send did not go through', err)
    } finally {
      sendingRef.current = false
      setSending(false)
      setSent(true)
    }
  }

  // Result state — replaces the card body, never stacks under the form.
  if (sent) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthBackLink to="/login" label={t('auth.backToSignIn')} />
          <h1 className="page-title">{t('auth.recovery.title')}</h1>
          <Notice tone="success" role="status" aria-live="polite">
            <p><strong>{t('auth.recovery.sent')}</strong></p>
            {email && <p>{t('auth.login.forAddress', { email })}</p>}
          </Notice>
        </AuthCard>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <AuthCard>
        <AuthBackLink to="/login" label={t('auth.backToSignIn')} />
        <h1 className="page-title">{t('auth.recovery.title')}</h1>
        <Notice tone="attention" role="alert">{t('auth.recovery.expired')}</Notice>

        <form className="auth-form" noValidate onSubmit={requestNewLink}>
          <div className="auth-field">
            <TextInput
              id={emailId}
              label={t('auth.recovery.emailLabel')}
              type="email"
              autoComplete="email"
              placeholder={t('auth.recovery.emailPlaceholder')}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (emailError) setEmailError('')
              }}
              disabled={sending}
              aria-required="true"
              error={Boolean(emailError)}
              aria-describedby={emailError ? emailErrorId : undefined}
              fullWidth
            />
            {emailError && <p id={emailErrorId} role="alert" className="auth-field-error">{emailError}</p>}
          </div>

          {/* The ONE filled primary on this page */}
          <Button type="submit" variant="primary" className="btn-touch" disabled={sending} aria-busy={sending}>
            {sending ? (
              <>
                <span role="status" className="sr-only">{t('auth.recovery.sending')}</span>
                <Spinner />
                {t('auth.recovery.sending')}
              </>
            ) : (
              t('auth.recovery.requestNewLink')
            )}
          </Button>
          <p className="auth-field-hint">{t('auth.recovery.nextCopy')}</p>
        </form>
      </AuthCard>
    </AuthShell>
  )
}

export function RecoveryPage() {
  const navigate = useNavigate()
  const auth = useAuth()
  const t = useT()

  const [expired, setExpired] = useState(false)

  const waitingForRecoverySession = auth.status === 'loading'
  const isRecoveryReady = auth.status === 'recovering'

  async function handleSubmit(newPassword: string): Promise<string | null> {
    setExpired(false)

    if (!isRecoveryReady) {
      setExpired(true)
      return null
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      const refusal = passwordRefusal(error)
      // On a recovery link, anything that is not a nameable password rule = expired/invalid link.
      if (refusal === 'auth.password.refused.session' || refusal === 'auth.password.refused.generic') {
        setExpired(true)
        return null
      }
      return t(refusal)
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
          <h1 className="page-title">{t('auth.recovery.title')}</h1>
          <div role="status" aria-label={t('auth.password.verifyingLabel')} className="recovery-verifying">
            <Spinner />
            <span>{t('auth.password.verifying')}</span>
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
          title={t('auth.password.setTitle')}
          subtitle={t('auth.password.recoverySubtitle')}
          onSubmit={handleSubmit}
        />
      </AuthCard>
    </AuthShell>
  )
}
