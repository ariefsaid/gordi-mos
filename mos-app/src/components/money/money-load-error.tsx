// A failed Money read. `kept`: earlier figures are still on screen. Too many rows is not a service
// failure — reading again returns the same rows — so it offers no Try again, only the next step.
import { useT } from '@/i18n/use-t'
import { ErrorState } from '@/components/ui/state-kit'

export function MoneyLoadError({ kept = false, tooMany = false, onRetry }: { kept?: boolean; tooMany?: boolean; onRetry: () => void }) {
  const t = useT()
  if (tooMany) return <ErrorState message={t('money.error.tooMany')} />
  return <ErrorState message={t(kept ? 'money.error.kept' : 'money.error')} onRetry={onRetry} />
}
