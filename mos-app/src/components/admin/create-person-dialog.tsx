// CreatePersonDialog — Add person + optional login (ticket #808 rewrite).
// Field order: Full name · Email (+ no-email → Sign-in name) · Team (required Select of live Teams)
// · Position (multi, optional) · Access (chip row; Member pre-selected) · Create login toggle.
// Rules:
//   - Team is required; submit without it shows the field error and calls nothing.
//   - Access chip row pre-selects Member.
//   - Login toggle is ON by default whenever there is an email OR a synthetic sign-in name;
//     OFF and disabled with a reason when there is neither.
//   - Submit → the person-create RPC once (name, email/synthetic, team_id, position_ids,
//     access_role), then createLogin only when the toggle is ON, then the temp-password reveal.
//
// Password dropped from state on Done (NFR-003).

import { useState, useEffect, useId, useMemo } from 'react'
import { useT } from '@/i18n/use-t'
import { TextInput } from '@/components/ui/text-input'
import { Checkbox } from '@/components/ui/checkbox'
import { Toggle } from '@/components/ui/toggle'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ErrorState } from '@/components/ui/state-kit'
import { ModalShell } from '@/components/ui/modal-shell'
import { PasswordReveal } from './password-reveal'
import { synthesizeEmail, createPerson, createLogin } from '@/lib/db/admin-users'
import { ASSIGNABLE_ROLES, localizedRoleMeta, isStreamTeam } from '@/lib/db/admin-users.types'
import type { RoleOption, TeamOption } from '@/lib/db/admin-users.types'

export interface CreatePersonDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
  /** The currently taken emails (for uniqueness suffix, AC-011/FR-021). */
  takenEmails?: Set<string>
  /** Live Teams (required by the RPC; #808) — a person is created WITH a team or not at all. */
  teams?: TeamOption[]
  /** Live org positions (Jabatan) — optional multi-select at create time. */
  roles?: RoleOption[]
  /** Called with a success message after the action completes. */
  onShowToast?: (message: string) => void
}

type Phase = 'form' | 'submitting' | 'reveal'

const REVEAL_HEADING_ID = 'create-dialog-reveal-heading'
const REVEAL_WARNING_ID = 'create-dialog-reveal-warning'

// The Access chip row — one chip per assignable role, Member pre-selected. Only one role picked
// at create time; #808 explicitly asks for a chip row with Member pre-selected. Additional roles
// are granted afterwards via Manage <name> → Access (multi-checkbox).
type AccessRole = (typeof ASSIGNABLE_ROLES)[number]

