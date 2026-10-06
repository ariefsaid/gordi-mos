import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveViewer } from '@/lib/db/viewer'
import type { ViewerResult } from '@/lib/db/viewer'
import type { PeopleRow } from '@/lib/database.types'
import {
  publishReadScope,
  type ReadScope,
} from '@/lib/scoped-reads'
import { clearDeviceDrafts } from '@/lib/device-drafts'
import { isSampleAccountOutsideSampleOrg } from '@/pages/demo-personas'
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

// Scope generations survive provider unmount/remount in this JS activation. A reload also reloads
// the in-memory read module, so it cannot revive an earlier lease.
let nextReadScopeGeneration = 0

function makeAuthorityKey(result: ViewerResult): string {
  const roles = result.roles
    .map((role) => ({
      id: role.id,
      orgId: role.org_id,
      businessUnitId: role.business_unit_id,
      reportsToRoleId: role.reports_to_role_id,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))

  return JSON.stringify({
    roles,
    isManager: result.isManager,
    accessRoles: [...new Set(result.accessRoles)].sort(),
    affiliated: [...new Set(result.affiliated)].sort(),
  })
}

function sameScopeFacts(left: ReadScope, right: Omit<ReadScope, 'generation'>): boolean {
  return left.authUserId === right.authUserId
    && left.viewerId === right.viewerId
    && left.orgId === right.orgId
    && left.authorityKey === right.authorityKey
}

function buildReadScope(
  authUserId: string,
  person: PeopleRow,
  result: ViewerResult,
  previous: ReadScope | null,
): ReadScope {
  const facts = {
    authUserId,
    viewerId: person.id,
    orgId: person.org_id,
    authorityKey: makeAuthorityKey(result),
  }
  if (previous && sameScopeFacts(previous, facts)) return previous
  nextReadScopeGeneration += 1
  return Object.freeze({ generation: nextReadScopeGeneration, ...facts })
}

export function AuthProvider({ children }: Props) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const activeScopeRef = useRef<ReadScope | null>(null)
  const resolutionTicketRef = useRef(0)
  const providerMountedRef = useRef(false)
  // Track the user ID captured during PASSWORD_RECOVERY so clearRecovering can resolve the viewer.
  const recoveryUserIdRef = useRef<string | undefined>(undefined)
  // Guard against the getSession() bootstrap overwriting the `recovering` state set by
  // PASSWORD_RECOVERY. Since both run concurrently, we set this flag in the event handler so
  // resolveSession can bail out if recovery has already been detected.
  const isRecoveringRef = useRef(false)

  const retireReadScope = useCallback(() => {
    activeScopeRef.current = null
    publishReadScope(null)
  }, [])

  const handleSignOut = useCallback(async () => {
    const ticket = ++resolutionTicketRef.current
    isRecoveringRef.current = false
    retireReadScope()
    await clearDeviceDrafts()
    await supabase.auth.signOut()
    if (ticket === resolutionTicketRef.current) {
      setState({ status: 'unauthenticated', signedOut: true })
    }
  }, [retireReadScope])

  const resolveSession = useCallback(async (userId: string | undefined, accessToken?: string) => {
    const ticket = ++resolutionTicketRef.current
    if (isRecoveringRef.current || !providerMountedRef.current) return

    if (!userId) {
      retireReadScope()
      recoveryUserIdRef.current = undefined
      setState({ status: 'unauthenticated' })
      return
    }

    if (isSampleAccountOutsideSampleOrg(accessToken)) {
      await handleSignOut()
      return
    }

    const previousScope = activeScopeRef.current
    if (previousScope && previousScope.authUserId !== userId) {
      retireReadScope()
      setState({ status: 'loading' })
    }

    const result = await resolveViewer(userId, accessToken)
    if (!providerMountedRef.current || ticket !== resolutionTicketRef.current || isRecoveringRef.current) return

    const person = result.person
    if (person === null) {
      retireReadScope()
      setState({ status: 'orphan', signOut: handleSignOut })
      return
    }

    const readScope = buildReadScope(userId, person, result, activeScopeRef.current)
    activeScopeRef.current = readScope
    publishReadScope(readScope)
    setState({
      status: 'authenticated',
      viewer: {
        person,
        roles: result.roles,
        isManager: result.isManager,
        accessRoles: result.accessRoles,
        affiliated: result.affiliated,
      },
      readScope,
      signOut: handleSignOut,
    })
  }, [handleSignOut, retireReadScope])

  const handleClearRecovering = useCallback(async () => {
    // Clearing recovery starts a fresh viewer-resolution ticket; an auth event during getSession
    // supersedes it and must remain the source of truth.
    isRecoveringRef.current = false
    const ticket = ++resolutionTicketRef.current
    const userId = recoveryUserIdRef.current
    if (!userId) {
      retireReadScope()
      setState({ status: 'unauthenticated' })
      return
    }
    const { data } = await supabase.auth.getSession()
    if (!providerMountedRef.current || ticket !== resolutionTicketRef.current || isRecoveringRef.current) return
    await resolveSession(userId, data.session?.access_token)
  }, [resolveSession, retireReadScope])

  useEffect(() => {
    let cancelled = false
    providerMountedRef.current = true

    // A provider mount begins without an active scope. The module-level generation allocator
    // prevents a later mount for the same viewer from recreating an earlier lease identity.
    retireReadScope()

    // Bootstrap only owns the ticket that was current when it began. Any auth event or
    // resolution that arrives first supersedes this potentially stale session snapshot.
    const bootstrapTicket = resolutionTicketRef.current
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && bootstrapTicket === resolutionTicketRef.current) {
        void resolveSession(data.session?.user?.id, data.session?.access_token)
      }
    })

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Park in recovering — do NOT resolve a viewer until recovery is cleared.
        isRecoveringRef.current = true
        resolutionTicketRef.current += 1
        retireReadScope()
        recoveryUserIdRef.current = session?.user?.id
        if (!cancelled) setState({ status: 'recovering', clearRecovering: handleClearRecovering })
      } else if (event === 'SIGNED_IN') {
        void resolveSession(session?.user?.id, session?.access_token)
      } else if (event === 'SIGNED_OUT') {
        isRecoveringRef.current = false
        resolutionTicketRef.current += 1
        recoveryUserIdRef.current = undefined
        retireReadScope()
        if (!cancelled) setState({ status: 'unauthenticated', signedOut: true })
      }
    })

    return () => {
      cancelled = true
      providerMountedRef.current = false
      resolutionTicketRef.current += 1
      retireReadScope()
      subscription.unsubscribe()
    }
  }, [handleClearRecovering, resolveSession, retireReadScope])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
