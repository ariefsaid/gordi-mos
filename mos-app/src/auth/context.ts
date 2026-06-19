import { createContext } from 'react'
import type { PeopleRow, RolesRow } from '@/lib/database.types'

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'orphan'; signOut: () => Promise<void> }
  | {
      status: 'authenticated'
      viewer: { person: PeopleRow; roles: RolesRow[]; isManager: boolean; accessRoles: string[] }
      signOut: () => Promise<void>
    }
  // PASSWORD_RECOVERY flow: session exists, user must set a new password before accessing the app.
  // clearRecovering is called by RecoveryPage on successful password update to proceed to home.
  | { status: 'recovering'; clearRecovering: () => void }

export const AuthContext = createContext<AuthState>({ status: 'loading' })
