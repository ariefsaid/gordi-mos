// The phone top bar's back slot: TopBar registers its empty element here, PageBackLink portals the
// page's back control into it below 768px. No slot (auth pages, tests) = the link stays inline.
import { useSyncExternalStore } from 'react'

let slot: HTMLElement | null = null
const subs = new Set<() => void>()

export function setTopBarBackSlot(el: HTMLElement | null) {
  if (slot === el) return
  slot = el
  subs.forEach((f) => f())
}

export function useTopBarBackSlot(): HTMLElement | null {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => slot)
}
