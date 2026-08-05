import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsCoarsePointer } from '@/shell/use-is-coarse-pointer'

/**
 * DO-22(a)/(b) shared presentation decision (census admin-people P2-A): the people list
 * presents as cards whenever hover cannot be relied on — below 768px OR on a coarse
 * pointer at any width (touch tablet at 768–1024). The page host reads the same hook to
 * decide whether to draw the outer container chrome, so table-chrome and card-list can
 * never disagree.
 */
export function usePeopleListPresentsCards(): boolean {
  const isDesktop = useIsDesktop()
  const isCoarse = useIsCoarsePointer()
  return !isDesktop || isCoarse
}
