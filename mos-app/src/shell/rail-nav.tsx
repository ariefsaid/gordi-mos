import { NavLink } from 'react-router-dom'
import { SECTIONS, KITCHEN_SECTIONS, ADMIN_SECTIONS } from './sections'
import type { Section } from './sections'
import { SettingsIcon } from './icons'
import { useAuth } from '@/auth/use-auth'

type RailNavProps = {
  onNavigate?: () => void
}

// Elevated roles that unlock Review + Pushes in the Kitchen group.
const KITCHEN_ELEVATED_ROLES = ['ops_lead', 'admin'] as const

function NavItem({ section, onNavigate }: { section: Section; onNavigate?: () => void }) {
  return (
    <NavLink
      key={section.path}
      to={section.path}
      end={section.path === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'flex items-center gap-[10px] rounded-sm px-2 no-underline text-sm',
          // Records-workspace selection: subtle neutral fill + accent-tinted icon + weight 500.
          // (Owner-directed override of OD-P3-7's navy tint + inset left-marker.)
          isActive
            ? 'bg-accent font-medium text-foreground'
            : 'font-normal text-muted-foreground hover:bg-accent/60',
        ].join(' ')
      }
      style={{ height: 28 }}
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>
            <section.Icon />
          </span>
          <span className={isActive ? 'text-foreground' : undefined}>{section.label}</span>
        </>
      )}
    </NavLink>
  )
}

export function RailNav({ onNavigate }: RailNavProps) {
  const auth = useAuth()

  // Derive access roles defensively — rail only ever renders inside the auth shell,
  // but guard against loading/unauth shapes so the component never throws.
  const accessRoles: string[] =
    auth.status === 'authenticated' ? auth.viewer.accessRoles : []

  const hasElevatedKitchenAccess = KITCHEN_ELEVATED_ROLES.some((r) => accessRoles.includes(r))
  const isAdmin = accessRoles.includes('admin')

  // Log, Plan, Stock → all authenticated users.
  // Review, Pushes → ops_lead / admin only.
  const visibleKitchenSections = KITCHEN_SECTIONS.filter((s) => {
    if (s.label === 'Review' || s.label === 'Pushes') return hasElevatedKitchenAccess
    return true
  })

  return (
    <>
      {/* Primary nav, grouped under a Workspace section label (records-workspace idiom).
          Top bar now owns: brand lockup, ⌘K search trigger, and user chip (ADR-0013 D1). */}
      <nav aria-label="Primary" className="flex flex-1 flex-col px-2">
        <div
          className="px-2 pb-1 pt-3 font-medium uppercase text-muted-foreground"
          style={{ fontSize: 11, letterSpacing: '0.06em' }}
        >
          Workspace
        </div>
        <div className="flex flex-col gap-[2px]">
          {SECTIONS.map((section) => (
            <NavItem key={section.path} section={section} onNavigate={onNavigate} />
          ))}
        </div>

        {/* Kitchen group — same heading + link idiom as Workspace above. */}
        <div
          className="px-2 pb-1 pt-3 font-medium uppercase text-muted-foreground"
          style={{ fontSize: 11, letterSpacing: '0.06em' }}
        >
          Kitchen
        </div>
        <div className="flex flex-col gap-[2px]">
          {visibleKitchenSections.map((section) => (
            <NavItem key={section.path} section={section} onNavigate={onNavigate} />
          ))}
        </div>

        {/* Admin group — rendered only for admin viewers (AC-070: absent from DOM for non-admins). */}
        {isAdmin && (
          <>
            <div
              className="px-2 pb-1 pt-3 font-medium uppercase text-muted-foreground"
              style={{ fontSize: 11, letterSpacing: '0.06em' }}
            >
              Admin
            </div>
            <div className="flex flex-col gap-[2px]">
              {ADMIN_SECTIONS.map((section) => (
                <NavItem key={section.path} section={section} onNavigate={onNavigate} />
              ))}
            </div>
          </>
        )}
      </nav>

      {/* Utility: Settings stub (disabled) — kept above the user chip. */}
      <div className="px-2">
        <span
          role="link"
          aria-disabled="true"
          aria-label="Settings — coming soon"
          title="Settings — coming soon"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
          }}
          onClick={(e) => e.preventDefault()}
          className="flex cursor-not-allowed items-center gap-[10px] rounded-sm px-2 text-sm font-normal text-muted-foreground opacity-50"
          style={{ height: 28 }}
        >
          <span className="text-muted-foreground"><SettingsIcon /></span>
          Settings
        </span>
      </div>

    </>
  )
}
