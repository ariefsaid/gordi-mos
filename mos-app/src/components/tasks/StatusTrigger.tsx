import { useState, useEffect, useRef } from 'react'
import type { TaskStatus } from '@/lib/db/tasks.types'
import { StatusPill } from './StatusPill'
import { Chevron } from '@/shell/icons'

const STATUSES: TaskStatus[] = ['Open', 'In Progress', 'Blocked', 'Done']

// ── Status trigger + popover ─────────────────────────────────────────────────
export type StatusTriggerProps = {
  status: TaskStatus
  onChange: (s: TaskStatus) => void
}

export function StatusTrigger({ status, onChange }: StatusTriggerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={ref} className="status-trigger-wrap" onKeyDown={handleKey}>
      <button
        type="button"
        className="status-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change status"
        onClick={() => setOpen(o => !o)}
      >
        <StatusPill status={status} />
        <Chevron className="trigger-chev" />
      </button>
      {open && (
        <div role="listbox" aria-label="Select status" className="status-popover">
          {STATUSES.map(s => (
            <div
              key={s}
              role="option"
              aria-selected={s === status}
              className={`status-option${s === status ? ' status-option-active' : ''}`}
              onClick={() => { onChange(s); setOpen(false) }}
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { onChange(s); setOpen(false) } }}
            >
              <StatusPill status={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
