// Signal collection ACTIONS seam (Issue 6, Option A — Director ruling 2026-07-21).
//
// The V3 RecordCollection engine loads DATA and owns query/URL/selection/state; the descriptor's
// presentations render that typed data. But the record-opening + composer + categorize callbacks are
// React-scoped (they call useNavigate / the composer host / the DAL). They cannot travel through the
// descriptor's `load`-built context. So the consuming page provides them through this small React
// context, and the Feed/Table presentation wrappers read them at render time.
//
// Option A note: `onOpen` here still drives the EXISTING `?record=` record-opening seam (navigate to
// the canonical Signal record URL) — NOT the Issue-4 overlay host. Host-slot adoption is gated on the
// Issue-4 route-seam slice (R-T-4); a later follow-up swaps both signals and tasks opening seams.
/* eslint-disable react-refresh/only-export-components -- context seam: provider + hook co-located */
import { createContext, useContext, type ReactNode } from 'react'
import type { SignalCategory } from '@/lib/db/signals.types'

export interface SignalCollectionActions {
  /** Open a Signal's canonical record (Option A: navigates to `?record=<id>`). */
  onOpen?: (signalId: string) => void
  /** Set a Signal's category (mutates via the DAL, then refreshes the collection). */
  onCategorize?: (signalId: string, category: SignalCategory) => void
  /** Create a follow-up Task for a Signal (navigates to the canonical record where the flow lives). */
  onCreateTask?: (signalId: string) => void
  /** Open the shared Signal composer host. */
  onShareClick?: () => void
}

const SignalCollectionActionsContext = createContext<SignalCollectionActions>({})

export function SignalCollectionActionsProvider({
  actions,
  children,
}: {
  actions: SignalCollectionActions
  children: ReactNode
}) {
  return (
    <SignalCollectionActionsContext.Provider value={actions}>
      {children}
    </SignalCollectionActionsContext.Provider>
  )
}

export function useSignalCollectionActions(): SignalCollectionActions {
  return useContext(SignalCollectionActionsContext)
}
