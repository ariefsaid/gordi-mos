// Shared auth chrome used by LoginPage, RecoveryPage, and OrphanScreen.
// Design-plan §2: centered viewport + brand block + foot line.

// Inline spinner — aria-hidden; button label carries meaning (design-plan §5)
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={['animate-spin', className].filter(Boolean).join(' ')}
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

// AuthShell — centered viewport + brand block + foot line
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-4">
      {/* Brand block — mirrors IA-8 rail brand */}
      <div className="w-full max-w-[360px] mb-6 flex items-center gap-2">
        {/* Logo square: 28px, primary bg, primary-foreground glyph, rounded-sm */}
        <div
          className="flex items-center justify-center bg-primary text-primary-foreground rounded-sm font-bold select-none"
          style={{ width: 28, height: 28, fontSize: 14, letterSpacing: '-0.01em' }}
          aria-hidden="true"
        >
          G
        </div>
        <div className="flex flex-col leading-none">
          {/* Brand name: 14px/700, ls -0.01em (heading weight, not page-title) */}
          <span
            className="text-foreground font-bold"
            style={{ fontSize: 14, letterSpacing: '-0.01em' }}
          >
            Gordi MOS
          </span>
          {/* Overline: 11px/600, ls 0.06em, uppercase, muted-foreground */}
          <span
            className="text-muted-foreground font-semibold uppercase tracking-[0.06em]"
            style={{ fontSize: 11 }}
          >
            Management OS
          </span>
        </div>
      </div>

      {children}

      {/* Foot line: body 13px, muted-foreground */}
      <p
        className="mt-6 text-muted-foreground text-center"
        style={{ fontSize: 13 }}
      >
        Trouble signing in? Contact Arief.
      </p>
    </div>
  )
}

// AuthCard — border-only, rounded-md, padding spacing.6 (24px), flat-by-default
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full max-w-[360px] bg-card border border-border rounded-md"
      style={{ padding: 24 }}
    >
      {children}
    </div>
  )
}
