import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import VideoPlayer from '../components/VideoPlayer.jsx'
import DownloadButton from '../components/DownloadButton.jsx'
import VideoCard from '../components/VideoCard.jsx'
import { getVideoInfo, searchVideos, formatViews } from '../services/api.js'

export default function Watch() {
  const { videoId } = useParams()
  const [info, setInfo]               = useState(null)
  const [related, setRelated]         = useState([])
  const [infoError, setInfoError]     = useState(null)
  const [descExpanded, setDescExpanded] = useState(false)

  useEffect(() => {
    if (!videoId) return
    let cancelled = false

    setInfo(null)
    setInfoError(null)
    setRelated([])
    setDescExpanded(false)

    getVideoInfo(videoId)
      .then((data) => {
        if (cancelled) return
        setInfo(data)
        return searchVideos(data.title, 12)
      })
      .then((res) => {
        if (!cancelled && res) setRelated(res.videos.filter(v => v.id !== videoId))
      })
      .catch((err) => { if (!cancelled) setInfoError(err.message) })

    return () => { cancelled = true }
  }, [videoId])

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 max-w-screen-2xl mx-auto">
      {/* Coluna principal */}
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

              <DownloadButton videoId={videoId} title={info.title} />
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

      {/* Sidebar — relacionados */}
      {related.length > 0 && (
        <div className="lg:w-96 flex-shrink-0">
          <h2 className="text-yt-text text-sm font-medium mb-3">Relacionados</h2>
          <div className="space-y-3">
            {related.map(v => <VideoCard key={v.id} video={v} />)}
          </div>
        </div>
      )}
    </div>
  )
}
