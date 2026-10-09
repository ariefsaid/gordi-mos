import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { useT } from '@/i18n/use-t'
import { focusableWithin } from '@/lib/focusable'
import { isTypeaheadKey, nextTypeaheadMatch, useTypeaheadBuffer } from './typeahead'
import './Picker.css'

export type PickerOption = {
  value: string
  label: string
  disabled?: boolean
  // Heading for a run of consecutive options sharing it; options without one stay ungrouped.
  group?: string
}

export type PickerCloseReason = 'escape' | 'outside' | 'tab' | 'select' | 'toggle'

export type PickerProps = {
  id?: string
  label: string
  value: string
  options: readonly PickerOption[]
  onChange: (value: string) => void
  disabled?: boolean
  busy?: boolean
  error?: boolean
  fullWidth?: boolean
  hideLabel?: boolean
  autoFocus?: boolean
  // Mount with the menu already open — for editors mounted by the click/key that means "open".
  defaultOpen?: boolean
  required?: boolean
  placeholder?: string
  // Visible prefix for the trigger only; menu option labels stay concise.
  triggerPrefix?: string
  describedBy?: string
  className?: string
  triggerClassName?: string
  menuClassName?: string
  optionClassName?: string
  onOpenChange?: (open: boolean, reason?: PickerCloseReason) => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
  onBlur?: FocusEventHandler<HTMLButtonElement>
}

// cmdk replaces an empty item value with its text, so a '' placeholder option could never be the
// active item. Keys follow the option value (stable when options reorder); the prefix keeps the
// empty placeholder's key distinct from every real value.
const keyOf = (value: string) => (value === '' ? 'empty' : `v:${value}`)

