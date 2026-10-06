import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { countCafeReceiptIssuesNeedingPo } from '@/lib/db/cafe-receipt-issues'
import { RailCountBadge } from '@/shell/rail-nav'

/** The Receipt issues entry point with FR-1034's badge: what waits for a PO, as the viewer may read it. */
export function CafeReceiptIssuesLink() {
  const t = useT()
  const [count, setCount] = useState<number>()
  useEffect(() => {
    let active = true
    // A failed count shows no badge rather than a wrong one; the list itself still opens.
    countCafeReceiptIssuesNeedingPo().then(n => { if (active) setCount(n) }, () => undefined)
    return () => { active = false }
  }, [])
  return (
    <Link to="/cafe/receive/issues" className="cafe-receipt-issues-link">
      {t('cafe.receipts.issues.title')}
      <RailCountBadge count={count} label={count ? t('cafe.receipts.issues.badge', { count }) : undefined} />
    </Link>
  )
}
