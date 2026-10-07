import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import * as RadixSelect from '@radix-ui/react-select'
import './Select.css'

/**
 * Select — a designed combobox/listbox with a hidden native form bridge.
 *
 * Radix Select owns the trigger keyboard, typeahead, focus, and popup experience. The native select remains
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
  contentClassName?: string
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

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

// Radix items cannot carry an empty value, and option values are free text, so every option
// travels under its index; a value with no option maps to a non-numeric key no index can equal.
const NO_OPTION = 'none'
const encodeValue = (options: readonly ParsedOption[], value: string) => {
  const index = options.findIndex((option) => option.value === value)
  return index < 0 ? NO_OPTION : String(index)
}
const decodeValue = (options: readonly ParsedOption[], key: string) => options[Number(key)]?.value ?? ''

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    label,
    error = false,
    fullWidth = false,
    id,
    className,
    contentClassName,
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
  const nativeRef = useRef<HTMLSelectElement>(null)
  const menuOpen = useRef(false)
  const controlled = value !== undefined
  const options = useMemo(() => parseOptions(children), [children])
  const [uncontrolledValue, setUncontrolledValue] = useState(() => initialValue(value, defaultValue, options))
  const selectedValue = controlled ? normalizeValue(value) : uncontrolledValue
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label
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
  }, [accessibleLabel, children, label, labelledBy, selectId])

  const selectValue = (next: string) => {
    if (disabled) return
    if (!controlled) setUncontrolledValue(next)
    if (nativeRef.current && nativeRef.current.value !== next) {
      setNativeSelectValue(nativeRef.current, next)
    }
  }

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

  const handleBridgeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (!controlled) setUncontrolledValue(event.target.value)
    onChange?.(event)
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
        <RadixSelect.Root
          value={encodeValue(options, selectedValue)}
          onValueChange={(next) => selectValue(decodeValue(options, next))}
          disabled={disabled}
          onOpenChange={(next) => { menuOpen.current = next }}
        >
          <RadixSelect.Trigger
            {...dataAttributes}
            ref={ref}
            id={selectId}
            aria-label={accessibleLabel ?? associatedLabel}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-errormessage={errorMessage}
            aria-invalid={triggerAriaInvalid}
            aria-required={triggerAriaRequired}
            className="mk-select__field"
            autoFocus={autoFocus}
            style={style}
            tabIndex={tabIndex}
            // Focus moves into the open menu; that is not the field losing focus.
            onBlur={(event) => { if (!menuOpen.current) onBlur?.(event) }}
            onFocus={onFocus}
            onClick={onClick}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
          >
            <span className={selectedLabel == null ? 'mk-select__placeholder' : undefined}>
              {selectedLabel ?? triggerLabel ?? ''}
            </span>
            <svg className="mk-select__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </RadixSelect.Trigger>
          <RadixSelect.Portal>
            <RadixSelect.Content
              position="popper"
              side="bottom"
              align="start"
              sideOffset={6}
              collisionPadding={12}
              aria-label={labelledBy ? undefined : triggerLabel}
              aria-labelledby={labelledBy}
              className={['mk-select__menu', contentClassName].filter(Boolean).join(' ')}
              onEscapeKeyDown={(event) => event.stopPropagation()}
            >
              <RadixSelect.Viewport className="mk-select__viewport">
                {options.map((option, index) => {
                  // A disabled empty-value option is the placeholder prompt (the pattern every
                  // caller uses to hold "no choice yet" — e.g. cafe-stream-bar's "Choose stream…").
                  // It is not a choosable value, so the open list omits it entirely; the closed
                  // trigger still reads its label via `selectedLabel`.
                  if (option.disabled && option.value === '') return null
                  return (
                    <RadixSelect.Item
                      key={`${option.value}-${index}`}
                      value={String(index)}
                      disabled={option.disabled}
                      textValue={option.label}
                      className="mk-select__option"
                    >
                      <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                      <RadixSelect.ItemIndicator>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
                      </RadixSelect.ItemIndicator>
                    </RadixSelect.Item>
                  )
                })}
              </RadixSelect.Viewport>
            </RadixSelect.Content>
          </RadixSelect.Portal>
        </RadixSelect.Root>
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
    </div>
  )
})
