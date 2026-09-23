import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { useListboxPopover } from '@/components/ui/use-listbox-popover'
import { usePopoverReflow } from '@/components/ui/use-popover-reflow'
import { POPOVER_GAP_PX, shouldFlipUp, shouldPullIn } from './signal-attention-placement'
import { attentionLabel } from './signal-attention-label'
import { attentionSlug, type Attention } from '@/lib/db/signals.types'
import './signal-attention-picker.css'

const ATTENTIONS: readonly Attention[] = ['FYI', 'Needs attention', 'Urgent']
const MEANING_KEYS: Record<Attention, MessageKey> = {
  FYI: 'signals.attention.meaning.fyi',
  'Needs attention': 'signals.attention.meaning.needsAttention',
  Urgent: 'signals.attention.meaning.urgent',
}

export interface SignalAttentionPickerProps {
  id: string
  value: Attention
  onChange: (value: Attention) => void
  label?: string
}

export function SignalAttentionPicker({ id, value, onChange, label }: SignalAttentionPickerProps) {
  const t = useT()
  const groupLabel = label ?? t('signals.attention.label')
  const listboxId = `${id}-listbox`
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  // The menu is portaled to <body> and fixed-positioned in real viewport pixels (computed below),
  // never CSS-relative to the trigger — a relatively-positioned overlay inside a scrolling dialog
  // both risks landing off-surface and, once it receives focus, drags the dialog's own scroll
  // position to follow it.
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({ top: 0, left: 0 })
  const { listboxProps, getOptionProps, activeIndex, setActiveIndex } = useListboxPopover({
    itemCount: ATTENTIONS.length,
    initialActive: Math.max(ATTENTIONS.indexOf(value), 0),
    onSelect: (index) => {
      const next = ATTENTIONS[index]
      if (next) { onChange(next); setOpen(false) }
    },
    onClose: () => setOpen(false),
  })

  useEffect(() => {
    const selectedIndex = ATTENTIONS.indexOf(value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }, [setActiveIndex, value])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || optionsRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown) }
  }, [open])

  const measure = () => {
    const trigger = triggerRef.current
    const menu = optionsRef.current
    if (!trigger || !menu) return
    const triggerRect = trigger.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const up = shouldFlipUp(triggerRect.top, triggerRect.bottom, menuRect.height, 0, window.innerHeight)
    const pullIn = shouldPullIn(triggerRect.left, menuRect.width, window.innerWidth)
    setMenuStyle({
      position: 'fixed',
      ...(up
        ? { top: 'auto', bottom: window.innerHeight - triggerRect.top + POPOVER_GAP_PX }
        : { top: triggerRect.bottom + POPOVER_GAP_PX, bottom: 'auto' }),
      ...(pullIn
        ? { left: 'auto', right: window.innerWidth - triggerRect.right }
        : { left: triggerRect.left, right: 'auto' }),
    })
  }
  useLayoutEffect(() => { if (open) measure() }, [open])
  usePopoverReflow(open, measure)

  return (
    <div className="signal-attention-picker" ref={rootRef}>
      <span className="signal-attention-picker-label" aria-hidden="true">{groupLabel}</span>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`signal-attention-picker-trigger signal-attention-picker-trigger--${attentionSlug(value)}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={`${groupLabel}: ${attentionLabel(t, value)}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {attentionLabel(t, value)}
        <svg className="signal-attention-picker-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && createPortal(
        <div
          {...listboxProps}
          ref={(node) => { listboxProps.ref(node); optionsRef.current = node }}
          id={listboxId}
          aria-label={groupLabel}
          data-escape-layer="nested"
          className="signal-attention-picker-options"
          style={menuStyle}
        >
          {ATTENTIONS.map((attention, index) => (
            <button
              key={attention}
              type="button"
              {...getOptionProps(index)}
              tabIndex={-1}
              aria-selected={attention === value}
              className={`signal-attention-picker-option${index === activeIndex ? ' is-active' : ''}`}
              onClick={() => { setActiveIndex(index); onChange(attention); setOpen(false) }}
            >
              <span className={`signal-attention signal-attention--${attentionSlug(attention)}`}>
                {attentionLabel(t, attention)}
              </span>
              <span className="signal-attention-picker-meaning">
                {t(MEANING_KEYS[attention])}
              </span>
              {attention === value && (
                <svg className="signal-attention-picker-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
