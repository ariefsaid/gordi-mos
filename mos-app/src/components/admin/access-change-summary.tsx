import type { AuthorityRole, RoleAuthorityRow } from '@/lib/db/admin-access.types'
import { AUTHORITY_ACTION_LABEL_KEYS, AUTHORITY_SCOPE_LABEL_KEYS, authorityRoleLabel } from '@/components/admin/person-authority'
import type { Translate } from '@/i18n/use-t'

export function AccessChangeSummary({ changes, saved, t }: { changes: RoleAuthorityRow[]; saved: RoleAuthorityRow[]; t: Translate }) {
  if (!changes.length) return null
  return <section className="access-change-summary" aria-labelledby="access-change-summary-title">
    <h3 id="access-change-summary-title">{t('admin.access.unsaved')}</h3>
    <ul>{changes.map((change) => {
      const old = saved.find((row) => row.action === change.action && row.role === change.role)?.scope ?? 'none'
      return <li key={`${change.action}:${change.role}`}>
        <span>{t(AUTHORITY_ACTION_LABEL_KEYS[change.action])} · {authorityRoleLabel(change.role as AuthorityRole, t)}</span>
        <span>{t(AUTHORITY_SCOPE_LABEL_KEYS[old])} → {t(AUTHORITY_SCOPE_LABEL_KEYS[change.scope])}</span>
      </li>
    })}</ul>
  </section>
}
