import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '@/auth/use-auth'
import { AppearanceControl } from './appearance-control'

interface UserChipProps {
  /** When true, hides name/role text (used at <920px per FR-020). */
  compact?: boolean
  // 'header' = compact chip in the top bar; 'rail' = full-width row pinned to
  // the sidebar foot with an upward-opening menu.
  /** Display variant. */
  variant?: 'header' | 'rail'
}

function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/)
  const first = words[0]?.[0] ?? ''
  const second = words[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export function UserChip({ compact = false, variant = 'header' }: UserChipProps) {
  const isRail = variant === 'rail'
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

  const showText = isRail || !compact

  return (
    <div className={isRail ? 'relative' : 'relative flex items-center gap-2'}>
      {/* Chip button */}
      <button
        ref={chipRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={viewer.person.full_name}
        className={
          isRail
            ? 'flex w-full items-center gap-2 rounded-sm hover:bg-accent px-2 cursor-pointer'
            : 'flex items-center gap-2 rounded-sm hover:bg-accent px-2 -mx-2 cursor-pointer'
        }
        style={{ height: isRail ? 40 : 36 }}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Avatar: 28px rounded-full, navy→blue gradient (OD-P3-7 / Structural-Navy Rule) */}
        <div
          className="flex items-center justify-center rounded-full text-primary-foreground flex-none font-bold"
          style={{
            width: 28,
            height: 28,
            fontSize: 11,
            background: 'linear-gradient(135deg, var(--brand-navy), var(--primary))',
          }}
          aria-hidden="true"
        >
          {initials}
        </div>
        {showText && (
          <div className={isRail ? 'flex-1 text-left min-w-0' : 'text-left'}>
            <div
              className="truncate font-semibold text-foreground"
              style={{ fontSize: 13, lineHeight: 1.1 }}
              title={viewer.person.full_name}
            >
              {viewer.person.full_name}
            </div>
            {primaryRole && (
              <div className="truncate text-muted-foreground" style={{ fontSize: 11 }}>
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
          className={
            (isRail
              ? 'absolute left-0 bottom-full mb-1 '
              : 'absolute right-0 top-full mt-1 ') +
            'bg-popover border border-border rounded-lg p-[5px] z-50'
          }
          style={{
            minWidth: isRail ? 200 : 140,
            boxShadow:
              '0 10px 30px color-mix(in srgb, var(--ds-font-color-primary) 16%, transparent), 0 2px 6px color-mix(in srgb, var(--ds-font-color-primary) 8%, transparent)',
          }}
        >
          {/* Appearance switcher */}
          <AppearanceControl />

          {/* Divider */}
          <div className="my-[5px] border-t border-border" role="separator" aria-hidden="true" />

          {/* Sign out */}
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
