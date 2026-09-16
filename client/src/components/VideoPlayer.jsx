import { useEffect, useRef, useState } from 'react'
import { videoCache } from '../services/videoCache.js'
import { downloadUrl, formatBytes } from '../services/api.js'

// Tenta codec strings do mais específico ao mais genérico.
// MSE exige uma string válida para criar o SourceBuffer.
const MSE_MIME = (() => {
  if (typeof MediaSource === 'undefined') return null
  const candidates = [
    'video/mp4; codecs="avc1.4d401f,mp4a.40.2"', // H.264 Main 3.1 + AAC-LC (720p típico)
    'video/mp4; codecs="avc1.42E01E,mp4a.40.2"', // H.264 Baseline + AAC-LC
    'video/mp4; codecs="avc1,mp4a.40.2"',
    'video/mp4',
  ]
  return candidates.find((t) => MediaSource.isTypeSupported(t)) ?? null
})()

export default function VideoPlayer({ videoId }) {
  const videoRef = useRef(null)
  const [cacheState, setCacheState] = useState('unknown')
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [cachedSize, setCachedSize] = useState(0)
  const abortRef = useRef(null)
  const blobUrlRef = useRef(null)
  const mediaSourceRef = useRef(null)

  useEffect(() => {
    if (!videoId) return

    let cancelled = false
    abortRef.current = new AbortController()

    async function load() {
      // ── 1. Cache hit → reproduz do IndexedDB (seeking completo) ──────────
      const cached = await videoCache.get(videoId)
      if (cancelled) return

      if (cached) {
        const blob = new Blob([cached.data], { type: cached.mimeType })
        blobUrlRef.current = URL.createObjectURL(blob)
        videoRef.current.src = blobUrlRef.current
        setCacheState('cached')
        setCachedSize(cached.data.byteLength)
        return
      }

      // ── 2. Cache miss ─────────────────────────────────────────────────────
      if (MSE_MIME) {
        await loadViaMSE()
      } else {
        // Fallback: browsers sem suporte a MSE (raro em 2026)
        console.warn('[VideoPlayer] MSE não suportado, usando src direto')
        videoRef.current.src = downloadUrl(videoId)
        setCacheState('miss')
      }
    }

    // MSE: única requisição que serve tanto para reprodução em tempo real
    // quanto para acumular o vídeo no IndexedDB.
    async function loadViaMSE() {
      const ms = new MediaSource()
      mediaSourceRef.current = ms
      blobUrlRef.current = URL.createObjectURL(ms)
      videoRef.current.src = blobUrlRef.current

      await new Promise((resolve, reject) => {
        ms.addEventListener('sourceopen', resolve, { once: true })
        ms.addEventListener('error', (e) => reject(new Error('MediaSource error: ' + e)), { once: true })
      })
      if (cancelled) return

      let sb
      try {
        sb = ms.addSourceBuffer(MSE_MIME)
      } catch (e) {
        console.error('[VideoPlayer] addSourceBuffer falhou:', e.message, '— usando src direto')
        videoRef.current.src = downloadUrl(videoId)
        setCacheState('miss')
        return
      }

      setCacheState('downloading')

      const response = await fetch(downloadUrl(videoId), { signal: abortRef.current.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const contentType = response.headers.get('content-type') ?? 'video/mp4'
      const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10)
      const reader = response.body.getReader()

      const chunks = []
      let received = 0

      // SourceBuffer só aceita appendBuffer quando não está atualizando.
      // Mantemos uma fila para serializar os appends.
      const queue = []
      let flushing = false

      function flush() {
        if (flushing || queue.length === 0 || sb.updating) return
        flushing = true
        try { sb.appendBuffer(queue.shift()) } catch (e) {
          console.warn('[MSE] appendBuffer error:', e.message)
          flushing = false
        }
      }

      sb.addEventListener('updateend', () => { flushing = false; flush() })
      sb.addEventListener('error', (e) => console.error('[MSE] SourceBuffer error:', e))

      // Lê o stream chunk a chunk
      while (true) {
        const { done, value } = await reader.read()

        if (cancelled) { reader.cancel(); break }

        if (done) {
          // Finaliza MSE
          const finalize = () => {
            try { if (ms.readyState === 'open') ms.endOfStream() } catch {}
          }
          sb.updating ? sb.addEventListener('updateend', finalize, { once: true }) : finalize()

          // Salva no IndexedDB
          const total = new Uint8Array(received)
          let offset = 0
          for (const c of chunks) { total.set(c, offset); offset += c.length }
          await videoCache.set(videoId, { data: total, mimeType: contentType })

          setCacheState('cached')
          setCachedSize(received)
          setDownloadProgress(100)
          console.log(`[VideoPlayer] cached ${videoId} — ${(received / 1024 / 1024).toFixed(1)} MB`)
          break
        }

        chunks.push(value)
        received += value.length
        queue.push(value)
        flush()

        if (contentLength > 0) {
          setDownloadProgress(Math.round((received / contentLength) * 100))
        }
      }
    }

    load().catch((err) => {
      if (!cancelled && err.name !== 'AbortError') {
        console.error('[VideoPlayer] erro:', err.message)
        setCacheState('miss')
      }
    })

    return () => {
      cancelled = true
      abortRef.current?.abort()
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      if (mediaSourceRef.current?.readyState === 'open') {
        try { mediaSourceRef.current.endOfStream() } catch {}
        mediaSourceRef.current = null
      }
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
        {cacheState === 'cached' && (
          <>
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span>Armazenado localmente ({formatBytes(cachedSize)})</span>
          </>
        )}
        {cacheState === 'downloading' && (
          <>
            <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0 animate-pulse" />
            <div className="flex items-center gap-2">
              <span>Salvando no cache{downloadProgress > 0 ? ` — ${downloadProgress}%` : '…'}</span>
              {downloadProgress > 0 && (
                <div className="w-24 h-1 bg-yt-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              )}
            </div>
          </>
        )}
        {cacheState === 'miss' && (
          <>
            <span className="w-2 h-2 rounded-full bg-yt-border flex-shrink-0" />
            <span>Streaming</span>
          </>
        )}
      </div>
    </div>
  )
}
