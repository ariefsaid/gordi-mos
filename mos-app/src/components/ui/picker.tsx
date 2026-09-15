import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useListboxPopover } from './use-listbox-popover'
import { usePopoverReflow } from './use-popover-reflow'
import './Picker.css'

export interface PickerOption {
  value: string
  label: string
  disabled?: boolean
}

export type PickerCloseReason = 'escape' | 'outside' | 'tab' | 'select' | 'toggle'

export interface PickerProps {
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
  required?: boolean
  placeholder?: string
  /** Visible prefix for the trigger only; menu option labels stay concise. */
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
  const autoId = useId()
  const triggerId = id ?? autoId
  const menuId = `${triggerId}-listbox`
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', time: 0 })

  const isDisabled = useCallback((index: number) => Boolean(options[index]?.disabled), [options])
  const selectedIndex = options.findIndex((option) => option.value === value)

  const close = useCallback((reason: PickerCloseReason) => {
    setOpen(false)
    onOpenChange?.(false, reason)
  }, [onOpenChange])

  const selectIndex = useCallback((index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    close('select')
  }, [close, onChange, options])

  const {
    listboxProps,
    getOptionProps,
    activeIndex,
    setActiveIndex,
    optionId,
  } = useListboxPopover<HTMLDivElement>({
    itemCount: options.length,
    initialActive: Math.max(0, selectedIndex),
    isDisabled,
    onSelect: selectIndex,
    onClose: () => close('escape'),
  })

  const openPicker = useCallback(() => {
    if (disabled || busy || open) return
    triggerRef.current?.focus()
    setOpen(true)
    onOpenChange?.(true, undefined)
  }, [busy, disabled, onOpenChange, open])

  const togglePicker = useCallback(() => {
    if (disabled || busy) return
    if (open) close('toggle')
    else openPicker()
  }, [busy, close, disabled, open, openPicker])

  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 })
  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const gap = 6
    const margin = 12
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - margin * 2)
    const below = window.innerHeight - rect.bottom - margin - gap
    const above = rect.top - margin - gap
    const contentHeight = Math.min(320, Math.max(44, options.length * 44 + 12))
    const flip = below < contentHeight && above > below
    const maxHeight = Math.max(44, Math.min(contentHeight, flip ? above : below))
    setPosition({
      top: flip ? rect.top - gap - maxHeight : rect.bottom + gap,
      left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
      width,
      maxHeight,
    })
  }, [options.length])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])
  usePopoverReflow(open, place)

  const setMenuRef = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node
    listboxProps.ref(node)
  }, [listboxProps])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        close('outside')
      }
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [close, open])

  // The overlay host owns a native bubble-phase Escape listener. Because the menu is portaled out
  // of the field wrapper, a React stopPropagation alone would be too late; consume Escape at the
  // menu/trigger's native capture boundary so a picker can never close its record host by accident.
  useEffect(() => {
    const trigger = triggerRef.current
    const menu = open ? menuRef.current : null
    const consumeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (open) close('escape')
      else onOpenChange?.(false, 'escape')
    }
    trigger?.addEventListener('keydown', consumeEscape, true)
    menu?.addEventListener('keydown', consumeEscape, true)
    return () => {
      trigger?.removeEventListener('keydown', consumeEscape, true)
      menu?.removeEventListener('keydown', consumeEscape, true)
    }
  }, [close, onOpenChange, open])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, open, optionId])

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.key === 'Tab') {
      event.preventDefault()
      const controls = focusableElements(menuRef.current)
      const index = triggerRef.current ? controls.indexOf(triggerRef.current) : -1
      const next = controls[index + (event.shiftKey ? -1 : 1)]
      flushSync(() => close('tab'))
      ;(next ?? triggerRef.current)?.focus()
      return
    }

    listboxProps.onKeyDown(event)
    if (
      event.key.length !== 1
      || event.key === ' '
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || options.length === 0
    ) return

    const now = Date.now()
    const repeated = now - typed.current.time < 700
      ? typed.current.text + event.key
      : event.key
    typed.current = { text: repeated, time: now }
    const query = repeated.toLocaleLowerCase()
    const search = [...query].every((character) => character === query[0]) ? query[0] : query
    const start = search.length === 1 ? activeIndex + 1 : Math.max(0, activeIndex)
    for (let offset = 0; offset < options.length; offset += 1) {
      const index = (Math.max(0, start) + offset) % options.length
      if (!options[index].disabled && options[index].label.toLocaleLowerCase().startsWith(search)) {
        setActiveIndex(index)
        break
      }
    }
    event.preventDefault()
  }

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
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
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
        onClick={togglePicker}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            // Opening moves focus into the portal before native collection shortcuts run.
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
      {open && createPortal(
        <div
          {...listboxProps}
          ref={setMenuRef}
          id={menuId}
          aria-label={label}
          className={['picker__menu', menuClassName].filter(Boolean).join(' ')}
          style={position}
          onKeyDown={handleMenuKeyDown}
        >
          {options.map((option, index) => (
            <div
              {...getOptionProps(index)}
              key={option.value}
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              className={['picker__option', optionClassName].filter(Boolean).join(' ')}
              onPointerMove={() => { if (!option.disabled) setActiveIndex(index) }}
              onClick={(event) => { event.stopPropagation(); selectIndex(index) }}
            >
              <span>{option.label}</span>
              {option.value === value && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
