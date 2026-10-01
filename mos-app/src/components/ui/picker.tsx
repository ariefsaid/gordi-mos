import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { flushSync } from 'react-dom'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { isTypeaheadKey, nextTypeaheadMatch, useTypeaheadBuffer } from './typeahead'
import { useT } from '@/i18n/use-t'
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

function focusableElements(exclude: HTMLElement | null) {
  return Array.from(document.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]',
  )).filter((node) => {
    if (node === exclude || exclude?.contains(node)) return false
    if (node.tabIndex < 0 || node.matches(':disabled,[hidden],[inert]')) return false
    const style = getComputedStyle(node)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
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
    setActive(initialActive())
    setSearch('')
    setOpen(true)
    onOpenChange?.(true, undefined)
  }, [busy, disabled, initialActive, onOpenChange, open])

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
    const controls = focusableElements(menuRef.current)
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
            onBlur={onBlur}
            onClick={(event) => { event.preventDefault(); togglePicker() }}
            onKeyDown={(event) => {
              if (!open && isTypeaheadKey(event)) {
                const typingAhead = typeahead.peek() !== ''
                const match = nextTypeaheadMatch(options, value, typeahead.push(event.key))
                if (match !== undefined) onChange(match)
                // While a type-ahead is in progress a space extends the phrase, never opens.
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
              label={t('ui.picker.filter', { label })}
              filter={filter}
              value={active}
              onValueChange={setActive}
              disablePointerSelection
              loop
            >
              <Command.Input
                className="picker__search"
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
