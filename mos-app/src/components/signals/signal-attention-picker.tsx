import { useT } from '@/i18n/use-t'
import { attentionLabel } from './signal-attention-label'
import { type Attention } from '@/lib/db/signals.types'
import './signal-attention-picker.css'

const ATTENTIONS: readonly Attention[] = ['FYI', 'Needs attention', 'Urgent']

export interface SignalAttentionPickerProps {
  value: Attention
  onChange: (value: Attention) => void
  label?: string
}

export function SignalAttentionPicker({ value, onChange, label }: SignalAttentionPickerProps) {
  const t = useT()
  const groupLabel = label ?? t('signals.attention.label')
  return (
    <div className="signal-attention-picker">
      <span className="signal-attention-picker-label">{groupLabel}</span>
      <div role="radiogroup" aria-label={groupLabel} className="signal-attention-picker-options">
        {ATTENTIONS.map((attention) => (
          <button
            key={attention}
            type="button"
            role="radio"
            aria-checked={attention === value}
            className={`signal-attention-picker-option signal-attention-picker-option--${attention.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={() => onChange(attention)}
          >
            {attentionLabel(t, attention)}
          </button>
        ))}
      </div>
    </div>
  )
}
