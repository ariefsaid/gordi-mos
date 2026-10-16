import { useState, useRef, useCallback } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useMenuPopover } from '@/lib/use-menu-popover'
import { localViewAsPassword } from '@/config/local-view-as'
import { clearLocalViewAsSession, useLocalViewAs } from './local-view-as-session'
import { AppearanceControl } from './appearance-control'
import { Chevron } from './icons'
import './user-chip.css'

interface UserChipProps {
  /**
   * When true, hides name/role text: the header variant uses this at <920px per FR-020; the
   * rail/drawer variants use it in the OD-REDESIGN-84.2 (P1-1) 920–1099.98px icon-only rail,
   * where the chip collapses to the avatar alone.
   */
  compact?: boolean
  // 'header' = compact chip in the top bar; 'rail' = full-width row pinned to the sidebar foot; 'drawer' =
  // full-width row in the phone "More" drawer's foot. Both open their menu UPWARD.
  /** Display variant. */
  variant?: 'header' | 'rail' | 'drawer'
}

function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/)
  const first = words[0]?.[0] ?? ''
  const second = words[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export function UserChip({ compact = false, variant = 'header' }: UserChipProps) {
  // 'rail' and 'drawer' both render the full-width identity row (name + role); only the
  // menu's open direction differs (rail opens up, drawer opens down — see menuOpensUp below).
  const isFullWidth = variant === 'rail' || variant === 'drawer'
  // Both full-width homes of the chip (sidebar foot, More drawer foot) sit at the bottom of their surface.
  const menuOpensUp = isFullWidth
  const t = useT()
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const chipRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const signOut = auth.status === 'authenticated' ? auth.signOut : undefined
  const viewAsPassword = localViewAsPassword(import.meta.env.DEV, import.meta.env.VITE_LOCAL_VIEW_AS_PASSWORD)

  const close = useCallback(() => {
    setOpen(false)
    chipRef.current?.focus()
  }, [])

  // ONE popover contract: outside-click + top-layer Escape + Tab exit, with focus-enter and
  // WAI-ARIA arrow/Home/End navigation.
  useMenuPopover(open, close, menuRef, chipRef)
  const { originalAccount, otherPeople, roleLabel, peopleStatus, switching, switchError, switchAccount } =
    useLocalViewAs(open, viewer, viewAsPassword, t)

  if (!viewer) return null

  const initials = getInitials(viewer.person.full_name)
  const primaryRole = viewer.roles[0]?.name

  // Was `isFullWidth || !compact` — the rail/drawer variants always showed text regardless of
  // `compact`, so the prop was dead for them (P1-1: the compact icon rail needs the chip to
  // actually collapse to the avatar). `compact` alone now governs text visibility for every variant.
  const showText = !compact

  return (
    <div className={isFullWidth ? 'relative' : 'relative flex items-center gap-2'}>
      {/* Chip button */}
      <button
        ref={chipRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        // Let the visible name and role form the name when shown; compact variants need a
        // textual substitute for the avatar alone.
        aria-label={compact ? `${viewer.person.full_name}${primaryRole ? `, ${primaryRole}` : ''}` : undefined}
        title={isFullWidth && compact ? viewer.person.full_name : undefined}
        className={
          // SYS-2: the full-width chip (rail foot + phone More drawer) is 40px — the drawer
          // variant is phone-reachable and falls below the 44px touch floor. tap-target-phone
          // (Button.css) raises it on phone; the desktop rail is unaffected (>767px).
          `user-chip${isFullWidth ? ' user-chip--full' : ''}${compact ? ' user-chip--compact' : ''}`
        }
        onClick={() => setOpen((v) => !v)}
      >
        {/* Avatar: 28px rounded-full, navy→blue gradient (OD-P3-7 / Structural-Navy Rule) */}
        <div className="mk-avatar user-chip__avatar" data-initials={initials} aria-hidden="true" />
        {showText && (
          <div className="user-chip__text">
            <div className="user-chip__name" title={viewer.person.full_name}>
              {viewer.person.full_name}
            </div>
            {primaryRole && (
              <div className="user-chip__role">
                {primaryRole}
              </div>
            )}
          </div>
        )}
        {/* v4 shell rebuild (Task 7 a11y): a visible disclosure cue on the drawer identity row —
            the row opens a menu and needs a static affordance beyond aria-haspopup/aria-expanded
            alone. Scoped to the phone drawer (the rail footer's affordance is already established
            chrome elsewhere in that surface). */}
        {variant === 'drawer' && showText && (
          <Chevron className="user-chip__chevron" size={16} />
        )}
      </button>

      {/* Popover menu */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={`user-chip-menu ${isFullWidth ? 'user-chip-menu--left' : 'user-chip-menu--right'} ${menuOpensUp ? 'user-chip-menu--up' : 'user-chip-menu--down'}`}
          style={isFullWidth ? undefined : { minWidth: viewAsPassword ? 260 : 140 }}
        >
          {/* Appearance switcher */}
          <AppearanceControl />

          {viewAsPassword && (
            <>
              <div className="user-chip-menu__sep" role="separator" aria-hidden="true" />
              <div>
                <div className="user-chip-menu__heading">
                  {t('account.viewAs')}
                </div>
                {originalAccount ? (
                  <button
                    role="menuitem"
                    type="button"
                    className="user-chip-menu-item"
                    disabled={switching}
                    onClick={() => void switchAccount(originalAccount.email, true).then((success) => { if (success) setOpen(false) })}
                  >
                    {t('account.viewAs.back', { name: originalAccount.full_name })}
                  </button>
                ) : peopleStatus === 'loading' || peopleStatus === 'idle' ? (
                  <div className="user-chip-menu__note" role="status">{t('account.viewAs.loading')}</div>
                ) : peopleStatus === 'error' ? (
                  <div className="user-chip-menu__note" role="alert">{t('account.viewAs.loadError')}</div>
                ) : otherPeople.length === 0 ? (
                  <div className="user-chip-menu__note">{t('account.viewAs.noPeople')}</div>
                ) : otherPeople.map((person) => {
                  const label = `${person.full_name} — ${roleLabel(person)}`
                  return (
                    <button
                      key={person.id}
                      role="menuitem"
                      type="button"
                      className="user-chip-menu-item"
                      title={label}
                      disabled={switching}
                      onClick={() => void switchAccount(person.email).then((success) => { if (success) setOpen(false) })}
                    >
                      {label}
                    </button>
                  )
                })}
                {switchError && <div className="user-chip-menu__note user-chip-menu__note--error" role="alert">{t('account.viewAs.signInError')}</div>}
              </div>
            </>
          )}

          {/* Divider */}
          <div className="user-chip-menu__sep" role="separator" aria-hidden="true" />

          {/* Sign out */}
          <button
            role="menuitem"
            type="button"
            // SYS-2: reachable on phone via the 'drawer' variant menu — raise the 32px row to the
            // 44px touch floor on phone (tap-target-phone, Button.css). Desktop rhythm unchanged.
            className="user-chip-menu-item"
            onClick={() => {
              close()
              clearLocalViewAsSession()
              signOut?.()
            }}
          >
            {t('account.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
