import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useCatalogRecordEntryFactory } from '@/components/catalog/use-catalog-record-overlay'
import { SignalRecordHost } from '@/components/signals/signal-record-host'
import { useOptionalOverlayHost, type OverlayEntry } from '@/shell/overlay-host'
import type { RecordRef } from '@/lib/db/document-references'

// Opens a record a document points at: pushed onto the panel stack when the page has one, else its own page.

const PAGE_PATH = {
  task: '/work/tasks/',
  objective: '/work/objectives/',
  project: '/work/projects/',
  signal: '/work/signals/',
  meeting: '/work/meetings/',
} as const

/** `ownerWhenAlone` names the stack's owner when this document is the first frame; a pushed record keeps the owner already showing. */
export function useOpenDocumentRecord(ownerWhenAlone: 'tasks' | 'work'): (ref: RecordRef) => void {
  const t = useT()
  const navigate = useNavigate()
  const host = useOptionalOverlayHost()
  const topOwner = host?.session?.frames.at(-1)?.entry.owner
  const { buildEntry } = useCatalogRecordEntryFactory({ owner: topOwner === 'work' || topOwner === 'signals' ? topOwner : ownerWhenAlone })

  return useCallback(({ kind, id }: RecordRef) => {
    if (!host?.session) { navigate(`${PAGE_PATH[kind]}${id}`); return }
    if (kind !== 'signal') { void host.push(buildEntry(kind === 'project' ? 'work-line' : kind, id)); return }
    const entry: OverlayEntry = {
      key: `signal:${id}`,
      owner: host.session.frames.at(-1)?.entry.owner ?? ownerWhenAlone,
      tenant: 'record',
      label: t('signals.record.title'),
      title: t('signals.record.title'),
      pageTo: { pathname: `${PAGE_PATH.signal}${id}` },
      content: <SignalRecordHost signalId={id} mode="panel" onPromote={(to, state) => { void host.openPage(to, state) }} />,
    }
    void host.push(entry)
  }, [buildEntry, host, navigate, ownerWhenAlone, t])
}
