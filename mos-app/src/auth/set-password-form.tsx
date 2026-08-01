import { useState, useId, type ReactNode } from 'react'
import { Spinner } from './auth-shell'

const ERR_MISMATCH = "Passwords don't match."

interface Props {
  title: string
  subtitle: string
  /**
   * Perform the password change. Return a message to show the user, or null/void on success.
   * Returning a message leaves the form mounted and the fields intact so they can retry.
   * A thrown Error's message is surfaced too — see handleSubmit.
   */
  onSubmit: (password: string) => Promise<string | null | void>
  /** Rendered under the submit button — e.g. the sign-out escape hatch on the #131 gate. */
  footer?: (busy: boolean) => ReactNode
}

/**
 * The set-password form: new + confirm, mismatch check, server-error slot, submit.
 *
 * Shared by the recovery-link flow (RecoveryPage) and the #131 must-change-password gate
 * (SetPasswordScreen) so the a11y wiring, `new-password` autocomplete, and weak-password
 * surfacing have exactly one home.
 */
export function SetPasswordForm({ title, subtitle, onSubmit, footer }: Props) {
  const newPasswordId = useId()
  const confirmPasswordId = useId()
  const mismatchErrorId = useId()
  const serverErrorId = useId()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mismatchError, setMismatchError] = useState('')
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMismatchError('')
    setServerError('')

    if (newPassword !== confirmPassword) {
      setMismatchError(ERR_MISMATCH)
      return
    }

    setLoading(true)
    try {
      const message = await onSubmit(newPassword)
      if (message) {
        setServerError(message)
        setLoading(false)
      }
      // On success the caller navigates or reloads, so stay in the busy state rather than
      // flashing an enabled button at a screen that is about to be torn down (and rather than
      // setting state on an unmounted component).
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
      <h1
        className="text-foreground font-semibold"
        style={{ fontSize: 20, lineHeight: 1.3, marginBottom: 4 }}
      >
        {title}
      </h1>
      <p className="text-muted-foreground mb-5" style={{ fontSize: 16 }}>
        {subtitle}
      </p>

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
            fontSize: 15,
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
            disabled={loading}
            aria-describedby={serverError ? serverErrorId : undefined}
            className="w-full bg-background text-foreground border border-input rounded-sm px-2.5"
            style={{
              height: 32,
              fontSize: 16,
              opacity: loading ? 0.5 : 1,
              cursor: loading ? 'not-allowed' : undefined,
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
            disabled={loading}
            aria-invalid={mismatchError ? 'true' : undefined}
            aria-describedby={mismatchError ? mismatchErrorId : undefined}
            className="w-full bg-background text-foreground border rounded-sm px-2.5"
            style={{
              height: 32,
              fontSize: 16,
              borderColor: mismatchError ? 'var(--destructive)' : 'var(--input)',
              opacity: loading ? 0.5 : 1,
              cursor: loading ? 'not-allowed' : undefined,
            }}
          />
          {mismatchError && (
            <p
              id={mismatchErrorId}
              className="mt-1"
              // Base --destructive stays the field OUTLINE; the error TEXT is the AA-darkened red.
              style={{ fontSize: 12, color: 'var(--status-lost-text)' }}
            >
              {mismatchError}
            </p>
          )}
        </div>

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

      {footer?.(loading)}
    </>
  )
}
