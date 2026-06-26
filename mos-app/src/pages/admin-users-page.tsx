// AdminUsersPage — admin-only people list + actions.
// Route: /admin/users (behind AdminRoute, AC-070).
// Design-plan §1, §2, §4. Covers AC-060, FR-010/011/020/021/022/030/040/050/060.
// Never fetches before AdminRoute resolves (AC-070).

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/auth/use-auth'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { Button } from '@/components/ui/button'
import { ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { UserTable } from '@/components/admin/user-table'
import { CreatePersonDialog } from '@/components/admin/create-person-dialog'
import { PasswordReveal } from '@/components/admin/password-reveal'
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

export function AdminUsersPage() {
  const auth = useAuth()
  const viewerPersonId = auth.status === 'authenticated' ? auth.viewer.person.id : ''

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [people, setPeople] = useState<AdminPersonRow[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [reveal, setReveal] = useState<RevealContext | null>(null)
  const [actionError, setActionError] = useState('')

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

  async function handleAction(action: string, person: AdminPersonRow) {
    setActionError('')
    try {
      switch (action) {
        case 'disable-login':
          await setLoginEnabled(person.id, false)
          await load()
          break
        case 'enable-login':
          await setLoginEnabled(person.id, true)
          await load()
          break
        case 'reset-password': {
          const pw = await resetPassword(person.id)
          setReveal({ password: pw, personName: person.full_name, email: person.email, context: 'reset' })
          break
        }
        case 'create-login': {
          const pw = await createLogin(person.id)
          setReveal({ password: pw, personName: person.full_name, email: person.email, context: 'create' })
          await load()
          break
        }
        case 'archive':
          await archivePerson(person.id)
          await load()
          break
        case 'restore':
          await restorePerson(person.id)
          await load()
          break
        default:
          break
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed. Try again.')
    }
  }

  function handleRevealDone() {
    setReveal(null)
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
            <div style={{ borderBottom: '1px solid var(--border)', height: 38, display: 'flex', alignItems: 'center', paddingLeft: 16 }}>
              <span className="text-xs font-semibold uppercase" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>
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
        onCreated={load}
        takenEmails={takenEmails}
      />

      {/* Password reveal (for reset-password + create-login actions) */}
      {reveal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'var(--scrim)' }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-lg p-6 shadow-lg"
            style={{ background: 'var(--card)' }}
          >
            <PasswordReveal
              personName={reveal.personName}
              password={reveal.password}
              email={reveal.email}
              context={reveal.context}
              onDone={handleRevealDone}
            />
          </div>
        </div>
      )}
    </PageFrame>
  )
}
