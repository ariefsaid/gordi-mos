import { describe, expect, it } from 'vitest'
import { diffRecipes, esbBomType, esbStatus, filterRecipes, latestRecipes, recipeKey, recipeType, searchRecipes, type RecipeVersion } from './cafe-recipes'

const original: RecipeVersion = {
  esb_code: 'TEST', menu_id: 1, bom_id: 10, version: 1, first_seen: '2026-10-01', source_observed_at: '2026-10-01T01:00:00Z',
  recipe: { menu_name: 'Long ERP kitchen preparation', output_unit: 'Batch @10 porsi', output_yield: 1000,
    lines: [{ line_id: 1, detail_id: 1, name: 'Flour', qty: 250, unit: 'GR' }, { line_id: 2, detail_id: 2, name: 'Salt', qty: 2, unit: 'GR' }] },
}

it('finds recipes by trimmed, case-insensitive output name or recorded branch scope', () => {
  const second: RecipeVersion = { ...original, menu_id: 2, recipe: { menu_name: 'Coffee', branch_codes: ['North'], lines: [] } }
  expect(searchRecipes([original, second], '  KITCHEN ')).toEqual([original])
  expect(searchRecipes([original, second], 'north')).toEqual([second])
  expect(searchRecipes([original, second], 'unknown')).toEqual([])
  expect(searchRecipes([original, second], '')).toHaveLength(2)
})

it('retains separate ERP catalogs and returns the latest version of each recipe', () => {
  const second = { ...original, esb_code: 'OTHER' }
  const latest = { ...original, version: 2 }
  expect(latestRecipes([latest, original, second]).map(recipeKey)).toEqual(['OTHER:1', 'TEST:1'])
  expect(latestRecipes([latest, original, second])[1].version).toBe(2)
})

describe('retained ERP recipe changes', () => {
  it('does not report reordered ingredients as an edit', () => {
    expect(diffRecipes(original, { ...original, recipe: { ...original.recipe, lines: [...original.recipe.lines].reverse() } })).toEqual([])
  })

  it('retains duplicate ingredient details and explains output and ingredient status changes', () => {
    const before = { ...original, recipe: { ...original.recipe, lines: [
      { detail_id: 1, name: 'Oil', qty: 2, unit: 'ML', yield: 0, detail_active: true },
      { detail_id: 1, name: 'Oil', qty: 3, unit: 'ML' },
    ] } }
    const next = { ...before, bom_id: 11, recipe: { ...before.recipe, output_unit: 'Porsi', output_yield: 1, lines: [
      { detail_id: 1, name: 'Cooking oil', qty: 2, unit: 'ML', yield: 5, detail_active: false },
      { detail_id: 1, name: 'Oil', qty: 4, unit: 'ML' },
    ] } }
    expect(diffRecipes(before, next)).toEqual([
      { kind: 'name', name: 'Cooking oil', before: 'Oil', after: 'Cooking oil' },
      { kind: 'yield', name: 'Cooking oil', before: '0', after: '5' },
      { kind: 'status', name: 'Cooking oil', before: 'true', after: 'false' },
      { kind: 'quantity', name: 'Oil', before: '3', after: '4' },
      { kind: 'output', name: 'output_unit', before: 'Batch @10 porsi', after: 'Porsi' },
      { kind: 'output', name: 'output_yield', before: '1000', after: '1' },
      { kind: 'output', name: 'bom_id', before: '10', after: '11' },
    ])
  })

  it('reports removed output information without filling a default', () => {
    expect(diffRecipes(original, { ...original, recipe: { ...original.recipe, output_unit: '', output_yield: null } })).toEqual([
      { kind: 'output', name: 'output_unit', before: 'Batch @10 porsi', after: '' },
      { kind: 'output', name: 'output_yield', before: '1000', after: '' },
    ])
  })
  it('explains added, removed, quantity and unit changes without converting quantities', () => {
    const next: RecipeVersion = { ...original, version: 2, recipe: { ...original.recipe, lines: [
      { line_id: 1, detail_id: 1, name: 'Flour', qty: 0.3, unit: 'KG' },
      { line_id: 3, detail_id: 3, name: 'Butter', qty: 20, unit: 'GR' },
    ] } }
    expect(diffRecipes(original, next)).toEqual([
      { kind: 'quantity', name: 'Flour', before: '250', after: '0.3' },
      { kind: 'unit', name: 'Flour', before: 'GR', after: 'KG' },
      { kind: 'removed', name: 'Salt', before: '2 GR' },
      { kind: 'added', name: 'Butter', after: '20 GR' },
    ])
  })
})

