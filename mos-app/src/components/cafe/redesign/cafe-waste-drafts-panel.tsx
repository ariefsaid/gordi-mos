import type { ReactNode } from 'react'
import { Panel } from './worksheet'

/** Keeps browser drafts and server resumptions together without unmounting their live state. */
export function CafeWasteDraftsPanel({ title, children }: { title: string; children: ReactNode }) {
  return <Panel title={title} className="cwl-drafts-panel">{children}</Panel>
}
