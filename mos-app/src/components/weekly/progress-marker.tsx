// ProgressMarker — token-based pill for update-line progress (§4 design-plan, AC-034, NFR-007).
// Two forms:
//   static  ProgressMarker        — display only (submitted-locked, review excerpts)
//   interactive ProgressMarkerPicker — button + listbox picker (draft editor)
// DISTINCT from task StatusPill: different vocabulary (Done/In progress/Blocked, no "Open").
//
// VIS-4/5/6 (PR-2): re-skinned onto the shared <Pill> primitive — one shell (6px radius,
// 8px dot, 12/600). The picker listbox options keep their own small standalone dots.
import { useRef, useState, useEffect, useCallback } from 'react'
import type { ProgressMarker as ProgressMarkerType } from '@/lib/db/weekly-updates.types'
import { Pill } from '@/components/ui/pill'
import type { PillTone } from '@/components/ui/pill'
import './ProgressMarker.css'

// ── Token mapping (§4.2, ratified in design-plan) ───────────────────────────
const PROGRESS_TONE: Record<ProgressMarkerType, PillTone> = {
  done: 'success',
  in_progress: 'primary',
  blocked: 'destructive',
}
const PROGRESS_LABEL: Record<ProgressMarkerType, string> = {
  done: 'Done',
  in_progress: 'In progress',
  blocked: 'Blocked',
}
const PROGRESS_TONE_CLASS: Record<ProgressMarkerType, string> = {
  done: 'pill--success',
  in_progress: 'pill--primary',
  blocked: 'pill--destructive',
}

const ALL_MARKERS: ProgressMarkerType[] = ['done', 'in_progress', 'blocked']

// ── Static (read-only) form ──────────────────────────────────────────────────
interface ProgressMarkerProps {
  progress: ProgressMarkerType
  className?: string
}

export function ProgressMarker({ progress, className = '' }: ProgressMarkerProps) {
  const label = PROGRESS_LABEL[progress]
  return (
    <Pill tone={PROGRESS_TONE[progress]} className={className} aria-label={label}>
      {label}
    </Pill>
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

  const label = PROGRESS_LABEL[progress]

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
    <div className="pm-picker-anchor" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={triggerRef}
        type="button"
        // VIS-4: the trigger re-uses the shared pill shell (.pill .pill--{tone}) + the
        // .pm-trigger modifier (cursor/reset) + the 8px .dot from Pill.css.
        className={`pill ${PROGRESS_TONE_CLASS[progress]} pm-trigger`}
        aria-label={`${label} — ${triggerLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        onClick={handleTriggerClick}
        style={{ minHeight: 44 }}
      >
        <span className="dot" aria-hidden="true" />
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
          {ALL_MARKERS.map(m => (
            <button
              key={m}
              role="option"
              aria-selected={m === progress ? 'true' : 'false'}
              className="pm-option"
              type="button"
              onClick={() => handleSelect(m)}
            >
              {/* standalone option dot (not a pill) — small marker in the popover */}
              <span className={`pm-option-dot pm-option-dot--${m}`} aria-hidden="true" />
              {PROGRESS_LABEL[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
