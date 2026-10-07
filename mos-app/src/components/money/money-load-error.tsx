// A failed Money read. `kept`: earlier figures are still on screen; `margin`: only the margin read
// failed. Too many rows is not a service failure — reading again returns the same rows — so it
// offers no Try again, only the next step.
import type { ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { ErrorState } from '@/components/ui/state-kit'

export function MoneyLoadError({ kept = false, tooMany = false, margin = false, message, tooManyMessage, onRetry }: {
  kept?: boolean
  tooMany?: boolean
  /** Only the margin read failed; revenue is on screen. */
  margin?: boolean
  message?: ReactNode
  tooManyMessage?: ReactNode
  onRetry: () => void
}) {
  const t = useT()
  if (tooMany) return <ErrorState message={tooManyMessage ?? t('money.error.tooMany')} />
  return <ErrorState message={message ?? t(margin ? 'money.error.margin' : kept ? 'money.error.kept' : 'money.error')} onRetry={onRetry} />
}
