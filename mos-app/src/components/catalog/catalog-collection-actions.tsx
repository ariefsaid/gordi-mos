// Catalog collection ACTIONS seam (V3 catalog grammar — Projects & Processes / Objectives).
//
// The RecordCollection engine loads DATA and owns query/URL/state; the descriptor's single `list`
// presentation renders that typed data. The management mutations (rename / archive / unarchive) are
// React-scoped (they call the DAL, then reload the collection), so the consuming page provides them
// through this small context and the list presentation reads them at render time. There is NO record
// panel for a catalog row — the inline management actions ARE the row's primary interaction.
/* eslint-disable react-refresh/only-export-components -- context seam: provider + hook co-located */
import { createContext, useContext, type ReactNode } from 'react'

export interface CatalogCollectionActions {
  /** Rename a row (mutates via the DAL, then reloads the collection). Rejects on failure. */
  rename: (id: string, name: string) => Promise<void>
  /** Archive a row (soft). Rejects on failure. */
  archive: (id: string) => Promise<void>
  /** Restore an archived row. Rejects on failure. */
  unarchive: (id: string) => Promise<void>
}

const CatalogCollectionActionsContext = createContext<CatalogCollectionActions | null>(null)

export function CatalogCollectionActionsProvider({
  actions,
  children,
}: {
  actions: CatalogCollectionActions
  children: ReactNode
}) {
  return (
    <CatalogCollectionActionsContext.Provider value={actions}>
      {children}
    </CatalogCollectionActionsContext.Provider>
  )
}

export function useCatalogCollectionActions(): CatalogCollectionActions {
  const actions = useContext(CatalogCollectionActionsContext)
  if (!actions) {
    throw new Error('useCatalogCollectionActions must be used within a CatalogCollectionActionsProvider')
  }
  return actions
}