export function CreatePersonDialog({
  open,
  onClose,
  onCreated,
  takenEmails,
  teams = [],
  roles = [],
  onShowToast,
}: CreatePersonDialogProps) {
  const t = useT()
  const [phase, setPhase] = useState<Phase>('form')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [noEmail, setNoEmail] = useState(false)
  const [teamId, setTeamId] = useState<string>('')
  const [positionIds, setPositionIds] = useState<Set<string>>(new Set())
  const [accessRole, setAccessRole] = useState<AccessRole>('member')
  const [createLoginNow, setCreateLoginNow] = useState(true)
  const [userTouchedToggle, setUserTouchedToggle] = useState(false)
  const [nameError, setNameError] = useState('')
  const [teamError, setTeamError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [revealData, setRevealData] = useState<{
    password: string
    personName: string
    email: string | null
  } | null>(null)

  const nameId = useId()
  const emailId = useId()
  const teamFieldId = useId()
  const titleId = useId()

  const syntheticEmail =
    noEmail && fullName.trim() ? synthesizeEmail(fullName.trim(), takenEmails) : null

  // Whether the person will have any sign-in address at all — a real email typed or a synthetic
  // one derived from the "no email" path. Drives the login toggle's default and its disabled state.
  const hasSignInAddress = noEmail ? syntheticEmail !== null : email.trim() !== ''
  const loginToggleDisabled = !hasSignInAddress

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setPhase('form')
      setFullName('')
      setEmail('')
      setNoEmail(false)
      setTeamId('')
      setPositionIds(new Set())
      setAccessRole('member')
      setCreateLoginNow(true)
      setUserTouchedToggle(false)
      setNameError('')
      setTeamError('')
      setSubmitError('')
      setRevealData(null)
    }
  }, [open])

  // Login-toggle default rule: ON by default when there is an address; OFF (and disabled) when
  // there isn't. The user's own explicit toggle wins after they've touched it, so a viewer who
  // deliberately turned it OFF for a person with an email isn't second-guessed by a later
  // character they type into the name field.
  useEffect(() => {
    if (userTouchedToggle) {
      if (!hasSignInAddress && createLoginNow) setCreateLoginNow(false)
      return
    }
    setCreateLoginNow(hasSignInAddress)
  }, [hasSignInAddress, userTouchedToggle, createLoginNow])

  const roleOptions = useMemo(() => roles, [roles])

  if (!open) return null

  function togglePosition(roleId: string) {
    setPositionIds((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) next.delete(roleId)
      else next.add(roleId)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setNameError('')
    setTeamError('')
    setSubmitError('')

    let hasError = false
    if (!fullName.trim()) {
      setNameError(t('admin.create.nameError'))
      hasError = true
    }
    if (!teamId) {
      setTeamError(t('admin.create.teamError'))
      hasError = true
    }
    if (hasError) return

    const resolvedEmail = noEmail ? syntheticEmail : email.trim() || null
    setPhase('submitting')

    let personId: string
    try {
      personId = await createPerson({
        full_name: fullName.trim(),
        email: resolvedEmail,
        team_id: teamId,
        position_ids: Array.from(positionIds),
        access_role: accessRole,
      })
    } catch (err) {
      setPhase('form')
      setSubmitError(
        err instanceof Error ? err.message : t('admin.create.error'),
      )
      return
    }

    if (!createLoginNow) {
      onCreated()
      onShowToast?.(t('admin.create.addedToast', { name: fullName.trim() }))
      onClose()
      return
    }

    try {
      const pw = await createLogin(personId)
      setRevealData({ password: pw, personName: fullName.trim(), email: resolvedEmail })
      setPhase('reveal')
    } catch {
      onCreated()
      onShowToast?.(t('admin.create.loginFailedToast', { name: fullName.trim() }))
      onClose()
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
    <ModalShell
      open={open}
      onClose={onClose}
      role={isReveal ? 'alertdialog' : 'dialog'}
      ariaLabelledBy={isReveal ? REVEAL_HEADING_ID : titleId}
      ariaDescribedBy={isReveal ? REVEAL_WARNING_ID : undefined}
      closeOnBackdrop={!isSubmitting && !isReveal}
      closeOnEscape={!isSubmitting && !isReveal}
      phoneMode="centered"
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
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <h2
                id={titleId}
                className="heading text-xl font-semibold"
                style={{ color: 'var(--foreground)' }}
              >
                {t('admin.create.title')}
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {t('admin.create.subtitle')}
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--border)' }} />

            {/* Body — field order fixed by AC-035: Full name · Email · Team · Position · Access · Login */}
            <div className="flex flex-col gap-5 px-6 py-5">
              {/* 1. Full name */}
              <div className="flex flex-col gap-1.5">
                <TextInput
                  id={nameId}
                  label={t('admin.create.fullName')}
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

              {/* 2. Email + "no email" affordance → Sign-in name */}
              <div className="flex flex-col gap-2">
                <TextInput
                  id={emailId}
                  label={t('admin.create.email')}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                  disabled={noEmail || isSubmitting}
                  aria-disabled={noEmail || undefined}
                />

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
                    aria-label={t('admin.create.noEmailAria')}
                  />
                  <span>{t('admin.create.noEmail')}</span>
                </label>

                {noEmail && syntheticEmail && (
                  <div
                    className="rounded-md px-3 py-2"
                    style={{ background: 'var(--secondary)' }}
                  >
                    <div
                      className="text-xs font-medium"
                      style={{ color: 'var(--muted-foreground)' }}
                    >
                      {t('admin.create.signInName')}
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

              {/* 3. Team (required Select of live Teams) */}
              <div className="flex flex-col gap-1.5">
                <Select
                  id={teamFieldId}
                  label={t('admin.create.team')}
                  value={teamId}
                  onChange={(e) => {
                    setTeamId(e.target.value)
                    if (e.target.value) setTeamError('')
                  }}
                  error={!!teamError}
                  fullWidth
                  disabled={isSubmitting}
                  aria-describedby={teamError ? `${teamFieldId}-err` : undefined}
                  aria-required="true"
                >
                  <option value="">{t('admin.create.teamPlaceholder')}</option>
                  {teams.map((team) => {
                    const stream = isStreamTeam(team)
                      ? ` · ${team.branch_name} ${team.activity!.charAt(0).toUpperCase()}${team.activity!.slice(1)}`
                      : ''
                    return (
                      <option key={team.id} value={team.id}>
                        {team.name}{stream}
                      </option>
                    )
                  })}
                </Select>
                {teamError && (
                  <p
                    id={`${teamFieldId}-err`}
                    className="text-xs"
                    style={{ color: 'var(--field-error-text)' }}
                    role="alert"
                  >
                    {teamError}
                  </p>
                )}
              </div>

              {/* 4. Position (multi, optional) */}
              <fieldset className="flex flex-col gap-1.5">
                <legend
                  className="mb-1 text-sm font-medium"
                  style={{ color: 'var(--foreground)' }}
                >
                  {t('admin.create.position')}
                  <span
                    className="ml-2 text-xs font-normal"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    {t('admin.create.positionHelp')}
                  </span>
                </legend>
                {roleOptions.length === 0 ? (
                  <p
                    className="text-sm"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    {t('admin.create.noPositions')}
                  </p>
                ) : (
                  <div
                    className="overflow-hidden rounded-md"
                    style={{ border: '1px solid var(--input)' }}
                  >
                    {roleOptions.map((role, i) => (
                      <label
                        key={role.id}
                        className={`flex items-center gap-3 px-3 py-2.5 ${
                          isSubmitting
                            ? 'opacity-50 cursor-not-allowed'
                            : 'cursor-pointer hover:bg-accent/60'
                        }`}
                        style={i > 0 ? { borderTop: '1px solid var(--input)' } : undefined}
                      >
                        <Checkbox
                          checked={positionIds.has(role.id)}
                          onChange={() => !isSubmitting && togglePosition(role.id)}
                          disabled={isSubmitting}
                          aria-label={role.name}
                        />
                        <span
                          className="text-sm font-medium"
                          style={{ color: 'var(--foreground)' }}
                        >
                          {role.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              {/* 5. Access — chip row, Member pre-selected. Radio semantics, chip appearance. */}
              <fieldset className="flex flex-col gap-1.5">
                <legend
                  className="mb-1 text-sm font-medium"
                  style={{ color: 'var(--foreground)' }}
                >
                  {t('admin.create.access')}
                </legend>
                <div
                  role="radiogroup"
                  aria-label={t('admin.create.access')}
                  className="flex flex-wrap gap-2"
                >
                  {(ASSIGNABLE_ROLES as readonly string[]).map((role) => {
                    const meta = localizedRoleMeta(role, t)
                    const active = accessRole === role
                    return (
                      <button
                        key={role}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={isSubmitting}
                        onClick={() => setAccessRole(role as AccessRole)}
                        className="rounded-full px-3 py-1 text-sm font-medium transition"
                        style={{
                          border: '1px solid var(--input)',
                          background: active
                            ? 'color-mix(in srgb, var(--primary) 12%, var(--card))'
                            : 'var(--card)',
                          color: active ? 'var(--primary)' : 'var(--foreground)',
                          borderColor: active ? 'var(--primary)' : 'var(--input)',
                          opacity: isSubmitting ? 0.5 : 1,
                          cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {meta.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {/* 6. Create login now — ON by default when there's an address; OFF+disabled when not */}
              <div className="flex flex-col gap-1.5">
                <label
                  className={`flex items-center gap-3 select-none ${
                    isSubmitting || loginToggleDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <Toggle
                    value={createLoginNow}
                    onChange={(v) => {
                      setUserTouchedToggle(true)
                      setCreateLoginNow(v)
                    }}
                    disabled={isSubmitting || loginToggleDisabled}
                    aria-label={t('admin.create.createLoginNow')}
                  />
                  <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    {t('admin.create.createLoginNow')}
                  </span>
                </label>
                <p
                  className="text-xs"
                  style={{
                    color: 'var(--muted-foreground)',
                    paddingLeft: 'calc(28px + 0.75rem)',
                  }}
                >
                  {loginToggleDisabled
                    ? t('admin.create.loginDisabledReason')
                    : createLoginNow
                      ? t('admin.create.loginHelpOn')
                      : t('admin.create.loginHelpOff')}
                </p>
              </div>

              {submitError && (
                <ErrorState message={t('admin.create.error')} />
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)' }} />
            <div className="flex items-center justify-end gap-2 px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={isSubmitting}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? t('admin.create.creating') : t('admin.create.submit')}
              </Button>
            </div>
        </form>
      )}
    </ModalShell>
  )
}
