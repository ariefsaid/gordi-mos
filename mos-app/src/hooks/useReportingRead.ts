import { useCallback, useEffect, useRef, useState } from 'react'
import { ReportingRowCapError } from '@/lib/db/reporting-shared'

export interface ReportingRead<T> {
  status: 'loading' | 'ready' | 'error'
  /** The last successful read, kept through a later reload's loading or failure. */
  data: T | null
  /** The failure was the read's row ceiling, not the service. */
  tooMany: boolean
  reload: () => void
}

type ReadState<T> = Omit<ReportingRead<T>, 'reload'>

/**
 * Reads a reporting snapshot on mount and again whenever the tab becomes visible. Reads may
 * overlap (a Refresh, a tab coming back); only the newest one may land. `load` must be stable.
 */
export function useReportingRead<T>(load: () => Promise<T>): ReportingRead<T> {
  const [state, setState] = useState<ReadState<T>>({ status: 'loading', data: null, tooMany: false })
  const generation = useRef(0)

  const reload = useCallback(() => {
    const mine = ++generation.current
    setState((prev) => ({ ...prev, status: 'loading' }))
    load().then(
      (data) => {
        if (mine === generation.current) setState({ status: 'ready', data, tooMany: false })
      },
      (error: unknown) => {
        if (mine !== generation.current) return
        setState((prev) => ({ status: 'error', data: prev.data, tooMany: error instanceof ReportingRowCapError }))
      },
    )
  }, [load])

  useEffect(() => {
    reload()
    const whenShown = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', whenShown)
    return () => document.removeEventListener('visibilitychange', whenShown)
  }, [reload])

  return { ...state, reload }
}
