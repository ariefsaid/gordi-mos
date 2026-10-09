import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: vi.fn(), storage: { from: vi.fn() } },
}))

vi.mock('@/lib/db/signal-photos', () => ({ shrinkPhoto: vi.fn() }))

import { supabase } from '@/lib/supabase'
import { shrinkPhoto } from '@/lib/db/signal-photos'
import {
  isWastePhotoWindowExpired, WASTE_PHOTO_UPLOAD_WINDOW_MS, listCurrentPersonKitchenWasteDrafts, restartKitchenWasteDraft, uploadKitchenWastePhoto,
} from './kitchen-waste-photos'

const schemaMock = vi.mocked(supabase.schema)
const storageFromMock = vi.mocked(supabase.storage.from)

function stubTables(responses: Record<string, { data: unknown; error: unknown }>) {
  schemaMock.mockReturnValue({ from: vi.fn((table: string) => {
    const response = responses[table]!
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'is', 'in', 'order']) builder[method] = vi.fn(() => builder)
    builder.then = (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve)
    return builder
  }) } as never)
  storageFromMock.mockReturnValue({ createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }) } as never)
}

describe('waste photo upload window', () => {
  it('closes at the same deadline used by upload and draft recovery', () => {
    const createdAt = '2026-10-01T00:00:00.000Z'
    const deadline = Date.parse(createdAt) + WASTE_PHOTO_UPLOAD_WINDOW_MS
    expect(isWastePhotoWindowExpired(createdAt, deadline - 1)).toBe(false)
    expect(isWastePhotoWindowExpired(createdAt, deadline)).toBe(true)
    expect(isWastePhotoWindowExpired(createdAt, deadline + 1)).toBe(true)
  })
})

