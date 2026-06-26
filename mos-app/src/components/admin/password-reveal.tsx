// PasswordReveal — the show-once password panel (AC-011, NFR-003, design-plan §4.4).
// Shows the temp password exactly once. Esc + backdrop-dismiss intentionally disabled.
// role="alertdialog" lives on the parent container in admin-users-page.tsx and
// create-person-dialog.tsx; the headingId/warningId are passed in so the alertdialog
// element (not this inner wrapper) owns aria-labelledby/describedby (item 7 fix).
// Password is dropped from component state when onDone is called (never persisted).

import { useState, useEffect, useRef } from 'react'
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
  const [copied, setCopied] = useState(false)
  const [clipboardBlocked, setClipboardBlocked] = useState(false)
  const copyBtnRef = useRef<HTMLButtonElement>(null)

  // Move focus to Copy button on open (design-plan §4.4 + §6)
  useEffect(() => {
    requestAnimationFrame(() => {
      copyBtnRef.current?.focus()
    })
  }, [])

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
      ? `Login created for ${personName}`
      : `Password reset for ${personName}`

  return (
    <div>
      <h2 id={headingId} className="font-jakarta text-heading font-semibold">
        {heading}
      </h2>

      {/* Warning banner — "copy this now" — the most important sentence.
          aria-describedby on the parent alertdialog points here so AT announces it on open. */}
      <div
        id={warningId}
        className="my-3 flex items-start gap-2 rounded-md px-3 py-2"
        style={{
          background: 'color-mix(in srgb, var(--warning) 18%, transparent)',
          borderLeft: '3px solid var(--warning)',
          color: 'var(--warning-foreground)',
        }}
        role="status"
      >
        <span className="font-medium text-sm">
          Copy this now — you won't be able to see it again.
        </span>
      </div>

      {/* Credential block */}
      <div
        className="rounded-md p-3 space-y-3"
        style={{ background: 'var(--secondary)' }}
      >
        {email && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Sign-in name</div>
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
            Temporary password
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
          {copied ? 'Password copied to clipboard' : ''}
        </div>

        {clipboardBlocked ? (
          <p className="text-xs text-muted-foreground">
            Select and copy manually — clipboard access is unavailable.
          </p>
        ) : (
          // Native button so we can attach a ref for auto-focus on reveal open
          <button
            ref={copyBtnRef}
            type="button"
            className="btn btn-primary"
            onClick={handleCopy}
            aria-label="Copy password"
          >
            {copied ? 'Copied ✓' : 'Copy password'}
          </button>
        )}
      </div>

      {/* Done — the ONLY dismiss path (no Esc, no backdrop, design-plan §4.4) */}
      <div className="mt-4 flex justify-end">
        <Button variant="outline" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}
