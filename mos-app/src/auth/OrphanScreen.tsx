import { useAuth } from './useAuth'

// FR-016: authenticated user with no linked people row sees this blocked screen.
// Only action is sign-out — no nav, no directory read/write.
export function OrphanScreen() {
  const auth = useAuth()
  const signOut = auth.status === 'orphan' ? auth.signOut : undefined

  return (
    <main>
      <p>Your account isn&apos;t set up yet — contact Arief.</p>
      <button
        type="button"
        onClick={() => signOut?.()}
      >
        Sign out
      </button>
    </main>
  )
}
