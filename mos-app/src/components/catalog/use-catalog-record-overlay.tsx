import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useSearchParams, type To } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { useIsWideOverlayWidth } from '@/shell/use-is-wide-overlay-width'
import { OverlayHostSlot, useOptionalOverlayHost, type OverlayEntry } from '@/shell/overlay-host'
import type { OverlayOwner } from '@/shell/overlay-navigation'
import { TaskOverlayContent } from '@/components/tasks/task-drawer'
import type { CatalogRow } from './catalog-collection-adapter'
import { CatalogRecordDocument, type CatalogRecordKind, type CatalogRelatedKind } from './catalog-record-document'

export type CatalogRecordOverlayOwner = Extract<OverlayOwner, 'tasks' | 'work' | 'signals'>

export interface CatalogRecordEntryFactory {
  /** Build a record frame that can be pushed into the caller's existing overlay stack. */
  buildEntry: (
    kind: CatalogRecordKind | 'task',
    id: string,
    search?: string,
  ) => OverlayEntry
}

/**
 * Reusable Work-record frame factory for domains that already own an overlay session.
 *
 * The owner is deliberately supplied by the caller: a Work collection opens a Work-owned frame,
 * while Tasks/Signals can push the same catalog document into their own stack and keep their own
 * `OverlayHostSlot` active. The returned callback is stable for the lifetime of its dependencies,
 * and every target keeps a canonical href so modified clicks can still leave the overlay stack.
 */
export function useCatalogRecordEntryFactory({
  owner,
  onCollectionChanged,
  onOpenPage,
}: {
  owner: CatalogRecordOverlayOwner
  onCollectionChanged?: () => void
  onOpenPage?: (to: To) => void
}): CatalogRecordEntryFactory {
  const t = useT()
  const host = useOptionalOverlayHost()

  const buildEntry = useCallback(function makeEntry(
    kind: CatalogRecordKind | 'task',
    id: string,
    search = '',
  ): OverlayEntry {
    const pageTo = kind === 'task'
      ? { pathname: `/work/tasks/${id}`, search }
      : {
          pathname: kind === 'objective' ? `/work/objectives/${id}` : `/work/projects/${id}`,
          search,
        }
    const entry: OverlayEntry = {
      key: `${kind}:${id}`,
      owner,
      tenant: 'record',
      label: kind === 'task' ? t('tasks.detail.title') : t(kind === 'objective' ? 'catalog.record.objective' : 'catalog.record.projectProcess'),
      title: kind === 'task' ? t('tasks.detail.title') : t(kind === 'objective' ? 'catalog.record.objective' : 'catalog.record.projectProcess'),
      pageTo,
      content: null,
    }

    if (kind === 'task') {
      entry.content = (
        <TaskOverlayContent
          taskId={id}
          onLeaveGuardChange={(guard) => { entry.leaveGuard = guard }}
          onClose={() => { void host?.back() }}
          onOpenPage={() => { if (onOpenPage) onOpenPage(pageTo); else if (host) void host.openPage(pageTo) }}
          onOpenRelated={(related) => {
            if (!host) return
            void host.push(makeEntry(related.kind, related.id, search))
          }}
        />
      )
      return entry
    }

    entry.content = (
      <CatalogRecordDocument
        kind={kind}
        id={id}
        mode="panel"
        onChanged={onCollectionChanged}
        onLeaveGuardChange={(guard) => { entry.leaveGuard = guard }}
        onOpenPage={() => { if (onOpenPage) onOpenPage(pageTo); else if (host) void host.openPage(pageTo) }}
        onCreateTask={() => {
          const to = { pathname: '/work/tasks', search: `?create=1&work_line=${encodeURIComponent(id)}` }
          if (onOpenPage) onOpenPage(to)
          else if (host) void host.openPage(to)
        }}
        onOpenRelated={(relatedKind: CatalogRelatedKind, relatedId: string) => {
          if (!host) return
          void host.push(makeEntry(relatedKind, relatedId, search))
        }}
      />
    )
    return entry
  }, [host, onCollectionChanged, onOpenPage, owner, t])

  return { buildEntry }
}

const WORK_OWNER: CatalogRecordOverlayOwner = 'work'

export interface CatalogRecordOverlayController {
  splitOpen: boolean
  recordId: string | null
  onOpenRecord: (record: CatalogRow) => void
  slot: ReactNode
  buildEntry: CatalogRecordEntryFactory['buildEntry']
}

