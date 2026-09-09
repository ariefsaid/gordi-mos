import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useListboxPopover } from '@/components/ui/use-listbox-popover'
import { usePopoverReflow } from '@/components/ui/use-popover-reflow'
import './TaskFilterSelect.css'

type Option = { value: string; label: string }
type Props = { label: string; value: string; options: readonly Option[]; onChange: (value: string) => void }

export function TaskFilterSelect({ label, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  return (
    <div className="task-filter-select">
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className="task-filter-select__trigger"
        onClick={() => { trigger.current?.focus(); setOpen((current) => !current) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span>{options.find((option) => option.value === value)?.label ?? label}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && <FilterOptions id={id} label={label} value={value} options={options} trigger={trigger} onClose={() => setOpen(false)} onChange={onChange} />}
    </div>
  )
}

function FilterOptions({ id, label, value, options, trigger, onChange, onClose }: Props & {
  id: string
  trigger: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 })
  const typed = useRef({ text: '', time: 0 })
  const { listboxProps, getOptionProps, activeIndex, setActiveIndex, optionId } = useListboxPopover({
    itemCount: options.length,
    initialActive: Math.max(0, options.findIndex((option) => option.value === value)),
    onSelect: (index) => { onChange(options[index].value); onClose() },
    onClose,
  })
  const focusRef = listboxProps.ref
  const setPanelRef = useCallback((node: HTMLDivElement | null) => { panel.current = node; focusRef(node) }, [focusRef])
  const place = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    const gap = 6
    const margin = 12
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - margin * 2)
    const below = window.innerHeight - rect.bottom - margin - gap
    const above = rect.top - margin - gap
    const height = Math.min(320, options.length * 44 + 12)
    const flip = below < height && above > below
    const maxHeight = Math.max(44, Math.min(height, flip ? above : below))
    setPosition({
      top: flip ? rect.top - gap - maxHeight : rect.bottom + gap,
      left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
      width,
      maxHeight,
    })
  }, [trigger, options.length])
  useLayoutEffect(place, [place])
  usePopoverReflow(true, place)
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [onClose, trigger])
  useEffect(() => {
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, optionId])
  return createPortal(
    <div
      {...listboxProps}
      ref={setPanelRef}
      id={id}
      aria-label={label}
      className="task-filter-select__menu"
      style={position}
      onKeyDown={(event) => {
        event.stopPropagation()
        // The portal lives at the end of body; Tab must follow the trigger’s document order.
        if (event.key === 'Tab') {
          event.preventDefault()
          const controls = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'))
            .filter((node) => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden], [inert]') && !panel.current?.contains(node) && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden')
          const index = trigger.current ? controls.indexOf(trigger.current) : -1
          const next = controls[index + (event.shiftKey ? -1 : 1)]
          flushSync(onClose)
          ;(next ?? trigger.current)?.focus()
          return
        }
        listboxProps.onKeyDown(event)
        if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const now = Date.now()
          typed.current = { text: now - typed.current.time < 700 ? typed.current.text + event.key : event.key, time: now }
          const query = typed.current.text.toLocaleLowerCase()
          const text = [...query].every((character) => character === query[0]) ? query[0] : query
          const start = text.length === 1 ? activeIndex + 1 : activeIndex
          for (let offset = 0; offset < options.length; offset++) {
            const index = (Math.max(0, start) + offset) % options.length
            if (options[index].label.toLocaleLowerCase().startsWith(text)) { setActiveIndex(index); break }
          }
          event.preventDefault()
        }
      }}
    >
      {options.map((option, index) => (
        <div
          {...getOptionProps(index)}
          key={option.value}
          aria-selected={option.value === value}
          className="task-filter-select__option"
          onPointerMove={() => setActiveIndex(index)}
          onClick={() => { onChange(option.value); onClose() }}
        >
          <span>{option.label}</span>
          {option.value === value && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
        </div>
      ))}
    </div>, document.body,
  )
}
