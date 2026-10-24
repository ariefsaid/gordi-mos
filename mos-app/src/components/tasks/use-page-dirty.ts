import { useCallback, useRef } from 'react'

/**
 * The Task page reports one dirty flag to its leave guard. Field edits and the description document
 * each know only their own state, so the page is dirty while either is: one going clean never clears the other.
 */
export function usePageDirty(onDirtyChange: (dirty: boolean) => void) {
  const fields = useRef(false)
  const document = useRef(false)
  const report = useRef(onDirtyChange)
  report.current = onDirtyChange
  const onFieldDirty = useCallback((dirty: boolean) => { fields.current = dirty; report.current(dirty || document.current) }, [])
  const onDocumentDirty = useCallback((dirty: boolean) => { document.current = dirty; report.current(dirty || fields.current) }, [])
  return { onFieldDirty, onDocumentDirty }
}
