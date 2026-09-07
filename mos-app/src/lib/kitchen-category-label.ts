import type { MessageKey } from '@/i18n/messages'
import type { Translate } from '@/i18n/use-t'

// Coupled to the seeded ops.wip_items category vocabulary; unknown future seed values stay visible.
const CATEGORY_KEYS: Readonly<Record<string, MessageKey>> = {
  Chicken: 'kitchen.category.chicken',
  'Snack/Sweet': 'kitchen.category.snackSweet',
  'Rice/Staple': 'kitchen.category.riceStaple',
  Meat: 'kitchen.category.meat',
  Seafood: 'kitchen.category.seafood',
  'Veg/Tempe/Tofu': 'kitchen.category.vegTempeTofu',
}

export function kitchenCategoryLabel(t: Translate, category: string): string {
  const key = CATEGORY_KEYS[category]
  return key ? t(key) : category
}
