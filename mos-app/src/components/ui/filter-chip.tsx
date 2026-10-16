// FilterChip — an active filter shown as a removable chip ("Status: Blocked ×"). One look for Work,
// Money, Admin and Café; the label always names the filter and its value.
import { useT } from '@/i18n/use-t'
import './FilterChip.css'

export function FilterChip({ label, onRemove, className }: { label: string; onRemove: () => void; className?: string }) {
  const t = useT()
  return (
    <button
      type="button"
      className={`filter-chip${className ? ` ${className}` : ''}`}
      aria-label={t('collection.filter.remove', { filter: label })}
      onClick={onRemove}
    >
      <span>{label}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  )
}
