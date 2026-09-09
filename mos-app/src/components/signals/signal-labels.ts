import type { MessageKey } from '@/i18n/messages'
import type { Translate } from '@/i18n/use-t'
import type { Attention, SignalCategory } from '@/lib/db/signals.types'

/**
 * Signal enum values are storage/query contracts. This is the single presentation seam that
 * turns those values into locale-aware message keys for every Signal surface.
 */
export const SIGNAL_LABEL_KEYS = {
  category: {
    'Supply/vendor': 'signals.category.supplyVendor',
    'Equipment/facility': 'signals.category.equipmentFacility',
    'Inventory/availability': 'signals.category.inventoryAvailability',
    Quality: 'signals.category.quality',
    Customer: 'signals.category.customer',
    People: 'signals.category.people',
    Process: 'signals.category.process',
    Other: 'signals.category.other',
  },
  attention: {
    FYI: 'signals.archive.attentionFyi',
    'Needs attention': 'signals.archive.viewAttention',
    Urgent: 'signals.archive.attentionUrgent',
  },
} satisfies {
  category: Record<SignalCategory, MessageKey>
  attention: Record<Attention, MessageKey>
}

export function signalCategoryLabel(t: Translate, category: SignalCategory): string {
  return t(SIGNAL_LABEL_KEYS.category[category])
}
