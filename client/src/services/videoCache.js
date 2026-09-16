import { openDB } from 'idb'

const DB_NAME = 'mytube'
const STORE = 'videos'
const META_STORE = 'meta'
const VERSION = 1

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE)
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE)
        }
      },
    })
  }
  return dbPromise
}

export const videoCache = {
  async get(videoId) {
    const db = await getDB()
    return db.get(STORE, videoId)
  },

  async set(videoId, { data, mimeType }) {
    const db = await getDB()
    await db.put(STORE, { data, mimeType, cachedAt: Date.now() }, videoId)
  },

  async has(videoId) {
    const db = await getDB()
    const val = await db.getKey(STORE, videoId)
    return val !== undefined
  },

  async delete(videoId) {
    const db = await getDB()
    return db.delete(STORE, videoId)
  },

  async clear() {
    const db = await getDB()
    await db.clear(STORE)
    await db.clear(META_STORE)
  },

  async list() {
    const db = await getDB()
    const keys = await db.getAllKeys(STORE)
    const entries = await Promise.all(
      keys.map(async (key) => {
        const val = await db.get(STORE, key)
        return {
          videoId: key,
          mimeType: val?.mimeType,
          sizeBytes: val?.data?.byteLength ?? 0,
          cachedAt: val?.cachedAt ?? 0,
        }
      })
    )
    return entries
  },
}
