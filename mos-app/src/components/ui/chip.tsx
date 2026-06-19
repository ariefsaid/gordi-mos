import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { Avatar } from './avatar'
import './Chip.css'

/**
 * Chip — leading avatar/icon + label, transparent bg (mos-design-kit display/Chip.jsx).
 * Truncates the label with ellipsis. Clickable chips underline the label on hover.
 * Use for person/entity chips; use `Tag` for categorical color labels.
 */
export interface ChipProps {
  label: ReactNode
  avatarUrl?: string
  /** Seed for the avatar's seeded-pastel initials. */
  avatarColor?: string
  avatarType?: 'squared' | 'rounded'
  Icon?: ReactNode
  clickable?: boolean
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  className?: string
  style?: CSSProperties
}

export function Chip({
  label,
  avatarUrl,
  avatarColor,
  avatarType = 'squared',
  Icon,
  clickable = false,
  onClick,
  className,
  style,
}: ChipProps) {
  const cls = ['mk-chip', clickable ? 'mk-chip--clickable' : null, className]
    .filter(Boolean).join(' ')
  const lead = avatarUrl || avatarColor
    ? <Avatar avatarUrl={avatarUrl} placeholder={typeof label === 'string' ? label : undefined} size="sm" type={avatarType} backgroundColor={avatarColor} />
    : Icon != null ? <span className="mk-chip__icon">{Icon}</span> : null

  if (clickable) {
    return (
      <button type="button" className={cls} style={style} onClick={onClick}>
        {lead}
        <span className="mk-chip__label">{label}</span>
      </button>
    )
  }
  return (
    <span className={cls} style={style}>
      {lead}
      <span className="mk-chip__label">{label}</span>
    </span>
  )
}
