/**
 * A quiet count: tabular digits at a row's trailing edge, shown only for a positive count. Compact pins a
 * small marker to the icon corner (the number lives in the accessible name). With a `label` the badge is
 * exposed to assistive technology under that name; without one it is a hidden, redundant cue.
 */
export function CountBadge({ count, bounded = false, unavailable = false, label, compact = false }: { count?: number; bounded?: boolean; unavailable?: boolean; label?: string; compact?: boolean }) {
  // An unknown count is a dash with a name that says so, never a zero.
  if (!unavailable && (count === undefined || count <= 0)) return null
  return (
    <span
      className={compact ? 'nav-count nav-count--compact tabular-nums' : 'nav-count tabular-nums'}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      {compact ? null : unavailable ? '—' : bounded ? `${count}+` : count}
    </span>
  )
}
