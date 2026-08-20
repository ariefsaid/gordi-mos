// My Week keeps the task module as its single surviving work surface.
import { useMemo } from 'react'
import { useAuth } from '@/auth/use-auth'
import { MyTasksCard } from '@/components/weekly/my-tasks-card'

export function MyWeekPanel() {
  const auth = useAuth()
  const personId = auth.status === 'authenticated' ? auth.viewer.person?.id : null
  const now = useMemo(() => new Date(), [])

  return personId ? <MyTasksCard viewerId={personId} now={now} /> : null
}
