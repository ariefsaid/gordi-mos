import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import type { RecipeType } from '@/lib/cafe-recipes'

const TYPE_KEYS: Record<RecipeType, MessageKey> = {
  menu: 'cafe.recipes.type.menu', wip: 'cafe.recipes.type.wip', unknown: 'cafe.recipes.statusUnknown',
}

/** The word for a recipe type: Menu, WIP / BOM or Unknown. */
export function useRecipeTypeLabel(): (type: RecipeType) => string {
  const t = useT()
  return type => t(TYPE_KEYS[type])
}
