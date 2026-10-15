import { useLayoutEffect, useRef, type ReactNode } from 'react'

/** A bounded work area: its scrollport ends above the transaction controls. */
export function CafeTransactionWorkspace({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => {
      const navigation = document.querySelector<HTMLElement>('.bottom-tab-bar')
      const clearance = navigation && navigation.getClientRects().length ? navigation.getBoundingClientRect().height : 0
      const viewport = window.visualViewport
      const bottom = viewport ? viewport.height + viewport.offsetTop : window.innerHeight
      node.style.height = `${Math.max(180, bottom - node.getBoundingClientRect().top - clearance)}px`
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (node.parentElement) observer.observe(node.parentElement)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
    }
  }, [])
  return <div className="cafe-transaction-workspace" ref={ref}>{children}</div>
}
