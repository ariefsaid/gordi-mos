import { useEffect, useState, useId, type ReactNode } from 'react'
import { PasswordToggle, Spinner } from './auth-shell'
import { ActionBar } from '@/components/ui/action-bar'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'
import { useT } from '@/i18n/use-t'
import { Notice } from '@/components/ui/notice'
import './set-password-form.css'
import { REAUTHENTICATION_REQUIRED } from './reauthentication-required'

/**
 * The shortest password GoTrue will accept. Stated to the person UNDER the field before they type
 * a character, and enforced here so the rule that is shown is the rule that is applied — a rule
 * only revealed by a server rejection is not a rule, it is a trap.
 */
const MIN_PASSWORD_LENGTH = 8

interface Props {
  title?: string
  /** Omitted when the page already says what the form is for (Profile). */
  subtitle?: string
  /** Fires as typed input appears or clears, so a host can guard leaving with unsaved input. */
  onDirtyChange?: (dirty: boolean) => void
  onSubmit: (password: string, nonce?: string) => Promise<string | null | void | typeof REAUTHENTICATION_REQUIRED>
  onReauthenticationRequired?: () => Promise<string | null | void>
  successMessage?: string
  /** Rendered under the submit button — e.g. the sign-out escape hatch on the #131 gate. */
  footer?: (busy: boolean) => ReactNode
}

/**
 * The set-password form: new + confirm, the length rule, mismatch check, server-error slot, submit.
 *
 * Shared by the recovery-link flow (RecoveryPage) and the #131 must-change-password gate
 * (SetPasswordScreen) so the a11y wiring, `new-password` autocomplete, and weak-password
 * surfacing have exactly one home.
 */
export function SetPasswordForm({ title, subtitle, onSubmit, onReauthenticationRequired, successMessage, footer, onDirtyChange }: Props) {
  const t = useT()
  const newPasswordId = useId()
  const confirmPasswordId = useId()
  const ruleId = useId()
  const ruleErrorId = useId()
  const mismatchErrorId = useId()
  const serverErrorId = useId()
  const verificationCodeId = useId()
  const formDomId = useId()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [ruleError, setRuleError] = useState('')
  const [mismatchError, setMismatchError] = useState('')
  const [serverError, setServerError] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [reauthenticationRequested, setReauthenticationRequested] = useState(false)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const dirty = newPassword !== '' || confirmPassword !== '' || verificationCode !== ''
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setRuleError('')
    setMismatchError('')
    setServerError('')
    setSuccess(false)

    // The rule is evaluated BEFORE the match. Two short passwords that differ are one mistake with
    // two symptoms, and reporting the mismatch first sends the person to retype a password that
    // was never going to be accepted.
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setRuleError(t('auth.password.tooShort'))
      return
    }

    if (newPassword !== confirmPassword) {
      setMismatchError(t('auth.password.mismatch'))
      return
    }

    if (reauthenticationRequested && !verificationCode.trim()) {
      setServerError(t('auth.password.codeRequired'))
      return
    }

    setLoading(true)
    try {
      const result = reauthenticationRequested ? await onSubmit(newPassword, verificationCode.trim()) : await onSubmit(newPassword)
      if (result === REAUTHENTICATION_REQUIRED) {
        const message = await onReauthenticationRequired?.()
        if (message || !onReauthenticationRequired) setServerError(message || t('auth.password.refused.generic'))
        else { setVerificationCode(''); setReauthenticationRequested(true) }
        setLoading(false)
      } else if (result) {
        setServerError(result)
        setLoading(false)
      } else if (successMessage) {
        setNewPassword(''); setConfirmPassword(''); setVerificationCode('')
        setReauthenticationRequested(false); setSuccess(true); setLoading(false)
      }
    } catch (err) {
      // Surface the caller's own message — e.g. the DAL's "Couldn't confirm your new password",
      // which names the real failure far better than a generic network line would.
      setServerError(err instanceof Error && err.message ? err.message : t('auth.login.networkError'))
      setLoading(false)
    }
  }

  // The auth variant keeps its submit inline under the fields (sign-in page type); Profile's embedded form uses the shared action bar.
  const submitButton = (
    <Button type="submit" form={formDomId} variant="primary" className="btn-touch" disabled={loading} aria-busy={loading}>
      {loading ? (
        <>
          <span role="status" className="sr-only">{t('auth.password.saving')}</span>
          <Spinner />
          {t('auth.password.saving')}
        </>
      ) : (
        t('auth.password.save')
      )}
    </Button>
  )

  return (
    <div className="password-workbench">
      {/* Task title */}
      {title && <h1 className="page-title">{title}</h1>}
      {subtitle && <p className="auth-lede">{subtitle}</p>}

      {serverError && <Notice tone="urgent" id={serverErrorId}>{serverError}</Notice>}

      <form id={formDomId} className={`auth-form ${title ? 'password-form password-form--auth' : 'password-form password-form--embedded'}`} onSubmit={handleSubmit} noValidate>
        <section className="password-capture auth-form" aria-label={t('auth.password.details')}>
          <div className="auth-field">
            <TextInput
              id={newPasswordId}
              label={t('auth.password.new')}
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              aria-required="true"
              error={Boolean(ruleError)}
              aria-describedby={[ruleError ? ruleErrorId : ruleId, serverError ? serverErrorId : ''].filter(Boolean).join(' ')}
              fullWidth
              trailing={(
                <PasswordToggle
                  shown={showNew}
                  onToggle={() => setShowNew((v) => !v)}
                  showLabel={t('auth.password.showNew')}
                  hideLabel={t('auth.password.hideNew')}
                  controls={newPasswordId}
                />
              )}
            />
            {/* The rule sits with the field it governs, not under the title. */}
            <p id={ruleId} className="auth-field-hint">{t('auth.password.rule')}</p>
            {ruleError && <p id={ruleErrorId} className="auth-field-error">{ruleError}</p>}
          </div>

          <div className="auth-field">
            <TextInput
              id={confirmPasswordId}
              label={t('auth.password.confirm')}
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              aria-required="true"
              error={Boolean(mismatchError)}
              aria-describedby={mismatchError ? mismatchErrorId : undefined}
              fullWidth
              trailing={(
                <PasswordToggle
                  shown={showConfirm}
                  onToggle={() => setShowConfirm((v) => !v)}
                  showLabel={t('auth.password.showConfirm')}
                  hideLabel={t('auth.password.hideConfirm')}
                  controls={confirmPasswordId}
                />
              )}
            />
            {mismatchError && <p id={mismatchErrorId} className="auth-field-error">{mismatchError}</p>}
          </div>

          {reauthenticationRequested && (
            <div className="auth-field">
              <p role="status" aria-live="polite" className="auth-field-hint">{t('profile.password.codeSent')}</p>
              <TextInput
                id={verificationCodeId}
                label={t('auth.password.reauth.code')}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                aria-required="true"
                error={Boolean(serverError)}
                aria-describedby={serverError ? serverErrorId : undefined}
                fullWidth
              />
            </div>
          )}
        </section>
        {title ? <div className="password-action">{submitButton}</div> : <ActionBar className="password-action" primary={submitButton} />}
      </form>

      {success && successMessage && <p role="status" aria-live="polite" aria-atomic="true" className="auth-field-hint">{successMessage}</p>}
      {footer?.(loading)}
    </div>
  )
}
