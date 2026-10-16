// Shared panel for local dev personas and the separate staging sample org. The staging variant
// hides its password hint; LoginPage gates the variant to the staging host and build flag.
import { useEffect, useState } from 'react'
import { Spinner } from '@/auth/auth-shell'
import { useT } from '@/i18n/use-t'
import { DEMO_PASSWORD, DEMO_PERSONAS } from './demo-personas'

export function DemoLogin({
  onPick,
  busyEmail,
  disabled,
  personas = DEMO_PERSONAS,
  showPassword = true,
  title = 'Show demo accounts',
  hideTitle = 'Hide demo accounts',
}: {
  onPick: (email: string) => void
  busyEmail: string | null
  disabled: boolean
  personas?: ReadonlyArray<{ label: string; email: string }>
  showPassword?: boolean
  title?: string
  hideTitle?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)')
    const update = () => setOpen(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return (
    <details className="demo-directory" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span>{open ? hideTitle : title}</span>
        <svg className="demo-directory__chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m3.5 6 4.5 4.5L12.5 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      {showPassword && (
        <p className="demo-directory__hint">
          {t('auth.login.demoPassword')}{' '}
          <code className="font-mono text-foreground">{DEMO_PASSWORD}</code>
        </p>
      )}

      <div className="demo-directory__list">
        {personas.map((p) => {
          const busy = busyEmail === p.email
          return (
            <button
              key={p.email}
              type="button"
              disabled={disabled}
              aria-busy={busy}
              onClick={() => onPick(p.email)}
              className="demo-persona"
            >
              {busy && <Spinner />}
              {p.label}
            </button>
          )
        })}
      </div>
    </details>
  )
}
