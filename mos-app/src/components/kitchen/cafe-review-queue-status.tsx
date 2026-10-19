import { type ReactNode } from 'react'
import { CafeQueueEmpty } from '@/components/cafe/redesign/cafe-queue-empty'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'

type CafeReviewQueueStatusProps = {
  queueTitle: string
  emptyTitle?: string
  loading: boolean
  loadError: boolean
  onRetry: () => void
  emptyContent: ReactNode | null
  emptyAction?: ReactNode
}

export function CafeReviewQueueStatus({
  queueTitle,
  emptyTitle,
  loading,
  loadError,
  onRetry,
  emptyContent,
  emptyAction,
}: CafeReviewQueueStatusProps) {
  const t = useT()
  if (loadError) {
    return <ErrorState message={t('common.loadFailed', { what: queueTitle })} onRetry={onRetry} retryLabel={t('common.retry')} />
  }
  if (loading) return <LoadingShell count={2} />
  if (emptyContent === null) return null
  return <CafeQueueEmpty title={emptyTitle ?? queueTitle} action={emptyAction}>{emptyContent}</CafeQueueEmpty>
}
