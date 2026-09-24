// PositionPicker — the Position (Jabatan) section of the person panel. A Position is an org
// title, never labelled "Role", and carries no permission of its own.
// Checked = person.jabatan.some(j => j.role_id === role.id); each row commits on toggle.

import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { matchesTokens } from '@/lib/token-search'
import { assignJabatan, removeJabatan } from '@/lib/db/admin-users'
import type { AdminPersonRow, RoleOption } from '@/lib/db/admin-users.types'
import { CheckboxRow } from './checkbox-row'
import { FilterEmpty, ListFilter, ShowAll } from './long-list'
import { FILTER_THRESHOLD, useLongList } from './use-long-list'
import { RowStatus } from './row-status'
import type { RowCommits } from './use-row-commits'

export interface PositionPickerProps {
  person: AdminPersonRow
  /** All org roles (Positions), from listRoles(). */
  roles: RoleOption[]
  /** The panel's shared row-commit state; keys here start with `pos:`. */
  commits: RowCommits<boolean>
  refresh: () => Promise<void>
}

export function PositionPicker({ person, roles, commits, refresh }: PositionPickerProps) {
  const t = useT()
  const [filter, setFilter] = useState('')
  const busy = commits.busy('pos:')
  const assigned = (role: RoleOption) => person.jabatan.some((j) => j.role_id === role.id)
  const list = useLongList(roles, (role) => role.id, assigned)
  const collapsed = list.collapsed(filter)
  const visible = list.ordered.filter((role) => collapsed
    ? list.pinned(role) || commits.display(`pos:${role.id}`, assigned(role))
    : matchesTokens(filter, [role.name]))

  function toggle(role: RoleOption, checked: boolean) {
    const wanted = !checked
    const write = wanted ? () => assignJabatan(person.id, role.id) : () => removeJabatan(person.id, role.id)
    void commits.commit(`pos:${role.id}`, wanted, assigned(role), write, refresh)
  }

  return (
    <div className="admin-person-section__body">
      {roles.length > FILTER_THRESHOLD && (
        <ListFilter section={t('admin.person.position')} value={filter} onChange={setFilter} />
      )}
      <fieldset>
        <legend className="sr-only">{t('admin.position.legend', { name: person.full_name })}</legend>
        {roles.length === 0 ? (
          <p className="admin-person-section__empty">{t('admin.position.none')}</p>
        ) : visible.length === 0 ? (
          !collapsed && <FilterEmpty query={filter} />
        ) : (
          <div className="admin-choice-list">
            {visible.map((role, i) => {
              const key = `pos:${role.id}`
              const checked = commits.display(key, assigned(role))
              return (
                <CheckboxRow
                  key={role.id}
                  label={role.name}
                  checked={checked}
                  disabled={busy}
                  divider={i > 0}
                  onToggle={() => toggle(role, checked)}
                  trailing={
                    <RowStatus
                      status={commits.status(key)}
                      error={commits.error(key)}
                      item={role.name}
                      onRetry={() => void commits.retry(key)}
                    />
                  }
                />
              )
            })}
          </div>
        )}
        {collapsed && visible.length < roles.length && <ShowAll count={roles.length} onShow={list.showAll} />}
      </fieldset>
    </div>
  )
}
