// SortIndicator — the one sort-direction mark beside a sorted column header (UX-STANDARD CT3):
// an arrow, up for ascending, down for descending. Tasks, Money, Café, Signals, Objectives and
// Admin tables all draw this and nothing else.
import './SortIndicator.css'

export type SortDirection = 'asc' | 'desc'

export function SortIndicator({ dir }: { dir: SortDirection | null | undefined }) {
  if (!dir) return null
  return (
    <span className="sort-indicator" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dir === 'desc' ? 'rotate(180deg)' : undefined }}>
        <path d="M12 19V5m-6 6 6-6 6 6" />
      </svg>
    </span>
  )
}
