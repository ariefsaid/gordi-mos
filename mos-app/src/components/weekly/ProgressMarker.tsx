// ProgressMarker — token-based pill for update-line progress (§4 design-plan, AC-034, NFR-007).
// Two forms:
//   static  ProgressMarker        — display only (submitted-locked, review excerpts)
//   interactive ProgressMarkerPicker — button + listbox picker (draft editor)
// DISTINCT from task StatusPill: different vocabulary (Done/In progress/Blocked, no "Open").
import { useRef, useState, useEffect, useCallback } from 'react'
import type { ProgressMarker as ProgressMarkerType } from '../../lib/db/weeklyUpdates.types'
import './ProgressMarker.css'

// ── Token mapping (§4.2, ratified in design-plan) ───────────────────────────
const PROGRESS_CONFIG: Record<ProgressMarkerType, { cls: string; label: string }> = {
  done:        { cls: 'pm-done',        label: 'Done' },
  in_progress: { cls: 'pm-inprogress',  label: 'In progress' },
  blocked:     { cls: 'pm-blocked',     label: 'Blocked' },
}

const ALL_MARKERS: ProgressMarkerType[] = ['done', 'in_progress', 'blocked']

// ── Static (read-only) form ──────────────────────────────────────────────────
interface ProgressMarkerProps {
  progress: ProgressMarkerType
  className?: string
}

export function ProgressMarker({ progress, className = '' }: ProgressMarkerProps) {
  const { cls, label } = PROGRESS_CONFIG[progress]
  return (
    <span
      className={`pm-pill ${cls} ${className}`}
      aria-label={label}
    >
      <span className="pm-dot" aria-hidden="true" />
      {label}
    </span>
  )
}

// ── Interactive (picker) form ────────────────────────────────────────────────
interface ProgressMarkerPickerProps {
  progress: ProgressMarkerType
  onSelect: (value: ProgressMarkerType) => void
  disabled?: boolean
  /** Accessible label for the trigger button (default: "Change progress marker") */
  triggerLabel?: string
}

export function ProgressMarkerPicker({
  progress,
  onSelect,
  disabled = false,
  triggerLabel = 'Change progress marker',
}: ProgressMarkerPickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)

  const { cls, label } = PROGRESS_CONFIG[progress]

  // Close on outside click (§4.3 — Esc closes + returns focus)
  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      const anchor = triggerRef.current?.closest('.pm-picker-anchor')
      if (anchor && !anchor.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  // Focus first option when picker opens
  useEffect(() => {
    if (open && listboxRef.current) {
      const first = listboxRef.current.querySelector<HTMLButtonElement>('[role="option"]')
      first?.focus()
    }
  }, [open])

  const handleTriggerClick = useCallback(() => {
    if (!disabled) setOpen(v => !v)
  }, [disabled])

  const handleSelect = useCallback((value: ProgressMarkerType) => {
    onSelect(value)
    setOpen(false)
    // Return focus to trigger (§5.3 keyboard paths, §4.3)
    triggerRef.current?.focus()
  }, [onSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      triggerRef.current?.focus()
    }
    // ↑/↓ navigation among options
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const options = Array.from(
        listboxRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
      )
      const idx = options.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.key === 'ArrowDown'
        ? Math.min(idx + 1, options.length - 1)
        : Math.max(idx - 1, 0)
      options[next]?.focus()
    }
  }, [])

  if (disabled) {
    // In locked/static state degrade to static pill (no button)
    return <ProgressMarker progress={progress} />
  }

  return (
    <div className="pm-picker-anchor">
      <button
        ref={triggerRef}
        type="button"
        className={`pm-pill pm-trigger ${cls}`}
        aria-label={`${label} — ${triggerLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        onClick={handleTriggerClick}
      >
        <span className="pm-dot" aria-hidden="true" />
        {label}
      </button>

      {open && (
        <div
          ref={listboxRef}
          role="listbox"
          aria-label="Select progress marker"
          className="pm-picker"
          onKeyDown={handleKeyDown}
        >
          {ALL_MARKERS.map(m => {
            const cfg = PROGRESS_CONFIG[m]
            return (
              <button
                key={m}
                role="option"
                aria-selected={m === progress ? 'true' : 'false'}
                className="pm-option"
                type="button"
                onClick={() => handleSelect(m)}
              >
                {/* dot decorative, label is accessible name of this option */}
                <span className={`pm-dot ${cfg.cls.replace('pm-', 'pm-dot-')}`} aria-hidden="true" />
                {cfg.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
