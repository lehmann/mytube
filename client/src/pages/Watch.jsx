import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import VideoPlayer from '../components/VideoPlayer.jsx'
import VideoCard from '../components/VideoCard.jsx'
import { getVideoInfo, searchVideos, formatViews, formatDuration } from '../services/api.js'
import { videoCache } from '../services/videoCache.js'

export default function Watch() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [related, setRelated] = useState([])
  const [infoError, setInfoError] = useState(null)
  const [descExpanded, setDescExpanded] = useState(false)
  const [isCached, setIsCached] = useState(false)

  useEffect(() => {
    if (!videoId) return
    let cancelled = false

    setInfo(null)
    setInfoError(null)
    setRelated([])
    setDescExpanded(false)

    videoCache.has(videoId).then((cached) => {
      if (!cancelled) setIsCached(cached)
    })

    getVideoInfo(videoId)
      .then((data) => {
        if (cancelled) return
        setInfo(data)
        // Fetch related via title search
        return searchVideos(data.title, 12)
      })
      .then((res) => {
        if (!cancelled && res) {
          setRelated(res.videos.filter((v) => v.id !== videoId))
        }
      })
      .catch((err) => {
        if (!cancelled) setInfoError(err.message)
      })

    return () => { cancelled = true }
  }, [videoId])

  async function handleDeleteCache() {
    await videoCache.delete(videoId)
    setIsCached(false)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 max-w-screen-2xl mx-auto">
      {/* Main column */}
      <div className="flex-1 min-w-0">
        <VideoPlayer videoId={videoId} />

        {infoError && (
          <p className="mt-3 text-yt-muted text-sm">Não foi possível carregar detalhes: {infoError}</p>
        )}

        {info && (
          <div className="mt-3">
            <h1 className="text-yt-text text-xl font-semibold leading-snug">{info.title}</h1>

            <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
              <div>
                <p className="text-yt-text font-medium text-sm">{info.channel}</p>
                <p className="text-yt-muted text-xs">
                  {formatViews(info.views)}
                  {info.views && info.publishDate ? ' • ' : ''}
                  {info.publishDate}
                </p>
              </div>

              {isCached && (
                <button
                  onClick={handleDeleteCache}
                  className="flex items-center gap-1.5 text-xs text-yt-muted hover:text-yt-red border border-yt-border rounded-full px-3 py-1.5 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                  Remover do cache
                </button>
              )}
            </div>

            {info.description && (
              <div className="mt-3 bg-yt-surface rounded-xl p-3">
                <p className={`text-yt-text text-sm whitespace-pre-line ${descExpanded ? '' : 'line-clamp-3'}`}>
                  {info.description}
                </p>
                {info.description.length > 200 && (
                  <button
                    onClick={() => setDescExpanded(!descExpanded)}
                    className="text-yt-text font-medium text-sm mt-1 hover:text-yt-muted"
                  >
                    {descExpanded ? 'Mostrar menos' : 'Mostrar mais'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {!info && !infoError && (
          <div className="mt-3 animate-pulse space-y-2">
            <div className="h-6 bg-yt-surface rounded w-3/4" />
            <div className="h-4 bg-yt-surface rounded w-1/3" />
          </div>
        )}
      </div>

      {/* Sidebar — related */}
      {related.length > 0 && (
        <div className="lg:w-96 flex-shrink-0">
          <h2 className="text-yt-text text-sm font-medium mb-3">Relacionados</h2>
          <div className="space-y-3">
            {related.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
