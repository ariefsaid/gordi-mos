import { Pill } from '@/components/ui/pill'
import { StatusBadge } from '@/components/ui/status-badge'
import { useT } from '@/i18n/use-t'
import type { RecipeActivity } from '@/lib/cafe-recipes'

/** Same word and colour as the Items page; a recipe with no source for its status says so rather than guessing. */
export function RecipeActivityBadge({ activity }: { activity: RecipeActivity }) {
  const t = useT()
  if (activity === 'unknown') return <Pill tone="neutral" dot={false}>{t('cafe.recipes.statusUnknown')}</Pill>
  return <StatusBadge status={activity === 'active' ? 'active' : 'disabled'} label={t(activity === 'active' ? 'cafe.items.active' : 'cafe.items.inactive')} />
}
