import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OFFLINE_PHOTO_DRAFT_MAX_AGE_MS,
  clearAllOfflinePhotoDrafts,
  loadOfflinePhotoDraft,
  pruneOfflinePhotoDrafts,
  saveOfflinePhotoDraft,
} from './offline-photo-drafts'

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
})
afterEach(() => vi.unstubAllGlobals())

const photo = (name: string, bytes: number) => new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' })

describe('offline photo drafts', () => {
  it('AC-1006 keeps a selected photo on the device and returns it', async () => {
    await expect(saveOfflinePhotoDraft('k', [photo('a.jpg', 10)])).resolves.toBe(true)
    expect((await loadOfflinePhotoDraft('k')).map(file => file.name)).toEqual(['a.jpg'])
  })

  it('NFR-1007 a photo over the 5 MB evidence limit is not stored, and the save says so', async () => {
    await expect(saveOfflinePhotoDraft('k', [photo('ok.jpg', 10), photo('huge.jpg', 5 * 1024 * 1024 + 1)])).resolves.toBe(false)
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
