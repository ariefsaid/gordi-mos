import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: vi.fn(), storage: { from: vi.fn() } },
}))

import { supabase } from '@/lib/supabase'
import { isWastePhotoWindowExpired, WASTE_PHOTO_UPLOAD_WINDOW_MS, listCurrentPersonKitchenWasteDrafts } from './kitchen-waste-photos'

const schemaMock = vi.mocked(supabase.schema)
const storageFromMock = vi.mocked(supabase.storage.from)

function stubTables(responses: Record<string, { data: unknown; error: unknown }>) {
  schemaMock.mockReturnValue({ from: vi.fn((table: string) => {
    const response = responses[table]!
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'in', 'order']) builder[method] = vi.fn(() => builder)
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
    ])
  })

  it('returns the captured quantity, unit label, and signed photos for each draft', async () => {
    const fromTables: string[] = []
    const responses: Record<string, { data: unknown; error: unknown }> = {
      kitchen_logs: {
        data: [{
          id: 'draft-1', wip_item_id: 'item-1', item_unit_id: 'unit-1', qty_porsi: 2.5,
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
      itemId: 'item-1',
      itemUnitId: 'unit-1',
      unitName: 'tray',
      quantity: 2.5,
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

  it('keeps draft facts when the unit-label read is temporarily unavailable', async () => {
    stubTables({
      kitchen_logs: { data: [{ id: 'draft-1', wip_item_id: 'item-1', item_unit_id: 'unit-1', qty_porsi: 2.5, created_at: '2026-10-01T00:00:00.000Z', log_date: '2026-10-01' }], error: null },
      item_units: { data: null, error: { message: 'Temporary read failure' } },
      kitchen_log_waste_photos: { data: [], error: null },
    })
    await expect(listCurrentPersonKitchenWasteDrafts({
      orgId: 'org-1', personId: 'person-1', branchId: 'branch-1', activity: 'bar',
    })).resolves.toEqual([expect.objectContaining({ logId: 'draft-1', itemUnitId: 'unit-1', unitName: null, quantity: 2.5 })])
  })

})
