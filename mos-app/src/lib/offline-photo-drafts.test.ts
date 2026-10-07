import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shrinkPhoto } from '@/lib/db/signal-photos'
import { prepareEvidencePhoto } from '@/lib/db/photo-evidence'
import {
  OFFLINE_PHOTO_DRAFT_MAX_AGE_MS,
  clearAllOfflinePhotoDrafts,
  loadOfflinePhotoDraft,
  pruneOfflinePhotoDrafts,
  saveOfflinePhotoDraft,
} from './offline-photo-drafts'

vi.mock('@/lib/db/signal-photos', () => ({ shrinkPhoto: vi.fn() }))

/** The slice of IndexedDB the store uses: one object store keyed by `key`, async callbacks. */
function fakeIndexedDb() {
  const records = new Map<string, Record<string, unknown>>()
  const later = (fn: () => void) => setTimeout(fn, 0)
  function transaction() {
    const tx: Record<string, unknown> = {}
    let pending = 0
    const settle = () => { if (--pending === 0) later(() => (tx.oncomplete as (() => void) | undefined)?.()) }
    const request = (run: () => unknown) => {
      pending++
      const req: Record<string, unknown> = {}
      later(() => { req.result = run(); (req.onsuccess as (() => void) | undefined)?.(); settle() })
      return req
    }
    tx.objectStore = () => ({
      get: (key: string) => request(() => records.get(key)),
      put: (value: Record<string, unknown>) => request(() => records.set(value.key as string, value)),
      delete: (key: string) => request(() => records.delete(key)),
      openCursor: () => {
        pending++
        const req: Record<string, unknown> = {}
        const keys = [...records.keys()]
        const step = (index: number) => later(() => {
          const key = keys[index]
          req.result = key === undefined ? null : {
            value: records.get(key),
            delete: () => records.delete(key),
            continue: () => step(index + 1),
          }
          ;(req.onsuccess as (() => void) | undefined)?.()
          if (key === undefined) settle()
        })
        step(0)
        return req
      },
    })
    return tx
  }
  const database = { objectStoreNames: { contains: () => true }, transaction, close: () => {} }
  return {
    records,
    api: {
      open: () => {
        const req: Record<string, unknown> = { result: database }
        later(() => (req.onsuccess as (() => void) | undefined)?.())
        return req
      },
      deleteDatabase: vi.fn(() => {
        const req: Record<string, unknown> = {}
        later(() => { records.clear(); (req.onsuccess as (() => void) | undefined)?.() })
        return req
      }),
    },
  }
}

let idb: ReturnType<typeof fakeIndexedDb>
beforeEach(() => {
  idb = fakeIndexedDb()
  vi.stubGlobal('indexedDB', idb.api)
  // The upload path's own shrink, stubbed to a small JPEG unless a test says otherwise.
  vi.mocked(shrinkPhoto).mockImplementation(async () => new Blob([new Uint8Array(10)], { type: 'image/jpeg' }))
})
afterEach(() => vi.unstubAllGlobals())

const photo = (name: string, bytes: number) => new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' })

describe('offline photo drafts', () => {
  it('AC-1006 keeps a selected photo on the device and returns it', async () => {
    await expect(saveOfflinePhotoDraft('k', [photo('a.jpg', 10)])).resolves.toBe('saved')
    expect((await loadOfflinePhotoDraft('k')).map(file => file.name)).toEqual(['a.jpg'])
  })

  it('NFR-1007 a large camera photo is stored as the JPEG upload would send, and comes back after a reload', async () => {
    vi.mocked(shrinkPhoto).mockResolvedValue(new Blob([new Uint8Array(900_000)], { type: 'image/jpeg' }))
    const raw = photo('camera-raw.jpg', 14 * 1024 * 1024)

    await expect(saveOfflinePhotoDraft('k', [raw])).resolves.toBe('saved')
    const [restored] = await loadOfflinePhotoDraft('k')

    expect(shrinkPhoto).toHaveBeenCalledWith(raw)
    expect({ name: restored.name, type: restored.type, size: restored.size }).toEqual({ name: 'camera-raw.jpg', type: 'image/jpeg', size: 900_000 })
  })

  it('NFR-1007 a restored photo is shrunk only once: saving it again and uploading it reuse the stored JPEG', async () => {
    vi.mocked(shrinkPhoto).mockResolvedValue(new Blob([new Uint8Array(900_000)], { type: 'image/jpeg' }))
    await saveOfflinePhotoDraft('k', [photo('camera-raw.jpg', 14 * 1024 * 1024)])
    const [restored] = await loadOfflinePhotoDraft('k')
    vi.mocked(shrinkPhoto).mockClear()

    await expect(saveOfflinePhotoDraft('k', [restored])).resolves.toBe('saved')
    const body = await prepareEvidencePhoto(restored)

    expect(shrinkPhoto).not.toHaveBeenCalled()
    expect(body).toBe(restored)
  })

  it('NFR-1007 a restored photo that is not a JPEG under 5 MB is still shrunk before upload', async () => {
    idb.records.set('k', { key: 'k', savedAt: Date.now(), files: [
      { blob: new Blob([new Uint8Array(10)], { type: 'image/png' }), name: 'kept-raw.png', type: 'image/png', lastModified: 1 },
    ] })
    const [restored] = await loadOfflinePhotoDraft('k')

    await prepareEvidencePhoto(restored)

    expect(shrinkPhoto).toHaveBeenCalledWith(restored)
  })

  it('NFR-1007 a photo still over 5 MB after shrinking is not stored, and the save says it is too large', async () => {
    vi.mocked(shrinkPhoto)
      .mockResolvedValueOnce(new Blob([new Uint8Array(10)], { type: 'image/jpeg' }))
      .mockResolvedValueOnce(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' }))

    await expect(saveOfflinePhotoDraft('k', [photo('ok.jpg', 10), photo('huge.jpg', 20 * 1024 * 1024)])).resolves.toBe('tooLarge')
    expect((await loadOfflinePhotoDraft('k')).map(file => file.name)).toEqual(['ok.jpg'])
  })

  it('AC-1006 a photo draft not saved for seven days is pruned; a recent one stays', async () => {
    const now = Date.parse('2026-10-14T00:00:00Z')
    await saveOfflinePhotoDraft('old', [photo('old.jpg', 10)], now - OFFLINE_PHOTO_DRAFT_MAX_AGE_MS - 1)
    await saveOfflinePhotoDraft('new', [photo('new.jpg', 10)], now - 60_000)

    await pruneOfflinePhotoDrafts(now)

    expect([...idb.records.keys()]).toEqual(['new'])
  })

  it('NFR-1007 clearing the device deletes the photo database', async () => {
    await saveOfflinePhotoDraft('k', [photo('a.jpg', 10)])
    await clearAllOfflinePhotoDrafts()
    expect(idb.api.deleteDatabase).toHaveBeenCalledWith('gordi-mos-offline-photos')
    expect(idb.records.size).toBe(0)
  })
})
