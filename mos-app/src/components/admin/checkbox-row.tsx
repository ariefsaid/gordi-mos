// Shared primitives for the admin dialog's checkbox-list pickers (PositionPicker, RevenueScopePicker).
// Extracts the one bit that was copied verbatim between them: the toggleable row (with the "Defect 3"
// whole-row click target) and the inline error block. Each picker still owns its own section shell +
// data shaping (PositionPicker = flat list; RevenueScopePicker = per-channel groups).

import { Checkbox } from '@/components/ui/checkbox'

export interface CheckboxRowProps {
  label: string
  checked: boolean
  /** Disabled while a write is in flight (fieldset busy). */
  disabled?: boolean
  onToggle: () => void
  /** Draw a top border — pass `index > 0` so rows within a bordered group are separated. */
  divider?: boolean
  /** Indent + lighter weight for a child row (a branch under its "Whole channel" parent). */
  indent?: boolean
  /** Stronger weight for a group-parent / select-all row. */
  emphasis?: boolean
}

/**
 * One checkbox row whose ENTIRE surface toggles (not just the 16px glyph). The glyph's wrapper stops
 * click propagation so a glyph click fires the toggle exactly once (via Checkbox onChange) and never
 * also bubbles to the row's onClick; a click on the label text fires the row onClick once. Disabled
 * rows no-op on both. Keyboard (Space/Enter) + aria-checked/disabled stay owned by the Checkbox.
 */
export function CheckboxRow({
  label,
  checked,
  disabled = false,
  onToggle,
  divider = false,
  indent = false,
  emphasis = false,
}: CheckboxRowProps) {
  return (
    <label
      className={`flex items-start gap-3 py-2.5 select-none ${indent ? 'pl-6 pr-3' : 'px-3'} ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent/60'
      }`}
      style={divider ? { borderTop: '1px solid var(--input)' } : undefined}
      onClick={() => {
        if (!disabled) onToggle()
      }}
    >
      <span className="mt-0.5" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={checked}
          disabled={disabled}
          onChange={() => !disabled && onToggle()}
          aria-label={label}
        />
      </span>
      <span
        className={`text-sm leading-tight ${emphasis ? 'font-semibold' : 'font-medium'}`}
        style={{ color: 'var(--foreground)' }}
      >
        {label}
      </span>
    </label>
  )
}

/** Inline error block shared by the pickers (destructive-tinted, role="alert"). Renders nothing when empty. */
export function PickerError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="mt-4 rounded-md px-3 py-2 text-sm"
      style={{
        background: 'color-mix(in srgb, var(--destructive) 10%, var(--card))',
        color: 'var(--destructive)',
        border: '1px solid color-mix(in srgb, var(--destructive) 30%, transparent)',
      }}
    >
      {message}
    </div>
  )
}
