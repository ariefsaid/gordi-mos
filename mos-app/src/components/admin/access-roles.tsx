// AccessRoles — the Access section of the person panel: one checkbox per assignable access role.
// Every row commits on toggle and reports beside itself. Admin is the one exception to direct
// commit: granting or removing it asks first, in the shared confirm dialog, naming the person and
// what Admin can do. Granting Ops Lead asks the same way. Cancel writes nothing; Confirm writes once.
//
// Guards kept from the role editor this replaces:
//   self-assign — admin/finance/manager/supervisor are disabled on the viewer's own row;
//   last admin  — the Admin checkbox is disabled for the only active admin.

import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { useAuth } from '@/auth/use-auth'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { grantRole, revokeRole } from '@/lib/db/admin-users'
import { ASSIGNABLE_ROLES, localizedRoleMeta, type AdminPersonRow } from '@/lib/db/admin-users.types'
import { CheckboxRow } from './checkbox-row'
import { RowStatus } from './row-status'
import type { RowCommits } from './use-row-commits'
import { isLastActiveAdmin } from './people-filter'

const SELF_GUARDED_ROLES = new Set(['admin', 'finance', 'manager', 'supervisor'])

const CONFIRM_COPY = {
  adminGrant: { title: 'admin.roles.confirmGrant.title', body: 'admin.roles.confirmGrant.body', confirm: 'admin.roles.confirmGrant.confirm' },
  adminRevoke: { title: 'admin.roles.confirmRevoke.title', body: 'admin.roles.confirmRevoke.body', confirm: 'admin.roles.confirmRevoke.confirm' },
  opsLeadGrant: { title: 'admin.roles.confirmOpsLead.title', body: 'admin.roles.confirmOpsLead.body', confirm: 'admin.roles.confirmOpsLead.confirm' },
} as const

export interface AccessRolesProps {
  person: AdminPersonRow
  people: readonly AdminPersonRow[]
  /** The panel's shared row-commit state; keys here start with `role:`. */
  commits: RowCommits<boolean>
  refresh: () => Promise<void>
}

export function AccessRoles({ person, people, commits, refresh }: AccessRolesProps) {
  const t = useT()
  const auth = useAuth()
  const viewerPersonId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  const isSelf = person.id === viewerPersonId
  const lastAdmin = isLastActiveAdmin(person, people)
  const busy = commits.busy('role:')
  const [confirmRole, setConfirmRole] = useState<null | { role: 'admin' | 'ops_lead'; wanted: boolean }>(null)

  function commit(role: string, wanted: boolean) {
    const write = wanted ? () => grantRole(person.id, role) : () => revokeRole(person.id, role)
    return commits.commit(`role:${role}`, wanted, person.access_roles.includes(role), write, refresh)
  }

  function toggle(role: string, checked: boolean) {
    const wanted = !checked
    // Confirm only a real change to Admin, or a grant of Ops Lead. Reverting a failed attempt back
    // to the saved value writes nothing, so it needs no confirmation either.
    const changes = wanted !== person.access_roles.includes(role)
    if (changes && (role === 'admin' || (role === 'ops_lead' && wanted))) {
      setConfirmRole({ role, wanted })
      return
    }
    void commit(role, wanted)
  }

  return (
    <div className="admin-person-section__body">
      <fieldset>
        <legend className="sr-only">{t('admin.roles.legend', { name: person.full_name })}</legend>
        <div className="admin-choice-list">
          {(ASSIGNABLE_ROLES as readonly string[]).map((role, i) => {
            const key = `role:${role}`
            const checked = commits.display(key, person.access_roles.includes(role))
            const selfGuarded = isSelf && SELF_GUARDED_ROLES.has(role)
            const lastAdminGuarded = role === 'admin' && lastAdmin
            const meta = localizedRoleMeta(role, t)
            const description = lastAdminGuarded
              ? t('admin.roles.lastAdminHint')
              : selfGuarded
                ? t('admin.roles.selfGuardShort')
                : meta.description
            const disabledReason = selfGuarded ? t('admin.roles.selfGuard') : lastAdminGuarded ? t('admin.people.lastAdmin') : undefined
            return (
              <CheckboxRow
                key={role}
                label={meta.label}
                description={description}
                checked={checked}
                disabled={selfGuarded || lastAdminGuarded || busy}
                divider={i > 0}
                title={disabledReason}
                onToggle={() => toggle(role, checked)}
                trailing={
                  <RowStatus
                    status={commits.status(key, person.access_roles.includes(role))}
                    error={commits.error(key)}
                    item={meta.label}
                    onRetry={() => void commits.retry(key)}
                  />
                }
              />
            )
          })}
        </div>
      </fieldset>

      {confirmRole && (() => {
        const copy = CONFIRM_COPY[confirmRole.role === 'ops_lead' ? 'opsLeadGrant' : confirmRole.wanted ? 'adminGrant' : 'adminRevoke']
        return (
          <ConfirmDialog
            open
            title={t(copy.title, { name: person.full_name })}
            body={t(copy.body)}
            confirmLabel={t(copy.confirm)}
            tone="primary"
            onConfirm={async () => {
              const { role, wanted } = confirmRole
              setConfirmRole(null)
              // The row owns the outcome (Saving… → Saved, or Failed · Retry), not the dialog.
              void commit(role, wanted)
            }}
            onCancel={() => setConfirmRole(null)}
          />
        )
      })()}
    </div>
  )
}
