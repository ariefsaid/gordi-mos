// RoleEditor — "Manage <name>" dialog (ticket #808 rewrite of the Access-level dialog).
//
// A dialog that edits one subject is titled for the subject — `Manage Bagas Barista`, never
// "Access level" (DESIGN.md § Components → Management dialogs, A-5). Sections run in the order
// the domain reads them: Teams · Position · Access · Revenue scope. Scope only when the person
// holds supervisor. Each eager-commit row prints `Saved` or `Failed · Retry` beside itself (see
// the individual pickers; the row-grammar success channel).
//
// Access section (this file): one checkbox per ASSIGNABLE_ROLES role. Checked = currently granted
// (from person.access_roles). Toggling ON → grantRole, OFF → revokeRole; onDone reloads the list.
// Self-assign guard: admin/finance/manager/supervisor disabled for the viewer's own row (FR-023,
// ADR-0050 D4 + ADR-0051). Last-admin guard: admin checkbox disabled when person is the sole
// active admin (FR-041). A save/failure marker sits beside each row.
//
// Phone (≤390): sections collapse into accordions with Teams open, everything else collapsed
// (AC-038).
//
// Interaction ownership (#201): focus trap, focus return, Esc and the scrim all belong to
// ModalShell — this component supplies content and dismissal POLICY only.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { useAuth } from '@/auth/use-auth'
import { Button } from '@/components/ui/button'
import { ModalShell } from '@/components/ui/modal-shell'
import { CloseIcon } from '@/shell/icons'
import { grantRole, revokeRole } from '@/lib/db/admin-users'
import { ASSIGNABLE_ROLES, localizedRoleMeta } from '@/lib/db/admin-users.types'
import type { AdminPersonRow, RoleOption, RevenueScopeOption, TeamOption } from '@/lib/db/admin-users.types'
import { PositionPicker } from './position-picker'
import { RevenueScopePicker } from './revenue-scope-picker'
import { TeamPicker } from './team-picker'
import { CheckboxRow, PickerError } from './checkbox-row'

// Roles protected by self-assign guard (FR-023, ADR-0050 D4 + ADR-0051)
const SELF_GUARDED_ROLES = new Set(['admin', 'finance', 'manager', 'supervisor'])

// Phone accordion threshold — DESIGN.md phone floor (§Layout → Breakpoint inventory).
const PHONE_ACCORDION_QUERY = '(max-width: 390px)'

export interface RoleEditorProps {
  person: AdminPersonRow
  /** The full people list — needed to compute last-admin guard (item 5, FR-041). */
  people?: AdminPersonRow[]
  /** Org roles (Positions) for the Position section, from listRoles() (ADR-0050). */
  roles?: RoleOption[]
  /** Live revenue-branch options for the Revenue scope section, from listRevenueScopeOptions(). */
  scopeOptions?: RevenueScopeOption[]
  /** Every live team, for the Teams section, from listTeams(). */
  teams?: TeamOption[]
  open: boolean
  onClose: () => void
  /** Called after a successful grant/revoke so the page can reload the list. */
  onDone: () => void
  /** Called with a success message after grant/revoke succeeds. */
  onShowToast?: (message: string) => void
}

/** Returns true if person is the only active admin in the list (FR-041). */
function isLastAdmin(person: AdminPersonRow, people: AdminPersonRow[]): boolean {
  const activeAdminCount = people.filter(
    (p) => p.access_roles.includes('admin') && p.login === 'active' && !p.archived_at,
  ).length
  return (
    person.access_roles.includes('admin') &&
    person.login === 'active' &&
    !person.archived_at &&
    activeAdminCount === 1
  )
}

type RowState = { kind: 'saved' } | { kind: 'failed'; retry: () => Promise<void> }

/** Read matchMedia synchronously at first render — no wrong-branch flash. */
function usePhoneAccordion(): boolean {
  const [phone, setPhone] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(PHONE_ACCORDION_QUERY).matches
      : false,
  )
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(PHONE_ACCORDION_QUERY)
    const handler = (e: MediaQueryListEvent) => setPhone(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return phone
}

type SectionKey = 'teams' | 'position' | 'access' | 'scope'

