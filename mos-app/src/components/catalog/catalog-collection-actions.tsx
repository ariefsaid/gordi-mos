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
  /**
   * Whether THIS viewer may write to the catalog. When false the list renders read-only: no
   * Rename / Archive / Unarchive on any row, and the page renders no create bar. Reading is
   * untouched — rows, traces and the relations disclosure all still render.
   *
   * This exists because the two catalogs no longer share a gate. Projects/Processes sits behind
   * `RequireCapability workline.manage`, so reaching it IS the permission. Objectives does not:
   * OD-V4-1 removed its read gate, so a viewer with no `objective.manage` now legitimately
   * reaches the surface and must not be offered writes they cannot perform (PORT-028).
   *
   * Affordance only. RLS is the boundary (NFR-004, DD-WAY-8) and refuses the write regardless.
   */
  canManage: boolean
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
