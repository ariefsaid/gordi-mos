import { describe, it, expect, vi, beforeEach } from 'vitest'

const upload = vi.fn()
const createSignedUrls = vi.fn()
const tables: Record<string, unknown> = {}
let encoded: string[] = []

vi.unmock('@/lib/db/signal-photos') // the shared setup stubs the read; this file tests the real one
vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: () => ({ from: (table: string) => tables[table] }),
    storage: { from: () => ({ upload, createSignedUrls }) },
  },
}))

import { uploadSignalPhotos, listSignalPhotos } from './signal-photos'

const photo = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

beforeEach(() => {
  vi.clearAllMocks()
  tables.signals = { select: () => ({ eq: () => ({ single: async () => ({ data: { org_id: 'org-1' }, error: null }) }) }) }
  // jsdom has no image decoder or canvas encoder; the shrink step's contract here is "a JPEG blob out".
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3200, height: 1600, close: vi.fn() })))
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never
  encoded = []
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string) {
    encoded.push(`${this.width}x${this.height} ${type}`)
    cb(new Blob(['x'], { type }))
  }
})

describe('uploadSignalPhotos', () => {
  it('uploads each photo, shrunk to a 1600px edge, under <org>/<signal>/<uuid>.jpg in the order chosen', async () => {
    upload.mockResolvedValue({ error: null })

    expect(await uploadSignalPhotos('sig-1', [photo('a.jpg'), photo('b.jpg')])).toEqual([])

    expect(upload).toHaveBeenCalledTimes(2)
    const [path, , options] = upload.mock.calls[0]
    expect(path).toMatch(/^org-1\/sig-1\/[0-9a-f-]{36}\.jpg$/)
    expect(encoded).toEqual(['1600x800 image/jpeg', '1600x800 image/jpeg'])
    expect(options).toEqual({ contentType: 'image/jpeg' })
  })

  it('returns exactly the photos that did not upload', async () => {
    const [a, b] = [photo('a.jpg'), photo('b.jpg')]
    upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'offline' } })

    expect(await uploadSignalPhotos('sig-1', [a, b])).toEqual([b])
  })

  it('does nothing without photos', async () => {
    expect(await uploadSignalPhotos('sig-1', [])).toEqual([])
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('listSignalPhotos', () => {
  it('reads many Signals in one query and pairs each path with its signed URL', async () => {
    const inFilter = vi.fn(() => ({ order: async () => ({ data: [{ signal_id: 'sig-1', path: 'org-1/sig-1/p.jpg' }], error: null }) }))
    tables.signal_photos = { select: () => ({ in: inFilter }) }
    createSignedUrls.mockResolvedValue({ data: [{ signedUrl: 'https://signed/p' }], error: null })

    expect(await listSignalPhotos(['sig-1', 'sig-2'])).toEqual([{ signalId: 'sig-1', path: 'org-1/sig-1/p.jpg', url: 'https://signed/p' }])
    expect(inFilter).toHaveBeenCalledWith('signal_id', ['sig-1', 'sig-2'])
    expect(createSignedUrls).toHaveBeenCalledWith(['org-1/sig-1/p.jpg'], 3600)
  })

  it('asks for nothing when there are no Signals', async () => {
    expect(await listSignalPhotos([])).toEqual([])
    expect(createSignedUrls).not.toHaveBeenCalled()
  })
})
