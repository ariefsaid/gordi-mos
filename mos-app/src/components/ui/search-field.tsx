// SearchField — the one search box (UX-STANDARD CT1): a visible label above, a magnifier, an example
// placeholder. Café, Money, Work, Admin and Inbox all render this; none draws its own.
import { useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import './SearchField.css'

export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  /** Visible label above the box, e.g. "Search tasks". */
  label: string
  /** Example text inside the box, e.g. "Title, person or team". */
  placeholder?: string
  value: string
  onChange: (value: string) => void
  className?: string
  /** Shares the label's line, right-aligned (a result count on a phone); wraps under the label when it does not fit. */
  labelEnd?: ReactNode
}

export function SearchField({ label, placeholder, value, onChange, className, id, labelEnd, ...rest }: SearchFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className={`search-field${className ? ` ${className}` : ''}`}>
      {labelEnd
        ? <div className="search-field__head"><label className="search-field__label" htmlFor={inputId}>{label}</label>{labelEnd}</div>
        : <label className="search-field__label" htmlFor={inputId}>{label}</label>}
      <span className="search-field__box">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          {...rest}
          ref={inputRef}
          id={inputId}
          type="search"
          title={placeholder}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {value ? (
          <button type="button" className="search-field__clear" aria-label={t('common.clearSearch')} onClick={() => { onChange(''); inputRef.current?.focus() }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        ) : null}
      </span>
    </div>
  )
}