export function Picker({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  busy = false,
  error = false,
  fullWidth = false,
  hideLabel = false,
  autoFocus = false,
  defaultOpen = false,
  required = false,
  placeholder,
  triggerPrefix,
  describedBy,
  className,
  triggerClassName,
  menuClassName,
  optionClassName,
  onOpenChange,
  onKeyDown,
  onBlur,
}: PickerProps) {
  const t = useT()
  const autoId = useId()
  const triggerId = id ?? autoId
  const [open, setOpen] = useState(defaultOpen)
  const initialActive = useCallback(() => {
    const selectable = options.filter((option) => !option.disabled)
    const current = selectable.find((option) => option.value === value) ?? selectable[0]
    return current ? keyOf(current.value) : ''
  }, [options, value])
  const [active, setActive] = useState(initialActive)
  const [search, setSearch] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Closed-trigger type-ahead (#1192): letters select the next matching option without opening,
  // exactly as a native select does — the shared grammar lives in ./typeahead.
  const typeahead = useTypeaheadBuffer()
  const closeReason = useRef<PickerCloseReason>('outside')
  const closedBy = useRef<PickerCloseReason>('outside')

  const close = useCallback((reason: PickerCloseReason) => {
    closedBy.current = reason
    setOpen(false)
    onOpenChange?.(false, reason)
  }, [onOpenChange])

  const openPicker = useCallback(() => {
    if (disabled || busy || open) return
    // #1192: opening always starts a fresh phrase — a live closed-trigger prefix must never
    // leak into the menu session or survive a quick dismiss → retype.
    typeahead.clear()
    setActive(initialActive())
    setSearch('')
    setOpen(true)
    onOpenChange?.(true, undefined)
  }, [busy, disabled, initialActive, onOpenChange, open, typeahead])

  const togglePicker = useCallback(() => {
    if (disabled || busy) return
    if (open) close('toggle')
    else openPicker()
  }, [busy, close, disabled, open, openPicker])

  // The overlay host owns a native bubble-phase Escape listener, so a closed trigger consumes
  // Escape at its capture boundary; the open menu does the same through Popover's Escape hook.
  useEffect(() => {
    const trigger = triggerRef.current
    const consumeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || open) return
      event.preventDefault()
      event.stopImmediatePropagation()
      onOpenChange?.(false, 'escape')
    }
    trigger?.addEventListener('keydown', consumeEscape, true)
    return () => trigger?.removeEventListener('keydown', consumeEscape, true)
  }, [onOpenChange, open])

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.key !== 'Tab') return
    event.preventDefault()
    const controls = focusableWithin(document.body).filter((node) => {
      const menu = menuRef.current
      return node !== menu && !menu?.contains(node)
    })
    const index = triggerRef.current ? controls.indexOf(triggerRef.current) : -1
    const next = controls[index + (event.shiftKey ? -1 : 1)]
    flushSync(() => close('tab'))
    ;(next ?? triggerRef.current)?.focus()
  }

  // Typed text ranks prefix matches first; hover never moves the highlight (disablePointerSelection).
  const filter = useCallback((optionKey: string, query: string) => {
    const text = options.find((option) => keyOf(option.value) === optionKey)?.label.toLocaleLowerCase() ?? ''
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return 1
    if (text.startsWith(needle)) return 1
    return text.includes(needle) ? 0.5 : 0
  }, [options])

  // Consecutive options sharing a `group` render under one heading; the list order is never changed.
  const optionRuns = options.reduce<{ group: string | undefined; options: PickerOption[] }[]>((runs, option) => {
    const last = runs[runs.length - 1]
    if (last && last.group === option.group) last.options.push(option)
    else runs.push({ group: option.group, options: [option] })
    return runs
  }, [])

  const filterLabel = t('ui.picker.filter', { label })
  const selectedLabel = options.find((option) => option.value === value)?.label
  const selectedValue = selectedLabel ?? placeholder ?? label
  const fullValue = triggerPrefix ? `${triggerPrefix}: ${selectedValue}` : selectedValue
  const rootClassName = [
    'picker',
    fullWidth ? 'picker--full' : null,
    error ? 'picker--error' : null,
    disabled || busy ? 'picker--disabled' : null,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={rootClassName}>
      {!hideLabel && <label className="picker__label" htmlFor={triggerId}>{label}</label>}
      <Popover.Root
        open={open}
        onOpenChange={(next) => { if (!next) close(closeReason.current); closeReason.current = 'outside' }}
      >
        <Popover.Trigger asChild>
          <button
            id={triggerId}
            ref={triggerRef}
            type="button"
            role="combobox"
            aria-label={label}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-describedby={describedBy}
            aria-invalid={error || undefined}
            aria-busy={busy || undefined}
            aria-required={required || undefined}
            className={['picker__trigger', triggerClassName].filter(Boolean).join(' ')}
            title={fullValue}
            data-full-value={fullValue}
            disabled={disabled || busy}
            autoFocus={autoFocus}
            onPointerDown={(event) => event.currentTarget.focus()}
            onBlur={onBlur}
            onClick={(event) => { event.preventDefault(); togglePicker() }}
            onKeyDown={(event) => {
              if (!open && isTypeaheadKey(event)) {
                // #1192: a closed trigger owns the printable keys its type-ahead handles —
                // consume them (preventDefault + stopPropagation) so they never bubble to a
                // window keyboard layer (Tasks: `n` must not open create, `j`/`k` must not
                // move the collection cursor).
                event.preventDefault()
                event.stopPropagation()
                const typingAhead = typeahead.peek() !== ''
                // A bare Space (no phrase in progress) opens the menu and never enters the
                // buffer; with a phrase live, Space extends it instead of opening.
                if (typingAhead || event.key !== ' ') {
                  const match = nextTypeaheadMatch(options, value, typeahead.push(event.key))
                  if (match !== undefined) onChange(match)
                }
                if (typingAhead && event.key === ' ') return
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                if (!open) openPicker()
              }
              onKeyDown?.(event)
            }}
          >
            <span
              className={!selectedLabel ? 'picker__placeholder' : undefined}
              title={fullValue}
              data-full-value={fullValue}
            >
              {fullValue}
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            ref={menuRef}
            aria-label={label}
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            data-escape-layer="nested"
            className={['picker__menu', menuClassName].filter(Boolean).join(' ')}
            onKeyDown={handleMenuKeyDown}
            onEscapeKeyDown={(event) => { closeReason.current = 'escape'; event.stopPropagation() }}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              if (closedBy.current !== 'tab' && closedBy.current !== 'outside') triggerRef.current?.focus()
            }}
          >
            <Command
              className="picker__command"
              label={filterLabel}
              filter={filter}
              value={active}
              onValueChange={setActive}
              disablePointerSelection
              loop
            >
              <Command.Input
                className="picker__search"
                placeholder={filterLabel}
                value={search}
                onValueChange={setSearch}
              />
              <Command.List className="picker__list" label={label}>
                <Command.Empty className="picker__empty">{t('ui.picker.noMatches')}</Command.Empty>
                {optionRuns.map((run, runIndex) => {
                  const items = run.options.map((option) => (
                    <Command.Item
                      key={keyOf(option.value)}
                      value={keyOf(option.value)}
                      disabled={option.disabled}
                      className={['picker__option', optionClassName].filter(Boolean).join(' ')}
                      data-checked={option.value === value || undefined}
                      onSelect={() => {
                        onChange(option.value)
                        close('select')
                      }}
                    >
                      <span className="picker__option-label">{option.label}</span>
                      {option.value === value && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
                    </Command.Item>
                  ))
                  return run.group === undefined
                    ? items
                    : <Command.Group key={`g${runIndex}:${run.group}`} heading={run.group} className="picker__group">{items}</Command.Group>
                })}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}

