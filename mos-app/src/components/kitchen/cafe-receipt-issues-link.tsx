import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { canManageCafeReceiptIssues, countCafeReceiptIssuesNeedingPo } from '@/lib/db/cafe-receipt-issues'
import { RailCountBadge } from '@/shell/rail-nav'

/**
 * The Receipt issues entry point with FR-1034's badge: what waits for a PO, as the viewer may read
 * it. Only people who act on or review issues are counted: procurement and stream reviewers count
 * every issue they read, a receiver (`receiverId`, set once they have receipts) their own receipts'.
 * Anyone else sends no count and sees no badge.
 */
export function CafeReceiptIssuesLink({ canReview, receiverId }: { canReview: boolean; receiverId: string | null }) {
  const t = useT()
  const [holder, setHolder] = useState<boolean>()
  const [count, setCount] = useState<number>()
  useEffect(() => {
    if (canReview) return
    let active = true
    canManageCafeReceiptIssues().then(allowed => { if (active) setHolder(allowed) }, () => { if (active) setHolder(false) })
    return () => { active = false }
  }, [canReview])
  const scope = canReview || holder ? 'all' : holder === false && receiverId ? 'own' : null
  const receivedBy = scope === 'own' ? receiverId ?? undefined : undefined
  useEffect(() => {
    if (!scope) return
    let active = true
    // A failed count shows no badge rather than a wrong one; the list itself still opens.
    countCafeReceiptIssuesNeedingPo(receivedBy ? { receivedBy } : {}).then(n => { if (active) setCount(n) }, () => undefined)
    return () => { active = false }
  }, [scope, receivedBy])
  return (
    <Link to="/cafe/receive/issues" className="cafe-receipt-issues-link">
      {t('cafe.receipts.issues.title')}
      <RailCountBadge count={count} label={count ? t('cafe.receipts.issues.badge', { count }) : undefined} />
    </Link>
  )
}
