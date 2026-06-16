import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../auth/useAuth'

interface UserChipProps {
  /** When true, hides name/role text (used at <920px per FR-020). */
  compact?: boolean
}

function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/)
  const first = words[0]?.[0] ?? ''
  const second = words[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export default function UserChip({ compact = false }: UserChipProps) {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const chipRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const signOut = auth.status === 'authenticated' ? auth.signOut : undefined

  const close = useCallback(() => {
    setOpen(false)
    chipRef.current?.focus()
  }, [])

  // Close on Escape via keydown on the menu container
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, close])

  if (!viewer) return null

  const initials = getInitials(viewer.person.full_name)
  const primaryRole = viewer.roles[0]?.name

  return (
    <div className="relative flex items-center gap-2">
      {/* Chip button */}
      <button
        ref={chipRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={viewer.person.full_name}
        className="flex items-center gap-2 rounded-sm hover:bg-accent px-2 -mx-2 cursor-pointer"
        style={{ height: 36 }}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Avatar: 28px rounded-full, navy→blue gradient (OD-P3-7 / Structural-Navy Rule) */}
        <div
          className="flex items-center justify-center rounded-full text-primary-foreground flex-none font-bold"
          style={{
            width: 28,
            height: 28,
            fontSize: 11,
            background: 'linear-gradient(135deg, hsl(var(--brand-navy)), hsl(var(--primary)))',
          }}
          aria-hidden="true"
        >
          {initials}
        </div>
        {!compact && (
          <div className="text-left">
            <div className="font-semibold text-foreground" style={{ fontSize: 13, lineHeight: 1.1 }}>
              {viewer.person.full_name}
            </div>
            {primaryRole && (
              <div className="text-muted-foreground" style={{ fontSize: 11 }}>
                {primaryRole}
              </div>
            )}
          </div>
        )}
      </button>

      {/* Popover menu */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md p-[5px] z-50"
          style={{
            minWidth: 140,
            boxShadow:
              '0 10px 30px hsl(240 10% 8% / 0.16), 0 2px 6px hsl(240 10% 8% / 0.08)',
          }}
        >
          <button
            role="menuitem"
            type="button"
            className="w-full text-left px-3 rounded-sm hover:bg-accent text-foreground"
            style={{ height: 32, fontSize: 13 }}
            onClick={() => {
              close()
              signOut?.()
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
