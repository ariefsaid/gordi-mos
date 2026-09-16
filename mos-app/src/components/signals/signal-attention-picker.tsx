import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { useListboxPopover } from '@/components/ui/use-listbox-popover'
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
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown) }
  }, [open])

  return (
    <div className="signal-attention-picker" ref={rootRef}>
      <span className="signal-attention-picker-label" aria-hidden="true">{groupLabel}</span>
      <button
        id={id}
        type="button"
        className="signal-attention-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={`${groupLabel}: ${attentionLabel(t, value)}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className={`signal-attention signal-attention--${attentionSlug(value)}`}>
          {attentionLabel(t, value)}
        </span>
        <span className="signal-attention-picker-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && <div
        {...listboxProps}
        id={listboxId}
        aria-label={groupLabel}
        className="signal-attention-picker-options"
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
          </button>
        ))}
      </div>}
    </div>
  )
}
