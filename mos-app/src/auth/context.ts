import { createContext } from 'react'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { ReadScope } from '@/lib/scoped-reads'

export type AuthState =
  | { status: 'loading' }
  // signedOut: this browser's session just ended (sign-out here or in another tab). The next
  // person to sign in is not assumed to be the last one, so no return route is kept for them.
  | { status: 'unauthenticated'; signedOut?: true }
  | { status: 'orphan'; signOut: () => Promise<void> }
  | {
      status: 'authenticated'
      viewer: { person: PeopleRow; roles: RolesRow[]; isManager: boolean; accessRoles: string[]; affiliated: string[] }
      signOut: () => Promise<void>
      // Optional for provider-less typed fixtures; production AuthProvider always supplies a scope.
      readScope?: ReadScope
    }
  // PASSWORD_RECOVERY flow: session exists, user must set a new password before accessing the app.
  // clearRecovering is called by RecoveryPage on successful password update to proceed to home.
  | { status: 'recovering'; clearRecovering: () => void | Promise<void> }

export const AuthContext = createContext<AuthState>({ status: 'loading' })
