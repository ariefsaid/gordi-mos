// Catalog collection ACTIONS seam (V3 catalog grammar — Projects & Processes / Objectives).
//
// The RecordCollection engine loads DATA and owns query/URL/state; the descriptor's single `list`
// presentation renders that typed data. The management mutations (rename / archive / unarchive) are
// React-scoped (they call the DAL, then reload the collection), so the consuming page provides them
// through this small context. The collection keeps one canonical record link per row; mutations live
// in the shared record document's overflow menu rather than in a second per-row action cluster.
/* eslint-disable react-refresh/only-export-components -- context seam: provider + hook co-located */
import { createContext, useContext, type ReactNode } from 'react'

export interface CatalogCollectionActions {
  /**
   * Whether THIS viewer may write to the catalog. When false the list renders read-only: no
   * Create action and no record overflow mutations. Reading is untouched — rows and linked facts
   * still render.
   *
   * This exists because catalog reads are org-wide while effective write scope is runtime data.
   * A viewer can legitimately reach either surface without a write grant and must not be offered
   * mutations they cannot perform (PORT-028).
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
  /** Optional focused draft controller. The collection head opens this draft; the presentation
   * renders it inside the list. */
  createDraft?: CatalogCreateDraft
}

export interface CatalogCreateDraft {
  kind: 'objective' | 'work-line'
  open: boolean
  name: string
  type?: 'project' | 'process'
  objectiveId?: string | null
  businessUnitId?: string | null
  businessUnitRequired?: boolean
  objectiveOptions?: readonly { value: string; label: string }[]
  businessUnitOptions?: readonly { value: string; label: string }[]
  adding: boolean
  error: string
  onNameChange: (name: string) => void
  onTypeChange?: (type: 'project' | 'process') => void
  onObjectiveChange?: (id: string | null) => void
  onBusinessUnitChange?: (id: string | null) => void
  onSubmit: () => void
  onCancel: () => void
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
