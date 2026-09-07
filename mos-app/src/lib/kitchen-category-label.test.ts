import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { messages } from '@/i18n/messages'
import { kitchenCategoryLabel } from './kitchen-category-label'

const t = ((key: string) => key) as never
const translate = (locale: 'en' | 'id') => ((key: string) => messages[locale][key as keyof typeof messages.en]) as never

describe('AC-063: Café category labels come from the locale catalog', () => {
  it('pins the category map to exactly the seeded category set', () => {
    // Keep this coupled to seed.sql so adding a seeded category forces a catalog decision.
    const seed = readFileSync(resolve(import.meta.dirname, '../../../supabase/seed.sql'), 'utf8')
    const wipInsert = seed.match(/insert into ops\.wip_items[\s\S]*?on conflict \(id\)/)?.[0] ?? ''
    const seeded = [...wipInsert.matchAll(/,\s*'([^']*)'\),?\s*$/gm)]
      .map(match => match[1])
    expect([...new Set(seeded)].sort()).toEqual([
      'Chicken', 'Meat', 'Rice/Staple', 'Seafood', 'Snack/Sweet', 'Veg/Tempe/Tofu',
    ])
    for (const category of [...new Set(seeded)]) {
      expect(kitchenCategoryLabel(t, category)).toMatch(/^kitchen\.category\./)
    }
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
