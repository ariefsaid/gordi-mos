import { useEffect, type RefObject } from 'react'
import { focusableWithin } from '@/lib/focusable'

const activeTraps: HTMLElement[] = []

function layerIndex(element: HTMLElement): number {
  for (let current: HTMLElement | null = element; current && current !== document.body; current = current.parentElement) {
    const value = Number.parseInt(window.getComputedStyle(current).zIndex, 10)
    if (Number.isFinite(value)) return value
  }
  return 0
}

function isTopmostTrap(container: HTMLElement): boolean {
  const containerLayer = layerIndex(container)
  return !activeTraps.some((candidate) => {
    if (candidate === container || !candidate.isConnected) return false
    if (container.contains(candidate)) return true
    if (candidate.contains(container)) return false

    const candidateLayer = layerIndex(candidate)
    if (candidateLayer !== containerLayer) return candidateLayer > containerLayer
    return Boolean(container.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
}

/** Keep keyboard Tab navigation inside the active focus scope. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const container = active ? ref.current : null
    if (!container) return

    activeTraps.push(container)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !isTopmostTrap(container)) return

      const controls = focusableWithin(container)
      if (controls.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = controls[0]
      const last = controls[controls.length - 1]
      const focusIsUnlisted = !controls.includes(document.activeElement as HTMLElement)
      if (event.shiftKey && (document.activeElement === first || focusIsUnlisted)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || focusIsUnlisted)) {
        event.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      const index = activeTraps.lastIndexOf(container)
      if (index !== -1) activeTraps.splice(index, 1)
    }
  }, [active, ref])
}
