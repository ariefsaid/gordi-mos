import { type Theme } from '@/theme/use-theme';
import { useThemeContext } from '@/theme/theme-provider';

/** Sun icon — 16px, aria-hidden, stroke-2, currentColor */
function SunIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

/** Moon icon — 16px, aria-hidden, stroke-2, currentColor */
function MoonIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/** Monitor icon — 16px, aria-hidden, stroke-2, currentColor */
function MonitorIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

/** Checkmark for the active state — 14px, aria-hidden */
function CheckIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

type Option = {
  value: Theme;
  label: string;
  icon: React.ReactNode;
};

const OPTIONS: Option[] = [
  { value: 'light', label: 'Light', icon: <SunIcon /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
  { value: 'system', label: 'System', icon: <MonitorIcon /> },
];

/**
 * AppearanceControl — theme switcher for the account menu.
 *
 * Renders a labeled group of three `role="menuitemradio"` items (Light / Dark /
 * System). Clicking an option calls setTheme and keeps the parent menu open
 * (close/Esc is owned by user-chip.tsx). Tokens-only; no hardcoded colors.
 *
 * a11y: aria-checked on each option, arrow-key/Tab reachable via natural tabIndex,
 * icons are aria-hidden, label text identifies the group for sighted users.
 */
export function AppearanceControl() {
  const { theme, setTheme } = useThemeContext();

  return (
    <div>
      {/* Group label — visible, muted, overline size */}
      <div
        className="px-3 text-muted-foreground select-none"
        style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', paddingBottom: 4, paddingTop: 2 }}
        aria-hidden="true"
      >
        Appearance
      </div>

      {/* Three option buttons */}
      <div role="group" aria-label="Appearance">
        {OPTIONS.map(({ value, label, icon }) => {
          const isActive = theme === value;
          return (
            <button
              key={value}
              role="menuitemradio"
              type="button"
              aria-checked={isActive}
              className={
                'w-full flex items-center gap-2 px-3 rounded-sm cursor-pointer ' +
                (isActive
                  ? 'text-foreground bg-accent'
                  : 'text-foreground hover:bg-accent')
              }
              style={{ height: 32, fontSize: 13 }}
              onClick={() => setTheme(value)}
            >
              {/* Icon */}
              <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>
                {icon}
              </span>
              {/* Label */}
              <span className="flex-1 text-left">{label}</span>
              {/* Active check */}
              {isActive && (
                <span className="text-primary">
                  <CheckIcon />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
