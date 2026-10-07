// The Procurement section of the person panel: one checkbox for the capability to resolve Receipt
// issues (FR-1040). It is not an access role, so its saved value is read from its own RPC; the row
// commits and reports beside itself like the Access rows, and the database refuses a self-grant.

import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { useAuth } from '@/auth/use-auth'
import { ErrorState } from '@/components/ui/state-kit'
import { getCafeReceiptIssueAccess, setCafeReceiptIssueAccess } from '@/lib/db/cafe-receipt-issues'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import { CheckboxRow } from './checkbox-row'
import { RowStatus } from './row-status'
import type { RowCommits } from './use-row-commits'

export function CafeReceiptIssueAccess({ person, commits }: { person: AdminPersonRow; commits: RowCommits<boolean> }) {
  const t = useT()
  const auth = useAuth()
  const isSelf = auth.status === 'authenticated' && auth.viewer.person.id === person.id
  const [saved, setSaved] = useState<boolean | 'failed' | null>(null)
  const key = `procurement:${person.id}`

  const load = useCallback(() => getCafeReceiptIssueAccess(person.id).then(setSaved), [person.id])
  useEffect(() => {
    setSaved(null)
    load().catch(() => setSaved('failed'))
  }, [load])

  if (saved === 'failed') {
    return (
      <ErrorState
        message={t('common.loadFailed', { what: t('admin.person.procurement.title') })}
        onRetry={() => { setSaved(null); load().catch(() => setSaved('failed')) }}
        retryLabel={t('common.retry')}
      />
    )
  }
  if (saved === null) return <p className="admin-person-muted" role="status">{t('common.loading')}</p>

  const checked = commits.display(key, saved)
  const label = t('admin.person.procurement.grant')
  return (
    <div className="admin-person-section__body">
      <div className="admin-choice-list">
        <CheckboxRow
          label={label}
          description={isSelf ? t('admin.person.procurement.selfGuard') : t('admin.person.procurement.description')}
          checked={checked}
          disabled={isSelf}
          busy={commits.busy(key)}
          title={isSelf ? t('admin.person.procurement.selfGuard') : undefined}
          onToggle={() => void commits.commit(key, !checked, saved, () => setCafeReceiptIssueAccess(person.id, !checked), load)}
          trailing={<RowStatus status={commits.status(key, saved)} error={commits.error(key)} item={label} onRetry={() => void commits.retry(key)} />}
        />
      </div>
    </div>
  )
}
