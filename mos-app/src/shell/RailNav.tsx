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
        {/* 28px primary logo square */}
        <div
          className="flex items-center justify-center bg-primary text-primary-foreground rounded-sm font-bold flex-none"
          style={{ width: 28, height: 28, fontSize: 13 }}
        >
          G
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
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-foreground hover:bg-accent',
              ].join(' ')
            }
            style={{ height: 38 }}
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
