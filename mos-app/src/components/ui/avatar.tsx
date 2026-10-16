import { useState, type CSSProperties, type ReactNode } from 'react'
import './Avatar.css'

/**
 * Avatar — image | initials | icon. Initials sit in ink on the band fill in both themes
 * (never white-on-white); a photo keeps the initials as its fallback.
 * Explicit `color`/`backgroundColor` (CSS colors) override the defaults.
 */
type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
type AvatarType = 'squared' | 'rounded'

const SIZE_PX: Record<AvatarSize, number> = { xs: 16, sm: 20, md: 24, lg: 32, xl: 48 }

export interface AvatarProps {
  avatarUrl?: string
  /** Seed for the pastel initials (usually a name). Falls back to '' . */
  placeholder?: string
  size?: AvatarSize
  type?: AvatarType
  // Letters shown from the name: 1 (first word) or 2 (first + last word).
  initials?: 1 | 2
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
  initials = 1,
  color,
  backgroundColor,
  Icon,
  className,
  style,
}: AvatarProps) {
  // #359: a broken avatarUrl used to render as an empty box — the browser's broken-image
  // glyph on a bare span. On error, fall back to the seeded initial, same as no-url.
  // Review finding on #443: a boolean never resets when the url PROP changes, so one failed
  // image pinned the initial forever on a reconciled instance. Track WHICH url failed instead.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const px = SIZE_PX[size]
  const showImg = Boolean(avatarUrl) && failedUrl !== avatarUrl
  const inline: CSSProperties = {
    width: px,
    height: px,
    fontSize: px >= 48 ? 'var(--mos-size-3)' : 'var(--mos-size-1)',
    background: backgroundColor,
    color,
    ...style,
  }
  const cls = ['mk-avatar', `mk-avatar--${type}`, className].filter(Boolean).join(' ')

  let content: ReactNode = null
  if (showImg) {
    content = <img src={avatarUrl} alt="" onError={() => setFailedUrl(avatarUrl ?? null)} />
  } else if (placeholder && placeholder.trim()) {
    const words = placeholder.trim().split(/\s+/)
    const letters = initials === 2 && words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0][0]
    content = letters.toUpperCase()
  } else if (Icon != null) {
    content = Icon
  }

  return (
    <span className={cls} style={inline} aria-hidden={placeholder ? undefined : true}>
      {content}
    </span>
  )
}
