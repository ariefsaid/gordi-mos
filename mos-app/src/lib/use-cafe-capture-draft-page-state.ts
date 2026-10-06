import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { formatWibDateTime } from '@/lib/format/date'
import { useSearchParamState } from '@/lib/use-search-param-state'

export interface CafeCaptureDraftRestoreInfo {
  count: number
  savedAt: string
}

/** Shared URL filters and draft restoration notice state for Café capture pages. */
export function useCafeCaptureDraftPageState() {
  const t = useT()
  const [restoredDraftInfo, setRestoredDraftInfo] = useState<CafeCaptureDraftRestoreInfo | null>(null)
  const [restoreAnnouncement, setRestoreAnnouncement] = useState('')

  useEffect(() => {
    if (!restoreAnnouncement) return
    const timer = window.setTimeout(() => setRestoreAnnouncement(''), 1500)
    return () => window.clearTimeout(timer)
  }, [restoreAnnouncement])

  const [search, setSearch] = useSearchParamState('q', '')
  const [kindFilter, setKindFilter] = useSearchParamState('kind', 'All')
  const [category, setCategory] = useSearchParamState('category', 'All')

  const setRestorationNotice = useCallback((savedAt: string | null, count: number) => {
    const info = savedAt && count > 0 ? { count, savedAt } : null
    setRestoredDraftInfo(info)
    setRestoreAnnouncement(info ? t(
      info.count === 1 ? 'cafe.captureDraft.restored.one' : 'cafe.captureDraft.restored.other',
      { count: info.count, time: formatWibDateTime(info.savedAt) },
    ) : '')
  }, [t])

  return {
    restoredDraftInfo,
    setRestoredDraftInfo,
    restoreAnnouncement,
    setRestoreAnnouncement,
    setRestorationNotice,
    search,
    setSearch,
    kindFilter,
    setKindFilter,
    category,
    setCategory,
  }
}
