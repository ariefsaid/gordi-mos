type RecipeLine = {
  line_id?: number
  detail_id: number
  name?: string
  qty: number
  unit: string
  yield?: number | null
  detail_active?: boolean
  product_active?: boolean
  product_deleted?: boolean
}

type RecipeEnvelope = {
  menu_name?: string
  bom_name?: string
  output_detail_id?: number
  output_unit?: string
  output_yield?: number | null
  branch_codes?: string[]
  active?: boolean
  menu_deleted?: boolean
  lines: RecipeLine[]
}

export type RecipeVersion = {
  esb_code: string
  menu_id: number
  bom_id: number | null
  version: number
  first_seen: string
  source_observed_at: string
  recipe: RecipeEnvelope
}

export type RecipeChange = {
  kind: 'added' | 'removed' | 'quantity' | 'unit' | 'status' | 'name' | 'yield' | 'output'
  name: string
  before?: string
  after?: string
}

export function recipeKey(row: RecipeVersion): string { return `${row.esb_code}:${row.menu_id}` }
export function recipeName(row: RecipeVersion): string { return row.recipe.menu_name || row.recipe.bom_name || '' }

export type RecipeActivity = 'active' | 'inactive' | 'unknown'
/** ESB BOM id -> whether an item built from that BOM is switched on in MOS (ops.wip_items.flag_active). */
export type RecipeItemFlags = ReadonlyMap<string, boolean>
/** Same three choices as the Items page filter. "Unknown" recipes appear under All only. */
export type RecipeActivityFilter = 'Active' | 'Inactive' | 'All'

/**
 * Is this recipe in use? The recipe's own ESB flag decides: ESB marks the recipe (or its menu) inactive or deleted.
 * Only when the copy carries neither flag do we fall back to the linked item (recipe.bom_id = item.esb_bom_id),
 * whose flag is a MOS team setting for the item, not ESB's word on the recipe. Neither source = unknown, never active.
 */
export function recipeActivity(row: RecipeVersion, itemFlags?: RecipeItemFlags): RecipeActivity {
  const { active, menu_deleted } = row.recipe
  if (menu_deleted === true || active === false) return 'inactive'
  if (active === true) return 'active'
  const linked = row.bom_id == null ? undefined : itemFlags?.get(String(row.bom_id))
  return linked === undefined ? 'unknown' : linked ? 'active' : 'inactive'
}

export function filterRecipesByActivity(rows: readonly RecipeVersion[], filter: RecipeActivityFilter, itemFlags?: RecipeItemFlags): RecipeVersion[] {
  if (filter === 'All') return [...rows]
  const want: RecipeActivity = filter === 'Active' ? 'active' : 'inactive'
  return rows.filter(row => recipeActivity(row, itemFlags) === want)
}

export function latestRecipes(versions: readonly RecipeVersion[]): RecipeVersion[] {
  const latest = new Map<string, RecipeVersion>()
  for (const row of versions) {
    const key = recipeKey(row)
    if (!latest.has(key) || latest.get(key)!.version < row.version) latest.set(key, row)
  }
  return [...latest.values()].sort((a, b) => recipeName(a).localeCompare(recipeName(b)) || recipeKey(a).localeCompare(recipeKey(b)))
}

export function searchRecipes(rows: readonly RecipeVersion[], query: string): RecipeVersion[] {
  const needle = query.trim().toLocaleLowerCase()
  return rows.filter(row => `${recipeName(row)} ${(row.recipe.branch_codes ?? []).join(' ')}`.toLocaleLowerCase().includes(needle))
}

function indexedLines(lines: RecipeLine[]): Map<string, RecipeLine> {
  const occurrences = new Map<string, number>()
  return new Map(lines.map(line => {
    const identity = line.line_id === undefined ? `detail:${line.detail_id}` : `line:${line.line_id}`
    const occurrence = occurrences.get(identity) ?? 0
    occurrences.set(identity, occurrence + 1)
    return [`${identity}:${occurrence}`, line]
  }))
}

export function diffRecipes(before: RecipeVersion, after: RecipeVersion): RecipeChange[] {
  const oldLines = indexedLines(before.recipe.lines)
  const newLines = indexedLines(after.recipe.lines)
  const changes: RecipeChange[] = []
  const value = (v: unknown) => v === undefined || v === null || v === '' ? '' : String(v)
  const compare = (kind: RecipeChange['kind'], name: string, a: unknown, b: unknown) => {
    if (value(a) !== value(b)) changes.push({ kind, name, before: value(a), after: value(b) })
  }
  for (const [key, old] of oldLines) {
    const next = newLines.get(key)
    const name = next?.name || old.name || ''
    if (!next) { changes.push({ kind: 'removed', name, before: `${old.qty} ${old.unit}` }); continue }
    compare('quantity', name, old.qty, next.qty)
    compare('unit', name, old.unit, next.unit)
    compare('name', name, old.name, next.name)
    compare('yield', name, old.yield, next.yield)
    for (const field of ['detail_active', 'product_active', 'product_deleted'] as const) {
      compare('status', name, old[field], next[field])
    }
    compare('output', name, old.detail_id, next.detail_id)
  }
  for (const [key, next] of newLines) {
    if (!oldLines.has(key)) changes.push({ kind: 'added', name: next.name || '', after: `${next.qty} ${next.unit}` })
  }
  for (const field of ['menu_name', 'output_unit', 'output_yield', 'output_detail_id', 'active', 'menu_deleted'] as const) {
    compare('output', field, before.recipe[field], after.recipe[field])
  }
  compare('output', 'bom_id', before.bom_id, after.bom_id)
  compare('output', 'branch_codes', before.recipe.branch_codes?.join(', '), after.recipe.branch_codes?.join(', '))
  return changes
}
