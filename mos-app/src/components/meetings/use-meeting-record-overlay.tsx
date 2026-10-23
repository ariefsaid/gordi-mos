// Opens a Meeting in the Work panel stack from the Meetings list, the way Objectives and Projects & Processes
// open theirs: `?record=<id>&recordType=meeting` names the open record; a phone goes to the record page instead.
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate, useSearchParams, type To } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { OverlayHostSlot, useOptionalOverlayHost, type OverlayEntry } from '@/shell/overlay-host'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsRecordSplit } from '@/shell/use-is-split-width'
import { MeetingRecordDocument } from './meeting-record-document'

const RECORD_TYPE = 'meeting'
const OWNER = 'work' as const

/** The list's query minus the open record. */
function withoutRecord(search: URLSearchParams): string {
  const next = new URLSearchParams(search)
  next.delete('record')
  next.delete('recordType')
  const rest = next.toString()
  return rest ? `?${rest}` : ''
}

export type MeetingOverlayController = {
  splitOpen: boolean
  panelOpen: boolean
  onOpenRecord: (id: string) => void
  slot: ReactNode
}

export function useMeetingRecordOverlay({ onCollectionChanged }: { onCollectionChanged: () => void }): MeetingOverlayController {
  const t = useT()
  const host = useOptionalOverlayHost()
  const isSplit = useIsRecordSplit()
  const isDesktop = useIsDesktop()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const recordId = params.get('recordType') === RECORD_TYPE ? params.get('record') : null
  const suppressNextOpen = useRef(false)
  const hadSession = useRef(false)

  const buildEntry = useCallback(function makeEntry(id: string): OverlayEntry {
    const pageTo: To = { pathname: `/work/meetings/${id}` }
    return {
      key: `meeting:${id}`,
      owner: OWNER,
      tenant: 'record',
      label: t('meetings.record.kind'),
      title: t('meetings.record.kind'),
      pageTo,
      content: (
        <MeetingRecordDocument
          id={id}
          mode="panel"
          onChanged={onCollectionChanged}
          onOpenMeeting={(next) => { if (host) void host.push(makeEntry(next)) }}
        />
      ),
    }
  }, [host, onCollectionChanged, t])

  const onOpenRecord = useCallback((id: string) => {
    if (!isDesktop) {
      navigate({ pathname: `/work/meetings/${id}`, search: withoutRecord(params) })
      return
    }
    const next = new URLSearchParams(params)
    next.set('record', id)
    next.set('recordType', RECORD_TYPE)
    setParams(next)
  }, [isDesktop, navigate, params, setParams])

  const entry = useMemo(() => (recordId && host ? buildEntry(recordId) : null), [buildEntry, host, recordId])

  useEffect(() => {
    if (!host || !entry || suppressNextOpen.current) return
    // A neighbour opened from the panel is a child frame: compare with the ROOT frame only.
    if (host.session?.frames[0]?.entry.key === entry.key) return
    const hasWorkSession = host.session?.frames.some((frame) => frame.entry.owner === OWNER)
    void (hasWorkSession ? host.replaceRoot(entry) : host.openRoot(entry, 'route', true))
  }, [entry, host])

  useEffect(() => {
    if (!recordId) suppressNextOpen.current = false
  }, [recordId])

  const sessionActive = host?.session?.frames.some((frame) => frame.entry.owner === OWNER) ?? false
  useEffect(() => {
    if (sessionActive) { hadSession.current = true; return }
    if (!hadSession.current) return
    // The session closed (browser Back past it) while the URL still names a record: drop the stale marker.
    hadSession.current = false
    if (!params.get('record') || suppressNextOpen.current) return
    const next = new URLSearchParams(params)
    next.delete('record')
    next.delete('recordType')
    setParams(next, { replace: true })
  }, [params, sessionActive, setParams])

  const panelOpen = Boolean(recordId && sessionActive)
  const slot = host ? (
    <OverlayHostSlot
      owner={OWNER}
      onClose={(via, close) => {
        suppressNextOpen.current = true
        void close(via).then((result) => {
          if (result.status === 'committed') {
            const next = new URLSearchParams(params)
            next.delete('record')
            next.delete('recordType')
            setParams(next, { replace: true })
          } else {
            suppressNextOpen.current = false
          }
        })
      }}
      onOpenPage={(to, openPage) => {
        suppressNextOpen.current = true
        void openPage(to)
      }}
    />
  ) : null

  return { splitOpen: panelOpen && isSplit, panelOpen, onOpenRecord, slot }
}
