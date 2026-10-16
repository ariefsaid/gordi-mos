import type { ReactNode } from 'react'
import { CafeWaitingContext, useCafeWaitingSource } from '@/lib/use-cafe-waiting'

/** Mount once in the shell: the nav badge, Café home and Review's queue selector share one set of reads. */
export function CafeWaitingProvider({ children }: { children: ReactNode }) {
  const value = useCafeWaitingSource(true)
  return <CafeWaitingContext.Provider value={value}>{children}</CafeWaitingContext.Provider>
}
