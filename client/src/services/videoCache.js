import { openDB } from 'idb'

const DB_NAME    = 'mytube'
const VERSION    = 2
const META_STORE = 'video_meta'
const CHUNK_STORE = 'video_chunks'

// video_meta  keyPath: 'id'
//   { id, mimeType, complete: bool, totalChunks, totalSize, cachedAt }
//
// video_chunks  keyPath: ['videoId', 'index']
//   { videoId, index, data: Uint8Array }

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(db) {
        // Migra do schema v1 (stores 'videos' e 'meta')
        for (const name of ['videos', 'meta']) {
          if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name)
        }
        db.createObjectStore(META_STORE, { keyPath: 'id' })
        const cs = db.createObjectStore(CHUNK_STORE, { keyPath: ['videoId', 'index'] })
        cs.createIndex('by_video', 'videoId')
      },
    })
  }
  return dbPromise
}

// Downloads em progresso nesta aba — evita gravações concorrentes no mesmo videoId
const _inProgress = new Set()

export const videoCache = {
  isInProgress(videoId) {
    return _inProgress.has(videoId)
  },

  async getMeta(videoId) {
    return (await getDB()).get(META_STORE, videoId) ?? null
  },

  async isComplete(videoId) {
    return (await this.getMeta(videoId))?.complete === true
  },

  async getChunk(videoId, index) {
    return (await getDB()).get(CHUNK_STORE, [videoId, index])
  },

  // Chamado antes de começar a gravar. Lança se já estiver em progresso.
  async initDownload(videoId, mimeType) {
    if (_inProgress.has(videoId)) throw new Error(`${videoId} already downloading`)
    _inProgress.add(videoId)
    const db = await getDB()
    await db.put(META_STORE, {
      id: videoId, mimeType,
      complete: false, totalChunks: 0, totalSize: 0,
      cachedAt: Date.now(),
    })
  },

  async appendChunk(videoId, index, data) {
    await (await getDB()).put(CHUNK_STORE, { videoId, index, data })
  },

  async finalizeDownload(videoId, totalChunks, totalSize) {
    _inProgress.delete(videoId)
    const db = await getDB()
    const meta = await db.get(META_STORE, videoId)
    if (meta) await db.put(META_STORE, { ...meta, complete: true, totalChunks, totalSize })
  },

  // Marca o download como cancelado sem apagar os chunks parciais.
  // O próximo download começa do zero e sobrescreve os chunks pelo índice.
  async cancelDownload(videoId) {
    _inProgress.delete(videoId)
  },

  async delete(videoId) {
    _inProgress.delete(videoId)
    const db = await getDB()
    const tx = db.transaction([META_STORE, CHUNK_STORE], 'readwrite')
    await tx.objectStore(META_STORE).delete(videoId)
    const keys = await tx.objectStore(CHUNK_STORE).index('by_video').getAllKeys(videoId)
    for (const k of keys) await tx.objectStore(CHUNK_STORE).delete(k)
    await tx.done
  },

  async list() {
    return (await getDB()).getAll(META_STORE)
  },
}