export type MultiPickerProps = {
  id?: string
  label: string
  values: readonly string[]
  options: readonly PickerOption[]
  onChange: (values: string[]) => void
  disabled?: boolean
  fullWidth?: boolean
  hideLabel?: boolean
  placeholder?: string
  footer?: ReactNode
  className?: string
  triggerClassName?: string
  menuClassName?: string
  optionClassName?: string
}

/** Searchable MOS multi-select for small, user-managed sets such as Café unit multiples. */
export function MultiPicker({
  id,
  label,
  values,
  options,
  onChange,
  disabled = false,
  fullWidth = false,
  hideLabel = false,
  placeholder,
  footer,
  className,
  triggerClassName,
  menuClassName,
  optionClassName,
}: MultiPickerProps) {
  const t = useT()
  const autoId = useId()
  const triggerId = id ?? autoId
  const selectedOptions = options.filter(option => values.includes(option.value))
  const selectedLabel = selectedOptions.map(option => option.label).join(', ')
  const triggerText = selectedLabel || placeholder || label
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const initialActive = useCallback(() => {
    const option = options.find(candidate => values.includes(candidate.value) && !candidate.disabled)
      ?? options.find(candidate => !candidate.disabled)
    return option ? keyOf(option.value) : ''
  }, [options, values])
  const [active, setActive] = useState(initialActive)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeReason = useRef<PickerCloseReason>('outside')

  const filter = useCallback((optionKey: string, query: string) => {
    const text = options.find(option => keyOf(option.value) === optionKey)?.label.toLocaleLowerCase() ?? ''
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return 1
    if (text.startsWith(needle)) return 1
    return text.includes(needle) ? 0.5 : 0
  }, [options])
  const filterLabel = t('ui.picker.filter', { label })
  const rootClassName = ['picker', fullWidth ? 'picker--full' : null, disabled ? 'picker--disabled' : null, className]
    .filter(Boolean).join(' ')

  function closePicker(reason: PickerCloseReason) {
    closeReason.current = reason
    setOpen(false)
  }

  return (
    <div className={rootClassName}>
      {!hideLabel && <label className="picker__label" htmlFor={triggerId}>{label}</label>}
      <Popover.Root open={open} onOpenChange={next => {
        setOpen(next)
        if (!next && closeReason.current !== 'tab' && closeReason.current !== 'outside') triggerRef.current?.focus()
        closeReason.current = 'outside'
      }}>
        <Popover.Trigger asChild>
          <button
            id={triggerId}
            ref={triggerRef}
            type="button"
            aria-label={label}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={['picker__trigger', triggerClassName].filter(Boolean).join(' ')}
            title={triggerText}
            data-full-value={triggerText}
            disabled={disabled}
            onPointerDown={event => event.currentTarget.focus()}
            onClick={event => {
              event.preventDefault()
              if (disabled) return
              if (open) closePicker('toggle')
              else {
                setActive(initialActive())
                setSearch('')
                setOpen(true)
              }
            }}
          >
            <span className={selectedLabel ? undefined : 'picker__placeholder'}>{triggerText}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            aria-label={label}
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            data-escape-layer="nested"
            className={['picker__menu', menuClassName].filter(Boolean).join(' ')}
            onEscapeKeyDown={event => { closeReason.current = 'escape'; event.stopPropagation() }}
            onCloseAutoFocus={event => {
              event.preventDefault()
              if (closeReason.current !== 'tab' && closeReason.current !== 'outside') triggerRef.current?.focus()
            }}
          >
            <Command
              className="picker__command"
              label={filterLabel}
              filter={filter}
              value={active}
              onValueChange={setActive}
              disablePointerSelection
              loop
            >
              <Command.Input
                className="picker__search"
                placeholder={filterLabel}
                value={search}
                onValueChange={setSearch}
                autoFocus
              />
              <Command.List className="picker__list" label={label} aria-multiselectable="true">
                <Command.Empty className="picker__empty">{t('ui.picker.noMatches')}</Command.Empty>
                {options.map(option => {
                  const checked = values.includes(option.value)
                  return (
                    <Command.Item
                      key={keyOf(option.value)}
                      value={keyOf(option.value)}
                      disabled={option.disabled}
                      aria-checked={checked}
                      className={['picker__option', optionClassName].filter(Boolean).join(' ')}
                      data-checked={checked || undefined}
                      onSelect={() => onChange(
                        checked ? values.filter(value => value !== option.value) : [...values, option.value],
                      )}
                    >
                      <span className="picker__option-label">{option.label}</span>
                      <span className="picker__multi-check" aria-hidden="true">
                        {checked && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 4 4L19 6" /></svg>}
                      </span>
                    </Command.Item>
                  )
                })}
              </Command.List>
            </Command>
            {footer && <div className="picker__multi-footer">{footer}</div>}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
