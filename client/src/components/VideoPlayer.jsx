import { useEffect, useRef, useState } from 'react'
import { videoCache } from '../services/videoCache.js'
import { downloadUrl, streamUrl, formatBytes } from '../services/api.js'

const CHUNK_SIZE = 4 * 1024 * 1024 // 4 MB por chunk no IndexedDB

const MSE_MIME = (() => {
  if (typeof MediaSource === 'undefined') return null
  const candidates = [
    'video/mp4; codecs="avc1.4d401f,mp4a.40.2"',
    'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4; codecs="avc1,mp4a.40.2"',
    'video/mp4',
  ]
  return candidates.find(t => MediaSource.isTypeSupported(t)) ?? null
})()

function concat(arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrays) { out.set(a, off); off += a.length }
  return out
}

// appendBuffer serializado via Promise — SourceBuffer só aceita um append por vez
function sbAppend(sb, data) {
  return new Promise((resolve, reject) => {
    sb.addEventListener('updateend', resolve, { once: true })
    sb.addEventListener('error', reject, { once: true })
    try { sb.appendBuffer(data) } catch (e) { reject(e) }
  })
}

// Limpa o SourceBuffer inteiramente. Só chamado quando sb.updating === false
// (garantido por sempre ser chamado após a resolução de sbAppend).
function sbClear(sb) {
  if (!sb.buffered.length) return Promise.resolve()
  return new Promise(resolve => {
    sb.addEventListener('updateend', resolve, { once: true })
    sb.remove(0, Infinity)
  })
}

