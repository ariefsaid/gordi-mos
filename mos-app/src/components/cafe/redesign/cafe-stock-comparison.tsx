import type { ReactNode } from 'react'
import { Worksheet } from './worksheet'

/** Read-only comparison collection; the page supplies its existing data and search behavior. */
export function StockComparison({ children, label }: { children: ReactNode; label: string }) {
  return <Worksheet label={label} className="cafe-stock-comparison">{children}</Worksheet>
}
