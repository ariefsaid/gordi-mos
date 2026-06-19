import { useCallback, type KeyboardEvent } from 'react'
import './Toggle.css'

/**
 * Toggle — switch control (mos-design-kit inputs/Toggle.jsx).
 * medium 28×16 / small 22×14. `role="switch"`, `aria-checked`, keyboard
 * Space/Enter. off → secondary bg, on → primary bg, knob → primary surface.
 */
export type ToggleSize = 'medium' | 'small'

export interface ToggleProps {
  value?: boolean
  disabled?: boolean
  size?: ToggleSize
  onChange?: (next: boolean) => void
  'aria-label'?: string
  id?: string
  className?: string
}

export function Toggle({
  value = false,
  disabled = false,
  size = 'medium',
  onChange,
  'aria-label': ariaLabel,
  id,
  className,
}: ToggleProps) {
  const toggle = useCallback(() => {
    if (disabled) return
    onChange?.(!value)
  }, [disabled, value, onChange])

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      toggle()
    }
  }, [toggle])

  const cls = ['mk-toggle', `mk-toggle--${size}`, className].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      role="switch"
      id={id}
      className={cls}
      aria-checked={value}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      disabled={disabled}
      onClick={toggle}
      onKeyDown={onKeyDown}
    >
      <span className="mk-toggle__knob" aria-hidden="true" />
    </button>
  )
}
