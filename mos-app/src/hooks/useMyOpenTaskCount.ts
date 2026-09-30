import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import { getMyOpenTaskCount } from '@/lib/db/open-task-count'

/**
 * The viewer's open-task count, read once per mount (no polling). Null until it resolves and on
 * failure, so a consumer omits the number rather than showing a wrong one. The rail badge and
 * Home both use this hook; neither recounts.
 */
export function useMyOpenTaskCount(): number | null {
  const auth = useAuth()
  const personId = auth.status === 'authenticated' ? auth.viewer?.person?.id : undefined
  const [result, setResult] = useState<{ personId: string; count: number | null } | null>(null)

  useEffect(() => {
    if (!personId) return
    let live = true
    getMyOpenTaskCount(personId)
      .then((count) => { if (live) setResult({ personId, count }) })
      .catch(() => { if (live) setResult({ personId, count: null }) })
    return () => { live = false }
  }, [personId])

  return personId && result?.personId === personId ? result.count : null
}
