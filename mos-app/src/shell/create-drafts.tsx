/* eslint-disable react-refresh/only-export-components -- the draft owner and its state seam */
import { createContext, useCallback, useContext, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useAuth } from '@/auth/use-auth'

type DraftStore = {
  values: Map<string, unknown>
  listeners: Map<string, Set<() => void>>
}
const DraftContext = createContext<DraftStore | null>(null)

function DraftOwner({ children }: { children: ReactNode }) {
  const [store] = useState<DraftStore>(() => ({ values: new Map(), listeners: new Map() }))
  return <DraftContext.Provider value={store}>{children}</DraftContext.Provider>
}

// Rekeying retires the store, so unfinished saves cannot affect the next authenticated owner.
export function CreateDraftProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const owner = auth.status === 'authenticated'
    ? `${auth.viewer.person.org_id}:${auth.viewer.person.id}:${auth.viewer.person.user_id ?? ''}`
    : auth.status
  return <DraftOwner key={owner}>{children}</DraftOwner>
}

// Isolated consumers can use ordinary local state without a shell owner.
export function useCreateDraftState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(DraftContext)
  const [local, setLocal] = useState(initial)
  const initialValue = useRef(local)
  const subscribe = useCallback((listener: () => void) => {
    if (!store) return () => {}
    const listeners = store.listeners.get(key) ?? new Set<() => void>()
    store.listeners.set(key, listeners)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [key, store])
  const snapshot = useCallback(() => {
    if (!store) return local
    if (!store.values.has(key)) store.values.set(key, initialValue.current)
    return store.values.get(key) as T
  }, [key, local, store])
  const value = useSyncExternalStore(subscribe, snapshot, snapshot)
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    if (!store) { setLocal(next); return }
    const previous = store.values.has(key) ? store.values.get(key) as T : initialValue.current
    const result = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next
    if (Object.is(previous, result)) return
    store.values.set(key, result)
    store.listeners.get(key)?.forEach((listener) => listener())
  }, [key, store])
  return [value, setValue]
}

// Retain async create/link identity alongside the composer instead of the mounted route.
export function useCreateDraftRef<T>(key: string, initial: T) {
  const [ref] = useCreateDraftState(key, () => ({ current: initial }))
  return ref
}
