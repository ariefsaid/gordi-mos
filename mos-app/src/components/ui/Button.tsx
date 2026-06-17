// Button — the ONE button primitive (IXD-4, PR-2; DESIGN.md §5).
// 32px, 8px radius, 13/600. variant → primary | outline | ghost | destructive.
// For <Link>/<a> use the same `.btn .btn-{variant}` classes directly (Button.css
// is imported globally in main.tsx so class-based usages resolve).
import type { ButtonHTMLAttributes } from 'react'
import './Button.css'

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'destructive'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  destructive: 'btn-destructive',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'outline', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn ${VARIANT_CLASS[variant]}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}
