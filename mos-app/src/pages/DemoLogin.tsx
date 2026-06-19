// DEV-ONLY one-click demo sign-in panel.
// Rendered by LoginPage strictly behind `import.meta.env.DEV` — it exposes a
// plaintext password and instant all-roles access, so it must NEVER reach a
// built/deployed site. The accounts it signs into are the fictional dev
// personas seeded by supabase/seed.dev-auth.sql (password below).
import { Spinner } from '@/auth/AuthShell'
import { DEMO_PASSWORD, DEMO_PERSONAS } from './demoPersonas'

export default function DemoLogin({
  onPick,
  busyEmail,
  disabled,
}: {
  onPick: (email: string) => void
  busyEmail: string | null
  disabled: boolean
}) {
  return (
    <div
      className="mt-5 rounded-lg border border-border shadow-rest"
      style={{ backgroundColor: 'color-mix(in srgb, var(--muted) 40%, transparent)', padding: 16 }}
    >
      {/* Overline title — 11px/600, uppercase, muted (mirrors AuthShell overline) */}
      <p
        className="text-muted-foreground font-semibold uppercase tracking-[0.06em] text-center"
        style={{ fontSize: 11 }}
      >
        Demo login
      </p>
      <p
        className="text-muted-foreground text-center mt-1"
        style={{ fontSize: 12 }}
      >
        password:{' '}
        <code className="font-mono text-foreground">{DEMO_PASSWORD}</code>
      </p>

      {/* Persona buttons — primary-text links, wrap on narrow widths */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {DEMO_PERSONAS.map((p) => {
          const busy = busyEmail === p.email
          return (
            <button
              key={p.email}
              type="button"
              disabled={disabled}
              aria-busy={busy}
              onClick={() => onPick(p.email)}
              className="text-primary font-medium hover:underline focus-visible:underline inline-flex items-center gap-1"
              style={{
                fontSize: 13,
                minHeight: 44, // ≥44px touch target (design-plan §4)
                opacity: disabled && !busy ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : undefined,
              }}
            >
              {busy && <Spinner className="text-primary" />}
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
