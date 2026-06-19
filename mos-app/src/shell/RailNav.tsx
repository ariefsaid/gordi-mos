import { NavLink } from 'react-router-dom'
import { SECTIONS } from './sections'
import { SettingsIcon } from './icons'
import UserChip from './UserChip'

interface RailNavProps {
  onNavigate?: () => void
}

/** Inline rail glyphs (16px, stroke-2, currentColor) — search + chevron. */
function SearchGlyph() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
function ChevronDownGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function RailNav({ onNavigate }: RailNavProps) {
  return (
    <>
      {/* Workspace switcher — Twenty idiom: logo + workspace name + chevron.
          Replaces the old brand block + "MANAGEMENT OS" subtitle. */}
      <div className="px-2 pt-2">
        <button
          type="button"
          aria-label="Gordi MOS workspace"
          className="flex w-full items-center gap-2 rounded-sm px-2 hover:bg-accent cursor-pointer"
          style={{ height: 44 }}
        >
          {/* Gordi logo mark — navy square + orange sprinkle (brand identity kept). */}
          <div className="relative flex-none" style={{ width: 24, height: 24 }}>
            <div
              className="flex h-full w-full items-center justify-center rounded-sm bg-brand-navy font-bold text-primary-foreground"
              style={{ fontSize: 12 }}
            >
              G
            </div>
            <span
              className="absolute bottom-0 right-0 rounded-full bg-brand-orange"
              style={{ width: 5, height: 5, transform: 'translate(30%, 30%)' }}
              aria-hidden="true"
            />
          </div>
          <span className="flex-1 truncate text-left font-semibold text-foreground" style={{ fontSize: 14, letterSpacing: '-0.01em' }}>
            Gordi MOS
          </span>
          <span className="text-muted-foreground"><ChevronDownGlyph /></span>
        </button>
      </div>

      {/* In-rail search trigger — Twenty signature (⌘K). Visual anchor for the
          forthcoming command menu; focusable. */}
      <div className="px-2 pb-1 pt-1">
        <button
          type="button"
          aria-label="Search"
          className="flex w-full items-center gap-2 rounded-sm border border-input bg-background px-2 text-muted-foreground hover:border-muted-foreground/50 cursor-text"
          style={{ height: 32 }}
        >
          <SearchGlyph />
          <span className="flex-1 text-left" style={{ fontSize: 13 }}>Search</span>
          <kbd
            className="rounded-xs border border-border px-1 font-medium text-muted-foreground"
            style={{ fontSize: 11, lineHeight: '16px' }}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Primary nav, grouped under a Workspace section label (Twenty idiom). */}
      <nav aria-label="Primary" className="flex flex-1 flex-col px-2">
        <div
          className="px-2 pb-1 pt-3 font-medium uppercase text-muted-foreground"
          style={{ fontSize: 11, letterSpacing: '0.06em' }}
        >
          Workspace
        </div>
        <div className="flex flex-col gap-[2px]">
          {SECTIONS.map((section) => (
            <NavLink
              key={section.path}
              to={section.path}
              end={section.path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  'flex items-center gap-[10px] rounded-sm px-2 no-underline text-sm',
                  // Twenty selection: subtle neutral fill + accent-tinted icon + weight 500.
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
          ))}
        </div>
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

      {/* User chip pinned to the rail foot — Twenty idiom (moved out of the top header). */}
      <div className="mt-1 border-t border-border p-2">
        <UserChip variant="rail" />
      </div>
    </>
  )
}
