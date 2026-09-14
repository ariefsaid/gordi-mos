import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEventHandler,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { useListboxPopover } from './use-listbox-popover'
import { usePopoverReflow } from './use-popover-reflow'
import './Select.css'

/**
 * Select — a designed combobox/listbox with a hidden native form bridge.
 *
 * The visible trigger owns the keyboard, focus, and popup experience. The native select remains
 * in the form so existing `name`, `required`, `form`, controlled/uncontrolled, and native-shaped
 * `onChange` callers keep their contract without exposing the browser's own popup chrome.
 */
/**
 * Form-facing props retain the native select value/change contract, while pointer, focus, and
 * keyboard callbacks describe the visible button they are attached to. The forwarded ref likewise
 * points at that button. `multiple` is intentionally excluded: this is a single-choice popup.
 */
export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'size' | 'multiple' | 'onBlur' | 'onFocus' | 'onKeyDown' | 'onKeyUp' | 'onClick' | 'onMouseDown' | 'onMouseUp'
> {
  label?: string
  error?: boolean
  fullWidth?: boolean
  onBlur?: FocusEventHandler<HTMLButtonElement>
  onFocus?: FocusEventHandler<HTMLButtonElement>
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
  onKeyUp?: KeyboardEventHandler<HTMLButtonElement>
  onClick?: MouseEventHandler<HTMLButtonElement>
  onMouseDown?: MouseEventHandler<HTMLButtonElement>
  onMouseUp?: MouseEventHandler<HTMLButtonElement>
}

type ParsedOption = {
  value: string
  label: string
  disabled: boolean
  selected: boolean
}

type OptionElementProps = {
  value?: unknown
  label?: unknown
  disabled?: boolean
  selected?: boolean
  children?: ReactNode
}

function optionText(children: ReactNode): string {
  let text = ''
  Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      text += String(child)
    } else if (isValidElement(child)) {
      text += optionText((child.props as OptionElementProps).children)
    }
  })
  return text
}

function parseOptions(children: ReactNode, groupDisabled = false): ParsedOption[] {
  const parsed: ParsedOption[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const props = child.props as OptionElementProps
    if (child.type === 'option') {
      const label = optionText(props.children)
      parsed.push({
        value: props.value == null ? label : String(props.value),
        label,
        disabled: groupDisabled || Boolean(props.disabled),
        selected: Boolean(props.selected),
      })
      return
    }
    if (child.type === 'optgroup') {
      parseOptions(props.children, groupDisabled || Boolean(props.disabled)).forEach((option) => parsed.push(option))
      return
    }
    if (child.type === Fragment) parseOptions(props.children, groupDisabled).forEach((option) => parsed.push(option))
  })
  return parsed
}

function normalizeValue(value: SelectProps['value'] | SelectProps['defaultValue']): string {
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : ''
  return value == null ? '' : String(value)
}

function initialValue(
  value: SelectProps['value'],
  defaultValue: SelectProps['defaultValue'],
  options: readonly ParsedOption[],
): string {
  if (value !== undefined) return normalizeValue(value)
  if (defaultValue !== undefined) return normalizeValue(defaultValue)
  return options.find((option) => option.selected)?.value ?? options[0]?.value ?? ''
}

