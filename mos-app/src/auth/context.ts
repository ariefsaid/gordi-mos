import { createContext } from 'react'
import type { PeopleRow, RolesRow } from '../lib/database.types'

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'orphan'; signOut: () => Promise<void> }
  | {
      status: 'authenticated'
      viewer: { person: PeopleRow; roles: RolesRow[]; isManager: boolean }
      signOut: () => Promise<void>
    }

export const AuthContext = createContext<AuthState>({ status: 'loading' })
