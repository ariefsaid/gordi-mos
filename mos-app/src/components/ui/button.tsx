// Button — the ONE button primitive (IXD-4, PR-2; DESIGN.md §5).
// 32px, 8px radius, 13/600. variant → primary | outline | ghost | destructive.
// For <Link>/<a> use the same `.btn .btn-{variant}` classes directly (Button.css
// is imported globally in main.tsx so class-based usages resolve).
import type { ButtonHTMLAttributes, Ref } from 'react'
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
  // Ported for #192 (Tasks — collection-toolbar.tsx's disclosure trigger measures its own DOM
  // node). React 19 passes `ref` to a plain function component as an ordinary prop — no
  // `forwardRef` wrapper needed — but the prop must still be declared for the JSX types to admit
  // `<Button ref={...} />` at a call site.
  ref?: Ref<HTMLButtonElement>
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
