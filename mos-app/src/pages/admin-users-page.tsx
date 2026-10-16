// AdminUsersPage — the admin-only People list: /admin/people (behind AdminRoute; never fetches first).
//
// A row, Enter on a name, or the row menu's "Manage person" opens that person's own page,
// /admin/people/:personId, carrying the list's filters so its Back link returns here unchanged.
// The row menu's account actions (reset, login, archive/restore) run here through the same
// confirms and show-once password as on the person page. Add person is a workspace in the URL (?add=1).
import { useCallback, useEffect } from 'react'
import './admin-people-page.css'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { isShipGated } from '@/lib/ship-gate'
import { moduleFacts } from '@/lib/module-switches-preview'
import { ErrorState } from '@/components/ui/state-kit'
import { OfflineNotice } from '@/components/ui/offline-notice'
import { UserTable, type PersonAction } from '@/components/admin/user-table'
import { usePeopleListPresentsCards } from '@/components/admin/use-people-list-presents-cards'
import { CreatePersonDialog } from '@/components/admin/create-person-dialog'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
import { useAdminPeople } from '@/components/admin/use-admin-people'
import { useAccountActions } from '@/components/admin/account-actions'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import { LIST_PARAMS } from '@/components/admin/people-filter'

export function AdminUsersPage() {
  const auth = useAuth()
  const t = useT()
  const navigate = useNavigate()
  useDocumentTitle(t('common.docTitle', { page: t('admin.people.title') }))
  const viewerPersonId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  const presentsCards = usePeopleListPresentsCards()
  const [searchParams, setSearchParams] = useSearchParams()
  const addOpen = searchParams.get('add') === '1'
  const setAddOpen = useCallback((open: boolean) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    if (open) next.set('add', '1'); else next.delete('add')
    return next
  }), [setSearchParams])

  // Preview: "People with personal overrides" on the Modules page leads here (?overrides=<module>). Who holds a
  // personal Allow/Block is not connected yet, so the list cannot be narrowed; it says so instead of faking a result.
  const overridesParam = searchParams.get('overrides')
  const overridesModule = isShipGated('/admin/people/modules') ? undefined : moduleFacts().find((fact) => fact.id === overridesParam)

  const data = useAdminPeople()
  const actions = useAccountActions(data.refresh)

  const openPerson = useCallback((id: string, replace = false) => {
    const query = new URLSearchParams()
    for (const key of LIST_PARAMS) {
      const value = searchParams.get(key)
      if (value) query.set(key, value)
    }
    navigate(`/admin/people/${id}${query.size ? `?${query}` : ''}`, { replace })
  }, [navigate, searchParams])

  // Links from before the person page (?person=<id>) land on it.
  const legacyPerson = searchParams.get('person')
  useEffect(() => { if (legacyPerson) openPerson(legacyPerson, true) }, [legacyPerson, openPerson])

  function handleAction(action: PersonAction, person: AdminPersonRow) {
    if (action === 'manage-person') openPerson(person.id)
    else void actions.run(action, person)
  }

  const takenEmails = new Set(data.people.map((p) => p.email).filter(Boolean) as string[])
  const frameState = data.state === 'loading' ? 'loading' : data.state === 'error' ? 'error' : 'default'
  useSetBreadcrumbTitle(addOpen ? t('admin.create.title') : '')

  return (
    <PageFamilyFrame
      family="management"
      title={addOpen ? t('admin.create.title') : t('admin.people.title')}
      jobSentence={addOpen ? undefined : t('admin.people.job')}
      back={addOpen ? { onClick: () => setAddOpen(false), label: t('record.backToCollection', { collection: t('admin.people.title') }) } : undefined}
      action={addOpen ? undefined : <Button variant="primary" onClick={() => setAddOpen(true)}>{t('admin.people.addPerson')}</Button>}
      state={frameState}
    >
      {/* The section switcher is for browsing; a form has the back link above its title. */}
      <div hidden={addOpen}><AdminSettingsNav /></div>
      <OfflineNotice />
      {overridesModule && !addOpen && (
        <Notice tone="info" role="none" action={<Link to="/admin/modules">{t('record.backToCollection', { collection: t('admin.modules.title') })}</Link>}>
          {t('admin.people.overridesNotice', { module: t(overridesModule.labelKey) })}
        </Notice>
      )}

      {actions.error && (
        <div className="admin-people-error">
          <ErrorState message={actions.error} onRetry={actions.clearError} retryLabel={t('admin.people.dismiss')} />
        </div>
      )}

      {!addOpen && (
        <div
          data-testid="people-list-container"
          className={`admin-people-list-shell${presentsCards ? ' admin-people-list-shell--phone' : ''}`}
        >
          {data.state === 'error' ? (
            <div className="admin-people-load-error">
              <ErrorState message={t('admin.people.loadError')} onRetry={data.load} />
            </div>
          ) : (
            <UserTable
              people={data.people}
              viewerPersonId={viewerPersonId}
              onAction={handleAction}
              onAddPerson={() => setAddOpen(true)}
              teams={data.teams}
              loading={data.state === 'loading'}
              justSavedId={actions.justSavedId}
            />
          )}
        </div>
      )}

      <CreatePersonDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => void data.refresh()}
        takenEmails={takenEmails}
        onShowToast={actions.showToast}
        presentation="workspace"
      />

      {actions.dialogs}
    </PageFamilyFrame>
  )
}
