// useFollowUpRecordOpener — the ONE follow-up record-open grammar, shared by every follow-up door
// (the canonical FollowUpsPage and the Work Tasks saved-view embed). Interaction D-A4 / JQ-4: a
// follow-up row opens the SAME shared record host through the SAME overlay host, in ROUTE mode, so
// every door behaves identically — never a bare <Link> page-jump from one door and a panel from
// another. The canonical page (/work/follow-ups/:id) stays reachable via the host chrome's
// Open-full-page button (the entry carries pageTo); ROUTE mode pushes a real `__mosOverlay` history
// marker so browser Back closes the panel and returns to the queue (D-A3), never ejecting the section.
//
// Returns `undefined` when no overlay host is mounted (isolated test/embed use), so the table falls
// back to its legacy direct <Link> and its contract stays honest.
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
        pageTo: { pathname: `/work/follow-ups/${row.id}` },
        content: createElement(FollowUpRecordHost, { followUpId: row.id, mode: 'panel' }),
      },
      'route',
    )
  }
}
