import { NavLink } from 'react-router-dom'
import { SECTIONS } from './sections'
import { SettingsIcon } from './icons'

interface RailNavProps {
  onNavigate?: () => void
}

export default function RailNav({ onNavigate }: RailNavProps) {
  return (
    <>
      {/* Brand block — 56px header height, border-bottom */}
      <div
        className="flex items-center gap-[10px] px-4 border-b border-border"
        style={{ height: 'var(--header-h)' }}
      >
        {/* 28px brand-navy logo square + orange sprinkle dot (OD-P3-7 / Structural-Navy Rule) */}
        <div className="relative flex-none" style={{ width: 28, height: 28 }}>
          <div
            className="flex items-center justify-center bg-brand-navy text-primary-foreground rounded-sm font-bold w-full h-full"
            style={{ fontSize: 13 }}
          >
            G
          </div>
          {/* Orange sprinkle dot — brand identity marker, bottom-right corner */}
          <span
            className="absolute bottom-0 right-0 bg-brand-orange rounded-full"
            style={{ width: 6, height: 6, transform: 'translate(30%, 30%)' }}
            aria-hidden="true"
          />
        </div>
        <div>
          <div className="font-bold text-foreground" style={{ fontSize: 14, letterSpacing: '-0.01em' }}>
            Gordi MOS
          </div>
          <div
            className="font-semibold text-muted-foreground uppercase"
            style={{ fontSize: 11, letterSpacing: '0.06em' }}
          >
            Management OS
          </div>
        </div>
      </div>

      {/* Primary nav */}
      <nav aria-label="Primary" className="flex flex-col gap-[3px] p-3 flex-1">
        {SECTIONS.map((section) => (
          <NavLink
            key={section.path}
            to={section.path}
            end={section.path === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                'flex items-center gap-[11px] rounded-sm px-3 no-underline',
                'text-sm font-medium',
                /* OD-P3-7 / Structural-Navy Rule: active nav uses brand-navy tint, NOT primary blue */
                isActive
                  ? 'bg-brand-navy/6 text-brand-navy-text font-semibold'
                  : 'text-foreground hover:bg-accent',
              ].join(' ')
            }
            style={({ isActive }) => ({
              height: 38,
              /* OD-P3-7: inset left rail marker for active state (navy, structural) */
              boxShadow: isActive ? 'inset 3px 0 0 var(--brand-navy)' : undefined,
            })}
          >
            <section.Icon />
            {section.label}
          </NavLink>
        ))}
      </nav>

      {/* Settings stub — visible but disabled (DESIGN.md proposed disabled, AS-1) */}
      {/* tabIndex=0 + aria-disabled keeps it in tab order and announces its disabled state to AT */}
      <div className="border-t border-border p-3">
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
          className="flex items-center gap-[11px] rounded-sm px-3 text-sm font-medium text-foreground opacity-50 cursor-not-allowed"
          style={{ height: 38 }}
        >
          <SettingsIcon />
          Settings
        </span>
      </div>
    </>
  )
}
