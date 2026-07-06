import { NavLink } from 'react-router-dom'
import { DESTINATIONS, isLive } from './destinations'
import { ADMIN_SECTIONS, CATALOG_SECTIONS } from './sections'
import type { Section } from './sections'
import { SettingsIcon } from './icons'
import { LocaleToggle } from './locale-toggle'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'

type RailNavProps = {
  onNavigate?: () => void
}

// Elevated roles that unlock Review + Pushes in the Operate (Kitchen) group.
const KITCHEN_ELEVATED_ROLES = ['ops_lead', 'admin'] as const

function NavItem({ section, onNavigate }: { section: Section; onNavigate?: () => void }) {
  const t = useT()
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
          <span className={isActive ? 'text-foreground' : undefined}>{section.labelKey ? t(section.labelKey) : section.label}</span>
        </>
      )}
    </NavLink>
  )
}

// One rail group: a muted-foreground uppercase heading + its NavItems.
function NavGroup({
  label,
  sections,
  onNavigate,
}: {
  label: string
  sections: Section[]
  onNavigate?: () => void
}) {
  return (
    <>
      <div
        className="px-2 pb-1 pt-3 font-medium uppercase text-muted-foreground"
        style={{ fontSize: 11, letterSpacing: '0.06em' }}
      >
        {label}
      </div>
      <div className="flex flex-col gap-[2px]">
        {sections.map((section) => (
          <NavItem key={section.path} section={section} onNavigate={onNavigate} />
        ))}
      </div>
    </>
  )
}

export function RailNav({ onNavigate }: RailNavProps) {
  const auth = useAuth()
  const t = useT()

  // Derive access roles defensively — rail only ever renders inside the auth shell,
  // but guard against loading/unauth shapes so the component never throws.
  const accessRoles: string[] =
    auth.status === 'authenticated' ? auth.viewer.accessRoles : []

  const hasElevatedKitchenAccess = KITCHEN_ELEVATED_ROLES.some((r) => accessRoles.includes(r))
  const isAdmin = accessRoles.includes('admin')

  // DESTINATIONS (plan §1.5/§4.2) is the single source of truth for both the rail
  // and the phone bottom-tab bar. Only live destinations (>=1 link, gate satisfied)
  // render as a rail group — Plan/Inbox are not live today (AC-D01).
  const liveDestinations = DESTINATIONS.filter((d) => isLive(d, accessRoles))

  // Cascade catalog (OD-C-2): each item shows only when the viewer holds a role that may write it.
  const visibleCatalogSections = CATALOG_SECTIONS.filter((s) =>
    s.anyOf.some((r) => accessRoles.includes(r)),
  )

  return (
    <>
      {/* Primary nav, grouped by DESTINATIONS (ADR-0019 D2/D8 regroup). Top bar owns:
          brand lockup, ⌘K search trigger, and user chip (ADR-0013 D1). */}
      <nav aria-label="Primary" className="flex flex-1 flex-col px-2">
        {liveDestinations.map((d) => {
          // Operate (Kitchen): Log/Plan/Stock for everyone; Review/Pushes gated.
          const sections =
            d.id === 'operate'
              ? d.links.filter((s) => {
                  if (s.label === 'Review' || s.label === 'Pushes') return hasElevatedKitchenAccess
                  return true
                })
              : d.links
          return (
            <NavGroup key={d.id} label={t(d.labelKey)} sections={sections} onNavigate={onNavigate} />
          )
        })}

        {/* Cascade catalog (OD-C-2) — role-gated, sits below the destination groups
            until it migrates under Work (ADR-0019 D2's "admin catalog becomes its
            manage mode") — out of scope for this slice. */}
        {visibleCatalogSections.length > 0 && (
          <NavGroup label="Catalog" sections={visibleCatalogSections} onNavigate={onNavigate} />
        )}

        {/* Admin group — rendered only for admin viewers (AC-070: absent from DOM for non-admins). */}
        {isAdmin && <NavGroup label="Admin" sections={ADMIN_SECTIONS} onNavigate={onNavigate} />}
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

      {/* Rail footer: the i18n locale toggle (ADR-0021, Task 3.9) — reused by the
          mobile drawer for free since MobileDrawer renders RailNav internally. */}
      <LocaleToggle />
    </>
  )
}
