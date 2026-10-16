import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import './TextInput.css'

/**
 * TextInput — label + box(input) + leading icon (mos-design-kit inputs/TextInput.jsx).
 * 32px box, 8px radius. Error → danger border + danger focus ring. Disabled → secondary bg.
 * No size prop (single 32px). No help-text slot (add a sibling element if needed).
 */
export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  Icon?: ReactNode
  /** A control after the field, inside the box (e.g. a show/hide toggle). It sets its own square size. */
  trailing?: ReactNode
  error?: boolean
  fullWidth?: boolean
  /** Shows the app's one required mark (a decorative "*") after the label; pair it with `required`. */
  requiredMark?: boolean
}

export function TextInput({
  label,
  Icon,
  trailing,
  error = false,
  fullWidth = false,
  requiredMark = false,
  id,
  className,
  disabled,
  ...rest
}: TextInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const cls = [
    'mk-textinput',
    error ? 'mk-textinput--error' : null,
    fullWidth ? 'mk-textinput--full' : null,
    disabled ? 'mk-textinput--disabled' : null,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      {label && <label className="mk-textinput__label" htmlFor={inputId}>{label}{requiredMark ? <span aria-hidden="true"> *</span> : null}</label>}
      <div className="mk-textinput__box">
        {Icon != null && <span className="mk-textinput__icon">{Icon}</span>}
        <input
          id={inputId}
          className="mk-textinput__field"
          disabled={disabled}
          aria-invalid={error || undefined}
          {...rest}
        />
        {trailing != null && <span className="mk-textinput__trailing">{trailing}</span>}
      </div>
    </div>
  )
}
