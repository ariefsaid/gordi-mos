// A column header that sorts (UX-STANDARD CT3): the sorted column shows its direction (the shared SortIndicator).
import type { ReactNode } from 'react'
import { SortIndicator } from '@/components/ui/sort-indicator'
import './page-actions.css'

export type SortDir = 'asc' | 'desc'

export function SortButton({ dir, onClick, children }: { dir: SortDir | null; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="admin-sort" onClick={onClick}>{children}<SortIndicator dir={dir} /></button>
}
