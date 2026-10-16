import { Pill } from '@/components/ui/pill'
import { StatusBadge } from '@/components/ui/status-badge'
import { useT } from '@/i18n/use-t'
import type { EsbStatus } from '@/lib/cafe-recipes'

/** ESB's word on a recipe. Active and Inactive match the Items page; "Removed from menu" and "Unknown" are neutral words, never a guess. */
export function EsbStatusBadge({ status }: { status: EsbStatus }) {
  const t = useT()
  if (status === 'unknown') return <Pill tone="neutral" dot={false}>{t('cafe.recipes.statusUnknown')}</Pill>
  if (status === 'removed') return <Pill tone="neutral">{t('cafe.recipes.status.removed')}</Pill>
  return <StatusBadge status={status === 'active' ? 'active' : 'disabled'} label={t(status === 'active' ? 'cafe.items.active' : 'cafe.items.inactive')} />
}
