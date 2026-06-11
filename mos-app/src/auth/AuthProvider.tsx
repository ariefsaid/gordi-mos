import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { resolveViewer } from '../lib/db/viewer'
import { AuthContext, type AuthState } from './context'

// FR-009: session persistence + auto-refresh is configured on the supabase client (T-004) —
// no extra code needed here; just subscribe to state changes.
//
// PASSWORD_RECOVERY (security audit L1): when Supabase fires PASSWORD_RECOVERY, the session is
// live but the user must set a new password before accessing the app. We park in `recovering`
// status and let RedirectIfAuthed / ProtectedRoute keep the user on /recovery until they do.
// clearRecovering() is called by RecoveryPage on a successful updateUser — it then resolves the
// viewer and transitions to `authenticated`.

interface Props {
  children: ReactNode
}

export function AuthProvider({ children }: Props) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  // Track the user ID captured during PASSWORD_RECOVERY so clearRecovering can resolve the viewer.
  const recoveryUserIdRef = useRef<string | undefined>(undefined)
  // Guard against the getSession() bootstrap overwriting the `recovering` state set by
  // PASSWORD_RECOVERY. Since both run concurrently, we set this flag in the event handler
  // so resolveSession can bail out if recovery has already been detected.
  const isRecoveringRef = useRef(false)

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    setState({ status: 'unauthenticated' })
  }, [])

  const handleClearRecovering = useCallback(async () => {
    // Clear the guard before resolving so resolveSession is no longer blocked.
    isRecoveringRef.current = false
    const userId = recoveryUserIdRef.current
    if (!userId) {
      setState({ status: 'unauthenticated' })
      return
    }
    const result = await resolveViewer(userId)
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
  }, [handleSignOut])

  useEffect(() => {
    let cancelled = false

    async function resolveSession(userId: string | undefined) {
      // Bail out if PASSWORD_RECOVERY was already detected — do not overwrite recovering state.
      if (isRecoveringRef.current) return

      if (!userId) {
        if (!cancelled) setState({ status: 'unauthenticated' })
        return
      }

      const result = await resolveViewer(userId)
      if (cancelled) return
      // Second check after async boundary — event may have fired while we were awaiting.
      if (isRecoveringRef.current) return

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
      if (event === 'PASSWORD_RECOVERY') {
        // Park in recovering — do NOT call resolveSession; keep the user on /recovery.
        // Set the guard ref BEFORE setState so any concurrent resolveSession sees it.
        isRecoveringRef.current = true
        recoveryUserIdRef.current = session?.user?.id
        if (!cancelled) setState({ status: 'recovering', clearRecovering: handleClearRecovering })
      } else if (event === 'SIGNED_IN') {
        resolveSession(session?.user?.id)
      } else if (event === 'SIGNED_OUT') {
        isRecoveringRef.current = false
        if (!cancelled) setState({ status: 'unauthenticated' })
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [handleSignOut, handleClearRecovering])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
