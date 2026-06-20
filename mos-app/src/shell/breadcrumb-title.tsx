/**
 * Breadcrumb title context (ADR-0013 D1 / OD-P4-9).
 *
 * Provides a lightweight cross-cutting channel so deep-mounted surfaces (TaskSurface)
 * can push the resolved task title up to the shell Breadcrumb without a global store.
 *
 * API:
 *   BreadcrumbTitleProvider — wrap the shell grid so both TopBar and the Outlet are inside.
 *   useBreadcrumbTitle()    — reader; returns the current title or null.
 *   useSetBreadcrumbTitle() — writer hook; sets on mount/title-change, clears on unmount.
 */

// Context files intentionally mix a Provider component with reader/writer hooks —
// the react-refresh rule is suppressed per the established pattern in this codebase.
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

type BreadcrumbTitleContextValue = {
  title: string | null
  setTitle: (title: string | null) => void
}

const BreadcrumbTitleContext = createContext<BreadcrumbTitleContextValue | null>(null)

/** Wrap the shell (or the grid root) so both TopBar and the Outlet share the context. */
export function BreadcrumbTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)
  const setTitleStable = useCallback((t: string | null) => setTitle(t), [])

  return (
    <BreadcrumbTitleContext.Provider value={{ title, setTitle: setTitleStable }}>
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
