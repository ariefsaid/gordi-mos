/**
 * Breadcrumb chrome context (ADR-0013 D1 / OD-P4-9).
 *
 * Provides a lightweight cross-cutting channel so deep-mounted surfaces can push resolved
 * breadcrumb content up to the shell Breadcrumb without a global store. Two independent slots:
 *   - title         — the resolved record title (TaskSurface owns this; task-drawer.tsx writes it).
 *   - collectionLeaf — the active saved-view label for a collection route (Tasks owns this today).
 * They are separate fields, not a shared shape: a record title and a collection-view leaf are
 * different kinds of breadcrumb content and can be live at once (e.g. a Task drawer open over the
 * Tasks list). Their VALUES are independent — writing one never touches the other's field or
 * clears it early. Their NOTIFICATIONS are not: both live in one context object, so React has no
 * per-field subscription — a title-only change still re-renders every consumer of this context,
 * including one that only calls useCollectionLeaf(). Each reader hook still returns just its own
 * field, so that render is a no-op for it; it is churn, not a correctness bug.
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
import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'

export type CollectionLeaf = { label: string; hasNonDefaultView: boolean }

// Opaque per-writer identity so a departing collection publisher can only clear the leaf it
// itself set — see useSetCollectionLeaf.
type LeafOwner = object

type BreadcrumbTitleContextValue = {
  title: string | null
  setTitle: (title: string | null) => void
  collectionLeaf: CollectionLeaf | null
  setCollectionLeaf: (leaf: CollectionLeaf | null, owner: LeafOwner) => void
}

const BreadcrumbTitleContext = createContext<BreadcrumbTitleContextValue | null>(null)

/** Wrap the shell (or the grid root) so both TopBar and the Outlet share the context. */
export function BreadcrumbTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)
  const [collectionLeaf, setCollectionLeaf] = useState<CollectionLeaf | null>(null)
  const setTitleStable = useCallback((t: string | null) => setTitle(t), [])

  // Tracks which writer currently owns the leaf slot, so a stale/second writer's cleanup can't
  // wipe a leaf some OTHER, still-mounted publisher owns (only matters once a second collection
  // ever mounts the writer hook — Tasks is the only one today, but Signals now has the seam too).
  const leafOwnerRef = useRef<LeafOwner | null>(null)
  const setCollectionLeafStable = useCallback((leaf: CollectionLeaf | null, owner: LeafOwner) => {
    if (leaf === null) {
      if (leafOwnerRef.current !== owner) return
      leafOwnerRef.current = null
    } else {
      leafOwnerRef.current = owner
    }
    setCollectionLeaf(leaf)
  }, [])

  // Memoized so a Provider re-render that changes neither field (e.g. a parent-forced re-render)
  // doesn't hand consumers a new object reference for no reason. It does NOT decouple the two
  // slots' notifications from each other — see the "NOTIFICATIONS are not [independent]" note
  // above — that would need two separate contexts, which this channel doesn't need yet.
  const value = useMemo<BreadcrumbTitleContextValue>(
    () => ({ title, setTitle: setTitleStable, collectionLeaf, setCollectionLeaf: setCollectionLeafStable }),
    [title, setTitleStable, collectionLeaf, setCollectionLeafStable],
  )

  return (
    <BreadcrumbTitleContext.Provider value={value}>
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
 * Each call site gets its own stable owner token (one per mounted instance): the cleanup only
 * clears the slot if THIS instance still owns it, so a stale unmount from a departing publisher
 * can never wipe a leaf a second, still-live publisher already took over.
 */
export function useSetCollectionLeaf(leaf: CollectionLeaf | null): void {
  const ctx = useContext(BreadcrumbTitleContext)
  const setCollectionLeaf = ctx?.setCollectionLeaf
  const ownerRef = useRef<LeafOwner>({})
  const label = leaf?.label ?? null
  const hasNonDefaultView = leaf?.hasNonDefaultView ?? false

  useLayoutEffect(() => {
    // Copy the ref into a local so the cleanup below closes over a stable value, not the ref
    // itself (ownerRef.current never actually changes across this hook's lifetime, but the lint
    // rule can't know that).
    const owner = ownerRef.current
    setCollectionLeaf?.(leaf, owner)
    return () => setCollectionLeaf?.(null, owner)
    // Depend on the leaf's primitive fields, not its object reference — a fresh object with the
    // same values every render (the common case) must not retrigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCollectionLeaf, label, hasNonDefaultView])
}
