import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import VideoGrid from '../components/VideoGrid.jsx'
import { searchVideos } from '../services/api.js'

export default function Home() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!query) {
      setVideos([])
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    searchVideos(query)
      .then((data) => {
        if (!cancelled) {
          setVideos(data.videos ?? [])
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [query])

  if (!query) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-yt-muted gap-4">
        <svg className="w-24 h-24 fill-yt-red opacity-80" viewBox="0 0 24 24">
          <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
        </svg>
        <h1 className="text-2xl font-medium text-yt-text">MyTube</h1>
        <p className="text-base">Use a barra de busca para encontrar vídeos</p>
      </div>
    )
  }

  return (
    <div>
      {!loading && !error && videos.length > 0 && (
        <p className="px-4 pt-4 text-yt-muted text-sm">
          Resultados para <span className="text-yt-text font-medium">"{query}"</span>
        </p>
      )}
      <VideoGrid videos={videos} loading={loading} error={error} />
    </div>
  )
}
