import { markPreparedEvidencePhoto, prepareEvidencePhoto } from '@/lib/db/photo-evidence'

const DATABASE_NAME = 'gordi-mos-offline-photos'
const STORE_NAME = 'pending'
const DATABASE_VERSION = 1
/** A photo draft not saved within this long is dropped from the device. */
export const OFFLINE_PHOTO_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type StoredFile = { blob: Blob; name: string; type: string; lastModified: number }
type StoredPhotoDraft = { key: string; files: StoredFile[]; savedAt: number }

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function asFile(value: StoredFile): File | null {
  if (!(value.blob instanceof Blob) || typeof value.name !== 'string' || typeof value.type !== 'string'
    || typeof value.lastModified !== 'number') return null
  try {
    return markPreparedEvidencePhoto(new File([value.blob], value.name, { type: value.type, lastModified: value.lastModified }))
  } catch {
    return null
  }
}

export async function loadOfflinePhotoDraft(key: string): Promise<File[]> {
  const database = await openDatabase()
  if (!database) return []
  return new Promise(resolve => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(key)
      request.onsuccess = () => {
        const stored = request.result as StoredPhotoDraft | undefined
        resolve(Array.isArray(stored?.files) ? stored.files.map(asFile).filter((file): file is File => file !== null) : [])
      }
      request.onerror = () => resolve([])
      transaction.oncomplete = () => database.close()
      transaction.onerror = () => { database.close(); resolve([]) }
    } catch {
      database.close()
      resolve([])
    }
  })
}

/** Run one read-write transaction; true once it commits, false when there is no database or it fails. */
async function writeTransaction(run: (store: IDBObjectStore) => void): Promise<boolean> {
  const database = await openDatabase()
  if (!database) return false
  return new Promise(resolve => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      run(transaction.objectStore(STORE_NAME))
      transaction.oncomplete = () => { database.close(); resolve(true) }
      transaction.onerror = () => { database.close(); resolve(false) }
      transaction.onabort = () => { database.close(); resolve(false) }
    } catch {
      database.close()
      resolve(false)
    }
  })
}

export type OfflinePhotoDraftResult = 'saved' | 'tooLarge' | 'failed'

/** Each chosen file's stored JPEG, shrunk once however often the selection is saved. */
const prepared = new WeakMap<File, Promise<Blob | 'tooLarge' | 'failed'>>()
function storedForm(file: File): Promise<Blob | 'tooLarge' | 'failed'> {
  let form = prepared.get(file)
  if (!form) {
    form = prepareEvidencePhoto(file).catch((cause: unknown) =>
      cause instanceof Error && cause.message === 'WASTE_PHOTO_TOO_LARGE' ? 'tooLarge' as const : 'failed' as const)
    prepared.set(file, form)
  }
  return form
}

/**
 * Store a key's selected photos as the JPEGs the upload would send, replacing what was there; no
 * files deletes the record. A photo still over the 5 MB cap after shrinking is not stored, and the
 * save reports `tooLarge` so the capture can say so in size terms.
 */
export async function saveOfflinePhotoDraft(key: string, files: readonly File[], now = Date.now()): Promise<OfflinePhotoDraftResult> {
  const forms = await Promise.all(files.map(storedForm))
  const storable = files.flatMap((file, index) => {
    const blob = forms[index]
    return blob instanceof Blob ? [{ blob, name: file.name, type: blob.type || 'image/jpeg', lastModified: file.lastModified }] : []
  })
  const committed = await writeTransaction(store => {
    if (storable.length === 0) store.delete(key)
    else store.put({ key, savedAt: now, files: storable } satisfies StoredPhotoDraft)
  })
  if (!committed || forms.includes('failed')) return 'failed'
  return forms.includes('tooLarge') ? 'tooLarge' : 'saved'
}

export async function clearOfflinePhotoDraft(key: string): Promise<void> {
  await writeTransaction(store => store.delete(key))
}

/** Drop photo drafts not saved within the last seven days (and records without a save time). */
export async function pruneOfflinePhotoDrafts(now = Date.now()): Promise<void> {
  await writeTransaction(store => {
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const savedAt = (cursor.value as Partial<StoredPhotoDraft>).savedAt
      if (typeof savedAt !== 'number' || now - savedAt > OFFLINE_PHOTO_DRAFT_MAX_AGE_MS) cursor.delete()
      cursor.continue()
    }
  })
}

/** Delete every stored photo draft on this device, for sign-out on a shared phone. */
export function clearAllOfflinePhotoDrafts(): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve()
  return new Promise(resolve => {
    try {
      const request = indexedDB.deleteDatabase(DATABASE_NAME)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      // An open tab holding the database delays the delete; it completes once that tab closes it.
      request.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}
