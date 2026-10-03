import { useEffect, useRef, type RefObject } from 'react'

type EscapeLayerOptions = {
  /** A non-closable top layer still consumes Escape instead of leaking it underneath. */
  closeOnEscape?: boolean
  /** Let a more-local editor handle Escape before this layer. */
  deferEscape?: (event: KeyboardEvent) => boolean
  /** Optional top-layer Tab behavior (shared menus close and move focus out). */
  onTab?: (event: KeyboardEvent) => void
}

type EscapeLayer = {
  elementRef: RefObject<HTMLElement | null>
  close: () => void
  options: () => EscapeLayerOptions
  position: 'normal' | 'primary' | 'companion'
}

const layers: EscapeLayer[] = []
let listeningDocument: Document | null = null

function topEscapeLayer(): EscapeLayer | null {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]
    if (layer.elementRef.current?.isConnected) return layer
  }
  return null
}

function onDocumentKeyDown(event: KeyboardEvent) {
  const layer = topEscapeLayer()
  if (!layer) return

  if (event.key === 'Escape') {
    if (event.defaultPrevented) return

    const nested = event.target instanceof Element
      ? event.target.closest('[data-escape-layer="nested"]')
      : null
    // Components with their own local dismissal can mark themselves nested. Registered menus
    // are handled by this stack; an unregistered nested control gets the first Escape itself.
    if (nested && !layers.some((entry) => entry.elementRef.current === nested)) return

    const options = layer.options()
    if (options.deferEscape?.(event)) return

    event.preventDefault()
    event.stopImmediatePropagation()
    if (options.closeOnEscape !== false) layer.close()
    return
  }

  if (event.key === 'Tab') {
    const onTab = layer.options().onTab
    if (!onTab) return
    onTab(event)
    event.stopImmediatePropagation()
  }
}

function registerEscapeLayer(layer: EscapeLayer): () => void {
  // Visual layer priority, not mount order: a late-mounted record stays beneath an open modal.
  const priority = { primary: 0, companion: 1, normal: 2 } as const
  const insertAt = layers.findIndex((entry) => priority[entry.position] > priority[layer.position])
  if (insertAt < 0) layers.push(layer)
  else layers.splice(insertAt, 0, layer)
  if (!listeningDocument) {
    listeningDocument = document
    listeningDocument.addEventListener('keydown', onDocumentKeyDown, true)
  }

  return () => {
    const index = layers.indexOf(layer)
    if (index >= 0) layers.splice(index, 1)
    if (layers.length === 0 && listeningDocument) {
      listeningDocument.removeEventListener('keydown', onDocumentKeyDown, true)
      listeningDocument = null
    }
  }
}

/** True only for the currently topmost, connected Escape layer. */
export function isTopEscapeLayer(element: HTMLElement | null): boolean {
  return !!element && topEscapeLayer()?.elementRef.current === element
}

/** Register one mounted overlay/menu in the shared Escape stack. */
export function useEscapeLayer(
  open: boolean,
  elementRef: RefObject<HTMLElement | null>,
  close: () => void,
  options: EscapeLayerOptions = {},
  position: EscapeLayer['position'] = 'normal',
) {
  const closeRef = useRef(close)
  closeRef.current = close
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    return registerEscapeLayer({
      elementRef,
      close: () => closeRef.current(),
      options: () => optionsRef.current,
      position,
    })
  }, [open, elementRef, position])
}
