import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/state-kit'

/** An operational empty state for a Café queue: the shared EmptyState (what is missing, why, one next step). */
export function CafeQueueEmpty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <EmptyState variant="blank" icon={null} title={title} copy={children}>{action}</EmptyState>
}
