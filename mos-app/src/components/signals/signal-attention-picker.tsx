import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { attentionLabel } from './signal-attention-label'
import { type Attention } from '@/lib/db/signals.types'
import './signal-attention-picker.css'

const ATTENTIONS: readonly Attention[] = ['FYI', 'Needs attention', 'Urgent']

export interface SignalAttentionPickerProps {
  value: Attention
  onChange: (value: Attention) => void
}

export function SignalAttentionPicker({ value, onChange }: SignalAttentionPickerProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popoverPosition, setPopoverPosition] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    if (!open) return
    const positionPopover = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const width = popoverRef.current?.getBoundingClientRect().width ?? 220
      setPopoverPosition({
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        top: rect.bottom + 4,
      })
    }
    positionPopover()
    window.addEventListener('resize', positionPopover)
    window.addEventListener('scroll', positionPopover, true)
    return () => { window.removeEventListener('resize', positionPopover); window.removeEventListener('scroll', positionPopover, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || (!pickerRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target))) {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeEscape, true)
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', closeEscape, true) }
  }, [open])
  return (
    <div ref={pickerRef} className="signal-attention-picker">
      <button ref={triggerRef}
        type="button"
        className={`signal-composer-pill signal-attention-pill signal-attention-pill--${value.toLowerCase().replace(/\s+/g, '-')}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {attentionLabel(t, value)} {t('signals.attention.caret')}
      </button>
      {open && createPortal(
        <div ref={popoverRef} role="menu" aria-label={t('signals.attention.label')} className="signal-attention-popover" style={popoverPosition}>
          {ATTENTIONS.map((attention) => (
            <button
              type="button"
              role="menuitem"
              key={attention}
              className="signal-attention-choice"
              onClick={() => { onChange(attention); setOpen(false); triggerRef.current?.focus() }}
            >
              <strong>{attentionLabel(t, attention)}</strong>
              <span>{t(attention === 'FYI' ? 'signals.attention.meaning.fyi' : attention === 'Urgent' ? 'signals.attention.meaning.urgent' : 'signals.attention.meaning.needs-attention')}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
