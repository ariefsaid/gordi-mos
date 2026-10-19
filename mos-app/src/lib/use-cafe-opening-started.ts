import { useEffect, useState } from 'react'
import { getCafeOpeningProcessId, getCafeOpeningTeamId, getTodayOpeningForTeam } from '@/lib/db/cafe-opening'

export type CafeOpeningStatus = 'unknown' | 'started' | 'not-started'

/** Whether today's opening has started at a branch. Any failure stays 'unknown' (callers keep
 *  today's plan-note rule) — a read hiccup must never waive a safeguard. */
export function useCafeOpeningStatus(branchId: string | null): CafeOpeningStatus {
  const [result, setResult] = useState<{ branchId: string; status: CafeOpeningStatus } | null>(null)
  useEffect(() => {
    if (!branchId) return
    let live = true
    void (async () => {
      let status: CafeOpeningStatus = 'unknown'
      try {
        const [processId, teamId] = await Promise.all([getCafeOpeningProcessId(), getCafeOpeningTeamId(branchId)])
        if (processId && teamId) status = (await getTodayOpeningForTeam(processId, teamId)).started ? 'started' : 'not-started'
      } catch { /* stays unknown */ }
      if (live) setResult({ branchId, status })
    })()
    return () => { live = false }
  }, [branchId])
  return branchId && result?.branchId === branchId ? result.status : 'unknown'
}
