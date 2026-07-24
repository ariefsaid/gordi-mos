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

import { useState, useEffect, useCallback, useId, useRef } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { UserTable } from '@/components/admin/user-table'
import type { PersonAction } from '@/components/admin/user-table'
import { usePeopleListPresentsCards } from '@/components/admin/use-people-list-presents-cards'
import { CreatePersonDialog } from '@/components/admin/create-person-dialog'
import { PasswordReveal } from '@/components/admin/password-reveal'
import { RoleEditor } from '@/components/admin/role-editor'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ModalShell } from '@/components/ui/modal-shell'
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
  const t = useT()
  const viewerPersonId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  // DO-22(b): same presentation decision the UserTable itself makes — chrome and list
  // presentation can never disagree.
  const presentsCards = usePeopleListPresentsCards()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [people, setPeople] = useState<AdminPersonRow[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [reveal, setReveal] = useState<RevealContext | null>(null)
  const [roleEditorPerson, setRoleEditorPerson] = useState<AdminPersonRow | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const [actionError, setActionError] = useState('')

  const { toast, showToast, clearToast } = useToast()

  // GAP-7 (OD-REDESIGN-91 #12): ONE success channel — an IN-PLACE edit (enable/disable login, which
  // updates the person's row where the user is already looking) confirms with an inline "Saved" at
  // the row locus (the record grammar), never a floating toast. The toast is reserved for changes
  // that land ELSEWHERE (archive/restore move the row out of the current segment view).
  const [justSavedId, setJustSavedId] = useState<string | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashSaved = useCallback((personId: string) => {
    setJustSavedId(personId)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setJustSavedId(null), 1600)
  }, [])
  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current) }, [])

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
          // No confirm — low-stakes reversible action. GAP-7: in-place edit → inline Saved at the row.
          await setLoginEnabled(person.id, true)
          await load()
          flashSaved(person.id)
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
          showToast(t('admin.people.toast.restored', { name: person.full_name }))
          break

        case 'manage-roles':
          // Opens the RoleEditor dialog; no async call here — the dialog owns grant/revoke.
          setRoleEditorPerson(person)
          break
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('admin.people.actionFailed'))
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
    // GAP-7: disabling login is an in-place edit (the row's login pill flips) → inline Saved at the row.
    await setLoginEnabled(person.id, false)
    setPendingConfirm(null)
    await load()
    flashSaved(person.id)
  }

  async function handleConfirmArchive(person: AdminPersonRow) {
    await archivePerson(person.id)
    setPendingConfirm(null)
    await load()
    showToast(t('admin.people.toast.archived', { name: person.full_name }))
  }

  function handleRevealDone() {
    setReveal(null)
  }

  function handlePersonCreated() {
    void load()
  }

  // Shell state seam (V3 Management family): the People load state maps to the
  // shared PageFamilyState. The UserTable body keeps its own empty/segment states.
  const frameState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : 'default'

  return (
    // Census R2 DO-7 sibling sweep (GUARD-R2 class): People has no in-body result-header, so its
    // count moves into the head as ONE labeled meta sentence ("9 people" — the Tasks grammar),
    // never the bare ".ch-count" digit pill; "—" while counts are unknown.
    <PageFamilyFrame
      family="management"
      title={t('admin.people.title')}
      jobSentence={t('admin.people.job')}
      meta={
        <span data-testid="people-count-line" className="ch-meta-line tabular-nums">
          {loadState === 'loaded'
            ? t(people.length === 1 ? 'admin.people.count.one' : 'admin.people.count.other', { count: people.length })
            : '—'}
        </span>
      }
      action={<Button variant="primary" onClick={() => setAddOpen(true)}>{t('admin.people.addPerson')}</Button>}
      state={frameState}
    >

      {/* Action error (inline, non-fatal) */}
      {actionError && (
        <div className="px-6 pt-2">
          <ErrorState
            message={actionError}
            onRetry={() => setActionError('')}
            retryLabel={t('admin.people.dismiss')}
          />
        </div>
      )}

      {/* DO-22(b) (census admin-people P2-B): when the list presents as CARDS (phone /
          coarse pointer) the person cards carry their own card chrome — the outer
          container drops its border/shadow/bg so cards never nest inside a card. The
          container card exists for the table presentation only. */}
      <div
        data-testid="people-list-container"
        className="mx-6 mb-6 rounded-lg overflow-hidden"
        style={presentsCards ? undefined : {
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
                {t('admin.people.col.person')}
              </span>
            </div>
            {/* Cohesion-debt 2026-07-19, item #3: one loading grammar — LoadingShell
                (role=status) instead of a role-less bare SkeletonRows. */}
            <LoadingShell count={6} />
          </>
        )}

        {loadState === 'error' && (
          <div className="py-12 px-4">
            <ErrorState
              message={t('admin.people.loadError')}
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
            justSavedId={justSavedId}
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
          title={t('admin.people.confirm.reset.title', { name: pendingConfirm.person.full_name })}
          body={t('admin.people.confirm.reset.body')}
          confirmLabel={t('admin.people.confirm.reset.confirm')}
          tone="primary"
          onConfirm={() => handleConfirmResetPassword(pendingConfirm.person)}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {pendingConfirm?.type === 'disable-login' && (
        <ConfirmDialog
          open
          title={t('admin.people.confirm.disable.title', { name: pendingConfirm.person.full_name })}
          body={t('admin.people.confirm.disable.body')}
          confirmLabel={t('admin.people.confirm.disable.confirm')}
          tone="primary"
          onConfirm={() => handleConfirmDisable(pendingConfirm.person)}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {pendingConfirm?.type === 'archive' && (
        <ConfirmDialog
          open
          title={t('admin.people.confirm.archive.title', { name: pendingConfirm.person.full_name })}
          body={t('admin.people.confirm.archive.body')}
          confirmLabel={t('admin.people.confirm.archive.confirm')}
          tone="destructive"
          onConfirm={() => handleConfirmArchive(pendingConfirm.person)}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {/* Password reveal — for reset-password + create-login actions.
          The alertdialog element owns aria-labelledby/describedby (item 7 fix):
          previously these were only on the inner wrapper div, not the alertdialog element. */}
      {reveal && (
        <ModalShell
          open
          onClose={handleRevealDone}
          role="alertdialog"
          ariaLabelledBy={revealHeadingId}
          ariaDescribedBy={revealWarningId}
          closeOnBackdrop={false}
          closeOnEscape={false}
        >
          <div className="p-6">
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
        </ModalShell>
      )}

      {/* Success toast (item 6) */}
      <Toast toast={toast} onDismiss={clearToast} />
    </PageFamilyFrame>
  )
}
