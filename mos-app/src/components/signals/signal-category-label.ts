import type { Translate } from '@/i18n/use-t'
import type { SignalCategory } from '@/lib/db/signals.types'

// #770 (AC-031): the ONE translated-label lookup for a Signal category. The DB enum stays English
// (SIGNAL_CATEGORIES), so every surface that RENDERS a category — the row's meta line
// (signal-feed-rows.tsx) and the archive toolbar category filter (signals-archive-page.tsx) —
// routes through this helper. The two locales can then never drift the way `attentionLabel` was
// written to prevent for attention words.
export function signalCategoryLabel(t: Translate, category: SignalCategory): string {
  switch (category) {
    case 'Supply/vendor': return t('signals.category.supplyVendor')
    case 'Equipment/facility': return t('signals.category.equipmentFacility')
    case 'Inventory/availability': return t('signals.category.inventoryAvailability')
    case 'Quality': return t('signals.category.quality')
    case 'Customer': return t('signals.category.customer')
    case 'People': return t('signals.category.people')
    case 'Process': return t('signals.category.process')
    case 'Other': return t('signals.category.other')
  }
}
