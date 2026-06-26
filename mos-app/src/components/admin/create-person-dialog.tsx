// CreatePersonDialog — Add person + optional login (design-plan §4.3, AC-011, FR-020/021/022/023).
// Form: name, email or "no email" → synthetic @ops.gordi.local, role checkboxes, "create login now".
// On success with login → swaps to PasswordReveal (§4.4).
// Password dropped from state on Done (NFR-003).
// Self-assign guard: admin/finance are never actor==target at create time (new person
// is always a different person from the actor). isSelfAssignBlocked = false always here.
//
// Rework items:
//   item 4: focus trap (useFocusTrap), focus returns on close
//   item 6: onShowToast prop — success toast after no-login create
//   item 11: dead useAuth() removed; isDisabled simplified to isSubmitting
//   item 13: heading uses .heading CSS class instead of fontSize: '20px'

import { useState, useEffect, useId, useRef } from 'react'
import { TextInput } from '@/components/ui/text-input'
import { Checkbox } from '@/components/ui/checkbox'
import { Toggle } from '@/components/ui/toggle'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/state-kit'
import { PasswordReveal } from './password-reveal'
import { synthesizeEmail, createPerson, createLogin } from '@/lib/db/admin-users'
import { ASSIGNABLE_ROLES, ROLE_META } from '@/lib/db/admin-users.types'

export interface CreatePersonDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
  /** The currently taken emails (for uniqueness suffix, AC-011/FR-021). */
  takenEmails?: Set<string>
  /** Called with a success message after the action completes (item 6). */
  onShowToast?: (message: string) => void
}

type Phase = 'form' | 'submitting' | 'reveal'

// IDs for the alertdialog in reveal phase
const REVEAL_HEADING_ID = 'create-dialog-reveal-heading'
const REVEAL_WARNING_ID = 'create-dialog-reveal-warning'

