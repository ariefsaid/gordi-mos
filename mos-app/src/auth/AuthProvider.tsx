import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { resolveViewer } from '../lib/db/viewer'
import { AuthContext, type AuthState } from './context'

// FR-009: session persistence + auto-refresh is configured on the supabase client (T-004) —
// no extra code needed here; just subscribe to state changes.

interface Props {
  children: ReactNode
}

export function AuthProvider({ children }: Props) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    setState({ status: 'unauthenticated' })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function resolveSession(userId: string | undefined) {
      if (!userId) {
        if (!cancelled) setState({ status: 'unauthenticated' })
        return
      }

      const result = await resolveViewer(userId)
      if (cancelled) return

      if (result.person === null) {
        setState({ status: 'orphan', signOut: handleSignOut })
      } else {
        setState({
          status: 'authenticated',
          viewer: {
            person: result.person,
            roles: result.roles,
            isManager: result.isManager,
          },
          signOut: handleSignOut,
        })
      }
    }

    // Bootstrap: check existing session
    supabase.auth.getSession().then(({ data }) => {
      resolveSession(data.session?.user?.id)
    })

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        resolveSession(session?.user?.id)
      } else if (event === 'SIGNED_OUT') {
        if (!cancelled) setState({ status: 'unauthenticated' })
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [handleSignOut])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
