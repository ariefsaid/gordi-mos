import { useCallback, type KeyboardEvent } from 'react'
import './Checkbox.css'

/**
 * Checkbox — custom checkbox with check/indeterminate glyphs (mos-design-kit
 * inputs/Checkbox.jsx). medium 16 / small 14, 4px radius. `role="checkbox"`,
 * `aria-checked`, keyboard Space/Enter. Checked/indeterminate → primary fill.
 *
 * Uncontrolled-friendly: parent owns `checked`/`indeterminate` and `onChange`.
 */
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
  const ariaChecked = indeterminate ? 'mixed' : checked ? 'true' : 'false'

  const toggle = useCallback(() => {
    if (disabled || indeterminate) return
    onChange?.(!checked)
  }, [disabled, indeterminate, checked, onChange])

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      toggle()
    }
  }, [toggle])

  const cls = ['mk-checkbox', `mk-checkbox--${size}`, className].filter(Boolean).join(' ')

  return (
    <span
      role="checkbox"
      id={id}
      className={cls}
      aria-checked={ariaChecked}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={toggle}
      onKeyDown={onKeyDown}
    >
      {checked && !indeterminate && <Check />}
      {indeterminate && <Dash />}
    </span>
  )
}
