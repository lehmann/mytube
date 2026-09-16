import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'

export default function Header() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')

  function handleSearch(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    navigate(`/?q=${encodeURIComponent(q)}`)
  }

  return (
    <header className="sticky top-0 z-50 bg-yt-bg border-b border-yt-border flex items-center gap-4 px-4 h-14">
      <Link to="/" className="flex items-center gap-1 flex-shrink-0 mr-2">
        <svg viewBox="0 0 90 20" className="h-5 fill-yt-red">
          <path d="M27.974 0L24.17 13.88 20.39 0h-4.06l5.88 18.14v8.67h3.84v-8.67L31.98 0zm8.51 6.44c-3.41 0-5.34 2.38-5.34 6.78v3.05c0 4.35 1.89 6.68 5.29 6.68 2.72 0 4.4-1.27 4.91-3.69l.07-.34h-3.5l-.05.19c-.25 1.02-.78 1.52-1.47 1.52-1.13 0-1.73-.92-1.73-2.72v-1.61h6.87v-3.08c0-4.4-1.88-6.78-5.05-6.78zm1.58 6.38h-3.17v-.96c0-1.82.54-2.74 1.6-2.74 1.05 0 1.57.92 1.57 2.74zm11.63-6.38c-1.53 0-2.75.58-3.57 1.71V6.7h-3.5v16.12h3.5v-9.7c0-1.99.75-2.97 2.3-2.97 1.3 0 1.94.81 1.94 2.47v10.2h3.5V12.34c0-3.76-1.61-5.9-4.17-5.9zM58.12 0h-3.5v22.82h3.5zM63.9 0l-5.18 10.73 5.52 12.09h3.9l-5.64-12.3 5.35-10.52zm18.6 3.36c0-1.85-1.5-3.36-3.36-3.36H70.4C68.54 0 67.04 1.5 67.04 3.36v16.28c0 1.85 1.5 3.36 3.36 3.36h8.74c1.85 0 3.36-1.5 3.36-3.36V3.36zm-11.44.53h6.62v15.26h-6.62V3.89zm-43.6 9.88l3.42 9.05h-6.84z"/>
        </svg>
        <span className="text-yt-text font-medium text-base hidden sm:block">MyYouTube</span>
      </Link>

      <form onSubmit={handleSearch} className="flex flex-1 max-w-2xl mx-auto">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar"
          className="flex-1 bg-yt-surface border border-yt-border rounded-l-full px-4 py-2 text-yt-text placeholder-yt-muted focus:outline-none focus:border-blue-500 text-sm"
        />
        <button
          type="submit"
          className="bg-yt-hover border border-yt-border border-l-0 rounded-r-full px-5 py-2 hover:bg-[#3f3f3f] transition-colors"
          aria-label="Pesquisar"
        >
          <svg className="w-5 h-5 text-yt-text" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.87 20.17l-5.59-5.59C16.35 13.35 17 11.75 17 10c0-3.87-3.13-7-7-7s-7 3.13-7 7 3.13 7 7 7c1.75 0 3.35-.65 4.58-1.71l5.59 5.59.7-.71zM10 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
          </svg>
        </button>
      </form>
    </header>
  )
}
