import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContractError } from './contract'

const db = vi.hoisted(() => {
  const rpc = vi.fn()
  const schema = vi.fn(() => ({ rpc }))
  return { rpc, schema }
})

vi.mock('@/lib/supabase', () => ({ supabase: { schema: db.schema } }))

import { getViewerModuleAvailability, listOrgModuleSettings, saveOrgModuleSettings } from './module-settings'

describe('module settings data access', () => {
  afterEach(() => vi.restoreAllMocks())

  beforeEach(() => {
    db.rpc.mockReset()
    db.schema.mockClear()
  })

  it('loads org settings through the mos RPC', async () => {
    const settings = [{ module_id: 'work', enabled: true, row_version: 0, updated_at: null, updated_by: null }]
    db.rpc.mockResolvedValue({ data: settings, error: null })

    await expect(listOrgModuleSettings()).resolves.toEqual(settings)
    expect(db.schema).toHaveBeenCalledWith('mos')
    expect(db.rpc).toHaveBeenCalledWith('list_org_module_settings')
  })

  it('loads viewer availability through the mos RPC', async () => {
    const availability = [{ module_id: 'work', enabled: false, revision: 'org-revision' }]
    db.rpc.mockResolvedValue({ data: availability, error: null })

    await expect(getViewerModuleAvailability()).resolves.toEqual(availability)
    expect(db.rpc).toHaveBeenCalledWith('viewer_module_availability')
  })

  it('saves org settings with the write request id', async () => {
    const rows = [{ module_id: 'work' as const, enabled: false, expected_version: 4 }]
    const saved = [{ module_id: 'work', enabled: false, row_version: 5, updated_at: null, updated_by: null }]
    db.rpc.mockResolvedValue({ data: saved, error: null })

    await expect(saveOrgModuleSettings(rows, { client_request_id: 'request-1' })).resolves.toEqual(saved)
    expect(db.rpc).toHaveBeenCalledWith('save_org_module_settings', {
      p_rows: rows,
      p_client_request_id: 'request-1',
    })
  })

  it('returns empty lists for successful RPCs with no rows', async () => {
    db.rpc.mockResolvedValue({ data: null, error: null })

    await expect(listOrgModuleSettings()).resolves.toEqual([])
    await expect(getViewerModuleAvailability()).resolves.toEqual([])
    await expect(saveOrgModuleSettings([], { client_request_id: 'request-1' })).resolves.toEqual([])
  })

  it('converts ordinary RPC failures into retryable errors', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'offline' } })
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(listOrgModuleSettings()).rejects.toThrow("Couldn't load module settings. Try again.")
    expect(logError).toHaveBeenCalledOnce()
  })

  it('surfaces optimistic-concurrency failures as typed conflicts', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'module settings changed, reload' } })

    await expect(saveOrgModuleSettings([], { client_request_id: 'request-1' })).rejects.toMatchObject({
      name: 'ContractError', code: 'CONFLICT',
    })
    await expect(saveOrgModuleSettings([], { client_request_id: 'request-1' })).rejects.toBeInstanceOf(ContractError)
  })
})
