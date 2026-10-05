import { useLayoutEffect, useState, type CSSProperties } from 'react'

const GAP = 12

export function findRecordIdentityHeader(record: ParentNode): HTMLElement | null {
  return record.querySelector<HTMLElement>('[data-record-header]')
}

export function recordColumnPlacement(
  record: Pick<DOMRect, 'left' | 'right' | 'top' | 'width'>,
  identityHeaderBottom: number,
  viewportWidth: number,
  preferredWidth: number,
): { right: number; width: number; top: number } {
  return {
    right: Math.max(0, viewportWidth - record.right),
    width: Math.max(0, Math.min(preferredWidth, record.width)),
    top: Math.max(record.top, identityHeaderBottom + GAP),
  }
}

/** Position Deputy in the active record's column, below the identity/actions header. */
export function useRecordColumnPlacement(active: boolean, recordKey: string | undefined): CSSProperties | undefined {
  const [placement, setPlacement] = useState<{ right: number; width: number; top: number } | null>(null)

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
    const measure = () => {
      const bounds = record.getBoundingClientRect()
      const identityHeader = findRecordIdentityHeader(record)
      const sharedChrome = record.querySelector<HTMLElement>('.record-panel-chrome')
      const headerBottom = identityHeader?.getBoundingClientRect().bottom
        ?? sharedChrome?.getBoundingClientRect().bottom
        ?? bounds.top
      const preferred = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--assistant-w')) || 400
      setPlacement(recordColumnPlacement(
        bounds,
        headerBottom,
        document.documentElement.clientWidth,
        preferred,
      ))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(record)
    const identityHeader = findRecordIdentityHeader(record)
    if (identityHeader) observer?.observe(identityHeader)
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
    '--companion-top': `${placement.top}px`,
  } as CSSProperties
}
