import { useEffect } from 'react'
import { useAuth } from '../auth/useAuth'

// FR-017: placeholder home — viewer full name + sign-out. Real shell is P1-4.
// Design-plan §3 "Placeholder home": name in typography.heading, sign-out as button-outline.
export default function Home() {
  useEffect(() => {
    document.title = 'Gordi MOS — Management OS'
  }, [])

  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const signOut = auth.status === 'authenticated' ? auth.signOut : undefined

  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      {viewer && (
        <>
          {/* heading: 20px/700, ls -0.01em per DESIGN.md */}
          <h1
            className="font-bold text-foreground"
            style={{ fontSize: 20, lineHeight: 1.25, letterSpacing: '-0.01em', marginBottom: 16 }}
          >
            {viewer.person.full_name}
          </h1>

          {/* Sign-out — button-outline (background fill, input border, foreground text) */}
          <button
            type="button"
            className="bg-background text-foreground border border-input rounded-md font-medium hover:bg-accent"
            style={{ height: 32, padding: '0 12px', fontSize: 14 }}
            onClick={() => signOut?.()}
          >
            Sign out
          </button>
        </>
      )}
    </main>
  )
}
