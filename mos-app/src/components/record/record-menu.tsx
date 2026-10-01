// RecordMenu — the record header's ⋯ overflow menu (DESIGN: record-page §5).
//
// Props
//   items   RecordMenuItem[]  { id, label, onSelect, destructive?, separatorBefore?, disabled? }
//   label   string            accessible name of the trigger and the menu
//   minItems number = 2       renders nothing below this count (a one-item menu is a button's job)
//
// The popover renders in a portal (it escapes the panel's overflow clip), anchors to the trigger,
// moves with its trigger on scroll and resize, closes on Escape / outside click / Tab and returns focus to the trigger, moves with the
// arrow keys, Home/End and type-ahead. A destructive item is text in the lost tone, never a fill.
import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useMenuPopover } from '@/lib/use-menu-popover'
import { usePopoverReflow } from '@/components/ui/use-popover-reflow'
import './record-page.css'

export interface RecordMenuItem {
  id: string
  label: string
  onSelect: () => void
  destructive?: boolean
  separatorBefore?: boolean
  disabled?: boolean
}

export interface RecordMenuProps {
  items: readonly RecordMenuItem[]
  label: string
  minItems?: number
}

export function RecordMenu({ items, label, minItems = 2 }: RecordMenuProps) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])
  const place = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setAnchor({ top: rect.bottom + 4, right: Math.max(8, document.documentElement.clientWidth - rect.right) })
  }, [])
  useMenuPopover(open, close, menuRef, triggerRef)
  // Scrolling or resizing moves the menu with its trigger; it never drops focus by closing.
  usePopoverReflow(open, place)
  useLayoutEffect(() => { if (open) place() }, [open, place])

  if (items.length < minItems) return null

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Tab leaves the menu: it closes and focus goes back to the trigger, so the next Tab moves on from there.
    if (event.key === 'Tab') { setOpen(false); triggerRef.current?.focus(); return }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
    const now = Date.now()
    typed.current = { text: (now - typed.current.at > 600 ? '' : typed.current.text) + event.key.toLowerCase(), at: now }
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const start = nodes.indexOf(document.activeElement as HTMLElement)
    const ordered = [...nodes.slice(start + 1), ...nodes.slice(0, start + 1)]
    ordered.find((node) => (node.textContent ?? '').trim().toLowerCase().startsWith(typed.current.text))?.focus()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="rp-icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className="rp-menu"
          data-escape-layer="nested"
          style={anchor ? { top: anchor.top, right: anchor.right } : { visibility: 'hidden' }}
          onKeyDown={onKeyDown}
        >
          {items.map((item) => (
            <div key={item.id} className="rp-menu__entry">
              {item.separatorBefore ? <div role="separator" className="rp-menu__separator" /> : null}
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                className={`rp-menu__item${item.destructive ? ' rp-menu__item--destructive' : ''}`}
                onClick={() => { setOpen(false); triggerRef.current?.focus(); item.onSelect() }}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  )
}
