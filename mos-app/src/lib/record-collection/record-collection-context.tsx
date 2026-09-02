/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type RecordCollectionChromeSnapshot = {
  collectionId: string
  activeViewLabel: string
  hasNonDefaultView: boolean
}

type Publisher = (snapshot: RecordCollectionChromeSnapshot) => void

type RecordCollectionChromeContextValue = {
  publish: (collectionId: string, publisher: Publisher, snapshot: RecordCollectionChromeSnapshot) => void
  clear: (collectionId: string, publisher: Publisher) => void
  snapshots: ReadonlyMap<string, RecordCollectionChromeSnapshot>
}

const RecordCollectionChromeContext = createContext<RecordCollectionChromeContextValue | null>(null)

type RecordCollectionChromeProviderProps = { children: ReactNode }

export function RecordCollectionChromeProvider({ children }: RecordCollectionChromeProviderProps) {
  const [snapshots, setSnapshots] = useState<Map<string, RecordCollectionChromeSnapshot>>(new Map())
  const owners = useRef(new Map<string, Publisher>())
  const publish = useCallback((collectionId: string, publisher: Publisher, snapshot: RecordCollectionChromeSnapshot) => {
    owners.current.set(collectionId, publisher)
    setSnapshots((current) => new Map(current).set(collectionId, snapshot))
  }, [])
  const clear = useCallback((collectionId: string, publisher: Publisher) => {
    if (owners.current.get(collectionId) !== publisher) return
    owners.current.delete(collectionId)
    setSnapshots((current) => {
      const next = new Map(current)
      next.delete(collectionId)
      return next
    })
  }, [])
  const value = useMemo<RecordCollectionChromeContextValue>(() => ({ publish, clear, snapshots }), [clear, publish, snapshots])
  return <RecordCollectionChromeContext.Provider value={value}>{children}</RecordCollectionChromeContext.Provider>
}

export function usePublishRecordCollectionChrome(snapshot: RecordCollectionChromeSnapshot): void {
  const context = useContext(RecordCollectionChromeContext)
  const publisher = useRef<Publisher | null>(null)
  const publish = context?.publish
  const clear = context?.clear
  if (!publisher.current) publisher.current = (next) => publish?.(next.collectionId, publisher.current!, next)
  useLayoutEffect(() => {
    publish?.(snapshot.collectionId, publisher.current!, snapshot)
    return () => clear?.(snapshot.collectionId, publisher.current!)
  // publisher is stable for this mounted collection and intentionally owns cleanup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish, clear, snapshot.collectionId, snapshot.activeViewLabel, snapshot.hasNonDefaultView])
}

export function useRecordCollectionChrome(collectionId: string): RecordCollectionChromeSnapshot | null {
  return useContext(RecordCollectionChromeContext)?.snapshots.get(collectionId) ?? null
}
