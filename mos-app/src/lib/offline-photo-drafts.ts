const DATABASE_NAME = 'gordi-mos-offline-photos'
const STORE_NAME = 'pending'
const DATABASE_VERSION = 1

type StoredFile = { blob: Blob; name: string; type: string; lastModified: number }
type StoredPhotoDraft = { key: string; files: StoredFile[] }

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
    return new File([value.blob], value.name, { type: value.type, lastModified: value.lastModified })
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

export async function saveOfflinePhotoDraft(key: string, files: readonly File[]): Promise<boolean> {
  const database = await openDatabase()
  if (!database) return false
  return new Promise(resolve => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      if (files.length === 0) store.delete(key)
      else store.put({
        key,
        files: files.map(file => ({ blob: file, name: file.name, type: file.type, lastModified: file.lastModified })),
      } satisfies StoredPhotoDraft)
      transaction.oncomplete = () => { database.close(); resolve(true) }
      transaction.onerror = () => { database.close(); resolve(false) }
      transaction.onabort = () => { database.close(); resolve(false) }
    } catch {
      database.close()
      resolve(false)
    }
  })
}

export async function clearOfflinePhotoDraft(key: string): Promise<void> {
  const database = await openDatabase()
  if (!database) return
  await new Promise<void>(resolve => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(key)
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => { database.close(); resolve() }
      transaction.onabort = () => { database.close(); resolve() }
    } catch {
      database.close()
      resolve()
    }
  })
}
