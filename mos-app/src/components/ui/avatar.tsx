import type { CSSProperties, ReactNode } from 'react'
import './Avatar.css'

/**
 * Avatar — image | seeded-pastel initials | icon (mos-design-kit display/Avatar.jsx).
 *
 * Seeded-pastel: when no avatarUrl is given, the placeholder string is hashed
 * deterministically to pick a color family from a 24-color pastel palette, then
 * rendered as `{fam}3` background + `{fam}11` text (both theme-aware via the
 * ported --ds-* tokens). Same input always yields the same color.
 *
 * Explicit `color`/`backgroundColor` (CSS colors) override the seed.
 */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type AvatarType = 'squared' | 'rounded'

const SIZE_PX: Record<AvatarSize, number> = { xs: 16, sm: 20, md: 24, lg: 32, xl: 48 }

// 24-color pastel palette (matches the kit's Avatar seed families).
const PALETTE = [
  'blue', 'iris', 'violet', 'purple', 'plum', 'pink',
  'red', 'tomato', 'orange', 'amber', 'grass', 'green',
  'jade', 'turquoise', 'cyan', 'sky', 'bronze', 'gold',
  'mauve', 'slate', 'sage', 'olive', 'sand', 'gray',
] as const

/** Deterministic hash → palette index. Stable for the same input string. */
function seedFamily(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0
  }
  return PALETTE[h % PALETTE.length]
}

export interface AvatarProps {
  avatarUrl?: string
  /** Seed for the pastel initials (usually a name). Falls back to '' . */
  placeholder?: string
  size?: AvatarSize
  type?: AvatarType
  /** Explicit CSS color — overrides the seed text color. */
  color?: string
  /** Explicit CSS background — overrides the seed background. */
  backgroundColor?: string
  /** Fallback icon when no url AND no placeholder. */
  Icon?: ReactNode
  className?: string
  style?: CSSProperties
}

export function Avatar({
  avatarUrl,
  placeholder,
  size = 'md',
  type = 'squared',
  color,
  backgroundColor,
  Icon,
  className,
  style,
}: AvatarProps) {
  const px = SIZE_PX[size]
  const fam = seedFamily(placeholder ?? '')
  const seedBg = `var(--ds-color-${fam}3)`
  const seedText = `var(--ds-color-${fam}11)`
  const inline: CSSProperties = {
    width: px,
    height: px,
    fontSize: Math.max(8, Math.round(px * 0.42)),
    background: backgroundColor ?? (avatarUrl ? undefined : seedBg),
    color: color ?? (avatarUrl ? undefined : seedText),
    ...style,
  }
  const cls = ['mk-avatar', `mk-avatar--${type}`, className].filter(Boolean).join(' ')

  let content: ReactNode = null
  if (avatarUrl) {
    content = <img src={avatarUrl} alt="" />
  } else if (placeholder && placeholder.trim()) {
    content = placeholder.trim().charAt(0).toUpperCase()
  } else if (Icon != null) {
    content = Icon
  }

  return (
    <span className={cls} style={inline} aria-hidden={placeholder ? undefined : true}>
      {content}
    </span>
  )
}
