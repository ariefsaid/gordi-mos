import { useAuth } from './useAuth'

// FR-016: authenticated user with no linked people row sees this blocked screen.
// The only action is sign-out — no nav, no directory read/write (OD-P1-10).
// Design-plan §3 OrphanBlockedPage: AuthShell frame + warning tile + subheading + body + sign-out primary.
export function OrphanScreen() {
  const auth = useAuth()
  const signOut = auth.status === 'orphan' ? auth.signOut : undefined

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-4">
      {/* Brand block — same as AuthShell (they did authenticate, product frame is honest) */}
      <div className="w-full max-w-[360px] mb-6 flex items-center gap-2">
        <div
          className="flex items-center justify-center bg-primary text-primary-foreground rounded-sm font-bold select-none"
          style={{ width: 28, height: 28, fontSize: 14, letterSpacing: '-0.01em' }}
          aria-hidden="true"
        >
          G
        </div>
        <div className="flex flex-col leading-none">
          <span
            className="text-foreground font-bold"
            style={{ fontSize: 14, letterSpacing: '-0.01em' }}
          >
            Gordi MOS
          </span>
          <span
            className="text-muted-foreground font-semibold uppercase tracking-[0.06em]"
            style={{ fontSize: 11 }}
          >
            Management OS
          </span>
        </div>
      </div>

      {/* Card — border-only, flat-by-default */}
      <div
        className="w-full max-w-[360px] bg-card border border-border rounded-md"
        style={{ padding: 24 }}
      >
        {/* Status icon tile — warning/18% tint (not destructive; "not set up yet," not user error) */}
        <div
          className="flex items-center justify-center rounded-full mb-4 mx-auto"
          style={{
            width: 40,
            height: 40,
            backgroundColor: 'hsl(var(--warning) / 0.18)',
            color: 'hsl(var(--warning-foreground))',
            fontSize: 18,
          }}
          aria-hidden="true"
        >
          ⚠
        </div>

        {/* Title — subheading (18px/600) */}
        <h1
          className="text-foreground font-semibold text-center mb-2"
          style={{ fontSize: 18, lineHeight: 1.3 }}
        >
          Your account isn't set up yet
        </h1>

        {/* Body — 14px, muted-foreground */}
        <p
          className="text-muted-foreground text-center mb-6"
          style={{ fontSize: 14 }}
        >
          We couldn't find your Gordi MOS profile. Contact Arief to get set up.
        </p>

        {/* Sign out — the ONE primary button on this screen (One Blue Rule) */}
        <button
          type="button"
          className="w-full flex items-center justify-center bg-primary text-primary-foreground rounded-md font-medium"
          style={{ height: 32, fontSize: 14 }}
          onClick={() => signOut?.()}
          // autoFocus intentional: single-action blocking screen — keyboard users land on exit (design-plan §5)
          autoFocus
        >
          Sign out
        </button>
      </div>

      {/* Foot contact line */}
      <p className="mt-6 text-muted-foreground text-center" style={{ fontSize: 13 }}>
        Trouble signing in? Contact Arief.
      </p>
    </div>
  )
}
