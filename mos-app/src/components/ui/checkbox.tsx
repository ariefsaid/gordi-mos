import { useLayoutEffect, useRef } from 'react'
import './Checkbox.css'

/** Checkbox control backed by a native input with a custom visual indicator. */
export type CheckboxSize = 'medium' | 'small'

export interface CheckboxProps {
  checked?: boolean
  indeterminate?: boolean
  disabled?: boolean
  size?: CheckboxSize
  onChange?: (next: boolean) => void
  'aria-label'?: string
  id?: string
  className?: string
}

const Check = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const Dash = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 8h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

export function Checkbox({
  checked = false,
  indeterminate = false,
  disabled = false,
  size = 'medium',
  onChange,
  'aria-label': ariaLabel,
  id,
  className,
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate
  }, [checked, indeterminate])
  const cls = ['mk-checkbox', `mk-checkbox--${size}`, className].filter(Boolean).join(' ')

  return (
    <span className={cls}>
      <input
        ref={inputRef}
        type="checkbox"
        id={id}
        className="mk-checkbox__input"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-checked={indeterminate ? 'mixed' : undefined}
        onChange={(event) => onChange?.(event.currentTarget.checked)}
      />
      <span className="mk-checkbox__visual" aria-hidden="true">
        {checked && !indeterminate && <Check />}
        {indeterminate && <Dash />}
      </span>
    </span>
  )
}