export function useCatalogRecordOverlay({
  collectionKind,
  onCollectionChanged,
}: {
  collectionKind: CatalogRecordKind
  onCollectionChanged: () => void
}): CatalogRecordOverlayController {
  const host = useOptionalOverlayHost()
  const isSplit = useIsWideOverlayWidth()
  const [params, setParams] = useSearchParams()
  const recordType = params.get('recordType')
  const recordId = recordType === collectionKind || (collectionKind === 'work-line' && recordType === null && params.has('record'))
    ? params.get('record')
    : null
  const hadSession = useRef(false)
  const recordInvoker = useRef<string | null>(null)
  const restoreRecordFocus = useRef(false)
  const suppressNextOpen = useRef(false)

  const searchWithoutRecord = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('record')
    next.delete('recordType')
    const search = next.toString()
    return search ? `?${search}` : ''
  }, [params])

  const promotePage = useCallback((to: To) => {
    if (!host) return
    suppressNextOpen.current = true
    void host.openPage(to).then((result) => {
      if (result.status !== 'committed') suppressNextOpen.current = false
    })
  }, [host])

  const { buildEntry } = useCatalogRecordEntryFactory({
    owner: WORK_OWNER,
    onOpenPage: promotePage,
    onCollectionChanged,
  })

  const onOpenRecord = useCallback((record: CatalogRow) => {
    recordInvoker.current = record.id
    const next = new URLSearchParams(params)
    next.set('record', record.id)
    next.set('recordType', collectionKind)
    setParams(next)
  }, [collectionKind, params, setParams])

  const entry = useMemo(() => {
    if (!recordId || !host) return null
    return buildEntry(collectionKind, recordId, searchWithoutRecord())
  }, [buildEntry, collectionKind, host, recordId, searchWithoutRecord])

  useEffect(() => {
    if (!host || !entry || suppressNextOpen.current) return
    // A related record is a child frame. Compare the query-driven entry with the ROOT frame;
    // comparing against the active/top frame replaces the whole stack whenever a child opens.
    const root = host.session?.frames[0]?.entry
    if (root?.key === entry.key) return
    const hasWorkSession = host.session?.frames.some((frame) => frame.entry.owner === WORK_OWNER)
    void (hasWorkSession ? host.replaceRoot(entry) : host.openRoot(entry, 'route', true))
  }, [entry, host])

  // A page escalation/explicit close suppresses the current query-driven open once. Clear the
  // latch after the query no longer names a record so the next collection click can open normally.
  useEffect(() => {
    if (!recordId) suppressNextOpen.current = false
  }, [recordId])

  const sessionActive = host?.session?.frames.some((frame) => frame.entry.owner === WORK_OWNER) ?? false
  useEffect(() => {
    if (sessionActive) {
      hadSession.current = true
      return
    }
    if (!hadSession.current || !params.get('record')) return
    if (suppressNextOpen.current) return
    hadSession.current = false
    const next = new URLSearchParams(params)
    next.delete('record')
    next.delete('recordType')
    setParams(next, { replace: true })
  }, [params, sessionActive, setParams])

  // Query navigation can replace the row DOM. Restore by record identity after both the
  // route and host are closed, rather than focusing a detached pre-navigation node.
  useEffect(() => {
    if (!restoreRecordFocus.current || recordId || sessionActive || !recordInvoker.current) return
    const id = recordInvoker.current
    const frame = requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`.catalog-collection__row-link[href$="/${CSS.escape(id)}"]`)
      if (row) {
        row.focus()
        restoreRecordFocus.current = false
      }
    })
    return () => cancelAnimationFrame(frame)
  })

  const clearRecordQuery = useCallback(() => {
    suppressNextOpen.current = true
    const next = new URLSearchParams(params)
    next.delete('record')
    next.delete('recordType')
    setParams(next, { replace: true })
  }, [params, setParams])

  const splitOpen = Boolean(recordId && sessionActive && isSplit)
  const slot = host ? (
    <OverlayHostSlot
      owner={WORK_OWNER}
      onClose={(via, close) => {
        suppressNextOpen.current = true
        void close(via).then((result) => {
          // A denied leave must keep both the URL and the draft in place. The query is cleared
          // only after the host confirms that the close committed.
          if (result.status === 'committed') {
            clearRecordQuery()
            restoreRecordFocus.current = true
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

  return { splitOpen, recordId, onOpenRecord, slot, buildEntry }
}
