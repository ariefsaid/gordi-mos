// PasswordReveal — the show-once password panel (AC-011, NFR-003, design-plan §4.4).
// Shows the temp password exactly once. Esc + backdrop-dismiss intentionally disabled.
// role="alertdialog" lives on the parent container in admin-users-page.tsx and
// create-person-dialog.tsx; the headingId/warningId are passed in so the alertdialog
// element (not this inner wrapper) owns aria-labelledby/describedby (item 7 fix).
// Password is dropped from component state when onDone is called (never persisted).

import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { Button } from '@/components/ui/button'

// Button is still used for the Done button below

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
      <h2 id={headingId} className="heading text-xl font-semibold">
        {heading}
      </h2>

      {/* Warning banner — "copy this now" — the most important sentence.
          aria-describedby on the parent alertdialog points here so AT announces it on open. */}
      <div
        id={warningId}
        className="my-3 flex items-start gap-2 rounded-md px-3 py-2"
        style={{
          background: 'color-mix(in srgb, var(--warning) 18%, transparent)',
          border: '1px solid color-mix(in srgb, var(--warning) 45%, transparent)',
          color: 'var(--warning-foreground)',
        }}
        role="status"
      >
        <span className="font-medium text-sm">
          {t('admin.reveal.warning')}
        </span>
      </div>

      {/* Credential block */}
      <div
        className="rounded-md p-3 space-y-3"
        style={{ background: 'var(--secondary)' }}
      >
        {email && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">{t('admin.create.signInName')}</div>
            <code
              className="select-text text-sm"
              style={{ fontFamily: 'var(--font-mono)', userSelect: 'text' }}
            >
              {email}
            </code>
          </div>
        )}

        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1" id="pw-label">
            {t('admin.reveal.tempPassword')}
          </div>
          <code
            aria-labelledby="pw-label"
            className="select-text text-sm tracking-widest block"
            style={{ fontFamily: 'var(--font-mono)', userSelect: 'text' }}
          >
            {password}
          </code>
        </div>

        {/* aria-live region for copy confirmation (design-plan §4.4) */}
        <div aria-live="polite" className="sr-only" role="status">
          {copied ? t('admin.reveal.copiedAnnounce') : ''}
        </div>

        {clipboardBlocked ? (
          <p className="text-xs text-muted-foreground">
            {t('admin.reveal.clipboardBlocked')}
          </p>
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
      <div className="mt-4 flex justify-end">
        <Button variant="outline" onClick={onDone}>
          {t('admin.reveal.done')}
        </Button>
      </div>
    </div>
  )
}
