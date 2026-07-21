// Signal collection ACTIONS seam (Issue 6, Option A — Director ruling 2026-07-21).
//
// The V3 RecordCollection engine loads DATA and owns query/URL/selection/state; the descriptor's
// presentations render that typed data. The remaining category/composer callbacks are React-scoped
// (they call the composer host or DAL), so the consuming page provides them through this small
// context and the Feed/Table presentation wrappers read them at render time. Record opening is
// deliberately supplied by the collection contract's injected onOpenRecord callback instead.
/* eslint-disable react-refresh/only-export-components -- context seam: provider + hook co-located */
import { createContext, useContext, type ReactNode } from 'react'
import type { SignalCategory } from '@/lib/db/signals.types'

export interface SignalCollectionActions {
  /** Set a Signal's category (mutates via the DAL, then refreshes the collection). */
  onCategorize?: (signalId: string, category: SignalCategory) => void
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
