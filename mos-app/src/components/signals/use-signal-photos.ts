import { useEffect, useState } from 'react'
import { listSignalPhotos, type SignalPhoto } from '@/lib/db/signal-photos'

/** Photos for a set of Signals in one read, grouped by Signal id. A failed read shows no photos:
 * the Signal's words are the record, and they are already on screen. */
export function useSignalPhotos(signalIds: readonly string[]): Record<string, SignalPhoto[]> {
  const key = signalIds.join(',')
  const [bySignal, setBySignal] = useState<Record<string, SignalPhoto[]>>({})
  useEffect(() => {
    let cancelled = false
    listSignalPhotos(key ? key.split(',') : []).then((photos) => {
      if (cancelled) return
      const grouped: Record<string, SignalPhoto[]> = {}
      for (const photo of photos) (grouped[photo.signalId] ??= []).push(photo)
      setBySignal(grouped)
    }).catch(() => { if (!cancelled) setBySignal({}) })
    return () => { cancelled = true }
  }, [key])
  return bySignal
}
