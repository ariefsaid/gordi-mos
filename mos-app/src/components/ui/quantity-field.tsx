import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { formatQuantityInput, parseQuantityInput } from '@/lib/quantity-parser'
import type { QuantityParseReason } from '@/lib/quantity-parser'
import './quantity-field.css'

interface QuantityFieldProps {
  id?: string
  label: string
  value: number
  onChange: (value: number) => void
  onInvalid?: (reason: QuantityParseReason) => void
  onValidityChange?: (valid: boolean) => void
  onBlur?: (valid: boolean) => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  resetKey?: number
  integerOnly?: boolean
  min?: number
  max?: number
  maxIntegerDigits?: number
  maxFractionDigits?: number
  step?: 'any' | number
  placeholder?: string
  className?: string
  errorClassName?: string
  disabled?: boolean
  busy?: boolean
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send'
  touchTarget?: boolean
}

function locale(): string {
  return document.documentElement.lang || 'en'
}

export function QuantityField({
  id,
  label,
  value,
  onChange,
  onInvalid,
  onValidityChange,
  onBlur,
  onKeyDown,
  resetKey,
  integerOnly = false,
  min = 0,
  max,
  maxIntegerDigits = 10,
  maxFractionDigits = 3,
  step = 'any',
  placeholder,
  className,
  errorClassName,
  disabled = false,
  busy = false,
  enterKeyHint,
  touchTarget = false,
}: QuantityFieldProps) {
  const t = useT()
  const generatedErrorId = useId()
  const [draft, setDraft] = useState(() => formatQuantityInput(value, locale(), maxFractionDigits))
  const [error, setError] = useState<QuantityParseReason | null>(null)
  const [errorVisible, setErrorVisible] = useState(false)
  const focused = useRef(false)
  const latestValue = useRef(value)
  const latestMaxFractionDigits = useRef(maxFractionDigits)
  latestValue.current = value
  latestMaxFractionDigits.current = maxFractionDigits
  const errorId = `${id ?? generatedErrorId}-quantity-error`
  const parseOptions = { integerOnly, min, max, maxIntegerDigits, maxFractionDigits }

  useEffect(() => {
    if (!focused.current) setDraft(formatQuantityInput(value, locale(), maxFractionDigits))
  }, [value, maxFractionDigits])

  const lastResetKey = useRef(resetKey)
  useEffect(() => {
    if (Object.is(lastResetKey.current, resetKey)) return
    lastResetKey.current = resetKey
    setDraft(formatQuantityInput(latestValue.current, locale(), latestMaxFractionDigits.current))
    setError(null)
    setErrorVisible(false)
  }, [resetKey]) // resetKey is an explicit cancel signal; refs keep this effect inert on edits.

  function handleChange(raw: string) {
    setDraft(raw)
    const parsed = parseQuantityInput(raw, parseOptions)
    if (parsed.kind === 'empty') {
      setError(null)
      setErrorVisible(false)
      onValidityChange?.(true)
      onChange(0)
      return
    }
    if (parsed.kind === 'valid') {
      setError(null)
      setErrorVisible(false)
      onValidityChange?.(true)
      onChange(parsed.value)
      return
    }
    setError(parsed.reason)
    setErrorVisible(!focused.current)
    onValidityChange?.(false)
    onInvalid?.(parsed.reason)
  }

  function handleBlur() {
    focused.current = false
    const parsed = parseQuantityInput(draft, parseOptions)
    const valid = parsed.kind === 'empty' || parsed.kind === 'valid'
    if (parsed.kind === 'valid') {
      setError(null)
      setErrorVisible(false)
      setDraft(formatQuantityInput(parsed.value, locale(), maxFractionDigits))
    } else if (parsed.kind === 'empty') {
      setError(null)
      setErrorVisible(false)
      setDraft('')
    } else {
      setError(parsed.reason)
      setErrorVisible(true)
      onInvalid?.(parsed.reason)
    }
    onValidityChange?.(valid)
    onBlur?.(valid)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event)
    if (event.defaultPrevented || disabled || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    const parsed = parseQuantityInput(draft, parseOptions)
    const current = parsed.kind === 'valid' ? parsed.value : min
    const increment = typeof step === 'number' ? step : 1
    const next = Math.max(min, current + (event.key === 'ArrowUp' ? increment : -increment))
    if (max !== undefined && next > max) return
    event.preventDefault()
    setError(null)
    setErrorVisible(false)
    setDraft(formatQuantityInput(next, locale(), maxFractionDigits))
    onValidityChange?.(true)
    onChange(next)
  }

  const currentParse = parseQuantityInput(draft, parseOptions)
  const ariaValue = currentParse.kind === 'valid' ? currentParse.value : undefined
  const message = errorVisible && error === 'integer'
    ? t('quantityField.error.whole')
    : errorVisible && error
      ? t('quantityField.error.invalid')
      : undefined

  return (
    <div className="quantity-field">
      <input
        id={id}
        type="text"
        role="spinbutton"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={ariaValue}
        aria-invalid={Boolean(message) || undefined}
        aria-busy={busy || undefined}
        aria-describedby={message ? errorId : undefined}
        className={className}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        enterKeyHint={enterKeyHint}
        data-touch-target={touchTarget ? 'true' : undefined}
        onFocus={() => { focused.current = true; setErrorVisible(false) }}
        onChange={event => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {message && (
        <p id={errorId} className={`quantity-field-error${errorClassName ? ` ${errorClassName}` : ''}`} role="alert">
          {message}
        </p>
      )}
    </div>
  )
}
