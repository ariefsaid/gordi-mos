import { useEffect, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { ErrorState } from '@/components/ui/state-kit'
import { CheckboxRow } from './checkbox-row'
import { RowStatus } from './row-status'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import { getCafeReceiptIssueAccess, setCafeReceiptIssueAccess } from '@/lib/db/cafe-receipt-issues'
import type { RowCommits } from './use-row-commits'

export function CafeReceiptIssueAccess({ person, commits, refresh }: {
  person: AdminPersonRow
  commits: RowCommits<boolean>
  refresh: () => Promise<void>
}) {
  const t = useT()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const key = `receipt-issues:${person.id}`

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailed(false)
    void getCafeReceiptIssueAccess(person.id).then(value => {
      if (active) setEnabled(value)
    }).catch(() => {
      if (active) setFailed(true)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [person.id])

  async function retryLoad() {
    setFailed(false)
    setLoading(true)
    try {
      setEnabled(await getCafeReceiptIssueAccess(person.id))
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  if (failed) {
    return <ErrorState message={t('admin.person.receiptIssues.loadFailed')} onRetry={() => void retryLoad()} retryLabel={t('common.retry')} />
  }
  if (loading) return <p className="admin-person-muted" role="status">{t('admin.person.receiptIssues.loading')}</p>

  const checked = commits.display(key, enabled)
  return (
    <div className="admin-person-section__body">
      <p className="admin-person-note">{t('admin.person.receiptIssues.help')}</p>
      <fieldset>
        <legend className="sr-only">{t('admin.person.receiptIssues.title')}</legend>
        <div className="admin-choice-list">
          <CheckboxRow
            label={t('admin.person.receiptIssues.grant')}
            description={t('admin.person.receiptIssues.description')}
            checked={checked}
            disabled={commits.busy(key)}
            onToggle={() => {
              const wanted = !checked
              void commits.commit(
                key,
                wanted,
                enabled,
                async () => {
                  const saved = await setCafeReceiptIssueAccess(person.id, wanted)
                  if (saved !== wanted) throw new Error('Receipt issue access did not change')
                },
                async () => {
                  const fresh = await getCafeReceiptIssueAccess(person.id)
                  setEnabled(fresh)
                  await refresh()
                },
              )
            }}
            trailing={(
              <RowStatus
                status={commits.status(key, enabled)}
                error={commits.error(key)}
                item={t('admin.person.receiptIssues.grant')}
                onRetry={() => void commits.retry(key)}
              />
            )}
          />
        </div>
      </fieldset>
    </div>
  )
}
