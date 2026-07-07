import { useId, type SelectHTMLAttributes } from 'react'
import './Select.css'

/**
 * Select — label + box(select) + chevron-down glyph.
 * 32px box, 8px radius. Wraps a native <select> (appearance: none).
 * Error → destructive border. Disabled → secondary bg. No size prop (single 32px).
 */
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string
  error?: boolean
  fullWidth?: boolean
}

export function Select({
  label,
  error = false,
  fullWidth = false,
  id,
  className,
  disabled,
  children,
  ...rest
}: SelectProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  const cls = [
    'mk-select',
    error ? 'mk-select--error' : null,
    fullWidth ? 'mk-select--full' : null,
    disabled ? 'mk-select--disabled' : null,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      {label && <label className="mk-select__label" htmlFor={selectId}>{label}</label>}
      <div className="mk-select__box">
        <select
          id={selectId}
          className="mk-select__field"
          disabled={disabled}
          aria-invalid={error || undefined}
          {...rest}
        >
          {children}
        </select>
        <span className="mk-select__chevron" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </span>
      </div>
    </div>
  )
}