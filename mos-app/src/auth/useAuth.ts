import { useContext } from 'react'
import { AuthContext, type AuthState } from './context'

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
