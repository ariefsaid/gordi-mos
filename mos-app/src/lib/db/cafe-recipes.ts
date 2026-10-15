import { supabase } from '@/lib/supabase'
import { latestRecipes, recipeKey, recipeName, type RecipeItemFlags, type RecipeVersion } from '@/lib/cafe-recipes'

const SELECT = 'esb_code,menu_id,bom_id,version,first_seen,source_observed_at,recipe'
const PAGE_SIZE = 500

/** Read retained envelopes under the existing org RLS, including catalogs larger than an API page. */
export async function listRecipeVersions(): Promise<RecipeVersion[]> {
  const rows: RecipeVersion[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.schema('reporting').from('recipe_versions')
      .select(SELECT).order('esb_code').order('menu_id').order('version')
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`listRecipeVersions failed: ${error.message}`)
    const page = (data ?? []) as RecipeVersion[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

/** BOM -> item active flag, a plain read of ops.wip_items under the existing org RLS. Several items on one BOM: active if any is. */
export async function listRecipeItemFlags(): Promise<RecipeItemFlags> {
  const flags = new Map<string, boolean>()
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.schema('ops').from('wip_items')
      .select('esb_bom_id,flag_active').not('esb_bom_id', 'is', null).order('id')
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`listRecipeItemFlags failed: ${error.message}`)
    const page = (data ?? []) as Array<{ esb_bom_id: string | null; flag_active: boolean }>
    for (const item of page) {
      if (item.esb_bom_id == null) continue
      const key = String(item.esb_bom_id)
      flags.set(key, (flags.get(key) ?? false) || item.flag_active === true)
    }
    if (page.length < PAGE_SIZE) return flags
  }
}

export async function listItemRecipeVersions(itemId: string, erpName: string): Promise<{
  versions: RecipeVersion[]
  matchedByName: boolean
}> {
  const [items, units, versions] = await Promise.all([
    supabase.schema('ops').from('wip_items').select('esb_bom_id').eq('id', itemId).single(),
    supabase.schema('ops').from('item_units').select('esb_product_detail_id').eq('wip_item_id', itemId),
    listRecipeVersions(),
  ])
  if (items.error) throw new Error(`listItemRecipeVersions failed: ${items.error.message}`)
  if (units.error) throw new Error(`listItemRecipeVersions failed: ${units.error.message}`)
  const bomId = items.data?.esb_bom_id
  const detailIds = new Set((units.data ?? []).map(unit => String(unit.esb_product_detail_id)))
  const latest = latestRecipes(versions)
  const identified = latest.filter(row => (bomId != null && String(row.bom_id) === String(bomId))
    || (row.recipe.output_detail_id != null && row.recipe.output_detail_id > 0 && detailIds.has(String(row.recipe.output_detail_id))))
  const matches = identified.length ? identified : latest.filter(row => recipeName(row) === erpName)
  const keys = new Set(matches.map(recipeKey))
  return { versions: versions.filter(row => keys.has(recipeKey(row))), matchedByName: !identified.length && matches.length > 0 }
}
