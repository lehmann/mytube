import { useEffect, useRef, useState } from 'react'
import { videoCache } from '../services/videoCache.js'
import { streamUrl, formatBytes } from '../services/api.js'

export default function VideoPlayer({ videoId }) {
  const videoRef = useRef(null)
  const [cacheState, setCacheState] = useState('unknown') // 'unknown'|'miss'|'downloading'|'cached'
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [cachedSize, setCachedSize] = useState(0)
  const abortRef = useRef(null)
  const blobUrlRef = useRef(null)

  useEffect(() => {
    if (!videoId) return

    let cancelled = false
    abortRef.current = new AbortController()

    async function load() {
      const cached = await videoCache.get(videoId)
      if (cancelled) return

      if (cached) {
        const blob = new Blob([cached.data], { type: cached.mimeType })
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        videoRef.current.src = url
        setCacheState('cached')
        setCachedSize(cached.data.byteLength)
        return
      }

      // Play via streaming proxy while caching in background
      videoRef.current.src = streamUrl(videoId)
      setCacheState('miss')

      // Background download for caching
      setCacheState('downloading')
      try {
        const res = await fetch(streamUrl(videoId), { signal: abortRef.current.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const contentType = res.headers.get('content-type') ?? 'video/mp4'
        const contentLength = parseInt(res.headers.get('content-length') ?? '0', 10)

        const reader = res.body.getReader()
        const chunks = []
        let received = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          received += value.length
          if (contentLength > 0) {
            setDownloadProgress(Math.round((received / contentLength) * 100))
          }
        }

        if (cancelled) return

        // Assemble into single buffer
        const total = new Uint8Array(received)
        let offset = 0
        for (const chunk of chunks) {
          total.set(chunk, offset)
          offset += chunk.length
        }

        await videoCache.set(videoId, { data: total, mimeType: contentType })
        setCacheState('cached')
        setCachedSize(received)
        setDownloadProgress(100)
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('[cache download]', err.message)
          setCacheState('miss')
        }
      }
    }

    load()

    return () => {
      cancelled = true
      abortRef.current?.abort()
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
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
            <span>
              Salvando no cache{downloadProgress > 0 ? ` — ${downloadProgress}%` : '…'}
            </span>
          </>
        )}
        {cacheState === 'miss' && (
          <>
            <span className="w-2 h-2 rounded-full bg-yt-border flex-shrink-0" />
            <span>Streaming ao vivo</span>
          </>
        )}
      </div>
    </div>
  )
}
