const BASE = '/api'

export async function searchVideos(query, limit = 24) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? `Search failed (${res.status})`)
  }
  return res.json()
}

export async function getVideoInfo(videoId) {
  const res = await fetch(`${BASE}/info/${videoId}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? `Failed to get info (${res.status})`)
  }
  return res.json()
}

export function streamUrl(videoId) {
  return `${BASE}/stream/${videoId}`
}

export function formatViews(n) {
  if (!n) return ''
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B visualizações`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M visualizações`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K visualizações`
  return `${n} visualizações`
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(seconds) {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
