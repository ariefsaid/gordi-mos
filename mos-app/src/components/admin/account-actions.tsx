// Account actions on a person — reset password, create / disable / enable login, archive, restore —
// shared by the People list's row menu and the person page header. One owner for the confirms
// (reset, disable, archive), the show-once password, the toasts and the inline "Saved", so the two
// doors can never disagree. Enable login and Restore are reversible and act without a confirm.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ModalShell } from '@/components/ui/modal-shell'
import { archivePerson, createLogin, resetPassword, restorePerson, setLoginEnabled } from '@/lib/db/admin-users'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import type { MessageKey } from '@/i18n/messages'
import { PasswordReveal } from './password-reveal'
import { Toast } from './toast'
import { useToast } from './use-toast'
import { isLastActiveAdmin } from './people-filter'
import type { PersonAction } from './user-table'
import './admin-settings.css'

export type AccountAction = Exclude<PersonAction, 'manage-person'>

export const ACCOUNT_ACTION_LABEL: Record<AccountAction, MessageKey> = {
  'reset-password': 'admin.people.action.resetPassword',
  'create-login': 'admin.people.action.createLogin',
  'disable-login': 'admin.people.action.disableLogin',
  'enable-login': 'admin.people.action.enableLogin',
  archive: 'admin.people.action.archive',
  restore: 'admin.people.action.restore',
}

/** The actions this person's state allows, in menu order, each blocked by the last-admin guard or not. */
export function accountActionsFor(person: AdminPersonRow, people: readonly AdminPersonRow[]): { action: AccountAction; blocked: boolean }[] {
  const lastAdmin = isLastActiveAdmin(person, people)
  const list: { action: AccountAction; blocked: boolean }[] = []
  if (person.login !== 'none') list.push({ action: 'reset-password', blocked: false })
  if (person.login === 'active') list.push({ action: 'disable-login', blocked: lastAdmin })
  if (person.login === 'disabled') list.push({ action: 'enable-login', blocked: false })
  if (person.login === 'none') list.push({ action: 'create-login', blocked: false })
  list.push(person.archived_at ? { action: 'restore', blocked: false } : { action: 'archive', blocked: lastAdmin })
  return list
}

/** The one action a person most likely needs next: what fixes an unusual state, else a password reset. */
export function nextAccountAction(person: AdminPersonRow): AccountAction {
  if (person.archived_at) return 'restore'
  if (person.login === 'none') return 'create-login'
  if (person.login === 'disabled') return 'enable-login'
  return 'reset-password'
}

type Reveal = { password: string; personName: string; email: string | null; context: 'create' | 'reset' }
type Pending = { type: 'reset-password' | 'disable-login' | 'archive'; person: AdminPersonRow }

export function useAccountActions(reload: () => Promise<void>) {
  const t = useT()
  const [pending, setPending] = useState<Pending | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [error, setError] = useState('')
  const [justSavedId, setJustSavedId] = useState<string | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { toast, showToast, clearToast } = useToast()
  const headingId = useId()
  const warningId = useId()

  // An in-place change (the login status flips where the admin is looking) confirms with an inline
  // Saved there; a change that moves the person out of view (archive, restore) confirms with a toast.
  const flashSaved = useCallback((id: string) => {
    setJustSavedId(id)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setJustSavedId(null), 1600)
  }, [])
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  async function run(action: AccountAction, person: AdminPersonRow) {
    setError('')
    try {
      if (action === 'reset-password' || action === 'disable-login' || action === 'archive') {
        setPending({ type: action, person })
      } else if (action === 'enable-login') {
        await setLoginEnabled(person.id, true)
        await reload()
        flashSaved(person.id)
      } else if (action === 'create-login') {
        const password = await createLogin(person.id)
        setReveal({ password, personName: person.full_name, email: person.email, context: 'create' })
        await reload()
      } else {
        await restorePerson(person.id)
        await reload()
        showToast(t('admin.people.toast.restored', { name: person.full_name }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.people.actionFailed'))
    }
  }

  const confirmCopy = pending && ({
    'reset-password': { title: 'admin.people.confirm.reset.title', body: 'admin.people.confirm.reset.body', confirm: 'admin.people.confirm.reset.confirm' },
    'disable-login': { title: 'admin.people.confirm.disable.title', body: 'admin.people.confirm.disable.body', confirm: 'admin.people.confirm.disable.confirm' },
    archive: { title: 'admin.people.confirm.archive.title', body: 'admin.people.confirm.archive.body', confirm: 'admin.people.confirm.archive.confirm' },
  } as const)[pending.type]

  async function confirm() {
    if (!pending) return
    const { type, person } = pending
    if (type === 'reset-password') {
      const password = await resetPassword(person.id)
      setReveal({ password, personName: person.full_name, email: person.email, context: 'reset' })
      setPending(null)
      await reload()
    } else if (type === 'disable-login') {
      await setLoginEnabled(person.id, false)
      setPending(null)
      await reload()
      flashSaved(person.id)
    } else {
      await archivePerson(person.id)
      setPending(null)
      await reload()
      showToast(t('admin.people.toast.archived', { name: person.full_name }))
    }
  }

  const dialogs = (
    <>
      {pending && confirmCopy && (
        <ConfirmDialog
          open
          title={t(confirmCopy.title, { name: pending.person.full_name })}
          body={t(confirmCopy.body)}
          confirmLabel={t(confirmCopy.confirm)}
          tone={pending.type === 'archive' ? 'destructive' : 'primary'}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
      {/* Shown exactly once: neither Escape nor the backdrop closes it, only Done. */}
      {reveal && (
        <ModalShell
          open
          onClose={() => setReveal(null)}
          role="alertdialog"
          ariaLabelledBy={headingId}
          ariaDescribedBy={warningId}
          closeOnBackdrop={false}
          closeOnEscape={false}
        >
          <div className="password-reveal-dialog">
            <PasswordReveal
              personName={reveal.personName}
              password={reveal.password}
              email={reveal.email}
              context={reveal.context}
              onDone={() => setReveal(null)}
              headingId={headingId}
              warningId={warningId}
            />
          </div>
        </ModalShell>
      )}
      <Toast toast={toast} onDismiss={clearToast} />
    </>
  )

  return { run, dialogs, error, clearError: () => setError(''), justSavedId, showToast }
}
