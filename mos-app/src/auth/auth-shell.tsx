// Shared auth chrome used by LoginPage, RecoveryPage, and OrphanScreen.
// Masthead + one left-edged task column + contextual help line.

import { GordiLogoMark } from '@/shell/logo-mark'
import { PageBackLink } from '@/shell/page-back-link'
import { IconButton } from '@/components/ui/icon-button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import '@/shell/page-head.css'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import './auth.css'

// Inline spinner — aria-hidden; button label carries meaning (design-plan §5)
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={['motion-safe:animate-spin', className].filter(Boolean).join(' ')}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 16 16"
      width="14"
      height="14"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.25"
      />
      <path
        d="M14 8a6 6 0 0 1-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

// Show/hide toggle for a password field: the one implementation, rendered in TextInput's trailing slot.
export function PasswordToggle({ shown, onToggle, showLabel, hideLabel, controls, disabled }: {
  shown: boolean
  onToggle: () => void
  showLabel: string
  hideLabel: string
  controls?: string
  disabled?: boolean
}) {
  return (
    <IconButton
      variant="tertiary"
      ariaLabel={shown ? hideLabel : showLabel}
      aria-pressed={shown}
      aria-controls={controls}
      disabled={disabled}
      onClick={onToggle}
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z" />
        <circle cx="8" cy="8" r="1.8" />
        {shown && <path d="M2 14 14 2" strokeLinecap="round" />}
      </svg>
    </IconButton>
  )
}

// AuthShell — masthead, task column, foot line
export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useT()
  const { locale, setLocale } = useI18n()

  return (
    <div className="auth-shell">
      <header className="auth-masthead">
        <div className="auth-brand">
          <GordiLogoMark />
          <div className="auth-brand__text">
            <span className="auth-brand__name">Gordi MOS</span>
            <span className="auth-brand__tag">Management OS</span>
          </div>
        </div>
        <SegmentedControl
          className="auth-locale"
          ariaLabel={t('auth.login.language')}
          options={[{ value: 'en', label: 'EN' }, { value: 'id', label: 'ID' }]}
          value={locale}
          onChange={setLocale}
        />
      </header>
      <main className="auth-main">{children}</main>
      <aside className="auth-help">{t('auth.footer')}</aside>
    </div>
  )
}

// The one back link (shared PageBackLink), above the title on the column's left edge.
export function AuthBackLink({ to, onClick, label }: { to?: string; onClick?: () => void; label: string }) {
  return <div className="auth-back"><PageBackLink to={to} onClick={onClick} label={label} /></div>
}

// Compatibility wrapper for existing auth callers; it is a task body, not a nested card.
export function AuthCard({ children }: { children: React.ReactNode }) {
  return <section className="auth-card">{children}</section>
}
