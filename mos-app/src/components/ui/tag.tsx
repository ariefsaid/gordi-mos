import type { CSSProperties, ReactNode } from 'react'
import './Tag.css'

/**
 * Tag — a categorical label (role, type, source). Status uses `Pill`/StatusBadge.
 * Colour names keep their call sites; each resolves to one of five semantic tones
 * (neutral, blue, red, amber, green) and a tone never carries meaning by colour alone.
 */
export type TagColor =
  | 'gray' | 'mauve' | 'slate' | 'sage' | 'olive' | 'sand'
  | 'tomato' | 'red' | 'ruby' | 'crimson' | 'pink' | 'plum' | 'purple'
  | 'violet' | 'iris' | 'cyan' | 'turquoise' | 'sky' | 'blue'
  | 'jade' | 'green' | 'grass' | 'mint' | 'lime'
  | 'bronze' | 'gold' | 'brown' | 'orange' | 'amber' | 'yellow'

type TagTone = 'neutral' | 'blue' | 'red' | 'amber' | 'green'

const TONE: Record<TagColor, TagTone> = {
  gray: 'neutral', mauve: 'neutral', slate: 'neutral', sage: 'neutral', olive: 'neutral', sand: 'neutral',
  tomato: 'red', red: 'red', ruby: 'red', crimson: 'red', pink: 'red',
  plum: 'blue', purple: 'blue', violet: 'blue', iris: 'blue', cyan: 'blue', turquoise: 'blue', sky: 'blue', blue: 'blue',
  jade: 'green', green: 'green', grass: 'green', mint: 'green', lime: 'green',
  bronze: 'amber', gold: 'amber', brown: 'amber', orange: 'amber', amber: 'amber', yellow: 'amber',
}

export interface TagProps {
  color?: TagColor
  /** Regular (default) or medium (600) weight. */
  weight?: 'regular' | 'medium'
  /** Optional leading icon (16px). */
  Icon?: ReactNode
  className?: string
  style?: CSSProperties
  children: ReactNode
}

export function Tag({ color = 'gray', weight = 'regular', Icon, className, style, children }: TagProps) {
  const cls = ['mk-tag', `mk-tag--${TONE[color]}`, weight === 'medium' ? 'mk-tag--medium' : null, className]
    .filter(Boolean).join(' ')
  return (
    <span className={cls} style={style}>
      {Icon != null && <span className="mk-tag__icon">{Icon}</span>}
      <span>{children}</span>
    </span>
  )
}
