import { useEffect } from 'react'

/**
 * Sets `document.title`. Pass `null` to opt OUT of setting it for this render — used when a parent
 * route (TasksLayout) defers the title to a child that owns the real record name (R6, review r2),
 * so the parent's generic title never clobbers the child's record title via effect ordering.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title == null) return
    document.title = title
  }, [title])
}