describe('uploadKitchenWastePhoto', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses a photo still over 5 MB after shrinking with the size error, before upload', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { org_id: 'org-1', action: 'waste', status: 'Draft', created_at: new Date().toISOString() }, error: null,
    })
    const builder: Record<string, unknown> = { single }
    for (const method of ['select', 'eq']) builder[method] = vi.fn(() => builder)
    schemaMock.mockReturnValue({ from: vi.fn(() => builder) } as never)
    const upload = vi.fn()
    storageFromMock.mockReturnValue({ upload } as never)
    vi.mocked(shrinkPhoto).mockResolvedValue(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' }))

    await expect(uploadKitchenWastePhoto('log-1', new File(['image'], 'spill.jpg', { type: 'image/jpeg' })))
      .rejects.toThrow('WASTE_PHOTO_TOO_LARGE')
    expect(shrinkPhoto).toHaveBeenCalledOnce()
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('listCurrentPersonKitchenWasteDrafts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads only the current person’s waste drafts for the selected org and stream across dates', async () => {
    expect(listCurrentPersonKitchenWasteDrafts).toBeTypeOf('function')
    const fromTables: string[] = []
    const filters: Array<[string, unknown]> = []
    const response = { data: [], error: null }
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn((column: string, value: unknown) => {
      filters.push([column, value])
      return builder
    })
    builder.is = vi.fn((column: string, value: unknown) => {
      filters.push([column, value])
      return builder
    })
    builder.order = vi.fn(() => builder)
    builder.then = (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve)
    const from = vi.fn((table: string) => {
      fromTables.push(table)
      return builder
    })
    schemaMock.mockReturnValue({ from } as never)

    await expect(listCurrentPersonKitchenWasteDrafts({
      orgId: 'org-1',
      personId: 'person-1',
      branchId: 'branch-1',
      activity: 'bar',
    })).resolves.toEqual([])

    expect(fromTables).toEqual(['kitchen_logs'])
    expect(filters).toEqual([
      ['org_id', 'org-1'],
      ['submitted_by', 'person-1'],
      ['branch_id', 'branch-1'],
      ['activity', 'bar'],
      ['action', 'waste'],
      ['status', 'Draft'],
      ['superseded_by', null],
    ])
  })

  it('returns the captured quantity, unit label, and signed photos for each draft', async () => {
    const fromTables: string[] = []
    const responses: Record<string, { data: unknown; error: unknown }> = {
      kitchen_logs: {
        data: [{
          id: 'draft-1', client_request_id: '40000000-0000-0000-0000-000000000001',
          wip_item_id: 'item-1', item_unit_id: 'unit-1', qty_porsi: 1.5,
          entry_quantity: 3, entry_unit_factor: 0.5, entry_unit_name: 'ERP pack',
          created_at: '2026-10-01T00:00:00.000Z', log_date: '2026-10-01',
        }],
        error: null,
      },
      item_units: { data: [{ id: 'unit-1', unit_name: 'tray' }], error: null },
      kitchen_log_waste_photos: {
        data: [{ log_id: 'draft-1', path: 'org-1/draft-1/photo.jpg', created_at: '2026-10-02T00:01:00.000Z' }],
        error: null,
      },
    }
    const from = vi.fn((table: string) => {
      fromTables.push(table)
      const response = responses[table]!
      const builder: Record<string, unknown> = {}
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      builder.is = vi.fn(() => builder)
      builder.in = vi.fn(() => builder)
      builder.order = vi.fn(() => builder)
      builder.then = (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve)
      return builder
    })
    schemaMock.mockReturnValue({ from } as never)
    storageFromMock.mockReturnValue({
      createSignedUrls: vi.fn().mockResolvedValue({
        data: [{ signedUrl: 'https://storage.test/draft-1/photo.jpg' }], error: null,
      }),
    } as never)

    await expect(listCurrentPersonKitchenWasteDrafts({
      orgId: 'org-1', personId: 'person-1', branchId: 'branch-1', activity: 'bar',
    })).resolves.toEqual([{
      logId: 'draft-1',
      clientRequestId: '40000000-0000-0000-0000-000000000001',
      itemId: 'item-1',
      itemUnitId: 'unit-1',
      unitName: 'ERP pack',
      quantity: 3,
      entryUnitFactor: 0.5,
      entryUnitName: 'ERP pack',
      createdAt: '2026-10-01T00:00:00.000Z',
      logDate: '2026-10-01',
      photos: [{
        logId: 'draft-1',
        path: 'org-1/draft-1/photo.jpg',
        url: 'https://storage.test/draft-1/photo.jpg',
        createdAt: '2026-10-02T00:01:00.000Z',
      }],
    }])
    expect(fromTables).toEqual(['kitchen_logs', 'item_units', 'kitchen_log_waste_photos'])
    expect(storageFromMock).toHaveBeenCalledWith('waste-photos')
  })
  it.each(['missing', 'blank', 'no-id'] as const)('isolates %s captured-unit metadata to its own draft', async state => {
    const captured = {
      wip_item_id: 'item-1', qty_porsi: 2.5,
      created_at: '2026-10-01T00:00:00.000Z', log_date: '2026-10-01',
    }
    stubTables({
      kitchen_logs: { data: [
        { ...captured, id: 'valid', item_unit_id: 'unit-1' },
        { ...captured, id: 'unavailable', item_unit_id: state === 'no-id' ? null : 'unit-2' },
      ], error: null },
      item_units: { data: [
        { id: 'unit-1', unit_name: 'tray' },
        ...(state === 'blank' ? [{ id: 'unit-2', unit_name: '' }] : []),
      ], error: null },
      kitchen_log_waste_photos: { data: [], error: null },
    })
    const drafts = await listCurrentPersonKitchenWasteDrafts({
      orgId: 'org-1', personId: 'person-1', branchId: 'branch-1', activity: 'bar',
    })
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({ logId: 'valid', itemUnitId: 'unit-1', unitName: 'tray', quantity: 2.5 })
    expect(drafts[1]).toMatchObject({ logId: 'unavailable', itemUnitId: state === 'no-id' ? null : 'unit-2', unitName: null, quantity: 2.5, logDate: '2026-10-01' })
  })

  it('surfaces a failed unit-label read while recovering waste drafts', async () => {
    stubTables({
      kitchen_logs: { data: [{ id: 'draft-1', wip_item_id: 'item-1', item_unit_id: 'unit-1', qty_porsi: 2.5, created_at: '2026-10-01T00:00:00.000Z', log_date: '2026-10-01' }], error: null },
      item_units: { data: null, error: { message: 'Temporary read failure' } },
      kitchen_log_waste_photos: { data: [], error: null },
    })
    await expect(listCurrentPersonKitchenWasteDrafts({
      orgId: 'org-1', personId: 'person-1', branchId: 'branch-1', activity: 'bar',
    })).rejects.toThrow('Temporary read failure')
  })

})

describe('restartKitchenWasteDraft', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the atomic restart RPC with only the original id and replacement date', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'replacement', log_date: '2026-10-02' }], error: null })
    schemaMock.mockReturnValue({ rpc } as never)
    await expect(restartKitchenWasteDraft('original', '2026-10-03')).resolves.toEqual({ logId: 'replacement', logDate: '2026-10-02' })
    expect(schemaMock).toHaveBeenCalledWith('ops')
    expect(rpc).toHaveBeenCalledWith('restart_cafe_waste_draft', { p_log_id: 'original', p_log_date: '2026-10-03' })
  })

  it('propagates a restart failure without reporting a replacement', async () => {
    schemaMock.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Draft is ineligible' } }) } as never)
    await expect(restartKitchenWasteDraft('original', '2026-10-02')).rejects.toThrow('Draft is ineligible')
  })

  it('rejects a response without a replacement', async () => {
    schemaMock.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as never)
    await expect(restartKitchenWasteDraft('original', '2026-10-02')).rejects.toThrow('replacement was not returned')
  })
})
