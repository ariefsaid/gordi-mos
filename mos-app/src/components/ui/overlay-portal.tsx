import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/** Render blocking layers outside the inert application root. */
export function OverlayPortal({ children }: { children: ReactNode }) {
  const target = document.getElementById('overlay-root')
    ?? (document.getElementById('root') ? document.body : null)
  return target ? createPortal(children, target) : <>{children}</>
}
