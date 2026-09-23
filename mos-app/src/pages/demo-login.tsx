// Shared panel for local dev personas and the separate staging sample org. The staging variant
// hides its password hint; LoginPage gates the variant to the staging host and build flag.
import { Spinner } from '@/auth/auth-shell'
import { DEMO_PASSWORD, DEMO_PERSONAS } from './demo-personas'

export function DemoLogin({
  onPick,
  busyEmail,
  disabled,
  personas = DEMO_PERSONAS,
  showPassword = true,
  title = 'Demo login',
}: {
  onPick: (email: string) => void
  busyEmail: string | null
  disabled: boolean
  personas?: ReadonlyArray<{ label: string; email: string }>
  showPassword?: boolean
  title?: string
}) {
  return (
    <div
      className="mt-5 rounded-lg border border-border shadow-rest"
      style={{ backgroundColor: 'color-mix(in srgb, var(--muted) 40%, transparent)', padding: 16 }}
    >
      {/* Overline title — 11px/600, uppercase, muted (mirrors AuthShell overline) */}
      <p
        className="text-muted-foreground font-semibold uppercase tracking-[0.06em] text-center"
        style={{ fontSize: 'var(--font-size-overline)' }}
      >
        {title}
      </p>
      {showPassword && (
        <p
          className="text-muted-foreground text-center mt-1"
          style={{ fontSize: 'var(--font-size-label)' }}
        >
          password:{' '}
          <code className="font-mono text-foreground">{DEMO_PASSWORD}</code>
        </p>
      )}

      {/* Persona buttons — primary-text links, wrap on narrow widths */}
      {/* #403: gap-y-2 (8px), not gap-y-1 — the chips are 44px boxes on a phone and they wrap
          onto two rows, so the wrap seam is an adjacent-target seam. DESIGN.md pairs the 44px
          floor with "8px between adjacent targets". */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {personas.map((p) => {
          const busy = busyEmail === p.email
          return (
            <button
              key={p.email}
              type="button"
              disabled={disabled}
              aria-busy={busy}
              onClick={() => onPick(p.email)}
              className={showPassword
                ? 'text-primary font-medium hover:underline focus-visible:underline inline-flex items-center gap-1'
                : 'text-primary font-medium inline-flex items-center justify-center gap-1 rounded-md border border-border bg-background px-3 hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'}
              style={{
                fontSize: 'var(--font-size-body-lg)',
                // #403: the ≥44px touch floor is the shared auth.css seam's job, phone-only.
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
