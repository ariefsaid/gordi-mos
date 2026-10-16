import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ContractError } from './contract'
import * as routes from './cafe-transfer-routes'
import * as modules from './module-settings'
import * as locations from './cafe-locations'
import * as comparison from './cafe-stock-comparison'

const ctx = { client_request_id: '00000000-0000-4000-8000-000000000000' }
const key = { origin_branch_id: 'a', origin_activity: 'kitchen' as const, destination_branch_id: 'b' }

describe('disconnected backend stubs', () => {
  const calls: [string, () => Promise<unknown>][] = [
    ['listCafeTransferRoutes', () => routes.listCafeTransferRoutes()],
    ['createCafeTransferRoute', () => routes.createCafeTransferRoute(key, ctx)],
    ['updateCafeTransferRoute', () => routes.updateCafeTransferRoute(key, 1, key, ctx)],
    ['removeCafeTransferRoute', () => routes.removeCafeTransferRoute(key, 1, ctx)],
    ['listOrgModuleSettings', () => modules.listOrgModuleSettings()],
    ['listPersonModuleSettings', () => modules.listPersonModuleSettings('p')],
    ['getViewerModuleAvailability', () => modules.getViewerModuleAvailability()],
    ['saveOrgModuleSettings', () => modules.saveOrgModuleSettings([], ctx)],
    ['savePersonModuleSettings', () => modules.savePersonModuleSettings('p', [], ctx)],
    ['countModuleDisableImpact', () => modules.countModuleDisableImpact('cafe')],
    ['listCafeLocations', () => locations.listCafeLocations()],
    ['listCafeLocationsByIds', () => locations.listCafeLocationsByIds(['a'])],
    ['createCafeLocation', () => locations.createCafeLocation({ name: 'x', use: 'both', parent_id: null, branch_ids: [] }, ctx)],
    ['updateCafeLocation', () => locations.updateCafeLocation('a', 1, { name: 'x', use: 'both', parent_id: null, branch_ids: [] }, ctx)],
    ['archiveCafeLocation', () => locations.archiveCafeLocation('a', 1, ctx)],
    ['fetchCafeLocationBalances', () => locations.fetchCafeLocationBalances('2026-10-15', { branch_id: 'a', activity: 'kitchen' })],
    ['moveCafeStock', () => locations.moveCafeStock({ stream: { branch_id: 'a', activity: 'kitchen' }, item_unit_id: 'i', quantity: '1', from_location_id: 'f', to_location_id: 't', movement_date: '2026-10-15', note: null }, ctx)],
    ['listCafeRecordLocations', () => locations.listCafeRecordLocations('log', ['a'])],
    ['getCafeStreamLocationDefaults', () => locations.getCafeStreamLocationDefaults({ branch_id: 'a', activity: 'kitchen' })],
    ['listEsbStockMovements', () => comparison.listEsbStockMovements({ stream: { branch_id: 'a', activity: 'kitchen' }, item_id: 'i', unit_id: 'u', from: '2026-10-01', to: '2026-10-15' })],
    ['saveCafeStreamLocationDefaults', () => locations.saveCafeStreamLocationDefaults({ branch_id: 'a', activity: 'kitchen' }, { production_location_id: null, storage_location_id: null }, 1, ctx)],
  ]
  it.each(calls)('%s throws a typed UNAVAILABLE error', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ name: 'ContractError', code: 'UNAVAILABLE' })
    await expect(call()).rejects.toBeInstanceOf(ContractError)
  })

  it('every stub carries a HANDOVER comment naming its section', () => {
    for (const file of ['cafe-transfer-routes.ts', 'module-settings.ts', 'cafe-locations.ts', 'cafe-stock-comparison.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf8')
      const exported = source.match(/export async function \w+/g) ?? []
      const marks = source.match(/\/\/ HANDOVER: R\/handover\/[\w-]+\.md §/g) ?? []
      expect(marks.length).toBeGreaterThan(exported.length)
    }
  })

  it('no screen or hook calls a stub while disconnected (types only)', () => {
    const src = join(__dirname, '..', '..')
    const stubFns = /\b(listCafeTransferRoutes|createCafeTransferRoute|updateCafeTransferRoute|removeCafeTransferRoute|listOrgModuleSettings|listPersonModuleSettings|getViewerModuleAvailability|saveOrgModuleSettings|savePersonModuleSettings|countModuleDisableImpact|listCafeLocations|listCafeLocationsByIds|createCafeLocation|updateCafeLocation|archiveCafeLocation|fetchCafeLocationBalances|moveCafeStock|listCafeRecordLocations|getCafeStreamLocationDefaults|saveCafeStreamLocationDefaults|listEsbStockMovements)\b/
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : []
    })
    const offenders = walk(src)
      .filter((file) => !/\.test\.tsx?$/.test(file)) // tests may mock the stubs to prove they are never reached
      .filter((file) => !/(cafe-transfer-routes|module-settings|cafe-locations|cafe-stock-comparison)\.ts$/.test(file))
      .filter((file) => stubFns.test(readFileSync(file, 'utf8')))
      .map((file) => relative(src, file))
    expect(offenders).toEqual([])
  })
})
