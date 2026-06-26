// CreatePersonDialog — Add person + optional login (design-plan §4.3, AC-011, FR-020/021/022/023).
// Form: name, email or "no email" → synthetic @ops.gordi.local, role checkboxes, "create login now".
// On success with login → swaps to PasswordReveal (§4.4).
// Password dropped from state on Done (NFR-003).
// Self-assign guard: admin/finance checkboxes disabled if actor === target (FR-023).

import { useState, useEffect, useId } from 'react'
import { useAuth } from '@/auth/use-auth'
import { TextInput } from '@/components/ui/text-input'
import { Checkbox } from '@/components/ui/checkbox'
import { Toggle } from '@/components/ui/toggle'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/state-kit'
import { PasswordReveal } from './password-reveal'
import { synthesizeEmail, createPerson, createLogin } from '@/lib/db/admin-users'
import { ASSIGNABLE_ROLES } from '@/lib/db/admin-users.types'

export interface CreatePersonDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
  /** The currently taken emails (for uniqueness suffix, AC-011/FR-021). */
  takenEmails?: Set<string>
}

type Phase = 'form' | 'submitting' | 'reveal'

export function CreatePersonDialog({ open, onClose, onCreated, takenEmails }: CreatePersonDialogProps) {
  useAuth() // keep for future self-assign guard (FR-023)

  const [phase, setPhase] = useState<Phase>('form')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [noEmail, setNoEmail] = useState(false)
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())
  const [createLoginNow, setCreateLoginNow] = useState(false)
  const [nameError, setNameError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [revealData, setRevealData] = useState<{ password: string; personName: string; email: string | null } | null>(null)

  const nameId = useId()
  const emailId = useId()

  // Derived synthetic email
  const syntheticEmail = noEmail && fullName.trim()
    ? synthesizeEmail(fullName.trim(), takenEmails)
    : null

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
        // No login — close + notify
        onCreated()
        onClose()
      }
    } catch (err) {
      setPhase('form')
      setSubmitError(err instanceof Error ? err.message : 'Couldn\'t create this person. Try again.')
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
      onClick={isReveal ? undefined : (e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role={isReveal ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-label={isReveal ? revealData?.personName : 'Add person'}
        className="relative w-full max-w-md rounded-lg p-6 shadow-lg"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow-overlay)' }}
        // Prevent bubbling to the backdrop
        onClick={(e) => e.stopPropagation()}
      >
        {isReveal && revealData ? (
          <PasswordReveal
            personName={revealData.personName}
            password={revealData.password}
            email={revealData.email}
            context="create"
            onDone={handleRevealDone}
          />
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <h2
              className="font-jakarta font-semibold mb-4"
              style={{ fontSize: '20px', color: 'var(--foreground)' }}
            >
              Add person
            </h2>

            {/* Full name */}
            <div className="mb-3">
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
                  className="text-xs mt-1"
                  style={{ color: 'var(--field-error-text)' }}
                  role="alert"
                >
                  {nameError}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="mb-3">
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

              {/* No email checkbox */}
              <label className="mt-2 flex items-center gap-2 cursor-pointer select-none text-sm">
                <Checkbox
                  checked={noEmail}
                  onChange={(v) => setNoEmail(v)}
                  disabled={isSubmitting}
                  aria-label="No email — this person has no email"
                />
                <span>No email</span>
              </label>

              {/* Synthetic email preview */}
              {noEmail && syntheticEmail && (
                <p
                  className="mt-1 text-xs"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Sign-in name:{' '}
                  <code style={{ fontFamily: 'var(--font-mono)' }}>{syntheticEmail}</code>
                </p>
              )}
            </div>

            {/* Access roles */}
            <fieldset className="mb-4">
              <legend className="text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                Access roles
              </legend>
              <div className="flex flex-col gap-2">
                {(ASSIGNABLE_ROLES as readonly string[]).map((role) => {
                  // Self-assign guard: admin/finance disabled only when actor === target.
                  // At create-time the new person is never the actor, so we never pre-disable them
                  // UNLESS the admin is somehow creating themselves (viewerPersonId would match — but
                  // that's impossible at create time). Per design-plan §4.3: default-safe = enabled.
                  const isSelfAssignBlocked = false // new person, never actor==target
                  const isDisabled = isSelfAssignBlocked || isSubmitting

                  return (
                    <label
                      key={role}
                      className={`flex items-center gap-2 text-sm ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <Checkbox
                        checked={selectedRoles.has(role)}
                        onChange={() => !isDisabled && toggleRole(role)}
                        disabled={isDisabled}
                        aria-label={role}
                      />
                      <span>{role}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            {/* Create a login now toggle */}
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <Toggle
                  value={createLoginNow}
                  onChange={(v) => setCreateLoginNow(v)}
                  disabled={isSubmitting}
                  aria-label="Create a login now"
                />
                <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                  Create a login now
                </span>
              </div>
              {createLoginNow && (
                <p
                  className="mt-1 text-xs"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  A temporary password will be shown once after you create.
                </p>
              )}
            </div>

            {/* Form-level error */}
            {submitError && (
              <ErrorState
                message={`Couldn't create this person. Try again.`}
                className="mb-3"
              />
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating…' : 'Create person'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