describe('ESB status', () => {
  const make = (menu_id: number, bom_id: number | null, recipe: Partial<RecipeVersion['recipe']>): RecipeVersion =>
    ({ ...original, menu_id, bom_id, recipe: { ...original.recipe, ...recipe } })

  it("reads ESB's own flags: active, inactive", () => {
    expect(esbStatus(make(1, 10, { active: true }))).toBe('active')
    expect(esbStatus(make(2, 10, { active: false }))).toBe('inactive')
  })
  it('a menu removed in ESB wins over an active flag', () => {
    expect(esbStatus(make(3, 10, { active: true, menu_deleted: true }))).toBe('removed')
    expect(esbStatus(make(4, 10, { active: false, menu_deleted: true }))).toBe('removed')
    expect(esbStatus(make(5, 10, { menu_deleted: true }))).toBe('removed')
    expect(esbStatus(make(6, 10, { active: true, menu_deleted: false }))).toBe('active')
  })
  it('is Unknown, never active, when the copy carries no flag (a linked MOS item does not decide ESB status)', () => {
    expect(esbStatus(make(7, 10, {}))).toBe('unknown')
    expect(esbStatus(make(8, null, {}))).toBe('unknown')
  })
})

describe('recipe type', () => {
  const make = (menu_id: number, bom_id: number | null, recipe: Partial<RecipeVersion['recipe']>): RecipeVersion =>
    ({ ...original, menu_id, bom_id, recipe: { ...original.recipe, ...recipe } })
  const wip = new Set(['10'])

  it('ESB "Menu" is a menu item; any other ESB value is WIP / BOM and is kept as ESB wrote it', () => {
    expect(recipeType(make(1, 10, { bom_type: 'Menu' }), wip)).toBe('menu')
    expect(recipeType(make(2, null, { bom_type: ' menu ' }))).toBe('menu')
    expect(recipeType(make(3, 99, { bom_type: 'Prep Item' }))).toBe('wip')
    expect(esbBomType(make(3, 99, { bom_type: ' Prep Item ' }))).toBe('Prep Item')
    expect(esbBomType(make(4, 99, { bom_type: '  ' }))).toBeNull()
  })
  it("ESB's type beats the linked item", () => {
    expect(recipeType(make(4, 10, { bom_type: 'Menu' }), wip)).toBe('menu')
  })
  it('without an ESB type, a recipe whose BOM feeds a MOS item is WIP / BOM', () => {
    expect(recipeType(make(5, 10, {}), wip)).toBe('wip')
    expect(recipeType(make(6, 10, { bom_type: null }), wip)).toBe('wip')
  })
  it('is Unknown with no ESB type, no BOM or no linked item', () => {
    expect(recipeType(make(7, 99, {}), wip)).toBe('unknown')
    expect(recipeType(make(8, null, {}), wip)).toBe('unknown')
    expect(recipeType(make(9, 10, {}))).toBe('unknown')
  })
})

describe('recipe filters', () => {
  const make = (menu_id: number, bom_id: number | null, recipe: Partial<RecipeVersion['recipe']>): RecipeVersion =>
    ({ ...original, menu_id, bom_id, recipe: { ...original.recipe, ...recipe } })
  const rows = [
    make(1, 1, { active: true, bom_type: 'Menu' }), make(2, 2, { active: false, bom_type: 'Menu' }), make(3, 3, { active: true, menu_deleted: true, bom_type: 'Menu' }),
    make(4, 4, { active: true, bom_type: 'Prep' }), make(5, 10, {}), make(6, null, {}),
  ]
  const wipBomIds = new Set(['10'])
  const ids = (filters: Partial<Parameters<typeof filterRecipes>[1]>) => filterRecipes(rows, { status: 'All', type: 'All', wipBomIds, ...filters }).map(row => row.menu_id)

  it('filters by ESB status; Unknown shows only under All', () => {
    expect(ids({ status: 'Active' })).toEqual([1, 4])
    expect(ids({ status: 'Inactive' })).toEqual([2])
    expect(ids({ status: 'Removed' })).toEqual([3])
    expect(ids({ status: 'All' })).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('filters by type; Unknown type shows only under All', () => {
    expect(ids({ type: 'Menu' })).toEqual([1, 2, 3])
    expect(ids({ type: 'Wip' })).toEqual([4, 5])
    expect(ids({ type: 'Wip', status: 'Active' })).toEqual([4])
  })
  it('hides recipes hidden in MOS unless Show hidden is on, and leaves everything alone with no hidden set', () => {
    const hidden = new Set([recipeKey(rows[0]), recipeKey(rows[3])])
    expect(ids({ status: 'Active', hidden })).toEqual([])
    expect(ids({ status: 'Active', hidden, showHidden: true })).toEqual([1, 4])
    expect(ids({ status: 'Active' })).toEqual([1, 4])
  })
})
