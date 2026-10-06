import type { ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import type { CafeReceiptDifferenceOutcome } from '@/lib/db/cafe-receipts'

type KnownOutcome = Exclude<CafeReceiptDifferenceOutcome, 'unknown'>

const LABEL = {
  over: 'cafe.receipts.difference.over',
  short: 'cafe.receipts.difference.short',
  matches: 'cafe.receipts.difference.matches',
  no_open_po: 'cafe.receipts.difference.noOpenPo',
} as const

/** A line's difference as toned text (DESIGN "Row status as text"): matches is quiet, the rest stand out. Never a quantity. */
export function CafeReceiptDifferenceLabel({ outcome }: { outcome: KnownOutcome }) {
  const t = useT()
  return <span className="cafe-receipt-difference" data-outcome={outcome}>{t(LABEL[outcome])}</span>
}

/**
 * One received line: name, quantity and, where a difference is expected, its label slot. The slot is
 * reserved before the label arrives so the row, and everything below it, does not move.
 */
export function CafeReceiptLineRow({ name, quantity, unit, withDifference, outcome, children }: {
  name: string
  quantity: string
  unit: string
  withDifference: boolean
  outcome?: KnownOutcome
  /** Full-width detail under the row, such as a condition and its evidence. */
  children?: ReactNode
}) {
  const t = useT()
  return (
    <li className={withDifference ? 'cafe-receipt-line--difference' : undefined}>
      <span>{name}</span>
      <span className="cafe-receipt-lines__facts">
        <span className="tabular">{t('cafe.receipts.quantityUnit', { quantity, unit })}</span>
        {withDifference && (
          <span className="cafe-receipt-lines__difference">{outcome && <CafeReceiptDifferenceLabel outcome={outcome} />}</span>
        )}
      </span>
      {children}
    </li>
  )
}
