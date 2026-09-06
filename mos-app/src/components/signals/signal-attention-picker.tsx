import { useEffect, useRef, useState } from 'react'
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
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !pickerRef.current?.contains(event.target)) {
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
      {open && (
        <div role="menu" aria-label={t('signals.attention.label')} className="signal-attention-popover">
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
        </div>
      )}
    </div>
  )
}
