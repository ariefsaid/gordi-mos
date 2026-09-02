/**
 * Breadcrumb chrome context (ADR-0013 D1 / OD-P4-9).
 *
 * Provides a lightweight cross-cutting channel so deep-mounted surfaces can push resolved
 * breadcrumb content up to the shell Breadcrumb without a global store. Two independent slots:
 *   - title         — the resolved record title (TaskSurface owns this; task-drawer.tsx writes it).
 *   - collectionLeaf — the active saved-view label for a collection route (Tasks owns this today).
 * They are separate fields, not a shared shape: a record route and a collection-view leaf are
 * different kinds of breadcrumb content and can be live at once (e.g. a Task drawer open over the
 * Tasks list), so one publisher must never be able to clobber the other's slot.
 *
 * API:
 *   BreadcrumbTitleProvider — wrap the shell grid so both TopBar and the Outlet are inside.
 *   useBreadcrumbTitle()    — reader; returns the current title or null.
 *   useSetBreadcrumbTitle() — writer hook; sets on mount/title-change, clears on unmount.
 *   useCollectionLeaf()     — reader; returns the current collection leaf or null.
 *   useSetCollectionLeaf()  — writer hook; sets on mount/change, clears on unmount.
 */

// Context files intentionally mix a Provider component with reader/writer hooks —
// the react-refresh rule is suppressed per the established pattern in this codebase.
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

export type CollectionLeaf = { label: string; hasNonDefaultView: boolean }

type BreadcrumbTitleContextValue = {
  title: string | null
  setTitle: (title: string | null) => void
  collectionLeaf: CollectionLeaf | null
  setCollectionLeaf: (leaf: CollectionLeaf | null) => void
}

const BreadcrumbTitleContext = createContext<BreadcrumbTitleContextValue | null>(null)

/** Wrap the shell (or the grid root) so both TopBar and the Outlet share the context. */
export function BreadcrumbTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)
  const [collectionLeaf, setCollectionLeaf] = useState<CollectionLeaf | null>(null)
  const setTitleStable = useCallback((t: string | null) => setTitle(t), [])
  const setCollectionLeafStable = useCallback((leaf: CollectionLeaf | null) => setCollectionLeaf(leaf), [])

  return (
    <BreadcrumbTitleContext.Provider
      value={{ title, setTitle: setTitleStable, collectionLeaf, setCollectionLeaf: setCollectionLeafStable }}
    >
      {children}
    </BreadcrumbTitleContext.Provider>
  )
}

/** Read the current dynamic breadcrumb title (or null when none is set / loading). */
export function useBreadcrumbTitle(): string | null {
  const ctx = useContext(BreadcrumbTitleContext)
  return ctx?.title ?? null
}

/**
 * Writer hook. Call inside the surface that owns the resolved title.
 * Sets the title on mount / when `title` changes, clears it on unmount
 * so navigating away from a record reverts the crumb back to the section label.
 */
export function useSetBreadcrumbTitle(title: string): void {
  const ctx = useContext(BreadcrumbTitleContext)
  const setTitle = ctx?.setTitle

  useEffect(() => {
    setTitle?.(title)
    return () => {
      setTitle?.(null)
    }
  }, [title, setTitle])
}

/** Read the active collection-view leaf (or null when no collection has published one). */
export function useCollectionLeaf(): CollectionLeaf | null {
  const ctx = useContext(BreadcrumbTitleContext)
  return ctx?.collectionLeaf ?? null
}

/**
 * Writer hook. Call inside the collection surface that owns the active-view label
 * (Tasks today). Sets the leaf on mount / when its fields change, clears it on unmount.
 * useLayoutEffect (not useEffect, matching the retired registry this replaces): the leaf feeds
 * the breadcrumb, which must not paint a stale label for one frame after a view switch.
 */
export function useSetCollectionLeaf(leaf: CollectionLeaf | null): void {
  const ctx = useContext(BreadcrumbTitleContext)
  const setCollectionLeaf = ctx?.setCollectionLeaf
  const label = leaf?.label ?? null
  const hasNonDefaultView = leaf?.hasNonDefaultView ?? false

  useLayoutEffect(() => {
    setCollectionLeaf?.(leaf)
    return () => setCollectionLeaf?.(null)
    // Depend on the leaf's primitive fields, not its object reference — a fresh object with the
    // same values every render (the common case) must not retrigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCollectionLeaf, label, hasNonDefaultView])
}
