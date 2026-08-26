// useFollowUpRecordOpener — the intended ONE follow-up record-open grammar. Today only the Work
// Tasks saved-view embed uses it; pages/follow-ups-page.tsx opens records through its own inline
// aside instead (#428, deferred with the AR rebuild). Interaction D-A4 / JQ-4: a
// follow-up row opens the SAME shared record host through the SAME overlay host, in ROUTE mode, so
// every door behaves identically — never a bare <Link> page-jump from one door and a panel from
// another. The Work record page is DELETED (DD-WAY-36, #369) — the record is panel-only, so the
// entry carries no pageTo and the host chrome hides its Open-full-page button (OverlayHostSlot only
// wires onOpenPage when pageTo exists). ROUTE mode pushes a real `__mosOverlay` history marker so
// browser Back closes the panel and returns to the queue (D-A3), never ejecting the section.
//
// Returns `undefined` when no overlay host is mounted (isolated test/embed use); the table then
// renders the source ref as plain text because the Work record route is deleted (DD-WAY-36).
import { createElement } from 'react'
import { useOptionalOverlayHost } from '@/shell/overlay-host'
import { FollowUpRecordHost } from './follow-up-record-host'
import type { FollowUpRow } from '@/lib/db/follow-ups'

export function useFollowUpRecordOpener(): ((row: FollowUpRow) => void) | undefined {
  const host = useOptionalOverlayHost()
  if (!host) return undefined
  return (row: FollowUpRow) => {
    void host.openRoot(
      {
        key: `follow-up:${row.id}`,
        owner: 'shell',
        tenant: 'record',
        label: row.counterparty,
        title: row.counterparty,
        content: createElement(FollowUpRecordHost, { followUpId: row.id, mode: 'panel' }),
      },
      'route',
    )
  }
}
