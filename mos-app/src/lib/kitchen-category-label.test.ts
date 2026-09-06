import { describe, expect, it } from 'vitest'
import { messages } from '@/i18n/messages'
import { kitchenCategoryLabel } from './kitchen-category-label'

const t = ((key: string) => key) as never
const translate = (locale: 'en' | 'id') => ((key: string) => messages[locale][key as keyof typeof messages.en]) as never

describe('AC-063: Café category labels come from the locale catalog', () => {
  it('maps every seeded category to a catalog key', () => {
    expect(kitchenCategoryLabel(t, 'Chicken')).toBe('kitchen.category.chicken')
    expect(kitchenCategoryLabel(t, 'Snack/Sweet')).toBe('kitchen.category.snackSweet')
    expect(kitchenCategoryLabel(t, 'Rice/Staple')).toBe('kitchen.category.riceStaple')
    expect(kitchenCategoryLabel(t, 'Meat')).toBe('kitchen.category.meat')
    expect(kitchenCategoryLabel(t, 'Seafood')).toBe('kitchen.category.seafood')
    expect(kitchenCategoryLabel(t, 'Veg/Tempe/Tofu')).toBe('kitchen.category.vegTempeTofu')
  })

  it('renders the catalog values in both locales', () => {
    expect(kitchenCategoryLabel(translate('en'), 'Chicken')).toBe('Chicken')
    expect(kitchenCategoryLabel(translate('id'), 'Chicken')).toBe('Ayam')
    expect(kitchenCategoryLabel(translate('id'), 'Snack/Sweet')).toBe('Camilan/Manis')
  })

  it('preserves unknown categories for catalog resilience', () => {
    expect(kitchenCategoryLabel(t, 'Seasonal')).toBe('Seasonal')
  })
})