export function RoleEditor({
  person,
  people = [],
  roles = [],
  teams = [],
  scopeOptions,
  open,
  onClose,
  onDone,
  onShowToast,
}: RoleEditorProps) {
  const t = useT()
  const auth = useAuth()
  const viewerPersonId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  const isSelf = person.id === viewerPersonId
  const lastAdmin = isLastAdmin(person, people)

  const [busyRole, setBusyRole] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [accessRowStates, setAccessRowStates] = useState<Record<string, RowState>>({})
  const titleId = useId()
  const savedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const showsSupervisorScope = person.access_roles.includes('supervisor')
  const phoneMode = usePhoneAccordion()

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    teams: true,
    position: false,
    access: false,
    scope: false,
  })

  useEffect(() => {
    if (open) {
      setError('')
      setAccessRowStates({})
      setOpenSections({ teams: true, position: false, access: false, scope: false })
    }
  }, [open, person.id])

  useEffect(() => {
    const timers = savedTimersRef.current
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer)
    }
  }, [])

  const flashSaved = useCallback((rowId: string) => {
    setAccessRowStates((prev) => ({ ...prev, [rowId]: { kind: 'saved' } }))
    const existing = savedTimersRef.current[rowId]
    if (existing) clearTimeout(existing)
    savedTimersRef.current[rowId] = setTimeout(() => {
      setAccessRowStates((prev) => {
        if (prev[rowId]?.kind !== 'saved') return prev
        const next = { ...prev }
        delete next[rowId]
        return next
      })
    }, 1800)
  }, [])

  const runAccess = useCallback(
    async (role: string) => {
      const isGranted = person.access_roles.includes(role)
      setBusyRole(role)
      setError('')
      setAccessRowStates((prev) => {
        if (!prev[role]) return prev
        const next = { ...prev }
        delete next[role]
        return next
      })
      const work = async () => {
        const roleName = localizedRoleMeta(role, t).label
        if (isGranted) {
          await revokeRole(person.id, role)
          onShowToast?.(t('admin.roles.removedToast', { role: roleName, name: person.full_name }))
        } else {
          await grantRole(person.id, role)
          onShowToast?.(t('admin.roles.grantedToast', { role: roleName, name: person.full_name }))
        }
      }
      try {
        await work()
        onDone()
        flashSaved(role)
      } catch (err) {
        setError(err instanceof Error ? err.message : t('admin.roles.error'))
        setAccessRowStates((prev) => ({
          ...prev,
          [role]: { kind: 'failed', retry: () => runAccess(role) },
        }))
      } finally {
        setBusyRole(null)
      }
    },
    [person, onDone, onShowToast, t, flashSaved],
  )

  if (!open) return null

  function handleToggle(role: string) {
    void runAccess(role)
  }

  function toggleSection(key: SectionKey) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Access section body — kept inline so its `Saved`/`Failed · Retry` marker rides beside each row.
  const accessBody = (
    <div className="access-picker">
      <h3 className="mb-1 text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
        {t('admin.manage.section.access')}
      </h3>
      <fieldset disabled={busyRole !== null}>
        <legend className="sr-only">
          {t('admin.roles.legend', { name: person.full_name })}
        </legend>
        <div
          className="overflow-hidden rounded-md"
          style={{ border: '1px solid var(--input)' }}
        >
          {(ASSIGNABLE_ROLES as readonly string[]).map((role, i) => {
            const isGranted = person.access_roles.includes(role)
            const isSelfGuarded = isSelf && SELF_GUARDED_ROLES.has(role)
            const isLastAdminGuarded = role === 'admin' && lastAdmin
            const isDisabled = isSelfGuarded || isLastAdminGuarded || busyRole !== null
            const meta = localizedRoleMeta(role, t)

            const disabledReason = isSelfGuarded
              ? t('admin.roles.selfGuard')
              : isLastAdminGuarded
                ? t('admin.people.lastAdmin')
                : undefined

            const description = (isSelfGuarded || isLastAdminGuarded)
              ? isLastAdminGuarded
                ? t('admin.roles.lastAdminHint')
                : t('admin.roles.selfGuardShort')
              : meta.description

            const rowState = accessRowStates[role]

            return (
              <div
                key={role}
                className="flex items-start gap-2 pr-3"
                style={i > 0 ? { borderTop: '1px solid var(--input)' } : undefined}
              >
                <span className="min-w-0 flex-1">
                  <CheckboxRow
                    label={meta.label}
                    checked={isGranted}
                    disabled={isDisabled}
                    description={description}
                    title={isDisabled ? disabledReason : undefined}
                    onToggle={() => handleToggle(role)}
                  />
                </span>
                <RowSaveMarker
                  state={rowState}
                  savedLabel={t('admin.manage.rowSaved')}
                  failedLabel={t('admin.manage.rowFailed')}
                />
              </div>
            )
          })}
        </div>
        <PickerError message={error} />
      </fieldset>
    </div>
  )

  const sections: { key: SectionKey; label: string; body: React.ReactNode }[] = [
    {
      key: 'teams',
      label: t('admin.manage.section.teams'),
      body: (
        <TeamPicker
          person={person}
          teams={teams}
          onDone={onDone}
          onShowToast={onShowToast}
          heading={t('admin.manage.section.teams')}
        />
      ),
    },
    {
      key: 'position',
      label: t('admin.manage.section.position'),
      body: <PositionPicker person={person} roles={roles} onDone={onDone} onShowToast={onShowToast} />,
    },
    { key: 'access', label: t('admin.manage.section.access'), body: accessBody },
  ]
  if (showsSupervisorScope) {
    sections.push({
      key: 'scope',
      label: t('admin.manage.section.revenueScope'),
      body: (
        <RevenueScopePicker
          person={person}
          options={scopeOptions ?? []}
          onDone={onDone}
          onShowToast={onShowToast}
        />
      ),
    })
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      closeOnBackdrop={busyRole === null}
      closeOnEscape={busyRole === null}
    >
      <div className="role-editor-panel">
        {/* Header — Manage <name>, subject-titled per A-5 */}
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-6 pb-4">
          <div>
            <h2
              id={titleId}
              className="subheading text-lg font-semibold"
              style={{ color: 'var(--foreground)' }}
            >
              {t('admin.manage.title', { name: person.full_name })}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t('admin.roles.dismissAria')}
            className="-mr-1 -mt-1 rounded-sm p-1 hover:bg-accent/60"
            style={{ color: 'var(--muted-foreground)' }}
            onClick={onClose}
            disabled={busyRole !== null}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="shrink-0" style={{ borderTop: '1px solid var(--border)' }} />

        {/* Scrollable body — sections run Teams · Position · Access · Revenue scope. */}
        <div
          data-testid="role-editor-scroll-body"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {sections.map((section, i) => {
            const isOpen = phoneMode ? openSections[section.key] : true
            return (
              <section
                key={section.key}
                data-section={section.key}
                data-open={isOpen ? 'true' : 'false'}
                style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}
              >
                {phoneMode ? (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-6 py-4 text-left"
                    aria-expanded={isOpen}
                    aria-controls={`section-body-${section.key}`}
                    onClick={() => toggleSection(section.key)}
                  >
                    <span
                      className="text-sm font-semibold"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {section.label}
                    </span>
                    <span
                      aria-hidden="true"
                      style={{
                        color: 'var(--muted-foreground)',
                        transform: isOpen ? 'rotate(180deg)' : undefined,
                        transition: 'transform 120ms',
                        display: 'inline-flex',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </button>
                ) : null}
                <div
                  id={`section-body-${section.key}`}
                  className={phoneMode ? 'px-6 pb-5' : 'px-6 pt-5 pb-5'}
                  hidden={phoneMode ? !isOpen : false}
                >
                  {section.body}
                </div>
              </section>
            )
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0" style={{ borderTop: '1px solid var(--border)' }} />
        <div className="flex shrink-0 justify-end px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={busyRole !== null}>
            {t('admin.roles.close')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}

interface RowSaveMarkerProps {
  state: RowState | undefined
  savedLabel: string
  failedLabel: string
}

function RowSaveMarker({ state, savedLabel, failedLabel }: RowSaveMarkerProps) {
  if (!state) return null
  if (state.kind === 'saved') {
    return (
      <span
        role="status"
        aria-live="polite"
        className="mt-2 flex-none text-xs font-medium"
        style={{ color: 'var(--success)' }}
      >
        ✓ {savedLabel}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        void state.retry()
      }}
      className="mt-2 flex-none rounded-sm px-2 text-xs font-medium hover:underline focus-visible:underline"
      style={{ color: 'var(--destructive)' }}
    >
      {failedLabel}
    </button>
  )
}
