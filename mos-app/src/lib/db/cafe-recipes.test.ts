import { beforeEach, expect, it, vi } from 'vitest'
import type { RecipeVersion } from '@/lib/cafe-recipes'
const { calls, results } = vi.hoisted(() => ({ calls: [] as Array<[string, string, unknown[]]>, results: {} as Record<string, Array<{ data: unknown; error: unknown }>> }))
vi.mock('@/lib/supabase', () => ({ supabase: { schema: (schema: string) => ({ from: (table: string) => {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'not', 'order', 'range', 'single']) chain[method] = (...args: unknown[]) => { calls.push([`${schema}.${table}`, method, args]); return chain }
  chain.then = (resolve: (value: unknown) => void) => resolve(results[table]?.shift() ?? { data: [], error: null })
  return chain
} }) } }))
import { listItemRecipeVersions, listRecipeWipBomIds, listRecipeVersions } from './cafe-recipes'
const row: RecipeVersion = { esb_code: 'TEST', menu_id: 100, bom_id: 20, version: 1, first_seen: '2026-10-01', source_observed_at: '2026-10-01T01:00:00Z', recipe: { menu_name: 'ERP coffee', lines: [] } }
beforeEach(() => { calls.length = 0; for (const key of Object.keys(results)) delete results[key] })

it('reads past the API page limit in stable order without dropping recipes', async () => {
  results.recipe_versions = [{ data: Array.from({ length: 500 }, (_, menu_id) => ({ ...row, menu_id })), error: null }, { data: [{ ...row, menu_id: 500 }], error: null }]
  expect(await listRecipeVersions()).toHaveLength(501)
  expect(calls.filter(call => call[1] === 'range').map(call => call[2])).toEqual([[0, 499], [500, 999]])
  expect(calls.filter(call => call[1] === 'order').slice(0, 3).map(call => call[2])).toEqual([['esb_code'], ['menu_id'], ['version']])
})
it('fails visibly if a later page cannot be read', async () => {
  results.recipe_versions = [{ data: [], error: { message: 'offline' } }]
  await expect(listRecipeVersions()).rejects.toThrow('offline')
})
it('matches output detail references, not coincidentally equal menu and product identifiers', async () => {
  results.wip_items = [{ data: { esb_bom_id: null }, error: null }]
  results.item_units = [{ data: [{ esb_product_detail_id: '50' }], error: null }]
  const second = { ...row, menu_id: 50, recipe: { menu_name: 'Other menu', lines: [] } }
  const matched = { ...row, recipe: { ...row.recipe, output_detail_id: 50 } }
  results.recipe_versions = [{ data: [matched, second], error: null }]
  expect(await listItemRecipeVersions('item', 'Different name')).toEqual({ versions: [matched], matchedByName: false })
})
it('retains the full chronology of a BOM match', async () => {
  results.wip_items = [{ data: { esb_bom_id: '20' }, error: null }]
  results.item_units = [{ data: [], error: null }]
  const second = { ...row, version: 2 }
  results.recipe_versions = [{ data: [row, second], error: null }]
  expect(await listItemRecipeVersions('item', 'Changed name')).toEqual({ versions: [row, second], matchedByName: false })
})
it('labels exact-name associations and never fuzzy-matches an ERP item', async () => {
  for (const name of ['ERP coffee', 'ERP coff']) {
    results.wip_items = [{ data: { esb_bom_id: null }, error: null }]
    results.item_units = [{ data: [], error: null }]
    results.recipe_versions = [{ data: [row], error: null }]
    expect(await listItemRecipeVersions('item', name)).toEqual(name === 'ERP coffee' ? { versions: [row], matchedByName: true } : { versions: [], matchedByName: false })
  }
})
it.each(['wip_items', 'item_units'])('does not turn a failed %s read into a no-recipe claim', async table => {
  results[table] = [{ data: null, error: { message: 'unavailable' } }]
  await expect(listItemRecipeVersions('item', 'ERP coffee')).rejects.toThrow('unavailable')
})

it('lists the ESB BOM ids that a MOS item is built from', async () => {
  results.wip_items = [{ data: [{ esb_bom_id: '10' }, { esb_bom_id: '10' }, { esb_bom_id: '11' }, { esb_bom_id: null }], error: null }]
  expect(await listRecipeWipBomIds()).toEqual(new Set(['10', '11']))
  expect(calls.find(call => call[1] === 'select')?.[2]).toEqual(['esb_bom_id'])
})
it('fails visibly if the linked items cannot be read', async () => {
  results.wip_items = [{ data: null, error: { message: 'offline' } }]
  await expect(listRecipeWipBomIds()).rejects.toThrow('offline')
})