export default function VideoPlayer({ videoId }) {
  const videoRef   = useRef(null)
  const abortRef   = useRef(null)
  const msRef      = useRef(null)
  const blobUrlRef = useRef(null)

  const [status, setStatus]       = useState('unknown') // unknown|cached|downloading|streaming
  const [progress, setProgress]   = useState(0)
  const [cachedSize, setCachedSize] = useState(0)

  useEffect(() => {
    if (!videoId) return

    let alive = true
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    // Libera recursos do vídeo anterior
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
    try { if (msRef.current?.readyState === 'open') msRef.current.endOfStream() } catch {}
    msRef.current = null

    setStatus('unknown')
    setProgress(0)
    setCachedSize(0)

    // ── Reprodução a partir do IndexedDB ────────────────────────────────────
    async function playFromCache(meta) {
      setStatus('cached')
      setCachedSize(meta.totalSize)

      const ms = new MediaSource()
      msRef.current = ms
      blobUrlRef.current = URL.createObjectURL(ms)
      videoRef.current.src = blobUrlRef.current

      await new Promise((res, rej) => {
        ms.addEventListener('sourceopen', res, { once: true })
        ms.addEventListener('error', rej, { once: true })
      })
      if (!alive) return

      const sb = ms.addSourceBuffer(MSE_MIME)

      let cursor = 0
      // Seek pendente: onSeeking apenas registra o target; o loop de feed responde.
      let seekTarget = null

      async function feed(start) {
        cursor = start
        while (cursor < meta.totalChunks && alive) {
          if (seekTarget !== null) {
            const target = seekTarget
            seekTarget = null
            await sbClear(sb)
            feed(target)
            return
          }
          const entry = await videoCache.getChunk(videoId, cursor++)
          if (!entry || !alive) return
          try { await sbAppend(sb, entry.data) } catch { return }
        }
        if (alive && seekTarget === null) {
          try { if (ms.readyState === 'open') ms.endOfStream() } catch {}
        }
      }

      function onSeeking() {
        const { currentTime, duration } = videoRef.current ?? {}
        if (!duration || !isFinite(duration) || !meta.totalChunks) return
        // Estimativa aproximada: vai ao chunk mais próximo do timestamp
        seekTarget = Math.max(0, Math.floor((currentTime / duration) * meta.totalChunks) - 1)
      }

      videoRef.current.addEventListener('seeking', onSeeking)
      feed(0)

      return () => videoRef.current?.removeEventListener('seeking', onSeeking)
    }

    // ── Streaming do servidor + escrita incremental no IndexedDB ────────────
    async function streamAndSave() {
      setStatus('downloading')

      const ms = new MediaSource()
      msRef.current = ms
      blobUrlRef.current = URL.createObjectURL(ms)
      videoRef.current.src = blobUrlRef.current

      await new Promise((res, rej) => {
        ms.addEventListener('sourceopen', res, { once: true })
        ms.addEventListener('error', rej, { once: true })
      })
      if (!alive) return

      let sb
      try {
        sb = ms.addSourceBuffer(MSE_MIME)
      } catch {
        videoRef.current.src = streamUrl(videoId)
        setStatus('streaming')
        return
      }

      // Reserva o slot no IndexedDB ANTES do fetch — o servidor leva vários segundos
      // para responder (yt-dlp resolve o formato), e durante esse tempo o DownloadButton
      // não veria nenhum download em progresso e iniciaria um segundo download duplicado.
      let saving = false
      if (!(await videoCache.isComplete(videoId))) {
        try { await videoCache.initDownload(videoId, 'video/mp4'); saving = true } catch {}
      }

      const res = await fetch(downloadUrl(videoId), { signal: abortRef.current.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const contentLength = parseInt(res.headers.get('content-length') ?? '0', 10)
      const reader        = res.body.getReader()

      // Fila para serializar os appendBuffer do MSE
      const mseQueue = []
      let flushing = false
      function mseFlush() {
        if (flushing || !mseQueue.length || sb.updating) return
        flushing = true
        try { sb.appendBuffer(mseQueue.shift()) } catch { flushing = false }
      }
      sb.addEventListener('updateend', () => { flushing = false; mseFlush() })

      // Buffer para escrita por lotes no IndexedDB
      let idbBuf = [], idbBufSize = 0, idbChunkIdx = 0
      let received = 0
      let aborted = false

      while (true) {
        const { done, value } = await reader.read()

        if (!alive) { reader.cancel(); aborted = true; break }

        if (done) {
          if (saving) {
            if (idbBuf.length > 0) {
              await videoCache.appendChunk(videoId, idbChunkIdx++, concat(idbBuf))
            }
            await videoCache.finalizeDownload(videoId, idbChunkIdx, received)
          }
          const end = () => { try { if (ms.readyState === 'open') ms.endOfStream() } catch {} }
          sb.updating ? sb.addEventListener('updateend', end, { once: true }) : end()
          setStatus('cached')
          setCachedSize(received)
          setProgress(100)
          break
        }

        // Reprodução via MSE
        mseQueue.push(value)
        mseFlush()

        // Acumulação para IndexedDB
        if (saving) {
          idbBuf.push(value)
          idbBufSize += value.length
          if (idbBufSize >= CHUNK_SIZE) {
            await videoCache.appendChunk(videoId, idbChunkIdx++, concat(idbBuf))
            idbBuf = []
            idbBufSize = 0
          }
        }

        received += value.length
        if (contentLength > 0) setProgress(Math.round((received / contentLength) * 100))
      }

      if (aborted && saving) await videoCache.cancelDownload(videoId)
    }

    // ── Ponto de entrada ────────────────────────────────────────────────────
    let seekingCleanup = null

    async function run() {
      const meta = await videoCache.getMeta(videoId)
      if (!alive) return

      if (meta?.complete) {
        seekingCleanup = await playFromCache(meta)
        return
      }

      if (!MSE_MIME) {
        videoRef.current.src = streamUrl(videoId)
        setStatus('streaming')
        return
      }

      await streamAndSave()
    }

    run().catch(err => {
      if (!alive || err.name === 'AbortError') return
      console.error('[VideoPlayer]', err.message)
      if (videoRef.current) {
        videoRef.current.src = streamUrl(videoId)
        setStatus('streaming')
      }
    })

    return () => {
      alive = false
      abortRef.current?.abort()
      seekingCleanup?.()
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
      try { if (msRef.current?.readyState === 'open') msRef.current.endOfStream() } catch {}
      msRef.current = null
    }
  }, [videoId])

  return (
    <div className="w-full">
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
        <video
          ref={videoRef}
          controls
          autoPlay
          className="w-full h-full"
          playsInline
        />
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-yt-muted">
        {status === 'cached' && (
          <>
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span>Armazenado localmente ({formatBytes(cachedSize)})</span>
          </>
        )}
        {status === 'downloading' && (
          <>
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
            <div className="flex items-center gap-2">
              <span>Salvando no cache{progress > 0 ? ` — ${progress}%` : '…'}</span>
              {progress > 0 && (
                <div className="w-24 h-1 bg-yt-border rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-400 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          </>
        )}
        {status === 'streaming' && (
          <>
            <span className="w-2 h-2 rounded-full bg-yt-border flex-shrink-0" />
            <span>Streaming</span>
          </>
        )}
      </div>
    </div>
  )
}
