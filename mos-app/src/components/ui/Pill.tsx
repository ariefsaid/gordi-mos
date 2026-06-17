// Pill — the ONE status/state/source/progress pill primitive (VIS-4/5/6, PR-2).
// Single shell: height 22, padding 0 9px, 6px radius, 8px leading dot, 12/600.
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

export interface PillProps extends AriaAttributes {
  tone: PillTone
  /** Leading colored dot. Default true (most pills carry one); pass false for the
   *  dotless neutral source badges (Ops non-tinted business units). */
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
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  )
}
