import { useAuth } from './useAuth'
import { AuthShell, AuthCard } from './AuthShell'

// FR-016: authenticated user with no linked people row sees this blocked screen.
// The only action is sign-out — no nav, no directory read/write (OD-P1-10).
// Design-plan §3 OrphanBlockedPage: AuthShell frame + warning tile + subheading + body + sign-out primary.
export function OrphanScreen() {
  const auth = useAuth()
  const signOut = auth.status === 'orphan' ? auth.signOut : undefined

  return (
    <AuthShell>
      {/* Card — border-only, flat-by-default */}
      <AuthCard>
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
      </AuthCard>
    </AuthShell>
  )
}
