import type { ReactNode } from 'react'
import { Worksheet } from './worksheet'

/** Page-local task topology for the two Plan faces. */
export function PlanWorkspace({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`cafe-plan-workspace ${className}`.trim()}>{children}</div>
}

export function PlanSheet({ children, label }: { children: ReactNode; label: string }) {
  return <Worksheet label={label} className="cafe-plan-sheet">{children}</Worksheet>
}

export function PlanScope({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`cafe-plan-scope ${className}`.trim()}>{children}</section>
}
