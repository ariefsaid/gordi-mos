import type { CSSProperties, ReactNode } from 'react'
import './Tag.css'

/**
 * Tag — soft tinted pill from the mos-design-kit 30-color palette
 * (display/Tag.jsx). Unlike `Pill`, Tag has no leading dot — use the `Icon`
 * slot for a marker. Use Tag for categorical labels; use `Pill` for status
 * (which keeps the AA-darkened text + dot convention).
 *
 * The 30 colors are backed by `--ds-tag-background-{color}` + `--ds-tag-text-{color}`
 * tokens (ported in Issue 1) that flip in dark mode.
 */
export type TagColor =
  | 'gray' | 'mauve' | 'slate' | 'sage' | 'olive' | 'sand'
  | 'tomato' | 'red' | 'ruby' | 'crimson' | 'pink' | 'plum' | 'purple'
  | 'violet' | 'iris' | 'cyan' | 'turquoise' | 'sky' | 'blue'
  | 'jade' | 'green' | 'grass' | 'mint' | 'lime'
  | 'bronze' | 'gold' | 'brown' | 'orange' | 'amber' | 'yellow'

export interface TagProps {
  /** Palette color (maps to --ds-tag-background/text-{color}). */
  color?: TagColor
  /** Regular (default) or medium (600) weight. */
  weight?: 'regular' | 'medium'
  /** Optional leading icon (14px). */
  Icon?: ReactNode
  className?: string
  style?: CSSProperties
  children: ReactNode
}

export function Tag({
  color = 'gray',
  weight = 'regular',
  Icon,
  className,
  style,
  children,
}: TagProps) {
  const inline: CSSProperties = {
    background: `var(--ds-tag-background-${color})`,
    color: `var(--ds-tag-text-${color})`,
    ...style,
  }
  const cls = ['mk-tag', weight === 'medium' ? 'mk-tag--medium' : null, className]
    .filter(Boolean).join(' ')
  return (
    <span className={cls} style={inline}>
      {Icon != null && <span className="mk-tag__icon">{Icon}</span>}
      <span>{children}</span>
    </span>
  )
}
