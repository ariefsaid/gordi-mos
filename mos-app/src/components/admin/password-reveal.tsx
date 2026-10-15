// PasswordReveal — the show-once password panel (AC-011, NFR-003, design-plan §4.4).
// Shows the temp password exactly once. Esc + backdrop-dismiss intentionally disabled.
// role="alertdialog" lives on the parent container in admin-users-page.tsx and
// create-person-dialog.tsx; the headingId/warningId are passed in so the alertdialog
// element (not this inner wrapper) owns aria-labelledby/describedby (item 7 fix).
// Password is dropped from component state when onDone is called (never persisted).

import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'

export interface PasswordRevealProps {
  personName: string
  password: string
  email: string | null
  context: 'create' | 'reset'
  onDone: () => void
  /**
   * ID for the heading element — must match the aria-labelledby on the parent alertdialog.
   * Defaults to 'reveal-heading' for backward compat (create-person-dialog).
   */
  headingId?: string
  /**
   * ID for the warning element — must match the aria-describedby on the parent alertdialog.
   * Defaults to 'reveal-warning' for backward compat.
   */
  warningId?: string
}

export function PasswordReveal({
  personName,
  password,
  email,
  context,
  onDone,
  headingId = 'reveal-heading',
  warningId = 'reveal-warning',
}: PasswordRevealProps) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const [clipboardBlocked, setClipboardBlocked] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setClipboardBlocked(true)
    }
  }

  const heading =
    context === 'create'
      ? t('admin.reveal.createdTitle', { name: personName })
      : t('admin.reveal.resetTitle', { name: personName })

  return (
    <div>
      <h2 id={headingId} className="password-reveal__title">{heading}</h2>

      {/* Warning banner — "copy this now" — the most important sentence.
          aria-describedby on the parent alertdialog points here so AT announces it on open. */}
      <Notice tone="attention" id={warningId} role="status" className="password-reveal__warning">{t('admin.reveal.warning')}</Notice>

      {/* Credential block */}
      <div className="password-reveal__credentials">
        {email && (
          <div>
            <div className="password-reveal__label">{t('admin.create.signInName')}</div>
            <code className="password-reveal__value">{email}</code>
          </div>
        )}

        <div>
          <div className="password-reveal__label" id="pw-label">{t('admin.reveal.tempPassword')}</div>
          <code aria-labelledby="pw-label" className="password-reveal__value password-reveal__value--secret">{password}</code>
        </div>

        {/* aria-live region for copy confirmation (design-plan §4.4) */}
        <div aria-live="polite" className="sr-only" role="status">
          {copied ? t('admin.reveal.copiedAnnounce') : ''}
        </div>

        {clipboardBlocked ? (
          <p className="password-reveal__blocked">{t('admin.reveal.clipboardBlocked')}</p>
        ) : (
          // Native button is the first focusable control, so ModalShell focuses it.
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCopy}
            aria-label={t('admin.reveal.copy')}
          >
            {copied ? t('admin.reveal.copied') : t('admin.reveal.copy')}
          </button>
        )}
      </div>

      {/* Done — the ONLY dismiss path (no Esc, no backdrop, design-plan §4.4) */}
      <div className="password-reveal__done">
        <Button variant="outline" onClick={onDone}>
          {t('admin.reveal.done')}
        </Button>
      </div>
    </div>
  )
}
