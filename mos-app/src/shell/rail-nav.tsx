import { NavLink } from 'react-router-dom'
import { DESTINATIONS, MODULES, UTILITY, isLive, type Destination } from './destinations'
import type { Section } from './sections'
import { Chevron } from './icons'
import { LocaleToggle } from './locale-toggle'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { can } from '@/lib/capabilities'

type RailNavProps = {
  onNavigate?: () => void
}

function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/)
  const first = words[0]?.[0] ?? ''
  const second = words[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

const itemBase = (isActive: boolean) =>
  [
    'flex items-center gap-[10px] rounded-sm px-2 no-underline text-sm',
    isActive
      ? 'bg-accent font-medium text-foreground'
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
      style={{ height: 28 }}
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>
            <d.Icon />
          </span>
          <span className={isActive ? 'text-foreground' : undefined}>{t(d.labelKey)}</span>
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
      style={{ height: 28 }}
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>
            <section.Icon />
          </span>
          <span className={isActive ? 'text-foreground' : undefined}>
            {section.labelKey ? t(section.labelKey) : section.label}
          </span>
        </>
      )}
    </NavLink>
  )
}

function Overline({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-2 pb-1 pt-3 font-medium uppercase text-muted-foreground"
      style={{ fontSize: 11, letterSpacing: '0.06em' }}
    >
      {children}
    </div>
  )
}

export function RailNav({ onNavigate }: RailNavProps) {
  const auth = useAuth()
  const t = useT()

  const accessRoles: string[] = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const liveDestinations = DESTINATIONS.filter((d) => isLive(d, accessRoles))
  const liveUtility = UTILITY.filter((u) => isLive(u, accessRoles) && u.id === 'admin')
  const liveModules = MODULES.map((g) => ({
    bu: g.bu,
    items: g.items.filter((m) => isLive(m, accessRoles)),
  })).filter((g) => g.items.length > 0)

  const fullName = viewer?.person.full_name ?? ''
  const initials = getInitials(fullName)
  const roleLabel = viewer?.roles[0]?.name

  return (
    <>
      <nav aria-label="Primary" className="flex flex-1 flex-col px-2">
        <Overline>{t('rail.workspace')}</Overline>
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
                    style={{ height: 28 }}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>
                          <d.Icon />
                        </span>
                        <span className={isActive ? 'text-foreground' : undefined}>{t(d.labelKey)}</span>
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

        {/* Modules (BU-grouped) */}
        {liveModules.map((g) => (
          <div key={g.bu} className="mt-1">
            <Overline>{t(g.bu)}</Overline>
            <div className="flex flex-col gap-[2px]">
              {g.items.map((m) => (
                <DestLink key={m.id} d={m} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}

        {/* Utility — Admin Settings (gated). Profile is the footer row below. */}
        {liveUtility.map((u) => (
          <div key={u.id} className="mt-1">
            <DestLink d={u} onNavigate={onNavigate} />
          </div>
        ))}
      </nav>

      {/* Profile footer row — avatar + name/role + chevron, links to /profile (AC-013).
          Always present for a signed-in viewer (gated only by authentication). */}
      {viewer && (
        <div className="px-2 pb-1">
          <NavLink
            to="/profile"
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                'flex items-center gap-2 rounded-sm px-2 no-underline text-sm',
                isActive ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60',
              ].join(' ')
            }
            style={{ height: 40 }}
          >
            <span
              className="flex items-center justify-center rounded-full text-primary-foreground flex-none font-bold"
              style={{ width: 28, height: 28, fontSize: 11, background: 'linear-gradient(135deg, var(--brand-navy), var(--primary))' }}
              aria-hidden="true"
            >
              {initials}
            </span>
            <span className="flex-1 min-w-0 text-left">
              <span className="block truncate font-semibold text-foreground" style={{ fontSize: 13, lineHeight: 1.1 }} title={fullName}>
                {fullName}
              </span>
              {roleLabel && (
                <span className="block truncate text-muted-foreground" style={{ fontSize: 11 }}>
                  {roleLabel}
                </span>
              )}
            </span>
            <Chevron className="rotate-[-90deg] text-muted-foreground" />
          </NavLink>
        </div>
      )}

      <LocaleToggle />
    </>
  )
}

export type { Destination }