export function CreatePersonDialog({
  open,
  onClose,
  onCreated,
  takenEmails,
  onShowToast,
}: CreatePersonDialogProps) {
  const [phase, setPhase] = useState<Phase>('form')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [noEmail, setNoEmail] = useState(false)
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())
  const [createLoginNow, setCreateLoginNow] = useState(false)
  const [nameError, setNameError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [revealData, setRevealData] = useState<{
    password: string
    personName: string
    email: string | null
  } | null>(null)

  const nameId = useId()
  const emailId = useId()
  const titleId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const invokerRef = useRef<HTMLElement | null>(null)

  // Derived synthetic email
  const syntheticEmail =
    noEmail && fullName.trim() ? synthesizeEmail(fullName.trim(), takenEmails) : null

  // Capture invoker + return focus on close
  useEffect(() => {
    if (open) {
      invokerRef.current = document.activeElement as HTMLElement | null
    } else {
      invokerRef.current?.focus?.()
    }
  }, [open])

  // Move focus into dialog on open; Tab trap + Esc on close (non-reveal phase only)
  useEffect(() => {
    if (!open || phase === 'reveal') return
    const container = containerRef.current
    if (!container) return

    requestAnimationFrame(() => {
      const first = container.querySelector<HTMLElement>(
        'input:not([disabled]), button:not([disabled])',
      )
      first?.focus()
    })

    const FOCUSABLE =
      'button:not([disabled]):not([aria-disabled="true"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && phase !== 'submitting') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = Array.from(container!.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, phase, onClose])

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setPhase('form')
      setFullName('')
      setEmail('')
      setNoEmail(false)
      setSelectedRoles(new Set())
      setCreateLoginNow(false)
      setNameError('')
      setSubmitError('')
      setRevealData(null)
    }
  }, [open])

  if (!open) return null

  function toggleRole(role: string) {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) {
        next.delete(role)
      } else {
        next.add(role)
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setNameError('')
    setSubmitError('')

    if (!fullName.trim()) {
      setNameError('Enter a name')
      return
    }

    const resolvedEmail = noEmail ? syntheticEmail : email.trim() || null
    setPhase('submitting')

    try {
      const personId = await createPerson({
        full_name: fullName.trim(),
        email: resolvedEmail,
        access_roles: Array.from(selectedRoles),
      })

      if (createLoginNow) {
        const pw = await createLogin(personId)
        // Swap to reveal — do NOT close or call onCreated yet
        setRevealData({ password: pw, personName: fullName.trim(), email: resolvedEmail })
        setPhase('reveal')
      } else {
        // No login — close + notify + toast
        onCreated()
        onShowToast?.(`${fullName.trim()} added.`)
        onClose()
      }
    } catch (err) {
      setPhase('form')
      setSubmitError(
        err instanceof Error ? err.message : "Couldn't create this person. Try again.",
      )
    }
  }

  function handleRevealDone() {
    setRevealData(null) // drop password from state (NFR-003)
    onCreated()
    onClose()
  }

  const isSubmitting = phase === 'submitting'
  const isReveal = phase === 'reveal'

  return (
    // Overlay — standard confirm-overlay scrim
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'var(--scrim)' }}
      // Backdrop click intentionally disabled during reveal (design-plan §4.4)
      onClick={
        isReveal
          ? undefined
          : (e) => {
              if (e.target === e.currentTarget && !isSubmitting) onClose()
            }
      }
    >
      <div
        ref={containerRef}
        role={isReveal ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={isReveal ? REVEAL_HEADING_ID : titleId}
        aria-describedby={isReveal ? REVEAL_WARNING_ID : undefined}
        className="relative w-full max-w-md overflow-hidden rounded-lg"
        style={{
          background: 'var(--card)',
          boxShadow: 'var(--shadow-overlay)',
          border: '1px solid var(--input)',
          borderRadius: 'var(--radius)',
        }}
        // Prevent bubbling to the backdrop
        onClick={(e) => e.stopPropagation()}
      >
        {isReveal && revealData ? (
          <div className="p-6">
            <PasswordReveal
              personName={revealData.personName}
              password={revealData.password}
              email={revealData.email}
              context="create"
              onDone={handleRevealDone}
              headingId={REVEAL_HEADING_ID}
              warningId={REVEAL_WARNING_ID}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* Header — considered title + caption, hairline divider seams it to the body */}
            <div className="px-6 pt-6 pb-4">
              <h2
                id={titleId}
                className="heading text-xl font-semibold"
                style={{ color: 'var(--foreground)' }}
              >
                Add person
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                Create a directory entry, and optionally a sign-in.
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--border)' }} />

            {/* Body — consistent field rhythm */}
            <div className="flex flex-col gap-5 px-6 py-5">
              {/* Full name */}
              <div className="flex flex-col gap-1.5">
                <TextInput
                  id={nameId}
                  label="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  error={!!nameError}
                  fullWidth
                  required
                  disabled={isSubmitting}
                  aria-describedby={nameError ? `${nameId}-err` : undefined}
                />
                {nameError && (
                  <p
                    id={`${nameId}-err`}
                    className="text-xs"
                    style={{ color: 'var(--field-error-text)' }}
                    role="alert"
                  >
                    {nameError}
                  </p>
                )}
              </div>

              {/* Email + "no email" affordance */}
              <div className="flex flex-col gap-2">
                <TextInput
                  id={emailId}
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                  disabled={noEmail || isSubmitting}
                  aria-disabled={noEmail || undefined}
                />

                {/* "No email" toggle row — gets its own breathing room (no longer cramped) */}
                <label
                  className={`flex items-center gap-2.5 select-none text-sm ${
                    isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                  style={{ color: 'var(--foreground)' }}
                >
                  <Checkbox
                    checked={noEmail}
                    onChange={(v) => setNoEmail(v)}
                    disabled={isSubmitting}
                    aria-label="No email — this person has no email"
                  />
                  <span>This person has no email</span>
                </label>

                {/* Synthetic sign-in name preview — cleanly presented in a quiet fill panel */}
                {noEmail && syntheticEmail && (
                  <div
                    className="rounded-md px-3 py-2"
                    style={{ background: 'var(--secondary)' }}
                  >
                    <div
                      className="text-xs font-medium"
                      style={{ color: 'var(--muted-foreground)' }}
                    >
                      Sign-in name
                    </div>
                    <code
                      className="mt-0.5 block text-sm"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--foreground)' }}
                    >
                      {syntheticEmail}
                    </code>
                  </div>
                )}
              </div>

              {/* Access roles — neat selectable rows in a grouped, bordered container */}
              <fieldset className="flex flex-col gap-1.5">
                <legend
                  className="mb-1 text-sm font-medium"
                  style={{ color: 'var(--foreground)' }}
                >
                  Access roles
                </legend>
                <div
                  className="overflow-hidden rounded-md"
                  style={{ border: '1px solid var(--input)' }}
                >
                  {(ASSIGNABLE_ROLES as readonly string[]).map((role, i) => {
                    // At create-time the new person is never the actor — self-assign guard never
                    // fires here (design-plan §4.3: "default-safe pick: enabled"). item 11.
                    const isDisabled = isSubmitting
                    const meta = ROLE_META[role] ?? { label: role, description: '' }

                    return (
                      <label
                        key={role}
                        className={`flex items-start gap-3 px-3 py-2.5 ${
                          isDisabled
                            ? 'opacity-50 cursor-not-allowed'
                            : 'cursor-pointer hover:bg-accent/60'
                        }`}
                        style={
                          i > 0 ? { borderTop: '1px solid var(--input)' } : undefined
                        }
                      >
                        <span className="mt-0.5">
                          <Checkbox
                            checked={selectedRoles.has(role)}
                            onChange={() => !isDisabled && toggleRole(role)}
                            disabled={isDisabled}
                            aria-label={meta.label}
                          />
                        </span>
                        <span className="flex flex-col">
                          <span
                            className="text-sm font-medium leading-tight"
                            style={{ color: 'var(--foreground)' }}
                          >
                            {meta.label}
                          </span>
                          <span
                            className="text-xs leading-snug"
                            style={{ color: 'var(--muted-foreground)' }}
                          >
                            {meta.description}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              {/* Create a login now — aligned switch row + helper */}
              <div className="flex flex-col gap-1.5">
                <label
                  className={`flex items-center gap-3 select-none ${
                    isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <Toggle
                    value={createLoginNow}
                    onChange={(v) => setCreateLoginNow(v)}
                    disabled={isSubmitting}
                    aria-label="Create a login now"
                  />
                  <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    Create a login now
                  </span>
                </label>
                <p
                  className="text-xs"
                  style={{
                    color: 'var(--muted-foreground)',
                    paddingLeft: 'calc(28px + 0.75rem)',
                  }}
                >
                  {createLoginNow
                    ? 'A temporary password will be shown once after you create.'
                    : 'Off: a directory entry only — you can add a sign-in later.'}
                </p>
              </div>

              {/* Form-level error */}
              {submitError && (
                <ErrorState message="Couldn't create this person. Try again." />
              )}
            </div>

            {/* Footer — seamed below a hairline, flat utility surface */}
            <div style={{ borderTop: '1px solid var(--border)' }} />
            <div className="flex items-center justify-end gap-2 px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Create person'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
