// AdminUsersPage — admin-only people list + actions.
// Route: /admin/people (behind AdminRoute, AC-070). Renamed from /admin/users (glossary: Person).
// Design-plan §1, §2, §4. Covers AC-060, FR-010/011/020/021/022/030/040/050/060.
// Never fetches before AdminRoute resolves (AC-070).
//
// Rework items addressed:
//   item 2: reset/disable/archive gated behind ConfirmDialog (design-plan §4.7)
//   item 6: success toasts after every action (Toast + useToast)
//   item 7: alertdialog reveal has aria-describedby on the alertdialog element itself
//   item 9: route renamed /admin/users → /admin/people

import { useState, useEffect, useCallback, useId } from 'react'
import { useAuth } from '@/auth/use-auth'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { Button } from '@/components/ui/button'
import { ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { UserTable } from '@/components/admin/user-table'
import type { PersonAction } from '@/components/admin/user-table'
import { CreatePersonDialog } from '@/components/admin/create-person-dialog'
import { PasswordReveal } from '@/components/admin/password-reveal'
import { RoleEditor } from '@/components/admin/role-editor'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { Toast } from '@/components/admin/toast'
import { useToast } from '@/components/admin/use-toast'
import {
  listAdminPeople,
  setLoginEnabled,
  resetPassword,
  archivePerson,
  restorePerson,
  createLogin,
} from '@/lib/db/admin-users'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'

type LoadState = 'loading' | 'loaded' | 'error'

type RevealContext = {
  password: string
  personName: string
  email: string | null
  context: 'create' | 'reset'
}

// Confirm state: which person + which action is pending confirmation
type PendingConfirm =
  | { type: 'reset-password'; person: AdminPersonRow }
  | { type: 'disable-login'; person: AdminPersonRow }
  | { type: 'archive'; person: AdminPersonRow }

export function AdminUsersPage() {
  const auth = useAuth()
  const viewerPersonId = auth.status === 'authenticated' ? auth.viewer.person.id : ''

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [people, setPeople] = useState<AdminPersonRow[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [reveal, setReveal] = useState<RevealContext | null>(null)
  const [roleEditorPerson, setRoleEditorPerson] = useState<AdminPersonRow | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const [actionError, setActionError] = useState('')

  const { toast, showToast, clearToast } = useToast()

  // IDs for alertdialog aria-labelledby/describedby (item 7)
  const revealHeadingId = useId()
  const revealWarningId = useId()

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const rows = await listAdminPeople()
      setPeople(rows)
      setLoadState('loaded')
    } catch {
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Collect taken emails for create-dialog uniqueness
  const takenEmails = new Set(people.map((p) => p.email).filter(Boolean) as string[])

  // Actions that need NO confirm: enable-login, restore, create-login, manage-roles
  // Actions that DO need confirm: reset-password, disable-login, archive
  async function handleAction(action: PersonAction, person: AdminPersonRow) {
    setActionError('')
    try {
      switch (action) {
        case 'reset-password':
          // Gate behind confirm (item 2)
          setPendingConfirm({ type: 'reset-password', person })
          break

        case 'disable-login':
          // Gate behind confirm (item 2)
          setPendingConfirm({ type: 'disable-login', person })
          break

        case 'archive':
          // Gate behind confirm (item 2)
          setPendingConfirm({ type: 'archive', person })
          break

        case 'enable-login':
          // No confirm — low-stakes reversible action
          await setLoginEnabled(person.id, true)
          await load()
          showToast(`${person.full_name}: login enabled.`)
          break

        case 'create-login': {
          const pw = await createLogin(person.id)
          setReveal({ password: pw, personName: person.full_name, email: person.email, context: 'create' })
          await load()
          break
        }

        case 'restore':
          // No confirm — low-stakes reversible action
          await restorePerson(person.id)
          await load()
          showToast(`${person.full_name} restored.`)
          break

        case 'manage-roles':
          // Opens the RoleEditor dialog; no async call here — the dialog owns grant/revoke.
          setRoleEditorPerson(person)
          break
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed. Try again.')
    }
  }

  // ── Confirm dialog handlers ──────────────────────────────────────────────
  async function handleConfirmResetPassword(person: AdminPersonRow) {
    const pw = await resetPassword(person.id)
    setReveal({ password: pw, personName: person.full_name, email: person.email, context: 'reset' })
    setPendingConfirm(null)
    // No toast here — the reveal panel itself is the feedback
    await load()
  }

  async function handleConfirmDisable(person: AdminPersonRow) {
    await setLoginEnabled(person.id, false)
    setPendingConfirm(null)
    await load()
    showToast(`${person.full_name}: login disabled.`)
  }

  async function handleConfirmArchive(person: AdminPersonRow) {
    await archivePerson(person.id)
    setPendingConfirm(null)
    await load()
    showToast(`${person.full_name} archived.`)
  }

  function handleRevealDone() {
    setReveal(null)
  }

  function handlePersonCreated() {
    void load()
  }

  return (
    <PageFrame variant="data">
      <div className="flex items-start justify-between mb-4">
        <PageHead
          title="People"
          subtitle="Manage who can sign in and what they can do."
        />
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          + Add person
        </Button>
      </div>

      {/* Action error (inline, non-fatal) */}
      {actionError && (
        <div className="px-6 pt-2">
          <ErrorState
            message={actionError}
            onRetry={() => setActionError('')}
            retryLabel="Dismiss"
          />
        </div>
      )}

      <div
        className="mx-6 mb-6 rounded-lg overflow-hidden"
        style={{
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-rest)',
          background: 'var(--card)',
        }}
      >
        {loadState === 'loading' && (
          <>
            {/* Table header still renders during load */}
            <div
              style={{
                borderBottom: '1px solid var(--border)',
                height: 38,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 16,
              }}
            >
              <span
                className="text-xs font-semibold uppercase"
                style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}
              >
                Person
              </span>
            </div>
            <SkeletonRows count={6} />
          </>
        )}

        {loadState === 'error' && (
          <div className="py-12 px-4">
            <ErrorState
              message="Couldn't load people. Try again."
              onRetry={load}
            />
          </div>
        )}

        {loadState === 'loaded' && (
          <UserTable
            people={people}
            viewerPersonId={viewerPersonId}
            onAction={handleAction}
            onAddPerson={() => setAddOpen(true)}
          />
        )}
      </div>

      {/* Create person dialog */}
      <CreatePersonDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handlePersonCreated}
        takenEmails={takenEmails}
        onShowToast={showToast}
      />

      {/* Role editor dialog (FR-050) */}
      {roleEditorPerson && (
        <RoleEditor
          person={roleEditorPerson}
          people={people}
          open
          onClose={() => setRoleEditorPerson(null)}
          onDone={() => {
            void load()
          }}
          onShowToast={showToast}
        />
      )}

      {/* Confirm dialogs (item 2) — reset password, disable login, archive */}
      {pendingConfirm?.type === 'reset-password' && (
        <ConfirmDialog
          open
          title={`Reset password for ${pendingConfirm.person.full_name}?`}
          body="Their current password will stop working. A new temporary password will be shown once."
          confirmLabel="Reset password"
          tone="primary"
          onConfirm={() => handleConfirmResetPassword(pendingConfirm.person)}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {pendingConfirm?.type === 'disable-login' && (
        <ConfirmDialog
          open
          title={`Disable sign-in for ${pendingConfirm.person.full_name}?`}
          body="They won't be able to log in until you enable it again. Nothing is deleted."
          confirmLabel="Disable"
          tone="primary"
          onConfirm={() => handleConfirmDisable(pendingConfirm.person)}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {pendingConfirm?.type === 'archive' && (
        <ConfirmDialog
          open
          title={`Archive ${pendingConfirm.person.full_name}?`}
          body="They drop out of the directory and lose access, but nothing is deleted."
          confirmLabel="Archive"
          tone="destructive"
          onConfirm={() => handleConfirmArchive(pendingConfirm.person)}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {/* Password reveal — for reset-password + create-login actions.
          The alertdialog element owns aria-labelledby/describedby (item 7 fix):
          previously these were only on the inner wrapper div, not the alertdialog element. */}
      {reveal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'var(--scrim)' }}
          // No backdrop dismiss on reveal — intentional (design-plan §4.4)
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={revealHeadingId}
            aria-describedby={revealWarningId}
            className="relative w-full max-w-md rounded-lg p-6"
            style={{
              background: 'var(--card)',
              boxShadow: 'var(--shadow-overlay)',
            }}
          >
            <PasswordReveal
              personName={reveal.personName}
              password={reveal.password}
              email={reveal.email}
              context={reveal.context}
              onDone={handleRevealDone}
              headingId={revealHeadingId}
              warningId={revealWarningId}
            />
          </div>
        </div>
      )}

      {/* Success toast (item 6) */}
      <Toast toast={toast} onDismiss={clearToast} />
    </PageFrame>
  )
}
