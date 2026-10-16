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
  /** ESB's own BOM type ("Menu" for a finished good sold; other values are preparations). Shown as ESB wrote it. */
  bom_type?: string | null
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

/** What ESB says about the recipe. "Removed from menu" wins over the active flag; no flag at all = unknown, never active. */
export type EsbStatus = 'active' | 'inactive' | 'removed' | 'unknown'
/** The ESB status filter; Unknown recipes appear under All only. The values are also the `?status=` URL values (Active = no key). */
export type EsbStatusFilter = 'Active' | 'Inactive' | 'Removed' | 'All'
export const ESB_STATUS_FILTERS: readonly EsbStatusFilter[] = ['All', 'Active', 'Inactive', 'Removed']

/** Menu = a finished good that is sold; WIP / BOM = a preparation. Unknown when neither ESB nor a linked MOS item says. */
export type RecipeType = 'menu' | 'wip' | 'unknown'
export type RecipeTypeFilter = 'All' | 'Menu' | 'Wip'
export const RECIPE_TYPE_FILTERS: readonly RecipeTypeFilter[] = ['All', 'Menu', 'Wip']
/** ESB BOM ids that a MOS item (ops.wip_items.esb_bom_id) is built from: a preparation even when ESB sends no type. */
export type RecipeWipBomIds = ReadonlySet<string>

export function esbStatus(row: RecipeVersion): EsbStatus {
  const { active, menu_deleted } = row.recipe
  if (menu_deleted === true) return 'removed'
  if (active === false) return 'inactive'
  if (active === true) return 'active'
  return 'unknown'
}

/** ESB's BOM type exactly as sent (trimmed), or null when the copy carries none. */
export function esbBomType(row: RecipeVersion): string | null {
  const raw = row.recipe.bom_type
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

/**
 * Menu or preparation. ESB's own BOM type decides ("Menu" is a menu item; any other value is a preparation).
 * Only when the copy carries no type does a MOS item built from the recipe's BOM mark it a preparation. Neither = unknown, never guessed.
 */
export function recipeType(row: RecipeVersion, wipBomIds?: RecipeWipBomIds): RecipeType {
  const type = esbBomType(row)
  if (type) return type.toLocaleLowerCase() === 'menu' ? 'menu' : 'wip'
  return row.bom_id != null && wipBomIds?.has(String(row.bom_id)) ? 'wip' : 'unknown'
}

export interface RecipeFilters {
  status: EsbStatusFilter
  type: RecipeTypeFilter
  wipBomIds?: RecipeWipBomIds
  /** Recipes hidden in MOS, and whether to include them in the list. */
  hidden?: ReadonlySet<string>
  showHidden?: boolean
}

export function filterRecipes(rows: readonly RecipeVersion[], filters: RecipeFilters): RecipeVersion[] {
  const status: EsbStatus | null = filters.status === 'All' ? null : filters.status === 'Active' ? 'active' : filters.status === 'Inactive' ? 'inactive' : 'removed'
  const type: RecipeType | null = filters.type === 'All' ? null : filters.type === 'Menu' ? 'menu' : 'wip'
  return rows.filter(row => (!status || esbStatus(row) === status)
    && (!type || recipeType(row, filters.wipBomIds) === type)
    && (filters.showHidden || !filters.hidden?.has(recipeKey(row))))
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
  for (const field of ['menu_name', 'output_unit', 'output_yield', 'output_detail_id', 'active', 'menu_deleted', 'bom_type'] as const) {
    compare('output', field, before.recipe[field], after.recipe[field])
  }
  compare('output', 'bom_id', before.bom_id, after.bom_id)
  compare('output', 'branch_codes', before.recipe.branch_codes?.join(', '), after.recipe.branch_codes?.join(', '))
  return changes
}
