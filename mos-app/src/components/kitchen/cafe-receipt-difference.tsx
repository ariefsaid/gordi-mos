import { Pill } from '@/components/ui/pill'
import { useT } from '@/i18n/use-t'
import type { CafeReceiptDifferenceOutcome } from '@/lib/db/cafe-receipts'

const LABEL = {
  over: 'cafe.receipts.difference.over',
  short: 'cafe.receipts.difference.short',
  matches: 'cafe.receipts.difference.matches',
  no_open_po: 'cafe.receipts.difference.noOpenPo',
} as const

/** A line's difference against the open POs as a word in a tinted pill; never a quantity. */
export function CafeReceiptDifferenceLabel({ outcome }: { outcome: Exclude<CafeReceiptDifferenceOutcome, 'unknown'> }) {
  const t = useT()
  return (
    <Pill tone={outcome === 'matches' ? 'success' : 'warning'} className="cafe-receipt-difference">
      {t(LABEL[outcome])}
    </Pill>
  )
}
