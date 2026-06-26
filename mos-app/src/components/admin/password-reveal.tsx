// PasswordReveal — the show-once password panel (AC-011, NFR-003, design-plan §4.4).
// Shows the temp password exactly once. Esc + backdrop-dismiss intentionally disabled.
// role="alertdialog" so the warning is announced on open by AT.
// Password is dropped from component state when onDone is called (never persisted).

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export interface PasswordRevealProps {
  personName: string
  password: string
  email: string | null
  context: 'create' | 'reset'
  onDone: () => void
}

export function PasswordReveal({ personName, password, email, context, onDone }: PasswordRevealProps) {
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
      ? `Login created for ${personName}`
      : `Password reset for ${personName}`

  return (
    // The parent dialog container sets role="alertdialog". This inner wrapper just
    // provides the labelledby/describedby anchors used by the outer container.
    <div
      aria-labelledby="reveal-heading"
      aria-describedby="reveal-warning"
    >
      <h2 id="reveal-heading" className="font-jakarta text-heading font-semibold">
        {heading}
      </h2>

      {/* Warning banner — "copy this now" — the most important sentence */}
      <div
        id="reveal-warning"
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
          <Button
            variant="primary"
            autoFocus
            onClick={handleCopy}
            aria-label="Copy password"
          >
            {copied ? 'Copied ✓' : 'Copy password'}
          </Button>
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
