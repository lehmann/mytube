import { downloadUrl } from '../services/api.js'

export default function DownloadButton({ videoId, title }) {
  return (
    <a
      href={downloadUrl(videoId)}
      download={title ? `${title}.mp4` : 'video.mp4'}
      className="flex items-center gap-1.5 text-xs text-yt-muted hover:text-yt-text border border-yt-border hover:border-yt-text rounded-full px-3 py-1.5 transition-colors"
    >
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
      Download
    </a>
  )
}
