import { Link } from 'react-router-dom'
import { formatViews } from '../services/api.js'

export default function VideoCard({ video }) {
  const { id, title, thumbnail, channel, duration, views, uploadedAt } = video

  return (
    <Link to={`/watch/${id}`} className="block group">
      <div className="relative aspect-video bg-yt-surface rounded-xl overflow-hidden mb-3">
        <img
          src={thumbnail}
          alt={title}
          className="w-full h-full object-cover group-hover:rounded-none transition-all duration-200"
          loading="lazy"
          onError={(e) => {
            e.target.src = `https://img.youtube.com/vi/${id}/mqdefault.jpg`
          }}
        />
        {duration && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-yt-text text-xs px-1 rounded font-medium">
            {duration}
          </span>
        )}
      </div>

      <div className="flex gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-yt-border flex items-center justify-center text-yt-muted text-sm font-bold uppercase select-none">
          {channel?.[0] ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-yt-text text-sm font-medium line-clamp-2 leading-snug mb-1">
            {title}
          </p>
          <p className="text-yt-muted text-xs">{channel}</p>
          <p className="text-yt-muted text-xs">
            {formatViews(views)}
            {views && uploadedAt ? ' • ' : ''}
            {uploadedAt}
          </p>
        </div>
      </div>
    </Link>
  )
}
