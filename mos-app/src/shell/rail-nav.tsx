import { NavLink } from 'react-router-dom'
import { DESTINATIONS, UTILITY, isLive, modulesForRoles, type Destination } from './destinations'
import type { Section } from './sections'
import { UserChip } from './user-chip'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { can } from '@/lib/capabilities'

type RailNavProps = {
  onNavigate?: () => void
}

// Rail item chrome. Active state ports e7's selected treatment (DESIGN-FIDELITY-1, 2026-07-18):
// e7 selected = blue wash + blue text + weight 600, ~36px tall, 10px inline padding. The old
// `bg-accent` resolved to --surface-secondary — the SAME warm-grey as the rail panel bg, so the
// selection was invisible (zero contrast). Now a blue tint (--ds-color-blue3) on the panel + The
// One Blue text. itemBase owns the active color so inner label spans don't re-set text-foreground.
const itemBase = (isActive: boolean) =>
  [
    'flex items-center gap-[10px] h-9 rounded-sm px-2.5 no-underline text-sm',
    isActive
      ? 'bg-[color:var(--ds-color-blue3)] font-semibold text-primary'
      : 'font-normal text-muted-foreground hover:bg-accent/60',
  ].join(' ')

// A destination rail item: NavLink to its primaryPath, labelled by the destination
// labelKey (e.g. "Admin Settings", "Money"), default aria-current="page" (Rule 5).
function DestLink({ d, onNavigate }: { d: Destination; onNavigate?: () => void }) {
  const t = useT()
  const to = d.primaryPath ?? d.links[0].path
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onNavigate}
      className={({ isActive }) => itemBase(isActive)}
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>
            <d.Icon />
          </span>
          <span>{t(d.labelKey)}</span>
        </>
      )}
    </NavLink>
  )
}

// A Work child (always expanded). Default aria-current="page" when active.
function WorkChild({ section, onNavigate }: { section: Section; onNavigate?: () => void }) {
  const t = useT()
  return (
    <NavLink
      to={section.path}
      onClick={onNavigate}
      className={({ isActive }) => itemBase(isActive)}
    >
      {() => (
        /* B2 (owner sketch, ratified 2026-07-18): Work children are PLAIN indented labels —
           the sketch showed no icons; the icons were a builder default parked in a scorecard
           footnote (parity-sweep axis-2 finding B2). Icon stays in the Section data for the
           bottom-nav/⌘K; the rail child renders label-only. */
        <span>
          {section.labelKey ? t(section.labelKey) : section.label}
        </span>
      )}
    </NavLink>
  )
}

export function RailNav({ onNavigate }: RailNavProps) {
  const auth = useAuth()
  const t = useT()

  const accessRoles: string[] = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const liveDestinations = DESTINATIONS.filter((d) => isLive(d, accessRoles))
  // Both Utility entries render as ordinary rail links now: Admin Settings (gated) and Personal
  // Profile (security audit fix — the footer below is the identity/sign-out chip, not a /profile
  // link, so /profile needs its own reachable rail entry to stay navigable, Rule 11).
  const liveUtility = UTILITY.filter((u) => isLive(u, accessRoles))
  // OD-REDESIGN-68: the rail shows YOUR work — modules render flat (no BU headings, no
  // WORKSPACE overline; the owner's sketch is a flat list) and only for viewers whose job
  // role belongs to that BU. Org-wide roles get exactly the sketch rail.
  const myModules = viewer
    ? modulesForRoles(viewer.roles.map((r) => r.name), accessRoles)
    : []

  return (
    <>
      <nav aria-label="Primary" className="flex flex-1 flex-col px-2 pt-3">
        <div className="flex flex-col gap-[2px]">
          {liveDestinations.map((d) => {
            if (d.id === 'work') {
              // Work parent: aria-current="location" when any /work/* route is active
              // (Rule 5 — parent never carries "page"; the active child does). `to="/work"`
              // matches every /work/* descendant so the parent is "active" across all children.
              const children = (d.children ?? []).filter((c) => !c.capability || can(accessRoles, c.capability))
              return (
                <div key={d.id}>
                  <NavLink
                    to="/work"
                    aria-current="location"
                    onClick={onNavigate}
                    className={({ isActive }) => itemBase(isActive)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>
                          <d.Icon />
                        </span>
                        <span>{t(d.labelKey)}</span>
                      </>
                    )}
                  </NavLink>
                  {/* Always-expanded 4 children (0 family headings — Rule 3). */}
                  <div className="flex flex-col gap-[2px] pl-3">
                    {children.map((c) => (
                      <WorkChild key={c.path} section={c} onNavigate={onNavigate} />
                    ))}
                  </div>
                </div>
              )
            }
            return <DestLink key={d.id} d={d} onNavigate={onNavigate} />
          })}
        </div>

        {/* Your-work modules (OD-REDESIGN-68): flat, no BU headings — only the modules whose
            BU matches the viewer's job role (e7 Ayu pattern). Empty for org-wide roles. */}
        {myModules.length > 0 && (
          <div className="mt-1 flex flex-col gap-[2px]">
            {myModules.map((m) => (
              <DestLink key={m.id} d={m} onNavigate={onNavigate} />
            ))}
          </div>
        )}

        {/* Utility — Admin Settings (gated) and Personal Profile. The footer below is the
            identity/sign-out chip, not a nav link, so /profile needs its own entry here. */}
        {liveUtility.map((u) => (
          <div key={u.id} className="mt-1">
            <DestLink d={u} onNavigate={onNavigate} />
          </div>
        ))}
      </nav>

      {/* Identity + sign-out footer row (security audit HIGH-1, 2026-07-17). The redesign had
          reduced this row to a bare NavLink showing only "{site} {role}" with no way to sign out —
          on shared café/kitchen terminals a stale session became invisible AND unterminable. Reuses
          the existing UserChip (Rule 11 — no new component): the 'rail' variant shows the viewer's
          full NAME + role and opens a menu with Sign out (handleSignOut is unchanged). /profile
          itself moved to a normal Utility rail link above (see liveUtility). */}
      {viewer && (
        <div className="px-2 pb-1">
          <UserChip variant="rail" />
        </div>
      )}
    </>
  )
}

export type { Destination }
