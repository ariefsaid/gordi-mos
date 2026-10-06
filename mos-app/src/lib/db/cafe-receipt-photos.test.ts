import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { shrinkPhoto } from '@/lib/db/signal-photos'
import { listCafeReceiptPhotos, uploadCafeReceiptLinePhoto } from './cafe-receipt-photos'

const mocks = vi.hoisted(() => ({ schema: vi.fn(), storageFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { schema: mocks.schema, storage: { from: mocks.storageFrom } } }))
vi.mock('@/lib/db/signal-photos', () => ({ shrinkPhoto: vi.fn() }))

const schemaMock = vi.mocked(supabase.schema)
const shrinkPhotoMock = vi.mocked(shrinkPhoto)
const storageFromMock = mocks.storageFrom

beforeEach(() => vi.clearAllMocks())

describe('Café receipt private photo adapter', () => {
  it('AC-1013 stores a compressed JPEG in the owner/receipt/line path and returns a signed photo', async () => {
    const lineQuery: Record<string, unknown> = {}
    for (const method of ['select', 'eq']) lineQuery[method] = vi.fn(() => lineQuery)
    lineQuery.single = vi.fn().mockResolvedValue({ data: { org_id: 'org-1', receipt_id: 'receipt-1' }, error: null })
    const photoQuery: Record<string, unknown> = {}
    for (const method of ['select', 'in', 'order']) photoQuery[method] = vi.fn(() => photoQuery)
    const photoPath = 'org-1/receipt-1/line-1/00000000-0000-0000-0000-00000000f301.jpg'
    photoQuery.then = (resolve: (value: unknown) => unknown) => Promise.resolve({
      data: [{ line_id: 'line-1', path: photoPath, created_at: '2026-10-06T08:00:00Z' }], error: null,
    }).then(resolve)
    schemaMock.mockImplementation(() => ({
      from: (name: string) => name === 'cafe_receipt_lines' ? lineQuery : photoQuery,
    }) as never)
    const upload = vi.fn().mockResolvedValue({ error: null })
    const createSignedUrls = vi.fn().mockResolvedValue({ data: [{ signedUrl: 'https://private.test/signed' }], error: null })
    storageFromMock.mockReturnValue({ upload, createSignedUrls })
    shrinkPhotoMock.mockResolvedValue(new Blob(['small-jpeg'], { type: 'image/jpeg' }))
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-00000000f301')

    await expect(uploadCafeReceiptLinePhoto('line-1', new File(['phone-image'], 'seal.png', { type: 'image/png' })))
      .resolves.toEqual({
        lineId: 'line-1', path: photoPath, url: 'https://private.test/signed',
        createdAt: '2026-10-06T08:00:00Z', name: 'seal.png',
      })
    expect(shrinkPhotoMock).toHaveBeenCalledOnce()
    expect(upload).toHaveBeenCalledWith(photoPath, expect.any(Blob), { contentType: 'image/jpeg', upsert: false })
    expect(createSignedUrls).toHaveBeenCalledWith([photoPath], 3600)
    vi.restoreAllMocks()
  })

  it('AC-1013 rejects non-images before lookup and rejects compressed images above 5 MB before upload', async () => {
    await expect(uploadCafeReceiptLinePhoto('line-1', new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' })))
      .rejects.toThrow('CAFE_RECEIPT_PHOTO_INVALID_TYPE')
    expect(schemaMock).not.toHaveBeenCalled()

    const lineQuery: Record<string, unknown> = {}
    for (const method of ['select', 'eq']) lineQuery[method] = vi.fn(() => lineQuery)
    lineQuery.single = vi.fn().mockResolvedValue({ data: { org_id: 'org-1', receipt_id: 'receipt-1' }, error: null })
    schemaMock.mockReturnValue({ from: () => lineQuery } as never)
    const upload = vi.fn()
    storageFromMock.mockReturnValue({ upload })
    shrinkPhotoMock.mockResolvedValue(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' }))

    await expect(uploadCafeReceiptLinePhoto('line-1', new File(['image'], 'photo.jpg', { type: 'image/jpeg' })))
      .rejects.toThrow('WASTE_PHOTO_TOO_LARGE')
    expect(upload).not.toHaveBeenCalled()
  })

  it('AC-1013 lists the requested receipts’ photo records by receipt and signs their private paths', async () => {
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'in', 'order']) query[method] = vi.fn(() => query)
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [
      { line_id: 'line-1', path: 'org-1/receipt-1/line-1/photo-1.jpg', created_at: '2026-10-06T08:00:00Z' },
    ], error: null }).then(resolve)
    schemaMock.mockReturnValue({ from: () => query } as never)
    const createSignedUrls = vi.fn().mockResolvedValue({ data: [{ signedUrl: 'https://private.test/signed' }], error: null })
    storageFromMock.mockReturnValue({ createSignedUrls })

    await expect(listCafeReceiptPhotos(['receipt-1', 'receipt-1'])).resolves.toEqual([{
      lineId: 'line-1', path: 'org-1/receipt-1/line-1/photo-1.jpg',
      url: 'https://private.test/signed', createdAt: '2026-10-06T08:00:00Z',
    }])
    expect(query.in).toHaveBeenCalledWith('receipt_id', ['receipt-1'])
  })

  it('AC-1013 refuses more than 50 receipts in one photo read', async () => {
    await expect(listCafeReceiptPhotos(Array.from({ length: 51 }, (_, index) => `receipt-${index}`)))
      .rejects.toThrow('at most 50 receipts')
    expect(schemaMock).not.toHaveBeenCalled()
  })
})
