import { useLayoutEffect, useState, type CSSProperties } from 'react'

const GAP = 12

/**
 * Where a desktop companion sits beside an open record: its right edge a gap left of the record
 * panel's real left edge, and no wider than the canvas between the content start and that edge.
 * Derived from rendered bounds, so no panel width, content cap or rail state can make them overlap.
 */
export function besideRecordPlacement(
  recordLeft: number,
  contentLeft: number,
  viewportWidth: number,
  preferredWidth: number,
): { right: number; width: number } {
  return {
    right: viewportWidth - recordLeft + GAP,
    width: Math.max(0, Math.min(preferredWidth, recordLeft - contentLeft - 2 * GAP)),
  }
}

/** Inline custom properties that place the companion beside the open record, or none. */
export function useBesideRecordPlacement(active: boolean, recordKey: string | undefined): CSSProperties | undefined {
  const [placement, setPlacement] = useState<{ right: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!active) {
      setPlacement(null)
      return
    }
    const record = document.querySelector<HTMLElement>('[data-overlay-host="true"]')
    if (!record) {
      setPlacement(null)
      return
    }
    const content = document.getElementById('main-content')
    const measure = () => {
      const preferred = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--assistant-w')) || 400
      setPlacement(besideRecordPlacement(
        record.getBoundingClientRect().left,
        content?.getBoundingClientRect().left ?? 0,
        document.documentElement.clientWidth,
        preferred,
      ))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(record)
    if (content) observer?.observe(content)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [active, recordKey])

  if (!active || !placement) return undefined
  return {
    '--companion-right': `${placement.right}px`,
    '--companion-width': `${placement.width}px`,
  } as CSSProperties
}
