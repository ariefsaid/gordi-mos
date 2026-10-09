import { useState, useId, type ReactNode } from 'react'
import { Spinner } from './auth-shell'
import { useT } from '@/i18n/use-t'

/**
 * The shortest password GoTrue will accept. Stated to the person UNDER the field before they type
 * a character, and enforced here so the rule that is shown is the rule that is applied — a rule
 * only revealed by a server rejection is not a rule, it is a trap.
 */
export const MIN_PASSWORD_LENGTH = 8
export const REAUTHENTICATION_REQUIRED = Symbol('reauthentication-required')

interface Props {
  title?: string
  subtitle: string
  onSubmit: (password: string, nonce?: string) => Promise<string | null | void | typeof REAUTHENTICATION_REQUIRED>
  onReauthenticationRequired?: () => Promise<string | null | void>
  successMessage?: string
  /** Rendered under the submit button — e.g. the sign-out escape hatch on the #131 gate. */
  footer?: (busy: boolean) => ReactNode
}

/** Eye toggle for a password field — the control is the label, so the label carries the state. */
function RevealToggle({
  shown,
  onToggle,
  showLabel,
  hideLabel,
  controls,
}: {
  shown: boolean
  onToggle: () => void
  showLabel: string
  hideLabel: string
  controls: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={shown}
      aria-controls={controls}
      aria-label={shown ? hideLabel : showLabel}
      className="absolute top-0 right-0 h-full px-2 flex items-center text-muted-foreground hover:text-foreground"
      style={{ fontSize: 'var(--font-size-label)' }}
    >
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z" />
        <circle cx="8" cy="8" r="1.8" />
        {shown && <path d="M2 14 14 2" strokeLinecap="round" />}
      </svg>
    </button>
  )
}

/**
 * The set-password form: new + confirm, the length rule, mismatch check, server-error slot, submit.
 *
 * Shared by the recovery-link flow (RecoveryPage) and the #131 must-change-password gate
 * (SetPasswordScreen) so the a11y wiring, `new-password` autocomplete, and weak-password
 * surfacing have exactly one home.
 */
