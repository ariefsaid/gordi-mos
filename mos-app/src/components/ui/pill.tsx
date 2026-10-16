// Pill — the ONE status/state/source/progress pill primitive (VIS-4/5/6, PR-2).
// Single shell (DESIGN.md "Status badge"): 4px/8px padding, 4px radius, 14/600 label, one 16px leading icon
// whose SHAPE says the state (ring, clock, check, triangle, alert), so the badge never leans on colour alone.
// Tint differs by tone only. Replaces every hand-rolled pillStyle / wup-state-* /
// pm-pill / ops-source-badge copy. The task StatusPill + the weekly StatePill
// re-skin onto this primitive.
//
// Design authority: DESIGN.md §5 Badges + Tinted-Status Rule + OD-P2 progress markers.
import type { ReactNode, CSSProperties, AriaAttributes } from 'react'
import './Pill.css'

export type PillTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'violet'
  | 'skeleton'

const TONE_CLASS: Record<PillTone, string> = {
  neutral: 'pill--neutral',
  primary: 'pill--primary',
  success: 'pill--success',
  warning: 'pill--warning',
  destructive: 'pill--destructive',
  violet: 'pill--violet',
  skeleton: 'pill--skeleton',
}

/** The 16px status icon every status badge leads with: shape by tone, colour from the badge. */
export function PillIcon({ tone }: { tone: PillTone }) {
  const body = tone === 'success' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>
    : tone === 'warning' ? <><path d="M12 4 21 19H3Z" /><path d="M12 10v4M12 16.5h.01" /></>
    : tone === 'destructive' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>
    : tone === 'primary' || tone === 'violet' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>
    : <circle cx="12" cy="12" r="8" />
  return (
    <svg className="pill-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{body}</svg>
  )
}

export interface PillProps extends AriaAttributes {
  tone: PillTone
  /** Leading 16px status icon. Default true (status badges carry one); pass false for
   *  plain labels (counts, source tags, ages) that are not a status. */
  dot?: boolean
  className?: string
  /** Inline style passthrough (skeleton shells, min-width, layout dims). */
  style?: CSSProperties
  children: ReactNode
}

export function Pill({ tone, dot = true, className, style, children, ...rest }: PillProps) {
  return (
    <span
      className={`pill ${TONE_CLASS[tone]}${className ? ` ${className}` : ''}`}
      style={style}
      {...rest}
    >
      {dot && tone !== 'skeleton' && <PillIcon tone={tone} />}
      {children}
    </span>
  )
}
