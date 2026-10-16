import type { ReactNode } from 'react'
import './cafe-transfer-context.css'

/** Transaction context that keeps source and selected destination visible during entry. */
export function CafeTransferContext({ from, fromLabel, destinationLabel, ariaLabel, selector }: {
  from: string
  fromLabel: string
  destinationLabel: string
  ariaLabel: string
  selector: ReactNode
}) {
  return <section className="cafe-transfer-context" aria-label={ariaLabel}>
    <div><span>{fromLabel}</span><strong>{from}</strong></div>
    <div className="cafe-transfer-context__destination"><span>{destinationLabel}</span>{selector}</div>
  </section>
}
