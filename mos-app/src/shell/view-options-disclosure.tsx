import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Chevron } from './icons'
import { useViewOptionsKeyboard } from './view-options-keyboard'

export interface ViewOptionsDisclosureProps {
  open: boolean
  onToggle: () => void
  onClose?: () => void
  label: string
  summary?: string
  panelId: string
  className?: string
  triggerClassName?: string
  summaryClassName?: string
  chevronClassName?: string
  panelClassName?: string
  children: ReactNode
}

export function ViewOptionsDisclosure({
  open, onToggle, onClose, label, summary, panelId, className, triggerClassName,
  summaryClassName, chevronClassName, panelClassName, children,
}: ViewOptionsDisclosureProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const onPanelKeyDown = useViewOptionsKeyboard(open, panelRef)
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!open || event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    ;(onClose ?? onToggle)()
    triggerRef.current?.focus()
  }
  const chevronCls = chevronClassName
    ? `${chevronClassName}${open ? ` ${chevronClassName}--open` : ''}`
    : undefined
  return (
    <div className={className}>
      <button type="button" ref={triggerRef} className={triggerClassName} aria-expanded={open}
        aria-controls={panelId} onClick={onToggle} onKeyDown={onKeyDown}>
        <span>{label}</span>
        {summary != null && <span className={summaryClassName} aria-hidden="true">{summary}</span>}
        <Chevron className={chevronCls} />
      </button>
      {open && <div id={panelId} ref={panelRef} className={panelClassName}
        onKeyDown={(event) => { onPanelKeyDown(event); onKeyDown(event) }}>
        {children}
      </div>}
    </div>
  )
}
