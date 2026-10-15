import { describe, expect, it } from 'vitest'
import { diffRecipes, filterRecipesByActivity, latestRecipes, recipeActivity, recipeKey, searchRecipes, type RecipeVersion } from './cafe-recipes'

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

describe('recipe active status', () => {
  const make = (menu_id: number, bom_id: number | null, recipe: Partial<RecipeVersion['recipe']>): RecipeVersion =>
    ({ ...original, menu_id, bom_id, recipe: { ...original.recipe, ...recipe } })
  const flags = new Map([['10', true], ['11', false]])

  it("trusts the recipe's own ESB flag over the linked item", () => {
    expect(recipeActivity(make(1, 11, { active: true }), flags)).toBe('active')
    expect(recipeActivity(make(2, 10, { active: false }), flags)).toBe('inactive')
  })
  it('treats a deleted menu as inactive even when marked active', () => {
    expect(recipeActivity(make(3, 10, { active: true, menu_deleted: true }), flags)).toBe('inactive')
    expect(recipeActivity(make(4, 10, { menu_deleted: true }), flags)).toBe('inactive')
  })
  it('falls back to the linked item (bom_id = esb_bom_id) only when the recipe carries no flag', () => {
    expect(recipeActivity(make(5, 10, {}), flags)).toBe('active')
    expect(recipeActivity(make(6, 11, {}), flags)).toBe('inactive')
  })
  it('is Unknown, never active, with no flag, no link or no item read', () => {
    expect(recipeActivity(make(7, null, {}), flags)).toBe('unknown')
    expect(recipeActivity(make(8, 99, {}), flags)).toBe('unknown')
    expect(recipeActivity(make(9, 10, {}))).toBe('unknown')
  })
  it('filters Active, Inactive and All; Unknown shows only under All', () => {
    const rows = [make(1, 10, { active: true }), make(2, 10, { active: false }), make(3, 99, {})]
    const ids = (filter: 'Active' | 'Inactive' | 'All') => filterRecipesByActivity(rows, filter, flags).map(row => row.menu_id)
    expect(ids('Active')).toEqual([1])
    expect(ids('Inactive')).toEqual([2])
    expect(ids('All')).toEqual([1, 2, 3])
  })
})
