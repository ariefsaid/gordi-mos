import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { useT } from '@/i18n/use-t'
import { formatDayMonthYear } from '@/lib/format/date'
import { maskDayFirst, parseDayFirst, toDayFirst } from '@/lib/format/date-entry'
import './DateField.css'

/**
 * DateField — the ONE date-entry control (#1191). Typed entry is day-first (dd/mm/yyyy)
 * whatever the browser's locale order, so 05/10/2026 is 5 October, never 10 May. A bare
 * `<input type="date">` takes its segment order from the OS locale and shows nothing the person
 * can check against the app's own "5 Oct 2026" display.
 *
 * A text input holds the draft: it shows "5 Oct 2026" at rest and "05/10/2026" while editing,
 * with the format as a hint and the parsed date echoed back as you type. A complete real date
 * is reported through `onChange` as ISO yyyy-mm-dd (the stored shape never changes). An
 * impossible, partial, or out-of-range value is NEVER reported and never shifted: the field
 * shows an error and tells the host through `onValidityChange`, so a save-on-blur or submit host
 * can refuse to commit. A real native date input sits under the calendar glyph for picking; it
 * emits unambiguous ISO, so picking cannot swap day and month.
 */
export interface DateFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type' | 'value' | 'onChange' | 'min' | 'max' | 'inputMode' | 'maxLength'> {
  label?: string
  /** ISO yyyy-mm-dd, or '' for no value. */
  value: string
  // A resumable composer must also retain unfinished typed dates.
  draftText?: string
  onDraftTextChange?: (text: string) => void
  /** Fires with a complete real ISO date, or '' when the field is emptied. Never with a guess. */
  onChange: (value: string) => void
  /** True while the typed text is not a usable date (partial, impossible, out of range, or empty
   *  when `required`). Save-on-blur and submit hosts gate their commit on it. */
  onValidityChange?: (invalid: boolean) => void
  /** Inclusive ISO bounds; a typed date outside them is rejected visibly. */
  min?: string
  max?: string
  error?: boolean
  fullWidth?: boolean
  /** Dense hosts (table cells, filter bars): no inline hint, narrower chrome. */
  compact?: boolean
  /** The host tried to commit: flag an unfinished value now instead of waiting for the next blur. */
  reveal?: boolean
  /** Shown when value is '' and the field is not focused. Defaults to an em dash. */
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
  {
    label, value, draftText, onDraftTextChange, onChange, onValidityChange, min, max, error = false, fullWidth = false, compact = false, reveal = false,
    id, className, disabled, placeholder, required, onFocus, onBlur, 'aria-describedby': describedBy, ...rest
  },
  ref,
) {
  const t = useT()
  const autoId = useId()
  const inputId = id ?? autoId
  const messageId = `${inputId}-msg`
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

  const [localText, setLocalText] = useState(() => toDayFirst(value))
  const text = draftText ?? localText
  const setText = (next: string) => { setLocalText(next); onDraftTextChange?.(next) }
  const [focused, setFocused] = useState(Boolean(rest.autoFocus))
  // Set on blur, cleared by the next edit: an unfinished value is flagged when you leave it,
  // not while you are still typing it.
  const [leftIt, setLeftIt] = useState(false)

  const entry = parseDayFirst(text)
  const outOfRange = entry.kind === 'ok' && ((min !== undefined && entry.iso < min) || (max !== undefined && entry.iso > max))
  const typedIso = entry.kind === 'ok' ? entry.iso : entry.kind === 'empty' ? '' : null

  // An outside change (parent rollback, record reload) replaces the text; the echo of our own
  // onChange does not, and neither does a draft the host has not seen.
  const [seenValue, setSeenValue] = useState(value)
  if (value !== seenValue) {
    setSeenValue(value)
    if (typedIso !== value) setLocalText(toDayFirst(value))
  }

  const problem: 'format' | 'impossible' | 'range' | 'required' | null =
    entry.kind === 'format' ? 'format'
    : entry.kind === 'impossible' ? 'impossible'
    : outOfRange ? 'range'
    : entry.kind === 'empty' && required ? 'required'
    : null
  const invalid = problem !== null
  // A real-looking but wrong date is flagged at once; a missing or unfinished one on leaving.
  const showProblem = problem === 'impossible' || problem === 'range' || (problem !== null && (leftIt || reveal))

  const onValidityRef = useRef(onValidityChange)
  onValidityRef.current = onValidityChange
  useEffect(() => { onValidityRef.current?.(invalid) }, [invalid])

  // Entering the field selects its text so typing replaces the date instead of appending to it.
  useLayoutEffect(() => {
    if (focused && text !== '') inputRef.current?.select()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on gaining focus
  }, [focused])

  function edit(raw: string, grew: boolean) {
    const next = grew ? maskDayFirst(raw) : raw
    setText(next)
    setLeftIt(false)
    const parsed = parseDayFirst(next)
    if (parsed.kind === 'empty') {
      if (value !== '') onChange('')
    } else if (parsed.kind === 'ok' && !(min !== undefined && parsed.iso < min) && !(max !== undefined && parsed.iso > max)) {
      if (parsed.iso !== value) onChange(parsed.iso)
    }
  }

  function onType(e: ChangeEvent<HTMLInputElement>) {
    edit(e.target.value.replace(/\/{2,}/g, '/'), e.target.value.length > text.length)
  }

  function pick(iso: string) {
    setText(toDayFirst(iso))
    setLeftIt(false)
    if (iso !== value) onChange(iso)
    inputRef.current?.focus()
  }

  const shown = focused || typedIso === null || outOfRange ? text : typedIso === '' ? '' : formatDayMonthYear(typedIso)
  const hint = focused && !compact && !showProblem && text !== ''
    ? entry.kind === 'ok' && !outOfRange ? formatDayMonthYear(entry.iso) : t('dateField.format')
    : null
  const message = problem === 'impossible' ? t('dateField.error.impossible')
    : problem === 'range' ? t('dateField.error.range')
    : problem === 'required' ? t('dateField.error.required')
    : t('dateField.error.format')
  const describedById = showProblem || hint ? messageId : undefined
  const cls = [
    'mk-date',
    error || showProblem ? 'mk-date--error' : null,
    fullWidth ? 'mk-date--full' : null,
    compact ? 'mk-date--compact' : null,
    disabled ? 'mk-date--disabled' : null,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      {label && <label className="mk-date__label" htmlFor={inputId}>{label}</label>}
      <div className="mk-date__box">
        <input
          {...rest}
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          className="mk-date__field"
          value={shown}
          placeholder={focused ? t('dateField.format') : (placeholder ?? '—')}
          disabled={disabled}
          aria-required={required || undefined}
          aria-invalid={error || showProblem || undefined}
          aria-describedby={[describedBy, describedById].filter(Boolean).join(' ') || undefined}
          onChange={onType}
          onFocus={(e) => { setFocused(true); onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); setLeftIt(true); onBlur?.(e) }}
        />
        {hint && <span id={messageId} className="mk-date__hint">{hint}</span>}
        <span className="mk-date__cal">
          <CalendarGlyph />
          <input
            type="date"
            className="mk-date__picker"
            tabIndex={0}
            aria-label={t('dateField.openCalendar')}
            value={entry.kind === 'ok' ? entry.iso : ''}
            min={min}
            max={max}
            disabled={disabled || rest.readOnly}
            // Keep focus in the text input: a blur here would commit a save-on-blur host mid-pick.
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { try { e.currentTarget.showPicker() } catch { /* the native control still opens on its own */ } }}
            onChange={(e) => (e.target.value === '' ? edit('', false) : pick(e.target.value))}
          />
        </span>
      </div>
      {showProblem && <span id={messageId} className="mk-date__error" role="alert">{message}</span>}
    </div>
  )
})
