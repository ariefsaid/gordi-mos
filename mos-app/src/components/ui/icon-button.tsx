import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './IconButton.css'

/**
 * IconButton — square icon-only button (mos-design-kit inputs/IconButton.jsx).
 * Reuses the kit's variant × accent matrix. Always set `ariaLabel` — there is
 * no visible text, so the accessible name depends on it (WCAG 4.1.2).
 *
 * @variant secondary | tertiary | primary (default secondary)
 * @accent  default | danger (default default; primary+danger = solid red)
 * @size    medium (32px) | small (24px)
 */
export type IconButtonVariant = 'secondary' | 'tertiary' | 'primary'
export type IconButtonAccent = 'default' | 'danger'
export type IconButtonSize = 'medium' | 'small'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name — REQUIRED (no visible label). */
  ariaLabel: string
  /** Icon node (16px recommended for medium, 14px for small). */
  children: ReactNode
  variant?: IconButtonVariant
  accent?: IconButtonAccent
  size?: IconButtonSize
}

export function IconButton({
  ariaLabel,
  children,
  variant = 'secondary',
  accent = 'default',
  size = 'medium',
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  const cls = [
    'mk-iconbtn',
    `mk-iconbtn--${variant}`,
    `mk-accent--${accent}`,
    size === 'small' ? 'mk-iconbtn--small' : null,
    className,
  ].filter(Boolean).join(' ')
  return (
    <button type={type} aria-label={ariaLabel} className={cls} {...rest}>
      {children}
    </button>
  )
}