export function SetPasswordForm({ title, subtitle, onSubmit, onReauthenticationRequired, successMessage, footer }: Props) {
  const t = useT()
  const newPasswordId = useId()
  const confirmPasswordId = useId()
  const ruleId = useId()
  const ruleErrorId = useId()
  const mismatchErrorId = useId()
  const serverErrorId = useId()
  const verificationCodeId = useId()

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
      setServerError(err instanceof Error && err.message ? err.message : "Couldn't reach the server — try again.")
      setLoading(false)
    }
  }

  return (
    <>
      {/* Card title */}
      {title && <h1 className="text-foreground font-semibold" style={{ fontSize: 'var(--font-size-heading)', lineHeight: 1.3, marginBottom: 4 }}>{title}</h1>}
      <p className="text-muted-foreground mb-5" style={{ fontSize: 16 }}>{subtitle}</p>

      {serverError && (
        <div
          id={serverErrorId}
          role="alert"
          className="mb-4 rounded-md px-3 py-2"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--destructive) 8%, transparent)',
            // DESIGN.md §Field-error tokens (RATIFIED OD-P3-5): error TEXT is the AA-darkened red,
            // never base --destructive, which is ~3.6:1 on white and fails AA at this size.
            color: 'var(--status-lost-text)',
            fontSize: 'var(--font-size-body-lg)',
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
            style={{ fontSize: 'var(--font-size-label)' }}
          >
            New password
          </label>
          <div className="relative">
            <input
              id={newPasswordId}
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              aria-required="true"
              aria-invalid={ruleError ? 'true' : undefined}
              aria-describedby={[ruleError ? ruleErrorId : ruleId, serverError ? serverErrorId : '']
                .filter(Boolean)
                .join(' ')}
              className="w-full bg-background text-foreground border rounded-sm pl-2.5 pr-12"
              style={{
                height: 32,
                fontSize: 'var(--font-size-touch-input)',
                borderColor: ruleError ? 'var(--destructive)' : 'var(--input)',
                opacity: loading ? 0.5 : 1,
                cursor: loading ? 'not-allowed' : undefined,
              }}
            />
            <RevealToggle
              shown={showNew}
              onToggle={() => setShowNew((v) => !v)}
              showLabel={t('auth.password.showNew')}
              hideLabel={t('auth.password.hideNew')}
              controls={newPasswordId}
            />
          </div>
          {/* The rule, stated before any error — it is what the person needs to get it right the
              first time, not a post-mortem on the attempt they already made. */}
          <p
            id={ruleId}
            className="mt-1 text-muted-foreground"
            style={{ fontSize: 'var(--font-size-label)' }}
          >
            {t('auth.password.rule')}
          </p>
          {ruleError && (
            <p
              id={ruleErrorId}
              className="mt-1"
              style={{ fontSize: 'var(--font-size-label)', color: 'var(--status-lost-text)' }}
            >
              {ruleError}
            </p>
          )}
        </div>

        {/* Confirm password */}
        <div className="mb-5">
          <label
            htmlFor={confirmPasswordId}
            className="block text-foreground font-semibold mb-1"
            style={{ fontSize: 'var(--font-size-label)' }}
          >
            Confirm password
          </label>
          <div className="relative">
            <input
              id={confirmPasswordId}
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              aria-required="true"
              aria-invalid={mismatchError ? 'true' : undefined}
              aria-describedby={mismatchError ? mismatchErrorId : undefined}
              className="w-full bg-background text-foreground border rounded-sm pl-2.5 pr-12"
              style={{
                height: 32,
                fontSize: 'var(--font-size-touch-input)',
                borderColor: mismatchError ? 'var(--destructive)' : 'var(--input)',
                opacity: loading ? 0.5 : 1,
                cursor: loading ? 'not-allowed' : undefined,
              }}
            />
            <RevealToggle
              shown={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
              showLabel={t('auth.password.showConfirm')}
              hideLabel={t('auth.password.hideConfirm')}
              controls={confirmPasswordId}
            />
          </div>
          {mismatchError && (
            <p
              id={mismatchErrorId}
              className="mt-1"
              // Base --destructive stays the field OUTLINE; the error TEXT is the AA-darkened red.
              style={{ fontSize: 'var(--font-size-label)', color: 'var(--status-lost-text)' }}
            >
              {mismatchError}
            </p>
          )}
        </div>

        {reauthenticationRequested && (
          <div className="mb-5">
            <p role="status" aria-live="polite" style={{ fontSize: 'var(--font-size-label)' }}>{t('profile.password.codeSent')}</p>
            <label htmlFor={verificationCodeId} className="block text-foreground font-semibold mb-1" style={{ fontSize: 'var(--font-size-label)' }}>{t('auth.password.reauth.code')}</label>
            <input id={verificationCodeId} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" aria-required="true" aria-invalid={serverError ? 'true' : undefined} aria-describedby={serverError ? serverErrorId : undefined} className="w-full bg-background text-foreground border rounded-sm px-2.5" style={{ height: 32, fontSize: 'var(--font-size-touch-input)', borderColor: serverError ? 'var(--destructive)' : 'var(--input)' }} />
          </div>
        )}

        {/* Primary submit */}
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-sm font-medium"
          style={{
            height: 32,
            fontSize: 16,
            opacity: loading ? 0.5 : 1,
            cursor: loading ? 'not-allowed' : undefined,
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

      {success && successMessage && <p role="status" aria-live="polite" aria-atomic="true" className="mt-4 text-muted-foreground" style={{ fontSize: 'var(--font-size-body)' }}>{successMessage}</p>}
      {footer?.(loading)}
    </>
  )
}
