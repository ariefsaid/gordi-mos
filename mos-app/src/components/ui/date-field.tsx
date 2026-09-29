import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { formatDayMonthYear } from '@/lib/format/date'
import './DateField.css'

/**
 * DateField — label + box(formatted display + native date input) (F2 fix, Task record
 * controls). A bare `<input type="date">` renders the OS/browser locale's own text
 * ("08/07/2026" — ambiguous day/month order) and its own calendar-icon chrome, clashing
 * with every other styled control on the page (mos-design-kit Select/TextInput box).
 *
 * DateField keeps the REAL native date input for picking (native calendar popup, full
 * keyboard segment editing, native a11y) but renders it invisible and stretched over a
 * token-styled box; the box shows the value via `formatDayMonthYear` ("22 Jul 2026" —
 * unambiguous) instead of the input's own locale text. Same 32px/8px box + chevron-slot
 * pattern as Select/TextInput; a call site scales the box height via its own wrapper class
 * (see `.tc-select`/`.record-field__select` for the same override pattern on Select).
 */
export interface DateFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type' | 'value' | 'onChange'> {
  label?: string
  /** ISO yyyy-mm-dd, or '' for no value — mirrors the native input's own value contract. */
  value: string
  onChange: (value: string) => void
  error?: boolean
  fullWidth?: boolean
  /** Shown in the display slot when value is ''. Defaults to an em dash. */
  placeholder?: string
}

function CalendarGlyph() {
  return (
    <svg className="mk-date__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField(
  { label, value, onChange, error = false, fullWidth = false, id, className, disabled, placeholder, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const display = value ? formatDayMonthYear(value) : null
  const cls = [
    'mk-date',
    error ? 'mk-date--error' : null,
    fullWidth ? 'mk-date--full' : null,
    disabled ? 'mk-date--disabled' : null,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      {label && <label className="mk-date__label" htmlFor={inputId}>{label}</label>}
      <div className="mk-date__box">
        <span className="mk-date__display" data-empty={display ? undefined : 'true'}>
          {display ?? (placeholder ?? '—')}
        </span>
        <CalendarGlyph />
        <input
          ref={ref}
          id={inputId}
          type="date"
          className="mk-date__field"
          value={value}
          disabled={disabled}
          aria-invalid={error || undefined}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      </div>
    </div>
  )
})
