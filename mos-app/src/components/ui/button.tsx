// Button — the ONE button primitive (IXD-4, PR-2; DESIGN.md §5).
// 32px, 8px radius, 13/600. variant → primary | outline | ghost | destructive.
// For <Link>/<a> use the same `.btn .btn-{variant}` classes directly (Button.css
// is imported globally in main.tsx so class-based usages resolve).
import { forwardRef, type ButtonHTMLAttributes } from 'react'
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

// Ref-forwarding, because a popover trigger has to be measurable and re-focusable by the hook that
// owns its listbox (the collection toolbar's disclosure, the Signal category/mention pickers). The
// alternative every caller would otherwise reach for is a bare <button> beside this one, which is
// how a second button grammar starts.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`btn ${VARIANT_CLASS[variant]}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
})