function optionIsDisabled(options: readonly ParsedOption[], index: number): boolean {
  return Boolean(options[index]?.disabled)
}

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    label,
    error = false,
    fullWidth = false,
    id,
    className,
    disabled = false,
    autoFocus = false,
    required = false,
    value,
    defaultValue,
    children,
    onChange,
    onBlur,
    onFocus,
    onKeyDown,
    onKeyUp,
    onClick,
    onMouseDown,
    onMouseUp,
    style,
    tabIndex,
    ...rest
  },
  ref,
) {
  const autoId = useId()
  const selectId = id ?? autoId
  const menuId = `${selectId}-listbox`
  const nativeRef = useRef<HTMLSelectElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', time: 0 })
  const controlled = value !== undefined
  const options = useMemo(() => parseOptions(children), [children])
  const [uncontrolledValue, setUncontrolledValue] = useState(() => initialValue(value, defaultValue, options))
  const selectedValue = controlled ? normalizeValue(value) : uncontrolledValue
  const selectedIndex = options.findIndex((option) => option.value === selectedValue)
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex]?.label : undefined
  const restRecord = rest as Record<string, unknown>
  const accessibleLabel = restRecord['aria-label'] as string | undefined
  const labelledBy = restRecord['aria-labelledby'] as string | undefined
  const describedBy = restRecord['aria-describedby'] as string | undefined
  const errorMessage = restRecord['aria-errormessage'] as string | undefined
  const userInvalid = restRecord['aria-invalid']
  const userRequired = restRecord['aria-required']
  const dataAttributes = Object.fromEntries(
    Object.entries(rest).filter(([key]) => key.startsWith('data-') || key.startsWith('aria-') || key === 'title'),
  )
  const nativeRest = { ...rest } as Record<string, unknown>
  Object.keys(nativeRest).forEach((key) => {
    if (key.startsWith('data-') || key.startsWith('aria-') || key === 'title') delete nativeRest[key]
  })
  const [open, setOpen] = useState(false)
  const [associatedLabel, setAssociatedLabel] = useState<string>()

  // Callers may keep the field label outside this component (`<label htmlFor=...>`). Discover it
  // after commit so the portaled listbox has the same accessible name as the trigger without
  // requiring every consumer to duplicate an aria-label.
  useLayoutEffect(() => {
    if (label || accessibleLabel || labelledBy) return
    const externalLabel = Array.from(document.querySelectorAll('label'))
      .find((candidate) => candidate.htmlFor === selectId)
    const nextLabel = externalLabel?.textContent?.trim() || undefined
    setAssociatedLabel((current) => current === nextLabel ? current : nextLabel)
  }, [accessibleLabel, label, labelledBy, selectId])

  const isDisabled = useCallback((index: number) => optionIsDisabled(options, index), [options])
  const firstEnabled = useCallback(() => options.findIndex((option) => !option.disabled), [options])
  const selectActiveIndex = useCallback(() => {
    if (selectedIndex >= 0 && !isDisabled(selectedIndex)) return selectedIndex
    return firstEnabled()
  }, [firstEnabled, isDisabled, selectedIndex])

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  const selectIndex = useCallback((index: number) => {
    const option = options[index]
    if (!option || option.disabled || disabled) return
    if (!controlled) setUncontrolledValue(option.value)
    if (nativeRef.current && nativeRef.current.value !== option.value) {
      setNativeSelectValue(nativeRef.current, option.value)
    }
    close(true)
  }, [close, controlled, disabled, options])

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
    onClose: () => close(true),
    manageFocus: false,
  })

  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 })
  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const gap = 6
    const margin = 12
    const viewportWidth = Math.max(window.innerWidth, margin * 2)
    const width = Math.min(Math.max(rect.width, 220), viewportWidth - margin * 2)
    const below = window.innerHeight - rect.bottom - margin - gap
    const above = rect.top - margin - gap
    const contentHeight = Math.min(320, Math.max(44, options.length * 44 + 12))
    const flip = below < contentHeight && above > below
    const maxHeight = Math.max(44, Math.min(contentHeight, flip ? above : below))
    setPosition({
      top: flip ? rect.top - gap - maxHeight : rect.bottom + gap,
      left: Math.max(margin, Math.min(rect.left, viewportWidth - width - margin)),
      width,
      maxHeight,
    })
  }, [options.length])

  useLayoutEffect(() => {
    if (!open) return
    setActiveIndex(selectActiveIndex())
    place()
  }, [open, place, selectActiveIndex, setActiveIndex])
  usePopoverReflow(open, place)

  useLayoutEffect(() => {
    if (controlled || !nativeRef.current) return
    if (nativeRef.current.value !== uncontrolledValue) setUncontrolledValue(nativeRef.current.value)
  }, [children, controlled, uncontrolledValue])

  // A native form reset changes the hidden bridge without emitting `change`, so mirror its
  // default option back into the visible trigger. The reset event fires before the browser resets
  // controls; `defaultSelected` is stable for both explicit `defaultValue` and the ordinary
  // first-option default.
  useEffect(() => {
    if (controlled) return
    const select = nativeRef.current
    const form = select?.form
    if (!form) return
    const handleReset = () => {
      const defaultOption = Array.from(select.options).find((option) => option.defaultSelected)
      setUncontrolledValue(defaultOption?.value ?? select.options[0]?.value ?? '')
    }
    form.addEventListener('reset', handleReset)
    return () => form.removeEventListener('reset', handleReset)
  }, [controlled, children])

  const setMenuRef = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node
    listboxProps.ref(node)
  }, [listboxProps])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        close(false)
      }
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [close, open])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, open, optionId])

  const openSelect = useCallback(() => {
    if (disabled || open) return
    setActiveIndex(selectActiveIndex())
    setOpen(true)
  }, [disabled, open, selectActiveIndex, setActiveIndex])

  const toggleSelect = useCallback(() => {
    if (disabled) return
    if (open) close(true)
    else openSelect()
  }, [close, disabled, open, openSelect])

  const handleBridgeChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    if (!controlled) setUncontrolledValue(event.target.value)
    onChange?.(event)
  }, [controlled, onChange])

  const handleTypeahead = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!open || event.key.length !== 1 || event.key === ' ' || event.ctrlKey || event.metaKey || event.altKey || options.length === 0) return
    const now = Date.now()
    const repeated = now - typed.current.time < 700 ? typed.current.text + event.key : event.key
    typed.current = { text: repeated, time: now }
    const query = repeated.toLocaleLowerCase()
    const search = [...query].every((character) => character === query[0]) ? query[0] : query
    const start = search.length === 1 ? activeIndex + 1 : Math.max(0, activeIndex)
    for (let offset = 0; offset < options.length; offset += 1) {
      const index = (Math.max(0, start) + offset) % options.length
      if (!options[index]?.disabled && options[index]?.label.toLocaleLowerCase().startsWith(search)) {
        setActiveIndex(index)
        event.preventDefault()
        break
      }
    }
  }, [activeIndex, open, options, setActiveIndex])

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || disabled) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) openSelect()
      else listboxProps.onKeyDown(event)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) openSelect()
      else listboxProps.onKeyDown(event)
      return
    }
    if (open) {
      listboxProps.onKeyDown(event)
      if (!event.defaultPrevented) handleTypeahead(event)
    }
  }

  const handleTriggerBlur = (event: FocusEvent<HTMLButtonElement>) => {
    if (open && !(event.relatedTarget instanceof Node && menuRef.current?.contains(event.relatedTarget))) close(false)
    onBlur?.(event)
  }

  const rootClassName = [
    'mk-select',
    error ? 'mk-select--error' : null,
    fullWidth ? 'mk-select--full' : null,
    disabled ? 'mk-select--disabled' : null,
    className,
  ].filter(Boolean).join(' ')
  const triggerLabel = accessibleLabel ?? label ?? associatedLabel
  const triggerAriaInvalid = error || (userInvalid as boolean | 'false' | 'grammar' | 'spelling' | 'true' | undefined) || undefined
  const triggerAriaRequired = required || (userRequired as boolean | 'false' | 'true' | undefined) || undefined

  return (
    <div className={rootClassName}>
      {label && <label className="mk-select__label" htmlFor={selectId}>{label}</label>}
      <div className="mk-select__box">
        <button
          {...dataAttributes}
          ref={(node) => {
            triggerRef.current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) ref.current = node
          }}
          id={selectId}
          type="button"
          role="combobox"
          aria-label={accessibleLabel ?? associatedLabel}
          aria-labelledby={labelledBy}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-describedby={describedBy}
          aria-errormessage={errorMessage}
          aria-invalid={triggerAriaInvalid}
          aria-required={triggerAriaRequired}
          className="mk-select__field"
          disabled={disabled}
          autoFocus={autoFocus}
          style={style}
          tabIndex={tabIndex}
          onBlur={handleTriggerBlur}
          onFocus={(event) => onFocus?.(event)}
          onClick={(event) => {
            onClick?.(event)
            if (!event.defaultPrevented) toggleSelect()
          }}
          onMouseDown={(event) => onMouseDown?.(event)}
          onMouseUp={(event) => onMouseUp?.(event)}
          onKeyDown={handleTriggerKeyDown}
          onKeyUp={(event) => onKeyUp?.(event)}
        >
          <span className={selectedLabel == null ? 'mk-select__placeholder' : undefined}>
            {selectedLabel ?? triggerLabel ?? ''}
          </span>
          <svg className="mk-select__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <select
          {...nativeRest}
          ref={nativeRef}
          id={`${selectId}-native`}
          data-select-native="true"
          className="mk-select__native"
          disabled={disabled}
          required={required}
          value={controlled ? value : undefined}
          defaultValue={!controlled ? defaultValue : undefined}
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleBridgeChange}
        >
          {children}
        </select>
      </div>
      {open && createPortal(
        <div
          {...listboxProps}
          ref={setMenuRef}
          id={menuId}
          aria-label={labelledBy ? undefined : triggerLabel}
          aria-labelledby={labelledBy}
          className="mk-select__menu"
          style={position}
          tabIndex={-1}
        >
          {options.map((option, index) => (
            <div
              {...getOptionProps(index)}
              key={`${option.value}-${index}`}
              aria-selected={option.value === selectedValue}
              aria-disabled={option.disabled || undefined}
              className="mk-select__option"
              onPointerMove={() => { if (!option.disabled) setActiveIndex(index) }}
              onClick={(event) => { event.stopPropagation(); selectIndex(index) }}
            >
              <span>{option.label}</span>
              {option.value === selectedValue && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
})
